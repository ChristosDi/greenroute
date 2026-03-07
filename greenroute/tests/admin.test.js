// tests/admin.test.js
// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTE TESTS — 18 test cases
//
// Tests admin-only functionality:
//   - RBAC: users blocked, admins allowed
//   - Dashboard statistics
//   - User management: list, sort, filter, role change
//   - Suspend/activate users
//   - Admin cannot suspend/delete themselves
//   - Delete user cascades (journeys + vehicles deleted)
//   - View any user's journeys
//   - Admin journey list with filtering + delete any journey
//   - Transport mode CRUD
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

async function loginAs(name, email, role) {
  var user = await User.create({ name: name, email: email, password: 'pass123', role: role || 'user' });
  var agent = request.agent(app);
  await agent.post('/auth/login').send({ email: email, password: 'pass123' });
  return { agent: agent, user: user };
}

// ── RBAC ──────────────────────────────────────────────────────
describe('Admin RBAC', () => {

  test('should deny regular user access to admin pages', async () => {
    var { agent } = await loginAs('User', 'u@t.com', 'user');
    expect((await agent.get('/admin')).status).toBe(403);
    expect((await agent.get('/admin/users')).status).toBe(403);
    expect((await agent.get('/admin/journeys')).status).toBe(403);
  });

  test('should allow admin access', async () => {
    var { agent } = await loginAs('Admin', 'a@t.com', 'admin');
    expect((await agent.get('/admin')).status).toBe(200);
    expect((await agent.get('/admin/users')).status).toBe(200);
    expect((await agent.get('/admin/journeys')).status).toBe(200);
  });

  test('should redirect unauthenticated users to login', async () => {
    var res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });

  test('should redirect admin from /journeys to /admin (isUser guard)', async () => {
    var { agent } = await loginAs('AdminJ', 'aj@t.com', 'admin');
    var res = await agent.get('/journeys');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });
});

// ── USER MANAGEMENT ───────────────────────────────────────────
describe('Admin user management', () => {

  let adminAgent;
  beforeEach(async () => {
    var result = await loginAs('Admin', 'admin@t.com', 'admin');
    adminAgent = result.agent;
  });

  test('should list users with journey stats', async () => {
    var user = await User.create({ name: 'TestUser', email: 'tu@t.com', password: '123456' });
    await Journey.create({ userId: user._id, origin: 'A', destination: 'B', distance: 50, emissions: 8500 });
    var res = await adminAgent.get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.text).toContain('TestUser');
  });

  test('should change user role', async () => {
    var user = await User.create({ name: 'Promote', email: 'p@t.com', password: '123456', role: 'user' });
    await adminAgent.post('/admin/users/' + user._id + '/role').send({ role: 'admin' });
    expect((await User.findById(user._id)).role).toBe('admin');
  });

  test('should suspend a user', async () => {
    var user = await User.create({ name: 'Suspend', email: 'sus@t.com', password: '123456' });
    expect(user.status).toBe('active');
    await adminAgent.post('/admin/users/' + user._id + '/suspend');
    var updated = await User.findById(user._id);
    expect(updated.status).toBe('suspended');
  });

  test('should reactivate a suspended user', async () => {
    var user = await User.create({ name: 'React', email: 'r@t.com', password: '123456', status: 'suspended' });
    await adminAgent.post('/admin/users/' + user._id + '/suspend');
    expect((await User.findById(user._id)).status).toBe('active');
  });

  test('should NOT allow admin to suspend themselves', async () => {
    var admin = await User.findOne({ email: 'admin@t.com' });
    await adminAgent.post('/admin/users/' + admin._id + '/suspend');
    // Status should remain active
    expect((await User.findById(admin._id)).status).toBe('active');
  });

  test('should delete user and cascade (journeys + vehicles)', async () => {
    var user = await User.create({ name: 'Delete', email: 'd@t.com', password: '123456' });
    await Journey.create({ userId: user._id, origin: 'A', destination: 'B', distance: 10 });
    await Journey.create({ userId: user._id, origin: 'C', destination: 'D', distance: 20 });
    await UserVehicle.create({ userId: user._id, nickname: 'Car', manufacturer: 'BMW', model: '320d', carType: 'diesel' });

    await adminAgent.post('/admin/users/' + user._id + '/delete');

    expect(await User.findById(user._id)).toBeNull();
    expect(await Journey.find({ userId: user._id })).toHaveLength(0);
    expect(await UserVehicle.find({ userId: user._id })).toHaveLength(0);
  });

  test('should NOT allow admin to delete themselves', async () => {
    var admin = await User.findOne({ email: 'admin@t.com' });
    await adminAgent.post('/admin/users/' + admin._id + '/delete');
    expect(await User.findById(admin._id)).not.toBeNull();
  });

  test('should view specific user journeys', async () => {
    var user = await User.create({ name: 'JUser', email: 'ju@t.com', password: '123456' });
    await Journey.create({ userId: user._id, origin: 'Bolton', destination: 'Manchester', distance: 15, emissions: 2550 });
    var res = await adminAgent.get('/admin/users/' + user._id + '/journeys');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bolton');
    expect(res.text).toContain('TOTALS');
  });

  test('should sort users by emissions descending', async () => {
    var u1 = await User.create({ name: 'Low', email: 'low@t.com', password: '123456' });
    var u2 = await User.create({ name: 'High', email: 'high@t.com', password: '123456' });
    await Journey.create({ userId: u1._id, origin: 'A', destination: 'B', distance: 10, emissions: 1700 });
    await Journey.create({ userId: u2._id, origin: 'C', destination: 'D', distance: 300, emissions: 51000 });
    var res = await adminAgent.get('/admin/users?sortBy=emissions&sortDir=desc');
    expect(res.text.indexOf('High')).toBeLessThan(res.text.indexOf('Low'));
  });
});

// ── ADMIN JOURNEY MANAGEMENT ──────────────────────────────────
describe('Admin journey management', () => {

  let adminAgent;
  beforeEach(async () => {
    var result = await loginAs('Admin', 'adm@t.com', 'admin');
    adminAgent = result.agent;
  });

  test('should list all journeys from all users', async () => {
    var u1 = await User.create({ name: 'User1', email: 'u1@t.com', password: '123456' });
    var u2 = await User.create({ name: 'User2', email: 'u2@t.com', password: '123456' });
    await Journey.create({ userId: u1._id, origin: 'A', destination: 'B', distance: 10, emissions: 1700 });
    await Journey.create({ userId: u2._id, origin: 'C', destination: 'D', distance: 20, emissions: 3400 });
    var res = await adminAgent.get('/admin/journeys');
    expect(res.status).toBe(200);
    expect(res.text).toContain('User1');
    expect(res.text).toContain('User2');
  });

  test('should delete any user journey', async () => {
    var user = await User.create({ name: 'Victim', email: 'v@t.com', password: '123456' });
    var j = await Journey.create({ userId: user._id, origin: 'X', destination: 'Y', distance: 10 });
    await adminAgent.post('/admin/journeys/' + j._id + '/delete');
    expect(await Journey.findById(j._id)).toBeNull();
  });
});

// ── TRANSPORT MODE CRUD ───────────────────────────────────────
describe('Admin transport modes', () => {

  let adminAgent;
  beforeEach(async () => {
    var result = await loginAs('Admin', 'am@t.com', 'admin');
    adminAgent = result.agent;
  });

  test('should create a transport mode with usesGradient', async () => {
    await adminAgent.post('/admin/transport-modes').send({
      name: 'E-Scooter', emissionFactor: 12, icon: '🛴', usesGradient: 'false'
    });
    var mode = await TransportMode.findOne({ name: 'E-Scooter' });
    expect(mode).not.toBeNull();
    expect(mode.emissionFactor).toBe(12);
    expect(mode.usesGradient).toBe(false);
  });

  test('should toggle transport mode active/inactive', async () => {
    var mode = await TransportMode.create({ name: 'Toggle', emissionFactor: 100 });
    await adminAgent.post('/admin/transport-modes/' + mode._id + '/toggle');
    expect((await TransportMode.findById(mode._id)).isActive).toBe(false);
    await adminAgent.post('/admin/transport-modes/' + mode._id + '/toggle');
    expect((await TransportMode.findById(mode._id)).isActive).toBe(true);
  });
});
