// tests/vehicles.test.js
// ═══════════════════════════════════════════════════════════════
// VEHICLE & USER VEHICLE ROUTE TESTS
//
// Tests:
//   - Euro 6 database browsing (pagination, filtering)
//   - Vehicle search API endpoint
//   - Manufacturer/model cascading API
//   - User vehicle management (add, set default, delete)
//   - Vehicle CO2 overriding transport mode in journey emissions
//
// Total: 14 test cases
// ═══════════════════════════════════════════════════════════════

const request       = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp     = require('./testApp');
const User          = require('../models/User');
const Vehicle       = require('../models/Vehicle');
const UserVehicle   = require('../models/UserVehicle');
const TransportMode = require('../models/TransportMode');
const Journey       = require('../models/Journey');

let app;

beforeAll(async () => {
  await connect();
  app = createApp();
});

afterEach(clearDatabase);
afterAll(disconnect);

/** Helper: create a user and return an authenticated agent */
async function loginAs(name, email) {
  await User.create({ name, email, password: 'password123' });
  const ag = request.agent(app);
  await ag.post('/auth/login').send({ email, password: 'password123' });
  return ag;
}


// ═══════════════════════════════════════════════════════════════
// EURO 6 DATABASE BROWSING
// ═══════════════════════════════════════════════════════════════
describe('GET /vehicles — Euro 6 Database', () => {

  let agent;

  beforeEach(async () => {
    agent = await loginAs('Vehicle Browser', 'vb@test.com');

    // Seed some test vehicles
    await Vehicle.insertMany([
      { manufacturer: 'BMW', model: '320d', fuelType: 'Diesel', co2: 127, engineSize: 1995 },
      { manufacturer: 'BMW', model: '520d', fuelType: 'Diesel', co2: 140, engineSize: 1995 },
      { manufacturer: 'Audi', model: 'A3', fuelType: 'Petrol', co2: 130, engineSize: 1498 },
      { manufacturer: 'Tesla', model: 'Model 3', fuelType: 'Electric', co2: 0, engineSize: 0 },
      { manufacturer: 'Toyota', model: 'Yaris', fuelType: 'Petrol', co2: 92, engineSize: 1496 },
    ]);
  });

  // Test 1: Vehicle list page renders with data
  test('should render vehicle database page', async () => {
    const res = await agent.get('/vehicles');
    expect(res.status).toBe(200);
    expect(res.text).toContain('BMW');
    expect(res.text).toContain('Audi');
    expect(res.text).toContain('Tesla');
  });

  // Test 2: Filter by manufacturer
  test('should filter by manufacturer', async () => {
    const res = await agent.get('/vehicles?manufacturer=BMW');
    expect(res.status).toBe(200);
    expect(res.text).toContain('320d');
    expect(res.text).toContain('520d');
  });

  // Test 3: Filter by fuel type
  test('should filter by fuel type', async () => {
    const res = await agent.get('/vehicles?fuelType=Electric');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tesla');
  });

  // Test 4: Unauthenticated access redirects
  test('should redirect unauthenticated users', async () => {
    const res = await request(app).get('/vehicles');
    expect(res.status).toBe(302);
  });
});


// ═══════════════════════════════════════════════════════════════
// VEHICLE SEARCH API
// ═══════════════════════════════════════════════════════════════
describe('GET /api/vehicles/* — Vehicle APIs', () => {

  let agent;

  beforeEach(async () => {
    agent = await loginAs('API Tester', 'api@test.com');

    await Vehicle.insertMany([
      { manufacturer: 'BMW', model: '320d', fuelType: 'Diesel', co2: 127 },
      { manufacturer: 'BMW', model: '520d', fuelType: 'Diesel', co2: 140 },
      { manufacturer: 'Audi', model: 'A3', fuelType: 'Petrol', co2: 130 },
    ]);
  });

  // Test 5: Search vehicles by query
  test('should search vehicles by text query', async () => {
    const res = await agent.get('/api/vehicles/search?q=BMW');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].manufacturer).toBe('BMW');
  });

  // Test 6: Get unique manufacturers list
  test('should return unique manufacturer list', async () => {
    const res = await agent.get('/api/vehicles/manufacturers');
    expect(res.status).toBe(200);
    expect(res.body).toContain('BMW');
    expect(res.body).toContain('Audi');
    expect(res.body).toHaveLength(2);
  });

  // Test 7: Get models for a specific manufacturer
  test('should return models for a manufacturer', async () => {
    const res = await agent.get('/api/vehicles/models?manufacturer=BMW');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Each result should have model, co2, fuelType
    expect(res.body[0]).toHaveProperty('model');
    expect(res.body[0]).toHaveProperty('co2');
  });

  // Test 8: Vehicle stats aggregation
  test('should return vehicle statistics', async () => {
    const res = await agent.get('/api/vehicles/stats');
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(3);
    expect(res.body.fuelStats).toBeDefined();
    expect(res.body.overall).toBeDefined();
    expect(res.body.overall.avgCo2).toBeDefined();
  });
});


// ═══════════════════════════════════════════════════════════════
// USER VEHICLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
describe('User Vehicle CRUD — /my-vehicles', () => {

  let agent, testUser;

  beforeEach(async () => {
    testUser = await User.create({ name: 'VehOwner', email: 'vo@test.com', password: 'password123' });
    agent = request.agent(app);
    await agent.post('/auth/login').send({ email: 'vo@test.com', password: 'password123' });
  });

  // Test 9: View my vehicles page
  test('should render my vehicles page', async () => {
    const res = await agent.get('/my-vehicles');
    expect(res.status).toBe(200);
  });

  // Test 10: Add a vehicle
  test('should add a user vehicle', async () => {
    const res = await agent.post('/my-vehicles').send({
      nickname: 'My BMW',
      manufacturer: 'BMW',
      model: '320d',
      year: 2023,
      fuelType: 'Diesel',
      co2: 127
    });

    expect(res.status).toBe(302);

    const vehicles = await UserVehicle.find({ userId: testUser._id });
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].nickname).toBe('My BMW');
    expect(vehicles[0].co2).toBe(127);
  });

  // Test 11: Set vehicle as default
  test('should set a vehicle as default', async () => {
    const v = await UserVehicle.create({
      userId: testUser._id, nickname: 'Car1', manufacturer: 'BMW', model: '320d'
    });

    const res = await agent.post('/my-vehicles/' + v._id + '/default');
    expect(res.status).toBe(302);

    const updated = await UserVehicle.findById(v._id);
    expect(updated.isDefault).toBe(true);
  });

  // Test 12: Delete a vehicle
  test('should delete a user vehicle', async () => {
    const v = await UserVehicle.create({
      userId: testUser._id, nickname: 'Temp', manufacturer: 'Ford', model: 'Focus'
    });

    const res = await agent.post('/my-vehicles/' + v._id + '/delete');
    expect(res.status).toBe(302);

    const deleted = await UserVehicle.findById(v._id);
    expect(deleted).toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════════
// VEHICLE CO2 OVERRIDES MODE IN JOURNEY EMISSIONS
// ═══════════════════════════════════════════════════════════════
describe('Vehicle CO2 in Journey Emissions', () => {

  // Test 13: Vehicle CO2 should override transport mode factor
  test('should use vehicle CO2 over transport mode factor', async () => {
    const user = await User.create({ name: 'CO2Test', email: 'co2@test.com', password: 'password123' });
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: 'co2@test.com', password: 'password123' });

    // Create mode with 170 g/km
    const mode = await TransportMode.create({ name: 'Car', emissionFactor: 170 });
    // Create vehicle with 127 g/km (overrides the 170)
    const vehicle = await UserVehicle.create({
      userId: user._id, nickname: 'EcoCar', manufacturer: 'BMW', model: '320d', co2: 127
    });

    await agent.post('/journeys').send({
      origin: 'A', destination: 'B', distance: 100,
      transportModeId: mode._id.toString(),
      userVehicleId: vehicle._id.toString(),
      gradientModifier: 1.0
    });

    const journey = await Journey.findOne({ origin: 'A' });
    // Should use 127 (vehicle), not 170 (mode): 100 × 127 = 12,700
    expect(journey.emissions).toBe(12700);
    expect(journey.emissionSource).toBe('vehicle');
  });

  // Test 14: Without vehicle, should fall back to transport mode
  test('should use mode factor when no vehicle CO2', async () => {
    const user = await User.create({ name: 'ModeTest', email: 'mode@test.com', password: 'password123' });
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: 'mode@test.com', password: 'password123' });

    const mode = await TransportMode.create({ name: 'Bus', emissionFactor: 89 });

    await agent.post('/journeys').send({
      origin: 'X', destination: 'Y', distance: 50,
      transportModeId: mode._id.toString(),
      gradientModifier: 1.0
    });

    const journey = await Journey.findOne({ origin: 'X' });
    // 50 × 89 = 4,450
    expect(journey.emissions).toBe(4450);
    expect(journey.emissionSource).toBe('mode');
  });
});
