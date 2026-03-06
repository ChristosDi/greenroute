// tests/auth.test.js
// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION ROUTE TESTS
//
// Tests the complete authentication flow:
//   - User registration (success + validation failures)
//   - User login (success + wrong credentials)
//   - Logout (session destruction + cookie clearing)
//   - Access control (protected routes redirect unauthenticated users)
//
// Uses Supertest to send real HTTP requests to the Express app.
// A Supertest 'agent' is used to persist cookies between requests
// (simulating a real browser session).
//
// Total: 15 test cases
// ═══════════════════════════════════════════════════════════════

const request   = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp = require('./testApp');
const User      = require('../models/User');

let app;

beforeAll(async () => {
  await connect();
  app = createApp();
});

afterEach(clearDatabase);
afterAll(disconnect);


// ═══════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════
describe('POST /auth/register', () => {

  // Test 1: Successful registration redirects to dashboard
  test('should register a new user and redirect', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: 'New User',
        email: 'new@test.com',
        password: 'password123',
        confirmPassword: 'password123'
      });

    // 302 = redirect (to /dashboard)
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');

    // Verify user was actually created in the database
    const user = await User.findOne({ email: 'new@test.com' });
    expect(user).not.toBeNull();
    expect(user.name).toBe('New User');
  });

  // Test 2: Missing fields should return 400
  test('should reject registration with missing fields', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'Incomplete' });
    // Should render the form with an error, status 400
    expect(res.status).toBe(400);
  });

  // Test 3: Password too short should fail
  test('should reject password shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: 'Short Pass', email: 'short@test.com',
        password: '123', confirmPassword: '123'
      });

    expect(res.status).toBe(400);
  });

  // Test 4: Mismatched passwords should fail
  test('should reject mismatched passwords', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: 'Mismatch', email: 'mismatch@test.com',
        password: 'password123', confirmPassword: 'different456'
      });

    expect(res.status).toBe(400);
  });

  // Test 5: Duplicate email should fail
  test('should reject duplicate email registration', async () => {
    // Register first user
    await User.create({ name: 'First', email: 'dup@test.com', password: 'password123' });

    // Try to register with same email
    const res = await request(app)
      .post('/auth/register')
      .send({
        name: 'Second', email: 'dup@test.com',
        password: 'password456', confirmPassword: 'password456'
      });

    expect(res.status).toBe(400);
  });
});


// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
describe('POST /auth/login', () => {

  // Create a test user before login tests
  beforeEach(async () => {
    await User.create({
      name: 'Login User',
      email: 'login@test.com',
      password: 'correctPassword'
    });
  });

  // Test 6: Successful login redirects to dashboard
  test('should login with correct credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@test.com', password: 'correctPassword' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/dashboard');
  });

  // Test 7: Wrong password should return 401
  test('should reject wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@test.com', password: 'wrongPassword' });

    expect(res.status).toBe(401);
  });

  // Test 8: Non-existent email should return 401
  test('should reject non-existent email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: 'anyPassword' });

    expect(res.status).toBe(401);
  });

  // Test 9: Missing fields should return 400
  test('should reject empty login fields', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: '', password: '' });

    expect(res.status).toBe(400);
  });
});


// ═══════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════
describe('GET /auth/logout', () => {

  // Test 10: Logout should redirect to login page
  test('should redirect to login after logout', async () => {
    const res = await request(app).get('/auth/logout');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});


// ═══════════════════════════════════════════════════════════════
// SESSION PERSISTENCE — using an agent to maintain cookies
// ═══════════════════════════════════════════════════════════════
describe('Session-based access control', () => {

  // Test 11: Authenticated user can access dashboard
  test('should access dashboard when logged in', async () => {
    // Use an agent to persist cookies across requests
    const agent = request.agent(app);

    // Register (which also logs in)
    await agent.post('/auth/register').send({
      name: 'Session User', email: 'session@test.com',
      password: 'password123', confirmPassword: 'password123'
    });

    // Now access dashboard — should get 200 (not redirect)
    const dashRes = await agent.get('/dashboard');
    expect(dashRes.status).toBe(200);
  });

  // Test 12: Unauthenticated user gets redirected from dashboard
  test('should redirect to login when not authenticated', async () => {
    const res = await request(app).get('/dashboard');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });

  // Test 13: Unauthenticated user gets redirected from journeys
  test('should redirect to login from protected routes', async () => {
    const res = await request(app).get('/journeys');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });

  // Test 14: After logout, protected routes redirect again
  test('should not access dashboard after logout', async () => {
    const agent = request.agent(app);

    // Register + auto-login
    await agent.post('/auth/register').send({
      name: 'Logout Test', email: 'logout@test.com',
      password: 'password123', confirmPassword: 'password123'
    });

    // Logout
    await agent.get('/auth/logout');

    // Try dashboard — should redirect to login
    const res = await agent.get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});


// ═══════════════════════════════════════════════════════════════
// RENDER FORMS
// ═══════════════════════════════════════════════════════════════
describe('Auth form pages', () => {

  // Test 15: Login form renders
  test('should render login page', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign In');
  });

  // Test 16: Register form renders
  test('should render register page', async () => {
    const res = await request(app).get('/auth/register');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Create');
  });
});
