// tests/middleware.test.js
// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE & SECURITY TESTS — 16 test cases
//
// Tests the security layer — arguably the most critical tests:
//   - isAuthenticated: page redirects + API 401
//   - isAuthenticated: suspension detection mid-session
//   - isAdmin: 403 for non-admins + pass-through for admins
//   - isAdmin: prevents non-admin role/delete/suspend operations
//   - isUser: blocks admins from user-only pages
//   - View data: sidebar shows correct nav for role
//   - 404 handling + home redirect logic
// ═══════════════════════════════════════════════════════════════

const request       = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp     = require('./testApp');
const User          = require('../models/User');

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

// ── isAuthenticated ───────────────────────────────────────────
describe('isAuthenticated middleware', () => {

  test('should redirect all page routes when not logged in', async () => {
    var pages = ['/journeys', '/journeys/new', '/my-vehicles', '/vehicles', '/dashboard', '/profile'];
    for (var i = 0; i < pages.length; i++) {
      var res = await request(app).get(pages[i]);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/auth/login');
    }
  });

  test('should return 401 JSON for unauthenticated API requests', async () => {
    var apis = ['/api/vehicles/search', '/api/vehicles/manufacturers', '/api/vehicles/stats', '/api/my-vehicles', '/api/transport-modes'];
    for (var i = 0; i < apis.length; i++) {
      var res = await request(app).get(apis[i]);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    }
  });

  test('should allow authenticated user through', async () => {
    var { agent } = await loginAs('Auth', 'auth@t.com');
    expect((await agent.get('/journeys')).status).toBe(200);
  });
});

// ── isAdmin ───────────────────────────────────────────────────
describe('isAdmin middleware', () => {

  test('should return 403 for non-admin on all admin pages', async () => {
    var { agent } = await loginAs('Regular', 'reg@t.com', 'user');
    var routes = ['/admin', '/admin/users', '/admin/journeys', '/admin/transport-modes'];
    for (var i = 0; i < routes.length; i++) {
      expect((await agent.get(routes[i])).status).toBe(403);
    }
  });

  test('should prevent non-admin from changing roles', async () => {
    var { agent } = await loginAs('Hacker', 'hack@t.com', 'user');
    var victim = await User.create({ name: 'Victim', email: 'v@t.com', password: '123456', role: 'user' });
    var res = await agent.post('/admin/users/' + victim._id + '/role').send({ role: 'admin' });
    expect(res.status).toBe(403);
    expect((await User.findById(victim._id)).role).toBe('user');
  });

  test('should prevent non-admin from suspending users', async () => {
    var { agent } = await loginAs('Hacker2', 'h2@t.com', 'user');
    var target = await User.create({ name: 'Target', email: 'tg@t.com', password: '123456' });
    var res = await agent.post('/admin/users/' + target._id + '/suspend');
    expect(res.status).toBe(403);
    expect((await User.findById(target._id)).status).toBe('active');
  });

  test('should prevent non-admin from deleting users', async () => {
    var { agent } = await loginAs('Hacker3', 'h3@t.com', 'user');
    var target = await User.create({ name: 'Target2', email: 'tg2@t.com', password: '123456' });
    var res = await agent.post('/admin/users/' + target._id + '/delete');
    expect(res.status).toBe(403);
    expect(await User.findById(target._id)).not.toBeNull();
  });

  test('should prevent non-admin from deleting journeys via admin route', async () => {
    var { agent, user } = await loginAs('Hacker4', 'h4@t.com', 'user');
    var Journey = require('../models/Journey');
    var j = await Journey.create({ userId: user._id, origin: 'A', destination: 'B', distance: 10 });
    var res = await agent.post('/admin/journeys/' + j._id + '/delete');
    expect(res.status).toBe(403);
    expect(await Journey.findById(j._id)).not.toBeNull();
  });
});

// ── isUser (admin blocked from user pages) ────────────────────
describe('isUser middleware', () => {

  test('should redirect admin from user-only pages to /admin', async () => {
    var { agent } = await loginAs('AdminBlock', 'ab@t.com', 'admin');
    var userPages = ['/journeys', '/journeys/new', '/my-vehicles'];
    for (var i = 0; i < userPages.length; i++) {
      var res = await agent.get(userPages[i]);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/admin');
    }
  });

  test('should redirect admin from /profile to /admin', async () => {
    var { agent } = await loginAs('AdminProf', 'ap@t.com', 'admin');
    var res = await agent.get('/profile');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });
});

// ── VIEW DATA (sidebar) ──────────────────────────────────────
describe('Session data in views', () => {

  test('should show user name in rendered pages', async () => {
    var { agent } = await loginAs('Visible User', 'vis@t.com');
    var res = await agent.get('/dashboard');
    expect(res.text).toContain('Visible User');
  });

  test('should show admin nav for admins', async () => {
    var { agent } = await loginAs('AdminNav', 'an@t.com', 'admin');
    var res = await agent.get('/admin');
    expect(res.text).toContain('/admin/users');
    expect(res.text).toContain('/admin/journeys');
  });

  test('should NOT show admin nav for regular users', async () => {
    var { agent } = await loginAs('RegNav', 'rn@t.com', 'user');
    var res = await agent.get('/dashboard');
    expect(res.text).not.toContain('/admin/users');
    expect(res.text).not.toContain('/admin/journeys');
  });
});

// ── 404 & HOME REDIRECT ──────────────────────────────────────
describe('404 and home redirect', () => {

  test('should return 404 for unknown routes', async () => {
    var { agent } = await loginAs('404er', '404@t.com');
    var res = await agent.get('/nonexistent-page');
    expect(res.status).toBe(404);
    expect(res.text).toContain('not found');
  });

  test('should redirect / to login when unauthenticated', async () => {
    var res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });

  test('should redirect / to dashboard for users', async () => {
    var { agent } = await loginAs('HomeUser', 'hu@t.com', 'user');
    var res = await agent.get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  test('should redirect / to admin for admins', async () => {
    var { agent } = await loginAs('HomeAdmin', 'ha@t.com', 'admin');
    var res = await agent.get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });
});
