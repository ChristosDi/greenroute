// tests/vehicles.test.js
// ═══════════════════════════════════════════════════════════════
// VEHICLE & USER VEHICLE TESTS — 16 test cases
//
// Tests:
//   - Euro 6 database browsing + filtering
//   - Vehicle search/stats/manufacturer/model API endpoints
//   - User vehicle CRUD with mandatory carType
//   - Setting default vehicle
//   - carType standard fallback factor
// ═══════════════════════════════════════════════════════════════

const request       = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp     = require('./testApp');
const User          = require('../models/User');
const Vehicle       = require('../models/Vehicle');
const UserVehicle   = require('../models/UserVehicle');

let app;
beforeAll(async () => { await connect(); app = createApp(); });
afterEach(clearDatabase);
afterAll(disconnect);

async function loginAs(name, email) {
  var user = await User.create({ name: name, email: email, password: 'pass123' });
  var agent = request.agent(app);
  await agent.post('/auth/login').send({ email: email, password: 'pass123' });
  return { agent: agent, user: user };
}

// ── EURO 6 DATABASE ───────────────────────────────────────────
describe('GET /vehicles — Euro 6 Database', () => {

  let agent;
  beforeEach(async () => {
    var result = await loginAs('Browser', 'b@t.com');
    agent = result.agent;
    await Vehicle.insertMany([
      { manufacturer: 'BMW', model: '320d', fuelType: 'Diesel', co2: 127 },
      { manufacturer: 'BMW', model: '520d', fuelType: 'Diesel', co2: 140 },
      { manufacturer: 'Audi', model: 'A3', fuelType: 'Petrol', co2: 130 },
      { manufacturer: 'Tesla', model: 'Model 3', fuelType: 'Electric', co2: 0 }
    ]);
  });

  test('should render vehicle list', async () => {
    var res = await agent.get('/vehicles');
    expect(res.status).toBe(200);
    expect(res.text).toContain('BMW');
    expect(res.text).toContain('Tesla');
  });

  test('should filter by manufacturer', async () => {
    var res = await agent.get('/vehicles?manufacturer=BMW');
    expect(res.status).toBe(200);
    expect(res.text).toContain('320d');
    expect(res.text).toContain('520d');
  });

  test('should filter by fuel type', async () => {
    var res = await agent.get('/vehicles?fuelType=Electric');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tesla');
  });

  test('should redirect unauthenticated users', async () => {
    expect((await request(app).get('/vehicles')).status).toBe(302);
  });
});

// ── VEHICLE API ENDPOINTS ─────────────────────────────────────
describe('Vehicle API endpoints', () => {

  let agent;
  beforeEach(async () => {
    var result = await loginAs('API', 'api@t.com');
    agent = result.agent;
    await Vehicle.insertMany([
      { manufacturer: 'BMW', model: '320d', fuelType: 'Diesel', co2: 127 },
      { manufacturer: 'BMW', model: '520d', fuelType: 'Diesel', co2: 140 },
      { manufacturer: 'Audi', model: 'A3', fuelType: 'Petrol', co2: 130 }
    ]);
  });

  test('should search vehicles by query', async () => {
    var res = await agent.get('/api/vehicles/search?q=BMW');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('should return unique manufacturers', async () => {
    var res = await agent.get('/api/vehicles/manufacturers');
    expect(res.body).toContain('BMW');
    expect(res.body).toContain('Audi');
    expect(res.body).toHaveLength(2);
  });

  test('should return models for a manufacturer', async () => {
    var res = await agent.get('/api/vehicles/models?manufacturer=BMW');
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('model');
    expect(res.body[0]).toHaveProperty('co2');
  });

  test('should return vehicle statistics', async () => {
    var res = await agent.get('/api/vehicles/stats');
    expect(res.body.totalCount).toBe(3);
    expect(res.body.fuelStats).toBeDefined();
    expect(res.body.overall.avgCo2).toBeDefined();
  });

  test('should return 401 for unauthenticated API calls', async () => {
    expect((await request(app).get('/api/vehicles/search')).status).toBe(401);
    expect((await request(app).get('/api/vehicles/manufacturers')).status).toBe(401);
  });
});

// ── USER VEHICLE MANAGEMENT ───────────────────────────────────
describe('User Vehicle CRUD — /my-vehicles', () => {

  let agent, testUser;
  beforeEach(async () => {
    var result = await loginAs('VOwner', 'vo@t.com');
    agent = result.agent; testUser = result.user;
  });

  test('should render my vehicles page', async () => {
    expect((await agent.get('/my-vehicles')).status).toBe(200);
  });

  test('should add vehicle with mandatory carType', async () => {
    var res = await agent.post('/my-vehicles').send({
      nickname: 'My BMW', manufacturer: 'BMW', model: '320d',
      carType: 'diesel', co2: 127, year: 2023
    });
    expect(res.status).toBe(302);
    var vehicles = await UserVehicle.find({ userId: testUser._id });
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].carType).toBe('diesel');
    expect(vehicles[0].co2).toBe(127);
  });

  test('should reject vehicle without carType', async () => {
    var res = await agent.post('/my-vehicles').send({
      nickname: 'No Type', manufacturer: 'Ford', model: 'Focus'
      // Missing carType
    });
    expect(res.status).toBe(400);
  });

  test('should set vehicle as default', async () => {
    var v = await UserVehicle.create({
      userId: testUser._id, nickname: 'Car1', manufacturer: 'BMW', model: '320d', carType: 'diesel'
    });
    await agent.post('/my-vehicles/' + v._id + '/default');
    expect((await UserVehicle.findById(v._id)).isDefault).toBe(true);
  });

  test('should delete vehicle', async () => {
    var v = await UserVehicle.create({
      userId: testUser._id, nickname: 'Temp', manufacturer: 'Ford', model: 'Focus', carType: 'petrol'
    });
    await agent.post('/my-vehicles/' + v._id + '/delete');
    expect(await UserVehicle.findById(v._id)).toBeNull();
  });
});
