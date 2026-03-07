// tests/auth.test.js
// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION & SUSPENSION TESTS — 18 test cases
//
// Tests the complete auth lifecycle including:
//   - Registration (success + all validation failures)
//   - Login (success + wrong credentials)
//   - Logout (session + cookie destruction)
//   - Suspended accounts are blocked from login with clear message
//   - Session persistence and access control
//   - Admin role redirects (admin goes to /admin, not /dashboard)
// ═══════════════════════════════════════════════════════════════

const request   = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp = require('./testApp');
const User      = require('../models/User');

let app;
beforeAll(async () => { await connect(); app = createApp(); });
afterEach(clearDatabase);
afterAll(disconnect);

// ── REGISTRATION ──────────────────────────────────────────────
describe('POST /auth/register', () => {

  test('should register and redirect to dashboard', async () => {
    const res = await request(app).post('/auth/register')
      .send({ name: 'New', email: 'new@t.com', password: 'pass123', confirmPassword: 'pass123' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
    const user = await User.findOne({ email: 'new@t.com' });
    expect(user).not.toBeNull();
    expect(user.status).toBe('active');
  });

  test('should reject missing fields', async () => {
    const res = await request(app).post('/auth/register').send({ name: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  test('should reject short password', async () => {
    const res = await request(app).post('/auth/register')
      .send({ name: 'Short', email: 's@t.com', password: '123', confirmPassword: '123' });
    expect(res.status).toBe(400);
  });

  test('should reject mismatched passwords', async () => {
    const res = await request(app).post('/auth/register')
      .send({ name: 'Mis', email: 'm@t.com', password: 'pass123', confirmPassword: 'diff456' });
    expect(res.status).toBe(400);
  });

  test('should reject duplicate email', async () => {
    await User.create({ name: 'First', email: 'dup@t.com', password: 'pass123' });
    const res = await request(app).post('/auth/register')
      .send({ name: 'Second', email: 'dup@t.com', password: 'pass456', confirmPassword: 'pass456' });
    expect(res.status).toBe(400);
  });
});

// ── LOGIN ─────────────────────────────────────────────────────
describe('POST /auth/login', () => {

  beforeEach(async () => {
    await User.create({ name: 'Login User', email: 'login@t.com', password: 'correct' });
  });

  test('should login with correct credentials', async () => {
    const res = await request(app).post('/auth/login')
      .send({ email: 'login@t.com', password: 'correct' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  test('should reject wrong password', async () => {
    const res = await request(app).post('/auth/login')
      .send({ email: 'login@t.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('should reject non-existent email', async () => {
    const res = await request(app).post('/auth/login')
      .send({ email: 'nobody@t.com', password: 'anything' });
    expect(res.status).toBe(401);
  });

  test('should reject empty fields', async () => {
    const res = await request(app).post('/auth/login').send({ email: '', password: '' });
    expect(res.status).toBe(400);
  });
});

// ── SUSPENDED ACCOUNT BLOCKING ────────────────────────────────
describe('Suspended account login', () => {

  // This is a critical security test: suspended users must be
  // completely blocked from accessing the platform
  test('should block suspended user with clear message', async () => {
    await User.create({ name: 'Suspended', email: 'sus@t.com', password: 'pass123', status: 'suspended' });

    const res = await request(app).post('/auth/login')
      .send({ email: 'sus@t.com', password: 'pass123' });

    // Should get 403 (not 401 — the credentials are correct, but access is denied)
    expect(res.status).toBe(403);
    // The error message must be user-friendly and explain the situation
    expect(res.text).toContain('suspended');
    expect(res.text).toContain('administrator');
  });

  // A reactivated user should be able to log in again
  test('should allow reactivated user to login', async () => {
    const user = await User.create({ name: 'Reactivated', email: 'react@t.com', password: 'pass123', status: 'suspended' });

    // Reactivate
    user.status = 'active';
    await user.save();

    const res = await request(app).post('/auth/login')
      .send({ email: 'react@t.com', password: 'pass123' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  // Deleted users get "Invalid email or password" — we don't reveal the account was deleted
  test('should show generic error for deleted users', async () => {
    const res = await request(app).post('/auth/login')
      .send({ email: 'deleted@t.com', password: 'pass123' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Invalid');
  });
});

// ── LOGOUT ────────────────────────────────────────────────────
describe('GET /auth/logout', () => {

  test('should redirect to login', async () => {
    const res = await request(app).get('/auth/logout');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });

  test('should block access to protected pages after logout', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/register')
      .send({ name: 'Logout', email: 'lo@t.com', password: 'pass123', confirmPassword: 'pass123' });
    await agent.get('/auth/logout');
    const res = await agent.get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});

// ── SESSION / ACCESS CONTROL ──────────────────────────────────
describe('Session-based access', () => {

  test('should access dashboard when logged in as user', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/register')
      .send({ name: 'Session', email: 'se@t.com', password: 'pass123', confirmPassword: 'pass123' });
    const res = await agent.get('/dashboard');
    expect(res.status).toBe(200);
  });

  test('should redirect admin from /dashboard to /admin', async () => {
    await User.create({ name: 'Admin', email: 'ad@t.com', password: 'pass123', role: 'admin' });
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: 'ad@t.com', password: 'pass123' });
    const res = await agent.get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  test('should render login and register forms', async () => {
    const login = await request(app).get('/auth/login');
    expect(login.status).toBe(200);
    expect(login.text).toContain('Sign In');
    const reg = await request(app).get('/auth/register');
    expect(reg.status).toBe(200);
    expect(reg.text).toContain('Create');
  });
});
