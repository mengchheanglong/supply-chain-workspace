/**
 * @fileoverview Supply Chain Workspace E2E Test Fixtures.
 * Provides deterministic locations, vehicle profiles, scenario configs,
 * seed constants, and domain contracts for P0-04, ROUTE-01, and ENV-02 tests.
 */

export const LOCATIONS = {
  // Phnom Penh Urban Core
  BKK1: { lat: 11.5564, lon: 104.9282, name: 'BKK1 Distribution Hub' },
  WAT_PHNOM: { lat: 11.5760, lon: 104.9230, name: 'Wat Phnom Commercial Node' },
  TOUL_KORK: { lat: 11.5720, lon: 104.8980, name: 'Toul Kork Residential Depot' },
  RUSSIAN_MARKET: { lat: 11.5435, lon: 104.9142, name: 'Toul Tom Poung Center' },
  CHROY_CHANGVAR: { lat: 11.5890, lon: 104.9350, name: 'Chroy Changvar Bridgehead' },
  AIRPORT_LOGISTICS: { lat: 11.5460, lon: 104.8440, name: 'Phnom Penh Airport Logistics' },

  // Inter-Provincial Corridors
  PP_INDUSTRIAL: { lat: 11.5300, lon: 104.8500, name: 'PP Industrial Park Hub' },
  SIHANOUKVILLE_PORT: { lat: 10.6275, lon: 103.5221, name: 'Sihanoukville Autonomous Port' },
  KAMPOT_WAREHOUSE: { lat: 10.6104, lon: 104.1815, name: 'Kampot Pepper Warehouse' },
  SIEM_REAP_HUB: { lat: 13.3671, lon: 103.8448, name: 'Siem Reap Logistics Hub' },

  // Edge / Disconnected Locations
  KOH_RONG_SANLOEM: { lat: 10.5900, lon: 103.3000, name: 'Koh Rong Sanloem Island (Unreachable)' },
  NORTH_POLE_OOB: { lat: 85.0000, lon: 0.0000, name: 'Out of Bounds Coordinate' },
  EQUATOR_NULL_ISLAND: { lat: 0.0000, lon: 0.0000, name: 'Null Island' },
};

export const VEHICLE_PROFILES = {
  CAR: {
    id: 'car',
    name: 'Standard Passenger Car',
    maxSpeedKmH: 120,
    allowedRoadClasses: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service'],
    prohibitedRoadClasses: [],
    turnPenaltyFactor: 1.0,
    allowUTurns: true,
  },
  VAN: {
    id: 'van',
    name: 'Urban Delivery Van',
    maxSpeedKmH: 90,
    allowedRoadClasses: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service'],
    prohibitedRoadClasses: ['living_street'],
    turnPenaltyFactor: 1.2,
    allowUTurns: true,
  },
  TRUCK: {
    id: 'truck',
    name: 'Heavy Freight Transport',
    maxSpeedKmH: 80,
    speedCaps: {
      motorway: 80,
      trunk: 70,
      primary: 60,
      secondary: 50,
      tertiary: 40,
    },
    allowedRoadClasses: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
    prohibitedRoadClasses: ['residential', 'living_street', 'service'],
    turnPenaltyFactor: 2.5,
    maxTurnAngleDeg: 130, // Sharp U-turns prohibited
    allowUTurns: false,
  },
  MOTORCYCLE: {
    id: 'motorcycle',
    name: 'Express Courier Motorcycle',
    maxSpeedKmH: 60,
    allowedRoadClasses: ['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'service'],
    prohibitedRoadClasses: ['motorway'], // Banned from Expressways (E01)
    turnPenaltyFactor: 0.5,
    allowUTurns: true,
  },
};

export const DETERMINISTIC_SEEDS = {
  PRIMARY: 42,
  SECONDARY: 12345,
  STRESS: 99999,
};

export const EXPECTED_VERSIONS = {
  GRAPH_VERSION_DEMO: 'demo-cambodia-v1.0',
  COST_MODEL_VERSION: 'tdsp-profiles-v1.0',
};

export const URBAN_EXPRESS_ORDERS = [
  {
    id: 'ORD-E2E-001',
    customer: 'Sophea Pich',
    pickup: LOCATIONS.BKK1,
    delivery: LOCATIONS.WAT_PHNOM,
    slaDurationMin: 30,
    priority: 'high',
    weightKg: 2.5,
  },
  {
    id: 'ORD-E2E-002',
    customer: 'Chann Dara',
    pickup: LOCATIONS.BKK1,
    delivery: LOCATIONS.TOUL_KORK,
    slaDurationMin: 45,
    priority: 'medium',
    weightKg: 5.0,
  },
  {
    id: 'ORD-E2E-003',
    customer: 'Borey Kem',
    pickup: LOCATIONS.RUSSIAN_MARKET,
    delivery: LOCATIONS.CHROY_CHANGVAR,
    slaDurationMin: 60,
    priority: 'standard',
    weightKg: 1.2,
  },
  {
    id: 'ORD-E2E-004',
    customer: 'Kalyan Seng',
    pickup: LOCATIONS.BKK1,
    delivery: LOCATIONS.AIRPORT_LOGISTICS,
    slaDurationMin: 30, // Tied SLA deadline with ORD-E2E-001
    priority: 'high',
    weightKg: 8.0,
  },
  {
    id: 'ORD-E2E-005',
    customer: 'Vireak Meas',
    pickup: LOCATIONS.WAT_PHNOM,
    delivery: LOCATIONS.RUSSIAN_MARKET,
    slaDurationMin: 90,
    priority: 'low',
    weightKg: 0.5,
  },
];
