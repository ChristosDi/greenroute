// tests/journeys.test.js
// ═══════════════════════════════════════════════════════════════
// JOURNEY CRUD & EMISSION CALCULATION TESTS — 18 test cases
//
// Tests the full journey lifecycle plus the emission logic:
//   - Create with gradient and emission calculation
//   - Transport mode is mandatory
//   - Gradient only applies to road vehicles (usesGradient=true)
//   - Vehicle CO2 overrides transport mode factor
//   - Vehicle without CO2 falls back to carType standard
//   - Manual distance override
//   - CRUD operations with access control
// ═══════════════════════════════════════════════════════════════

const request       = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp     = require('./testApp');
const User          = require('../models/User');
const Journey       = require('../models/Journey');
const TransportMode = require('../models/TransportMode');
const UserVehicle   = require('../models/UserVehicle');

let app;
beforeAll(async () => { await connect(); app = createApp(); });
afterEach(clearDatabase);
afterAll(disconnect);

// Helper: register and login, return agent + user
async function loginAs(name, email, role) {
  var user = await User.create({ name: name, email: email, password: 'pass123', role: role || 'user' });
  var agent = request.agent(app);
  await agent.post('/auth/login').send({ email: email, password: 'pass123' });
  return { agent: agent, user: user };
}

// ── CREATE ────────────────────────────────────────────────────
describe('POST /journeys — Create', () => {

  let agent, testUser, carMode, trainMode;
  beforeEach(async () => {
    carMode   = await TransportMode.create({ name: 'Car (Petrol)', emissionFactor: 170, usesGradient: true });
    trainMode = await TransportMode.create({ name: 'Train', emissionFactor: 41, usesGradient: false });
    var result = await loginAs('Tester', 'test@t.com');
    agent = result.agent; testUser = result.user;
  });

  test('should create journey with gradient-adjusted emissions for road vehicle', async () => {
    var res = await agent.post('/journeys').send({
      origin: 'Manchester', destination: 'London', distance: 330,
      transportModeId: carMode._id.toString(),
      gradient: -0.14, elevationGain: 1240, elevationLoss: 1285, gradientModifier: 1.042
    });
    expect(res.status).toBe(302);
    var j = await Journey.findOne({ origin: 'Manchester' });
    // Car uses gradient: emissions = 330 * 170 * 1.042 = 58,459
    expect(j.emissions).toBe(Math.round(330 * 170 * 1.042));
    expect(j.gradientModifier).toBe(1.042);
    expect(j.gradient).toBe(-0.14);
  });

  test('should NOT apply gradient for train (usesGradient=false)', async () => {
    await agent.post('/journeys').send({
      origin: 'Bolton', destination: 'Leeds', distance: 100,
      transportModeId: trainMode._id.toString(),
      gradient: 2.5, elevationGain: 500, elevationLoss: 300, gradientModifier: 1.08
    });
    var j = await Journey.findOne({ origin: 'Bolton' });
    // Train ignores gradient: modifier forced to 1.0, gradient fields zeroed
    expect(j.gradientModifier).toBe(1.0);
    expect(j.gradient).toBe(0);
    expect(j.elevationGain).toBe(0);
    expect(j.elevationLoss).toBe(0);
    // Emissions = 100 * 41 * 1.0 = 4100 (no gradient impact)
    expect(j.emissions).toBe(4100);
  });

  test('should require transport mode (mandatory)', async () => {
    var res = await agent.post('/journeys').send({
      origin: 'A', destination: 'B', distance: 50
      // No transportModeId
    });
    expect(res.status).toBe(400);
  });

  test('should use manual distance when provided', async () => {
    await agent.post('/journeys').send({
      origin: 'A', destination: 'B', distance: 100, manualDistance: 150,
      transportModeId: carMode._id.toString(), gradientModifier: 1.0
    });
    var j = await Journey.findOne({ origin: 'A' });
    expect(j.distance).toBe(150);
  });

  test('should default gradient modifier to 1.0', async () => {
    await agent.post('/journeys').send({
      origin: 'X', destination: 'Y', distance: 50,
      transportModeId: carMode._id.toString()
    });
    var j = await Journey.findOne({ origin: 'X' });
    expect(j.gradientModifier).toBe(1.0);
    expect(j.emissions).toBe(8500); // 50 * 170
  });

  test('should reject missing origin/destination', async () => {
    var res = await agent.post('/journeys').send({
      destination: 'B', distance: 100, transportModeId: carMode._id.toString()
    });
    expect(res.status).toBe(400);
  });
});

// ── VEHICLE CO2 PRIORITY ──────────────────────────────────────
describe('Vehicle CO2 emission priority', () => {

  let agent, testUser, carMode;
  beforeEach(async () => {
    carMode = await TransportMode.create({ name: 'Car', emissionFactor: 170, usesGradient: true });
    var result = await loginAs('VehTest', 'vt@t.com');
    agent = result.agent; testUser = result.user;
  });

  test('should use vehicle Euro 6 CO2 over transport mode factor', async () => {
    var vehicle = await UserVehicle.create({
      userId: testUser._id, nickname: 'Eco', manufacturer: 'BMW', model: '320d',
      carType: 'diesel', co2: 127
    });
    await agent.post('/journeys').send({
      origin: 'A', destination: 'B', distance: 100,
      transportModeId: carMode._id.toString(),
      userVehicleId: vehicle._id.toString(), gradientModifier: 1.0
    });
    var j = await Journey.findOne({ origin: 'A' });
    expect(j.emissions).toBe(12700); // 100 * 127, not 100 * 170
    expect(j.emissionSource).toBe('vehicle');
  });

  test('should fall back to carType standard when vehicle has no CO2', async () => {
    var vehicle = await UserVehicle.create({
      userId: testUser._id, nickname: 'Old', manufacturer: 'Ford', model: 'Focus',
      carType: 'diesel', co2: null // No Euro 6 data
    });
    await agent.post('/journeys').send({
      origin: 'C', destination: 'D', distance: 100,
      transportModeId: carMode._id.toString(),
      userVehicleId: vehicle._id.toString(), gradientModifier: 1.0
    });
    var j = await Journey.findOne({ origin: 'C' });
    expect(j.emissions).toBe(15500); // 100 * 155 (diesel standard)
    expect(j.emissionSource).toBe('vehicle');
  });

  test('should use mode factor when no vehicle selected', async () => {
    await agent.post('/journeys').send({
      origin: 'E', destination: 'F', distance: 50,
      transportModeId: carMode._id.toString(), gradientModifier: 1.0
    });
    var j = await Journey.findOne({ origin: 'E' });
    expect(j.emissions).toBe(8500); // 50 * 170
    expect(j.emissionSource).toBe('mode');
  });
});

// ── LIST / SHOW / EDIT / DELETE ───────────────────────────────
describe('Journey CRUD operations', () => {

  let agent, testUser, carMode;
  beforeEach(async () => {
    carMode = await TransportMode.create({ name: 'Car', emissionFactor: 170, usesGradient: true });
    var result = await loginAs('CRUD', 'crud@t.com');
    agent = result.agent; testUser = result.user;
  });

  test('should list only own journeys', async () => {
    await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 10 });
    var other = await User.create({ name: 'Other', email: 'o@t.com', password: '123456' });
    await Journey.create({ userId: other._id, origin: 'X', destination: 'Y', distance: 20 });
    var res = await agent.get('/journeys');
    expect(res.status).toBe(200);
    expect(res.text).toContain('A');
  });

  test('should show journey detail', async () => {
    var j = await Journey.create({ userId: testUser._id, origin: 'Bolton', destination: 'Leeds', distance: 80, emissions: 13600 });
    var res = await agent.get('/journeys/' + j._id);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bolton');
  });

  test('should return 404 for other users journey', async () => {
    var other = await User.create({ name: 'O', email: 'oo@t.com', password: '123456' });
    var j = await Journey.create({ userId: other._id, origin: 'X', destination: 'Y', distance: 10 });
    var res = await agent.get('/journeys/' + j._id);
    expect(res.status).toBe(404);
  });

  test('should update journey', async () => {
    var j = await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 100, transportMode: carMode._id });
    var res = await agent.post('/journeys/' + j._id).send({
      origin: 'Manchester', destination: 'Birmingham', distance: 140,
      transportModeId: carMode._id.toString(), gradientModifier: 1.1
    });
    expect(res.status).toBe(302);
    var updated = await Journey.findById(j._id);
    expect(updated.origin).toBe('Manchester');
    expect(updated.emissions).toBe(Math.round(140 * 170 * 1.1));
  });

  test('should delete own journey', async () => {
    var j = await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 10 });
    await agent.post('/journeys/' + j._id + '/delete');
    expect(await Journey.findById(j._id)).toBeNull();
  });

  test('should not delete other users journey', async () => {
    var other = await User.create({ name: 'O2', email: 'o2@t.com', password: '123456' });
    var j = await Journey.create({ userId: other._id, origin: 'X', destination: 'Y', distance: 10 });
    await agent.post('/journeys/' + j._id + '/delete');
    expect(await Journey.findById(j._id)).not.toBeNull();
  });

  test('should render new journey form with transport modes', async () => {
    var res = await agent.get('/journeys/new');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Car');
  });
});
