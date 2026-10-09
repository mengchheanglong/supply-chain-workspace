/**
 * @fileoverview Compose and Workspace Isolation Validator.
 * Analyzes compose.yaml, workspace.json, and environment configurations
 * to verify network egress isolation, secret isolation, port bindings, and service wiring.
 */

import fs from 'node:fs';
import path from 'node:path';

export class ComposeValidator {
  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
    this.composePath = path.join(workspaceRoot, 'compose.yaml');
    this.workspaceJsonPath = path.join(workspaceRoot, 'workspace.json');
  }

  loadWorkspaceManifest() {
    if (!fs.existsSync(this.workspaceJsonPath)) {
      throw new Error(`workspace.json not found at ${this.workspaceJsonPath}`);
    }
    const raw = fs.readFileSync(this.workspaceJsonPath, 'utf8');
    return JSON.parse(raw);
  }

  loadComposeRaw() {
    if (!fs.existsSync(this.composePath)) {
      throw new Error(`compose.yaml not found at ${this.composePath}`);
    }
    return fs.readFileSync(this.composePath, 'utf8');
  }

  /**
   * Lightweight parser to extract service definitions, networks, and secrets from compose.yaml.
   */
  parseComposeStructure() {
    const content = this.loadComposeRaw();
    const lines = content.split('\n');

    const result = {
      services: {},
      networks: {},
      secrets: {},
    };

    let currentSection = null;
    let currentService = null;
    let currentKey = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*#/.test(line) || !line.trim()) continue;

      const topLevelMatch = line.match(/^([a-z0-9_-]+):\s*$/);
      if (topLevelMatch) {
        currentSection = topLevelMatch[1];
        currentService = null;
        currentKey = null;
        continue;
      }

      if (currentSection === 'services') {
        const serviceMatch = line.match(/^  ([a-z0-9_-]+):\s*$/);
        if (serviceMatch) {
          currentService = serviceMatch[1];
          result.services[currentService] = {
            name: currentService,
            networks: [],
            secrets: [],
            ports: [],
            environment: {},
            profiles: [],
          };
          continue;
        }

        if (currentService && result.services[currentService]) {
          const s = result.services[currentService];

          // Profiles
          const profileMatch = line.match(/^    profiles:\s*\[(.*?)\]/);
          if (profileMatch) {
            s.profiles = profileMatch[1].split(',').map(p => p.trim().replace(/['"]/g, ''));
          }

          // Networks list
          if (/^    networks:\s*$/.test(line)) {
            currentKey = 'networks';
            continue;
          }
          if (currentKey === 'networks') {
            const netItem = line.match(/^      -\s*([a-z0-9_-]+)/);
            if (netItem) {
              s.networks.push(netItem[1]);
              continue;
            } else if (/^    [a-z]/.test(line)) {
              currentKey = null;
            }
          }

          // Secrets list
          if (/^    secrets:\s*$/.test(line)) {
            currentKey = 'secrets';
            continue;
          }
          if (currentKey === 'secrets') {
            const secItem = line.match(/^      -\s*([a-z0-9_-]+)/);
            if (secItem) {
              s.secrets.push(secItem[1]);
              continue;
            } else if (/^    [a-z]/.test(line)) {
              currentKey = null;
            }
          }

          // Ports list
          if (/^    ports:\s*$/.test(line)) {
            currentKey = 'ports';
            continue;
          }
          if (currentKey === 'ports') {
            const portItem = line.match(/^      -\s*["']?([^"']+)["']?/);
            if (portItem) {
              s.ports.push(portItem[1]);
              continue;
            } else if (/^    [a-z]/.test(line)) {
              currentKey = null;
            }
          }

          // Environment
          const envItem = line.match(/^      ([A-Za-z0-9_]+):\s*(.*)$/);
          if (envItem && !/^    [a-z]/.test(line)) {
            s.environment[envItem[1]] = envItem[2].trim().replace(/['"]/g, '');
          }
        }
      }

      if (currentSection === 'networks') {
        const netMatch = line.match(/^  ([a-z0-9_-]+):\s*$/);
        if (netMatch) {
          result.networks[netMatch[1]] = { driver: 'bridge' };
        }
      }

      if (currentSection === 'secrets') {
        const secMatch = line.match(/^  ([a-z0-9_-]+):\s*$/);
        if (secMatch) {
          result.secrets[secMatch[1]] = true;
        }
      }
    }

    return result;
  }

  /**
   * Validates port collision absence against workspace.json registry.
   */
  validatePortRegistry() {
    const manifest = this.loadWorkspaceManifest();
    const registeredPorts = Object.values(manifest.hostPorts || {});
    const uniquePorts = new Set(registeredPorts);
    return {
      total: registeredPorts.length,
      unique: uniquePorts.size,
      hasCollisions: registeredPorts.length !== uniquePorts.size,
      ports: manifest.hostPorts,
    };
  }
}
