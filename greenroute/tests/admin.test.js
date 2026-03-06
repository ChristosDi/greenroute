// tests/admin.test.js
// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTE TESTS
//
// Tests admin-only functionality:
//   - Role-based access control (users can't access admin pages)
//   - Admin dashboard statistics
//   - User management (list, role change, delete, view journeys)
//   - Transport mode CRUD (create, toggle, delete)
//   - Filtering and sorting users
//
// Total: 14 test cases
// ═══════════════════════════════════════════════════════════════

const request       = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp     = require('./testApp');
const User          = require('../models/User');
const Journey       = require('../models/Journey');
const TransportMode = require('../models/TransportMode');

let app;

beforeAll(async () => {
  await connect();
  app = createApp();
});

afterEach(clearDatabase);
afterAll(disconnect);

/** Helper: create a user and return an authenticated agent */
async function loginAs(name, email, role) {
  const user = await User.create({ name, email, password: 'password123', role: role || 'user' });
  const ag = request.agent(app);
  await ag.post('/auth/login').send({ email, password: 'password123' });
  return { agent: ag, user };
}


// ═══════════════════════════════════════════════════════════════
// ROLE-BASED ACCESS CONTROL (RBAC)
// ═══════════════════════════════════════════════════════════════
describe('Admin RBAC', () => {

  // Test 1: Regular users CANNOT access admin dashboard
  test('should deny regular user access to admin dashboard', async () => {
    const { agent } = await loginAs('Regular', 'reg@test.com', 'user');
    const res = await agent.get('/admin');
    expect(res.status).toBe(403);
  });

  // Test 2: Regular users CANNOT access user management
  test('should deny regular user access to admin/users', async () => {
    const { agent } = await loginAs('Regular', 'reg2@test.com', 'user');
    const res = await agent.get('/admin/users');
    expect(res.status).toBe(403);
  });

  // Test 3: Admin CAN access admin dashboard
  test('should allow admin access to dashboard', async () => {
    const { agent } = await loginAs('Admin', 'admin@test.com', 'admin');
    const res = await agent.get('/admin');
    expect(res.status).toBe(200);
  });

  // Test 4: Unauthenticated users are redirected to login
  test('should redirect unauthenticated users from admin', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});


// ═══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
describe('GET /admin — Dashboard', () => {

  // Test 5: Dashboard shows correct statistics
  test('should display platform statistics', async () => {
    // Create some test data
    const u1 = await User.create({ name: 'User1', email: 'u1@t.com', password: '123456' });
    const u2 = await User.create({ name: 'User2', email: 'u2@t.com', password: '123456' });
    await Journey.create({ userId: u1._id, origin: 'A', destination: 'B', distance: 100, emissions: 17000 });
    await Journey.create({ userId: u2._id, origin: 'C', destination: 'D', distance: 200, emissions: 34000 });

    // Login as admin
    const { agent } = await loginAs('Admin', 'admin@test.com', 'admin');
    const res = await agent.get('/admin');

    expect(res.status).toBe(200);
    // Dashboard should show user count (3: u1, u2, admin)
    expect(res.text).toContain('3');
    // Should show journey count
    expect(res.text).toContain('2');
  });
});


// ═══════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════
describe('Admin User Management', () => {

  let adminAgent;

  beforeEach(async () => {
    const result = await loginAs('Admin', 'admin@test.com', 'admin');
    adminAgent = result.agent;
  });

  // Test 6: List all users with stats
  test('should list users with journey stats', async () => {
    const user = await User.create({ name: 'TestUser', email: 'tu@t.com', password: '123456' });
    await Journey.create({ userId: user._id, origin: 'A', destination: 'B', distance: 50, emissions: 8500 });

    const res = await adminAgent.get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.text).toContain('TestUser');
    expect(res.text).toContain('tu@t.com');
  });

  // Test 7: Change user role
  test('should update user role', async () => {
    const user = await User.create({ name: 'Promote', email: 'promo@t.com', password: '123456', role: 'user' });

    const res = await adminAgent.post('/admin/users/' + user._id + '/role').send({ role: 'admin' });
    expect(res.status).toBe(302);

    const updated = await User.findById(user._id);
    expect(updated.role).toBe('admin');
  });

  // Test 8: Delete a user and their data
  test('should delete user and their journeys', async () => {
    const user = await User.create({ name: 'Delete Me', email: 'del@t.com', password: '123456' });
    await Journey.create({ userId: user._id, origin: 'A', destination: 'B', distance: 10 });
    await Journey.create({ userId: user._id, origin: 'C', destination: 'D', distance: 20 });

    const res = await adminAgent.post('/admin/users/' + user._id + '/delete');
    expect(res.status).toBe(302);

    // User should be gone
    const deleted = await User.findById(user._id);
    expect(deleted).toBeNull();

    // All their journeys should be gone too
    const orphanJourneys = await Journey.find({ userId: user._id });
    expect(orphanJourneys).toHaveLength(0);
  });

  // Test 9: Admin cannot delete themselves
  test('should not allow self-deletion', async () => {
    const admin = await User.findOne({ email: 'admin@test.com' });

    await adminAgent.post('/admin/users/' + admin._id + '/delete');

    // Admin should still exist
    const stillExists = await User.findById(admin._id);
    expect(stillExists).not.toBeNull();
  });

  // Test 10: View a specific user's journeys
  test('should show all journeys for a specific user', async () => {
    const user = await User.create({ name: 'Journey User', email: 'ju@t.com', password: '123456' });
    await Journey.create({ userId: user._id, origin: 'Bolton', destination: 'Manchester', distance: 15, emissions: 2550 });
    await Journey.create({ userId: user._id, origin: 'Manchester', destination: 'Leeds', distance: 70, emissions: 11900 });

    const res = await adminAgent.get('/admin/users/' + user._id + '/journeys');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Journey User');
    expect(res.text).toContain('Bolton');
    expect(res.text).toContain('Leeds');
    // Should show totals
    expect(res.text).toContain('TOTALS');
  });

  // Test 11: Sort users by emissions
  test('should sort users by emissions descending', async () => {
    const u1 = await User.create({ name: 'Low Emitter', email: 'low@t.com', password: '123456' });
    const u2 = await User.create({ name: 'High Emitter', email: 'high@t.com', password: '123456' });
    await Journey.create({ userId: u1._id, origin: 'A', destination: 'B', distance: 10, emissions: 1700 });
    await Journey.create({ userId: u2._id, origin: 'C', destination: 'D', distance: 300, emissions: 51000 });

    const res = await adminAgent.get('/admin/users?sortBy=emissions&sortDir=desc');
    expect(res.status).toBe(200);
    // High emitter should appear before low emitter in the HTML
    const highPos = res.text.indexOf('High Emitter');
    const lowPos  = res.text.indexOf('Low Emitter');
    expect(highPos).toBeLessThan(lowPos);
  });

  // Test 12: Filter users by role
  test('should filter users by role', async () => {
    await User.create({ name: 'Plain User', email: 'plain@t.com', password: '123456', role: 'user' });

    const res = await adminAgent.get('/admin/users?role=admin');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Admin');
    expect(res.text).not.toContain('Plain User');
  });
});


// ═══════════════════════════════════════════════════════════════
// TRANSPORT MODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
describe('Admin Transport Modes', () => {

  let adminAgent;

  beforeEach(async () => {
    const result = await loginAs('Admin', 'admin2@test.com', 'admin');
    adminAgent = result.agent;
  });

  // Test 13: Create a new transport mode
  test('should create a transport mode', async () => {
    const res = await adminAgent.post('/admin/transport-modes').send({
      name: 'E-Scooter',
      emissionFactor: 12,
      icon: '🛴',
      description: 'Electric scooter'
    });

    expect(res.status).toBe(302);

    const mode = await TransportMode.findOne({ name: 'E-Scooter' });
    expect(mode).not.toBeNull();
    expect(mode.emissionFactor).toBe(12);
    expect(mode.isActive).toBe(true);
  });

  // Test 14: Toggle transport mode active/inactive
  test('should toggle transport mode status', async () => {
    const mode = await TransportMode.create({ name: 'Toggle Test', emissionFactor: 100 });
    expect(mode.isActive).toBe(true);

    // Toggle off
    await adminAgent.post('/admin/transport-modes/' + mode._id + '/toggle');
    let updated = await TransportMode.findById(mode._id);
    expect(updated.isActive).toBe(false);

    // Toggle back on
    await adminAgent.post('/admin/transport-modes/' + mode._id + '/toggle');
    updated = await TransportMode.findById(mode._id);
    expect(updated.isActive).toBe(true);
  });
});
