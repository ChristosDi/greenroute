// tests/journeys.test.js
// ═══════════════════════════════════════════════════════════════
// JOURNEY CRUD ROUTE TESTS
//
// Tests the full Create-Read-Update-Delete lifecycle:
//   - Creating journeys with all fields including gradient data
//   - Listing journeys (only shows user's own journeys)
//   - Viewing a single journey's detail page
//   - Editing a journey
//   - Deleting a journey
//   - Emission calculation with gradient modifier
//   - Access control (can't see other users' journeys)
//
// Total: 14 test cases
// ═══════════════════════════════════════════════════════════════

const request       = require('supertest');
const { connect, disconnect, clearDatabase } = require('./setup');
const createApp     = require('./testApp');
const User          = require('../models/User');
const Journey       = require('../models/Journey');
const TransportMode = require('../models/TransportMode');

let app, agent, testUser, carMode;

beforeAll(async () => {
  await connect();
  app = createApp();
});

afterEach(clearDatabase);
afterAll(disconnect);

/**
 * Helper: register a user and return an authenticated agent
 * The agent persists cookies, simulating a logged-in browser
 */
async function loginAs(name, email, role) {
  const user = await User.create({ name, email, password: 'password123', role: role || 'user' });
  const ag = request.agent(app);
  await ag.post('/auth/login').send({ email, password: 'password123' });
  return { agent: ag, user };
}

// Before each test, create a transport mode and log in
beforeEach(async () => {
  carMode = await TransportMode.create({
    name: 'Car (Petrol)', emissionFactor: 170, icon: '🚗'
  });

  const result = await loginAs('Journey Tester', 'journey@test.com');
  agent = result.agent;
  testUser = result.user;
});


// ═══════════════════════════════════════════════════════════════
// CREATE JOURNEY
// ═══════════════════════════════════════════════════════════════
describe('POST /journeys — Create', () => {

  // Test 1: Create a journey with route data and gradient
  test('should create a journey and redirect', async () => {
    const res = await agent.post('/journeys').send({
      origin: 'Manchester',
      destination: 'London',
      distance: 330,
      transportModeId: carMode._id.toString(),
      gradient: -0.14,
      elevationGain: 1240,
      elevationLoss: 1285,
      gradientModifier: 1.042
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/journeys');

    // Verify journey in database
    const journey = await Journey.findOne({ origin: 'Manchester' });
    expect(journey).not.toBeNull();
    expect(journey.destination).toBe('London');
    expect(journey.distance).toBe(330);
    expect(journey.gradient).toBe(-0.14);
    expect(journey.gradientModifier).toBe(1.042);

    // Verify emissions calculation: 330 × 170 × 1.042 = 58,459
    expect(journey.emissions).toBe(Math.round(330 * 170 * 1.042));
    expect(journey.baseEmissions).toBe(Math.round(330 * 170));
  });

  // Test 2: Missing required fields
  test('should reject journey with missing origin', async () => {
    const res = await agent.post('/journeys').send({
      destination: 'London', distance: 100, transportModeId: carMode._id.toString()
    });

    expect(res.status).toBe(400);
  });

  // Test 3: Manual distance override
  test('should use manual distance when provided', async () => {
    await agent.post('/journeys').send({
      origin: 'A', destination: 'B',
      distance: 100,        // auto-calculated
      manualDistance: 150,   // user override — should take priority
      transportModeId: carMode._id.toString(),
      gradientModifier: 1.0
    });

    const journey = await Journey.findOne({ origin: 'A' });
    expect(journey.distance).toBe(150); // manual wins
  });

  // Test 4: Default gradient modifier when not provided
  test('should default gradient modifier to 1.0', async () => {
    await agent.post('/journeys').send({
      origin: 'X', destination: 'Y', distance: 50,
      transportModeId: carMode._id.toString()
    });

    const journey = await Journey.findOne({ origin: 'X' });
    expect(journey.gradientModifier).toBe(1.0);
    // Emissions = 50 × 170 × 1.0 = 8500
    expect(journey.emissions).toBe(8500);
  });
});


// ═══════════════════════════════════════════════════════════════
// LIST JOURNEYS
// ═══════════════════════════════════════════════════════════════
describe('GET /journeys — List', () => {

  // Test 5: User sees only their own journeys
  test('should list only the logged-in user journeys', async () => {
    // Create journeys for testUser
    await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 10 });
    await Journey.create({ userId: testUser._id, origin: 'C', destination: 'D', distance: 20 });

    // Create journey for another user
    const other = await User.create({ name: 'Other', email: 'other@test.com', password: '123456' });
    await Journey.create({ userId: other._id, origin: 'E', destination: 'F', distance: 30 });

    const res = await agent.get('/journeys');
    expect(res.status).toBe(200);
    // Response HTML should contain A→B and C→D but NOT E→F
    expect(res.text).toContain('A');
    expect(res.text).toContain('C');
    expect(res.text).not.toContain('origin: E');
  });

  // Test 6: Unauthenticated access redirects to login
  test('should redirect unauthenticated users', async () => {
    const res = await request(app).get('/journeys');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');
  });
});


// ═══════════════════════════════════════════════════════════════
// VIEW SINGLE JOURNEY
// ═══════════════════════════════════════════════════════════════
describe('GET /journeys/:id — Show', () => {

  // Test 7: View own journey
  test('should display journey details', async () => {
    const journey = await Journey.create({
      userId: testUser._id, origin: 'Bolton', destination: 'Leeds',
      distance: 80, emissions: 13600, gradient: 1.2, gradientModifier: 1.05
    });

    const res = await agent.get('/journeys/' + journey._id);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bolton');
    expect(res.text).toContain('Leeds');
  });

  // Test 8: Can't view another user's journey
  test('should return 404 for another user journey', async () => {
    const other = await User.create({ name: 'Other', email: 'o@t.com', password: '123456' });
    const journey = await Journey.create({
      userId: other._id, origin: 'X', destination: 'Y', distance: 10
    });

    const res = await agent.get('/journeys/' + journey._id);
    expect(res.status).toBe(404);
  });

  // Test 9: Invalid ID returns error
  test('should handle invalid journey ID', async () => {
    const res = await agent.get('/journeys/000000000000000000000000');
    expect(res.status).toBe(404);
  });
});


// ═══════════════════════════════════════════════════════════════
// UPDATE JOURNEY
// ═══════════════════════════════════════════════════════════════
describe('POST /journeys/:id — Update', () => {

  // Test 10: Update journey fields
  test('should update journey and redirect', async () => {
    const journey = await Journey.create({
      userId: testUser._id, origin: 'A', destination: 'B',
      distance: 100, transportMode: carMode._id, emissions: 17000
    });

    const res = await agent.post('/journeys/' + journey._id).send({
      origin: 'Manchester',
      destination: 'Birmingham',
      distance: 140,
      transportModeId: carMode._id.toString(),
      gradientModifier: 1.1
    });

    expect(res.status).toBe(302);

    // Verify the update
    const updated = await Journey.findById(journey._id);
    expect(updated.origin).toBe('Manchester');
    expect(updated.destination).toBe('Birmingham');
    expect(updated.distance).toBe(140);
    // Emissions: 140 × 170 × 1.1 = 26,180
    expect(updated.emissions).toBe(Math.round(140 * 170 * 1.1));
  });
});


// ═══════════════════════════════════════════════════════════════
// DELETE JOURNEY
// ═══════════════════════════════════════════════════════════════
describe('POST /journeys/:id/delete — Delete', () => {

  // Test 11: Delete own journey
  test('should delete journey and redirect', async () => {
    const journey = await Journey.create({
      userId: testUser._id, origin: 'A', destination: 'B', distance: 10
    });

    const res = await agent.post('/journeys/' + journey._id + '/delete');
    expect(res.status).toBe(302);

    // Verify deletion
    const deleted = await Journey.findById(journey._id);
    expect(deleted).toBeNull();
  });

  // Test 12: Can't delete another user's journey
  test('should not delete another user journey', async () => {
    const other = await User.create({ name: 'Other', email: 'o2@t.com', password: '123456' });
    const journey = await Journey.create({
      userId: other._id, origin: 'X', destination: 'Y', distance: 10
    });

    await agent.post('/journeys/' + journey._id + '/delete');

    // Journey should still exist
    const still = await Journey.findById(journey._id);
    expect(still).not.toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════════
// EDIT FORM
// ═══════════════════════════════════════════════════════════════
describe('GET /journeys/:id/edit — Edit Form', () => {

  // Test 13: Render edit form for own journey
  test('should render edit form', async () => {
    const journey = await Journey.create({
      userId: testUser._id, origin: 'Bolton', destination: 'Manchester',
      distance: 15, transportMode: carMode._id
    });

    const res = await agent.get('/journeys/' + journey._id + '/edit');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Bolton');
    expect(res.text).toContain('Manchester');
  });
});


// ═══════════════════════════════════════════════════════════════
// NEW FORM
// ═══════════════════════════════════════════════════════════════
describe('GET /journeys/new — New Form', () => {

  // Test 14: Render the new journey form with transport modes
  test('should render new journey form', async () => {
    const res = await agent.get('/journeys/new');
    expect(res.status).toBe(200);
    // Form should contain the transport mode we created
    expect(res.text).toContain('Car (Petrol)');
    expect(res.text).toContain('170');
  });
});
