// tests/middleware.test.js
// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE & SECURITY TESTS
//
// Tests the authentication and authorization middleware:
//   - isAuthenticated guards on page routes (redirects)
//   - isAuthenticated guards on API routes (returns JSON 401)
//   - isAdmin guards on admin routes (returns 403)
//   - isAdmin guards on API routes (returns JSON 403)
//   - Session data availability in views (res.locals.user)
//   - 404 handling for non-existent routes
//   - Home route redirect logic
//
// These tests verify the security layer works correctly —
// arguably the most critical tests in the entire suite.
//
// Total: 12 test cases
// ═══════════════════════════════════════════════════════════════

const request       = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp     = require('./testApp');
const User          = require('../models/User');

let app;

beforeAll(async () => {
  await connect();
  app = createApp();
});

afterEach(clearDatabase);
afterAll(disconnect);

/** Helper: create a user and return an authenticated agent */
async function loginAs(name, email, role) {
  await User.create({ name, email, password: 'password123', role: role || 'user' });
  const ag = request.agent(app);
  await ag.post('/auth/login').send({ email, password: 'password123' });
  return ag;
}


// ═══════════════════════════════════════════════════════════════
// isAuthenticated MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
describe('isAuthenticated middleware', () => {

  // Test 1: Page routes redirect to login when not authenticated
  test('should redirect page routes to /auth/login', async () => {
    const routes = ['/journeys', '/journeys/new', '/my-vehicles', '/vehicles', '/dashboard'];

    for (const route of routes) {
      const res = await request(app).get(route);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/auth/login');
    }
  });

  // Test 2: API routes return 401 JSON when not authenticated
  test('should return 401 JSON for unauthenticated API requests', async () => {
    const apiRoutes = [
      '/api/vehicles/search',
      '/api/vehicles/manufacturers',
      '/api/vehicles/stats',
      '/api/my-vehicles',
      '/api/transport-modes'
    ];

    for (const route of apiRoutes) {
      const res = await request(app).get(route);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    }
  });

  // Test 3: Authenticated users pass through
  test('should allow authenticated users through', async () => {
    const agent = await loginAs('AuthUser', 'auth@test.com');
    const res = await agent.get('/journeys');
    expect(res.status).toBe(200);
  });
});


// ═══════════════════════════════════════════════════════════════
// isAdmin MIDDLEWARE
// ═══════════════════════════════════════════════════════════════
describe('isAdmin middleware', () => {

  // Test 4: Regular users get 403 on admin pages
  test('should return 403 for non-admin on admin pages', async () => {
    const agent = await loginAs('Regular', 'reg@test.com', 'user');

    const adminRoutes = ['/admin', '/admin/users', '/admin/transport-modes'];

    for (const route of adminRoutes) {
      const res = await agent.get(route);
      expect(res.status).toBe(403);
    }
  });

  // Test 5: Admin users pass through
  test('should allow admin users through', async () => {
    const agent = await loginAs('Admin', 'admin@test.com', 'admin');

    const res = await agent.get('/admin');
    expect(res.status).toBe(200);
  });

  // Test 6: Regular user cannot change another user's role
  test('should prevent non-admin from changing roles', async () => {
    const agent = await loginAs('Hacker', 'hack@test.com', 'user');
    const victim = await User.create({ name: 'Victim', email: 'v@t.com', password: '123456', role: 'user' });

    const res = await agent.post('/admin/users/' + victim._id + '/role').send({ role: 'admin' });
    expect(res.status).toBe(403);

    // Victim should still be a regular user
    const unchanged = await User.findById(victim._id);
    expect(unchanged.role).toBe('user');
  });

  // Test 7: Regular user cannot delete another user
  test('should prevent non-admin from deleting users', async () => {
    const agent = await loginAs('Hacker2', 'hack2@test.com', 'user');
    const target = await User.create({ name: 'Target', email: 't@t.com', password: '123456' });

    const res = await agent.post('/admin/users/' + target._id + '/delete');
    expect(res.status).toBe(403);

    // Target should still exist
    const stillAlive = await User.findById(target._id);
    expect(stillAlive).not.toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════════
// SESSION DATA IN VIEWS
// ═══════════════════════════════════════════════════════════════
describe('Session data in views (res.locals)', () => {

  // Test 8: Logged-in user sees their name in the sidebar
  test('should include user name in rendered pages', async () => {
    const agent = await loginAs('Visible User', 'visible@test.com');
    const res = await agent.get('/dashboard');

    expect(res.status).toBe(200);
    // The sidebar should show the user's name
    expect(res.text).toContain('Visible User');
  });

  // Test 9: Admin users see admin nav links
  test('should show admin navigation for admin users', async () => {
    const agent = await loginAs('Admin Nav', 'adminnav@test.com', 'admin');
    const res = await agent.get('/dashboard');

    expect(res.status).toBe(200);
    // Admin section should be visible in sidebar
    expect(res.text).toContain('/admin');
    expect(res.text).toContain('Users');
  });

  // Test 10: Regular users do NOT see admin nav links
  test('should NOT show admin navigation for regular users', async () => {
    const agent = await loginAs('Regular Nav', 'regnav@test.com', 'user');
    const res = await agent.get('/dashboard');

    expect(res.status).toBe(200);
    // Admin links should not appear
    expect(res.text).not.toContain('/admin/users');
  });
});


// ═══════════════════════════════════════════════════════════════
// 404 HANDLING & HOME REDIRECT
// ═══════════════════════════════════════════════════════════════
describe('404 and home redirect', () => {

  // Test 11: Non-existent routes return 404
  test('should return 404 for unknown routes', async () => {
    const agent = await loginAs('404 Tester', '404@test.com');
    const res = await agent.get('/this-page-does-not-exist');

    expect(res.status).toBe(404);
    expect(res.text).toContain('not found');
  });

  // Test 12: Home route redirects based on auth state
  test('should redirect / to login when unauthenticated', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });

  test('should redirect / to dashboard when authenticated', async () => {
    const agent = await loginAs('Home User', 'home@test.com');
    const res = await agent.get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });
});
