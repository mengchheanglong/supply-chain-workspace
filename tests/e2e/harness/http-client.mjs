/**
 * @fileoverview Robust HTTP Client for E2E Cross-Service Interactions.
 * Interacts with osm-pathfinder (port 8000) and logistics-sandbox (port 8500)
 * with timeout controls, structured error reporting, and ping probes.
 */

export class E2EHttpClient {
  constructor({
    routingBaseUrl = process.env.ROUTING_BASE_URL || 'http://127.0.0.1:8000',
    sandboxBaseUrl = process.env.SANDBOX_BASE_URL || 'http://127.0.0.1:8500',
    timeoutMs = 5000,
  } = {}) {
    this.routingBaseUrl = routingBaseUrl.replace(/\/$/, '');
    this.sandboxBaseUrl = sandboxBaseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  async isRoutingAlive() {
    try {
      const res = await this.get(`${this.routingBaseUrl}/api/health`, { timeoutMs: 1500 });
      return res.status === 200 && res.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  async isSandboxAlive() {
    try {
      const res = await this.get(`${this.sandboxBaseUrl}/api/health`, { timeoutMs: 1500 });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async request(url, { method = 'GET', body = null, headers = {}, timeoutMs = this.timeoutMs } = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const reqHeaders = {
      Accept: 'application/json',
      ...headers,
    };

    let reqBody = null;
    if (body !== null) {
      reqHeaders['Content-Type'] = 'application/json';
      reqBody = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const t0 = Date.now();
    try {
      const response = await fetch(url, {
        method,
        headers: reqHeaders,
        body: reqBody,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - t0;

      let data = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      } else {
        data = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        data,
        latencyMs,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - t0;
      if (err.name === 'AbortError') {
        throw new Error(`HTTP request to ${url} timed out after ${timeoutMs}ms`);
      }
      throw new Error(`HTTP request to ${url} failed: ${err.message}`);
    }
  }

  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  async post(url, body, options = {}) {
    return this.request(url, { ...options, method: 'POST', body });
  }

  // Convenience methods for osm-pathfinder
  async postMatrix(payload) {
    return this.post(`${this.routingBaseUrl}/api/matrix`, payload);
  }

  async postRoute(payload) {
    return this.post(`${this.routingBaseUrl}/api/route`, payload);
  }

  async getRoutingStats() {
    return this.get(`${this.routingBaseUrl}/api/graph/stats`);
  }

  // Convenience methods for logistics-sandbox
  async postSimulationStep(payload) {
    return this.post(`${this.sandboxBaseUrl}/api/simulation/step`, payload);
  }

  async postSimulationPause() {
    return this.post(`${this.sandboxBaseUrl}/api/simulation/pause`, {});
  }

  async postSimulationResume() {
    return this.post(`${this.sandboxBaseUrl}/api/simulation/resume`, {});
  }

  async postSimulationReset(payload = {}) {
    return this.post(`${this.sandboxBaseUrl}/api/simulation/reset`, payload);
  }

  async getSimulationEventsHash() {
    return this.get(`${this.sandboxBaseUrl}/api/simulation/events/hash`);
  }

  async getSimulationState() {
    return this.get(`${this.sandboxBaseUrl}/api/simulation/state`);
  }
}
