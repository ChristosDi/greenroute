// tests/models.test.js
// ═══════════════════════════════════════════════════════════════
// MODEL VALIDATION TESTS
//
// Tests every Mongoose model in the application:
//   1. User       — registration, password hashing, validation
//   2. Journey    — CRUD fields, emission calculations, references
//   3. TransportMode — emission factors, active/inactive toggling
//   4. Vehicle    — Euro 6 dataset schema mapping
//   5. UserVehicle — user-vehicle linking, default vehicle logic
//
// These tests verify that:
//   - Required fields are enforced (Mongoose validation)
//   - Default values are applied correctly
//   - Password hashing works via the pre-save hook
//   - The comparePassword method works for auth
//   - References between models (ObjectId) work correctly
//   - The "only one default vehicle per user" logic works
//
// Total: 30+ individual test cases
// ═══════════════════════════════════════════════════════════════

const { connect, disconnect, clearDatabase } = require('./setup');
const User          = require('../models/User');
const Journey       = require('../models/Journey');
const TransportMode = require('../models/TransportMode');
const Vehicle       = require('../models/Vehicle');
const UserVehicle   = require('../models/UserVehicle');

// ── Lifecycle hooks: connect before tests, clean between, disconnect after ──
beforeAll(connect);
afterEach(clearDatabase);
afterAll(disconnect);


// ═══════════════════════════════════════════════════════════════
// 1. USER MODEL
// ═══════════════════════════════════════════════════════════════
describe('User Model', () => {

  // Test 1: A valid user should save successfully
  test('should create a user with valid fields', async () => {
    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    });

    expect(user._id).toBeDefined();
    expect(user.name).toBe('Test User');
    expect(user.email).toBe('test@example.com');
    // Password should be hashed, NOT stored in plain text
    expect(user.password).not.toBe('password123');
    // Default role should be 'user' (not admin)
    expect(user.role).toBe('user');
  });

  // Test 2: Password hashing via the pre-save hook
  // The User schema has a pre('save') middleware that calls bcrypt.hash()
  test('should hash the password before saving', async () => {
    const user = await User.create({
      name: 'Hash Test',
      email: 'hash@test.com',
      password: 'mySecret123'
    });

    // bcrypt hashes start with '$2a$' or '$2b$'
    expect(user.password).toMatch(/^\$2[ab]\$/);
    // The hash should be 60 characters long
    expect(user.password.length).toBe(60);
  });

  // Test 3: The comparePassword instance method
  // Used during login to verify the entered password
  test('should correctly compare passwords', async () => {
    const user = await User.create({
      name: 'Compare Test',
      email: 'compare@test.com',
      password: 'correctPassword'
    });

    // Correct password should return true
    const isMatch = await user.comparePassword('correctPassword');
    expect(isMatch).toBe(true);

    // Wrong password should return false
    const isWrong = await user.comparePassword('wrongPassword');
    expect(isWrong).toBe(false);
  });

  // Test 4: Required fields — name
  test('should require a name', async () => {
    await expect(
      User.create({ email: 'noname@test.com', password: '123456' })
    ).rejects.toThrow();
  });

  // Test 5: Required fields — email
  test('should require an email', async () => {
    await expect(
      User.create({ name: 'No Email', password: '123456' })
    ).rejects.toThrow();
  });

  // Test 6: Required fields — password
  test('should require a password', async () => {
    await expect(
      User.create({ name: 'No Pass', email: 'nopass@test.com' })
    ).rejects.toThrow();
  });

  // Test 7: Email uniqueness — the schema has unique:true on email
  test('should not allow duplicate emails', async () => {
    await User.create({ name: 'First', email: 'dup@test.com', password: '123456' });

    await expect(
      User.create({ name: 'Second', email: 'dup@test.com', password: '654321' })
    ).rejects.toThrow();
  });

  // Test 8: Email should be stored in lowercase
  test('should store email in lowercase', async () => {
    const user = await User.create({
      name: 'Lowercase Test',
      email: 'UPPER@TEST.COM',
      password: '123456'
    });

    expect(user.email).toBe('upper@test.com');
  });

  // Test 9: Role enum validation — only 'user' or 'admin' allowed
  test('should only accept valid roles', async () => {
    await expect(
      User.create({ name: 'Bad Role', email: 'role@test.com', password: '123456', role: 'superadmin' })
    ).rejects.toThrow();
  });

  // Test 10: Default role assignment
  test('should default role to user', async () => {
    const user = await User.create({
      name: 'Default Role',
      email: 'default@test.com',
      password: '123456'
    });

    expect(user.role).toBe('user');
  });

  // Test 11: Admin role can be set explicitly
  test('should allow admin role when explicitly set', async () => {
    const user = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: '123456',
      role: 'admin'
    });

    expect(user.role).toBe('admin');
  });

  // Test 12: Timestamps are created automatically
  test('should have timestamps', async () => {
    const user = await User.create({
      name: 'Timestamp Test',
      email: 'time@test.com',
      password: '123456'
    });

    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });
});


// ═══════════════════════════════════════════════════════════════
// 2. JOURNEY MODEL
// ═══════════════════════════════════════════════════════════════
describe('Journey Model', () => {

  let testUser;

  // Create a user to own the journeys (journeys require a userId)
  beforeEach(async () => {
    testUser = await User.create({
      name: 'Journey Owner',
      email: 'journey@test.com',
      password: '123456'
    });
  });

  // Test 13: Valid journey creation with all fields
  test('should create a journey with valid fields', async () => {
    const journey = await Journey.create({
      userId: testUser._id,
      origin: 'Manchester',
      destination: 'London',
      distance: 330.5,
      gradient: -0.14,
      elevationGain: 1240,
      elevationLoss: 1285,
      gradientModifier: 1.042,
      emissions: 58000,
      baseEmissions: 55658
    });

    expect(journey._id).toBeDefined();
    expect(journey.origin).toBe('Manchester');
    expect(journey.destination).toBe('London');
    expect(journey.distance).toBe(330.5);
    expect(journey.gradient).toBe(-0.14);
    expect(journey.gradientModifier).toBe(1.042);
  });

  // Test 14: Required fields — origin, destination, distance, userId
  test('should require origin', async () => {
    await expect(
      Journey.create({ userId: testUser._id, destination: 'London', distance: 100 })
    ).rejects.toThrow();
  });

  test('should require destination', async () => {
    await expect(
      Journey.create({ userId: testUser._id, origin: 'Manchester', distance: 100 })
    ).rejects.toThrow();
  });

  test('should require distance', async () => {
    await expect(
      Journey.create({ userId: testUser._id, origin: 'Manchester', destination: 'London' })
    ).rejects.toThrow();
  });

  test('should require userId', async () => {
    await expect(
      Journey.create({ origin: 'Manchester', destination: 'London', distance: 100 })
    ).rejects.toThrow();
  });

  // Test 15: Distance must be non-negative
  test('should not allow negative distance', async () => {
    await expect(
      Journey.create({
        userId: testUser._id,
        origin: 'A', destination: 'B', distance: -50
      })
    ).rejects.toThrow();
  });

  // Test 16: Default values are applied
  test('should apply default values', async () => {
    const journey = await Journey.create({
      userId: testUser._id,
      origin: 'A',
      destination: 'B',
      distance: 10
    });

    // These fields should have defaults from the schema
    expect(journey.gradient).toBe(0);
    expect(journey.elevationGain).toBe(0);
    expect(journey.elevationLoss).toBe(0);
    expect(journey.gradientModifier).toBe(1.0);
    expect(journey.emissions).toBe(0);
    expect(journey.baseEmissions).toBe(0);
    expect(journey.emissionSource).toBe('mode');
  });

  // Test 17: Emission source enum validation
  test('should only allow valid emission sources', async () => {
    await expect(
      Journey.create({
        userId: testUser._id,
        origin: 'A', destination: 'B', distance: 10,
        emissionSource: 'magic'
      })
    ).rejects.toThrow();
  });

  // Test 18: Journey date defaults to now
  test('should default date to current time', async () => {
    const before = new Date();
    const journey = await Journey.create({
      userId: testUser._id,
      origin: 'A', destination: 'B', distance: 10
    });
    const after = new Date();

    expect(journey.date.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(journey.date.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  // Test 19: Query journeys by userId
  test('should find journeys by userId', async () => {
    // Create journeys for our test user
    await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 10 });
    await Journey.create({ userId: testUser._id, origin: 'C', destination: 'D', distance: 20 });

    // Create another user with their own journey
    const otherUser = await User.create({ name: 'Other', email: 'other@test.com', password: '123456' });
    await Journey.create({ userId: otherUser._id, origin: 'E', destination: 'F', distance: 30 });

    // Should only find 2 journeys for testUser
    const journeys = await Journey.find({ userId: testUser._id });
    expect(journeys).toHaveLength(2);
  });
});


// ═══════════════════════════════════════════════════════════════
// 3. TRANSPORT MODE MODEL
// ═══════════════════════════════════════════════════════════════
describe('TransportMode Model', () => {

  // Test 20: Create a valid transport mode
  test('should create a transport mode', async () => {
    const mode = await TransportMode.create({
      name: 'Bus',
      emissionFactor: 89,
      icon: '🚌',
      description: 'City bus per passenger'
    });

    expect(mode.name).toBe('Bus');
    expect(mode.emissionFactor).toBe(89);
    expect(mode.icon).toBe('🚌');
    expect(mode.isActive).toBe(true); // default
  });

  // Test 21: Name is required and must be unique
  test('should require a name', async () => {
    await expect(
      TransportMode.create({ emissionFactor: 100 })
    ).rejects.toThrow();
  });

  test('should not allow duplicate names', async () => {
    await TransportMode.create({ name: 'Train', emissionFactor: 41 });
    await expect(
      TransportMode.create({ name: 'Train', emissionFactor: 50 })
    ).rejects.toThrow();
  });

  // Test 22: Emission factor is required
  test('should require an emission factor', async () => {
    await expect(
      TransportMode.create({ name: 'Unknown Mode' })
    ).rejects.toThrow();
  });

  // Test 23: isActive defaults to true
  test('should default isActive to true', async () => {
    const mode = await TransportMode.create({ name: 'Bike', emissionFactor: 0 });
    expect(mode.isActive).toBe(true);
  });

  // Test 24: Can toggle isActive
  test('should allow toggling isActive', async () => {
    const mode = await TransportMode.create({ name: 'Ferry', emissionFactor: 115 });
    expect(mode.isActive).toBe(true);

    mode.isActive = false;
    await mode.save();

    const updated = await TransportMode.findById(mode._id);
    expect(updated.isActive).toBe(false);
  });

  // Test 25: Filter only active modes (as used in journey form)
  test('should filter active modes only', async () => {
    await TransportMode.create({ name: 'Active Mode', emissionFactor: 50, isActive: true });
    await TransportMode.create({ name: 'Disabled Mode', emissionFactor: 200, isActive: false });

    const activeModes = await TransportMode.find({ isActive: true });
    expect(activeModes).toHaveLength(1);
    expect(activeModes[0].name).toBe('Active Mode');
  });
});


// ═══════════════════════════════════════════════════════════════
// 4. VEHICLE MODEL (Euro 6 Dataset)
// ═══════════════════════════════════════════════════════════════
describe('Vehicle Model', () => {

  // Test 26: Create a vehicle matching Euro 6 CSV structure
  test('should create a vehicle from Euro 6 data', async () => {
    const vehicle = await Vehicle.create({
      manufacturer: 'BMW',
      model: '320d',
      description: '320d xDrive Saloon',
      fuelType: 'Diesel',
      engineSize: 1995,
      co2: 127,
      transmission: 'M6'
    });

    expect(vehicle.manufacturer).toBe('BMW');
    expect(vehicle.model).toBe('320d');
    expect(vehicle.co2).toBe(127);
  });

  // Test 27: Manufacturer and model are required
  test('should require manufacturer', async () => {
    await expect(
      Vehicle.create({ model: 'Test' })
    ).rejects.toThrow();
  });

  test('should require model', async () => {
    await expect(
      Vehicle.create({ manufacturer: 'Test' })
    ).rejects.toThrow();
  });

  // Test 28: Search by manufacturer (regex, case-insensitive)
  test('should find vehicles by manufacturer search', async () => {
    await Vehicle.create({ manufacturer: 'BMW', model: '320d', co2: 127 });
    await Vehicle.create({ manufacturer: 'BMW', model: '520d', co2: 140 });
    await Vehicle.create({ manufacturer: 'Audi', model: 'A3', co2: 110 });

    const results = await Vehicle.find({ manufacturer: /bmw/i });
    expect(results).toHaveLength(2);
  });

  // Test 29: Bulk insert (as used by seedVehicles.js)
  test('should support bulk insert', async () => {
    const vehicles = Array.from({ length: 100 }, (_, i) => ({
      manufacturer: 'TestMaker',
      model: 'Model ' + i,
      co2: 100 + i
    }));

    await Vehicle.insertMany(vehicles);
    const count = await Vehicle.countDocuments();
    expect(count).toBe(100);
  });

  // Test 30: Aggregation — average CO2 by fuel type
  test('should aggregate stats by fuel type', async () => {
    await Vehicle.insertMany([
      { manufacturer: 'A', model: 'M1', fuelType: 'Petrol', co2: 150 },
      { manufacturer: 'B', model: 'M2', fuelType: 'Petrol', co2: 160 },
      { manufacturer: 'C', model: 'M3', fuelType: 'Diesel', co2: 120 },
    ]);

    const stats = await Vehicle.aggregate([
      { $group: { _id: '$fuelType', avgCo2: { $avg: '$co2' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    expect(stats).toHaveLength(2);
    // Diesel: 120 avg, Petrol: 155 avg
    const diesel = stats.find(s => s._id === 'Diesel');
    expect(diesel.avgCo2).toBe(120);
    expect(diesel.count).toBe(1);

    const petrol = stats.find(s => s._id === 'Petrol');
    expect(petrol.avgCo2).toBe(155);
    expect(petrol.count).toBe(2);
  });
});


// ═══════════════════════════════════════════════════════════════
// 5. USER VEHICLE MODEL
// ═══════════════════════════════════════════════════════════════
describe('UserVehicle Model', () => {

  let testUser;

  beforeEach(async () => {
    testUser = await User.create({
      name: 'Vehicle Owner',
      email: 'vowner@test.com',
      password: '123456'
    });
  });

  // Test 31: Create a user vehicle
  test('should create a user vehicle', async () => {
    const uv = await UserVehicle.create({
      userId: testUser._id,
      nickname: 'Daily Driver',
      manufacturer: 'BMW',
      model: '320d',
      year: 2023,
      fuelType: 'Diesel',
      co2: 127
    });

    expect(uv.nickname).toBe('Daily Driver');
    expect(uv.co2).toBe(127);
    expect(uv.isDefault).toBe(false); // default
  });

  // Test 32: Required fields
  test('should require nickname, manufacturer, and model', async () => {
    // Missing nickname
    await expect(
      UserVehicle.create({ userId: testUser._id, manufacturer: 'BMW', model: '320d' })
    ).rejects.toThrow();

    // Missing manufacturer
    await expect(
      UserVehicle.create({ userId: testUser._id, nickname: 'Test', model: '320d' })
    ).rejects.toThrow();

    // Missing model
    await expect(
      UserVehicle.create({ userId: testUser._id, nickname: 'Test', manufacturer: 'BMW' })
    ).rejects.toThrow();
  });

  // Test 33: Setting default vehicle unsets others
  // The pre-save hook ensures only one default per user
  test('should enforce only one default per user', async () => {
    // Create first vehicle as default
    const v1 = await UserVehicle.create({
      userId: testUser._id,
      nickname: 'Car 1',
      manufacturer: 'BMW',
      model: '320d',
      isDefault: true
    });

    // Create second vehicle as default — should unset the first
    const v2 = await UserVehicle.create({
      userId: testUser._id,
      nickname: 'Car 2',
      manufacturer: 'Audi',
      model: 'A3',
      isDefault: true
    });

    // Reload v1 from database
    const reloadedV1 = await UserVehicle.findById(v1._id);
    const reloadedV2 = await UserVehicle.findById(v2._id);

    // Only v2 should be default
    expect(reloadedV1.isDefault).toBe(false);
    expect(reloadedV2.isDefault).toBe(true);
  });

  // Test 34: CO2 can be null (uses transport mode default instead)
  test('should allow null CO2 for manual vehicles', async () => {
    const uv = await UserVehicle.create({
      userId: testUser._id,
      nickname: 'Old Car',
      manufacturer: 'Ford',
      model: 'Focus',
      co2: null
    });

    expect(uv.co2).toBeNull();
  });

  // Test 35: Query vehicles by userId
  test('should find vehicles belonging to a specific user', async () => {
    await UserVehicle.create({ userId: testUser._id, nickname: 'A', manufacturer: 'BMW', model: '1' });
    await UserVehicle.create({ userId: testUser._id, nickname: 'B', manufacturer: 'BMW', model: '2' });

    const otherUser = await User.create({ name: 'Other', email: 'other@v.com', password: '123456' });
    await UserVehicle.create({ userId: otherUser._id, nickname: 'C', manufacturer: 'Audi', model: '3' });

    const myVehicles = await UserVehicle.find({ userId: testUser._id });
    expect(myVehicles).toHaveLength(2);
  });
});
