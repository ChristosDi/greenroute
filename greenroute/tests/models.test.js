// tests/models.test.js
// ═══════════════════════════════════════════════════════════════
// MODEL VALIDATION TESTS — 45 test cases
//
// Tests every Mongoose model's schema validation, defaults,
// relationships, and business logic:
//   1. User       — hashing, auth, roles, status (active/suspended)
//   2. Journey    — fields, defaults, emissions, gradient, emissionSource
//   3. TransportMode — unique names, usesGradient flag
//   4. Vehicle    — Euro 6 schema, search, aggregation
//   5. UserVehicle — carType requirement, default enforcement, CO2 fallback
// ═══════════════════════════════════════════════════════════════

const { connect, disconnect, clearDatabase } = require('./setup');
const User          = require('../models/User');
const Journey       = require('../models/Journey');
const TransportMode = require('../models/TransportMode');
const Vehicle       = require('../models/Vehicle');
const UserVehicle   = require('../models/UserVehicle');

beforeAll(connect);
afterEach(clearDatabase);
afterAll(disconnect);

// ───────────────────────────────────────────────────────────────
// 1. USER MODEL
// ───────────────────────────────────────────────────────────────
describe('User Model', () => {

  test('should create a user with valid fields and hash password', async () => {
    const user = await User.create({ name: 'Test', email: 'test@test.com', password: 'password123' });
    expect(user._id).toBeDefined();
    expect(user.name).toBe('Test');
    // Password must be hashed, not plain text
    expect(user.password).not.toBe('password123');
    expect(user.password).toMatch(/^\$2[ab]\$/);
    expect(user.password.length).toBe(60);
  });

  test('should default role to user and status to active', async () => {
    const user = await User.create({ name: 'Default', email: 'd@t.com', password: '123456' });
    expect(user.role).toBe('user');
    expect(user.status).toBe('active');
  });

  test('should correctly compare passwords via instance method', async () => {
    const user = await User.create({ name: 'Compare', email: 'c@t.com', password: 'correct' });
    expect(await user.comparePassword('correct')).toBe(true);
    expect(await user.comparePassword('wrong')).toBe(false);
  });

  test('should require name, email, and password', async () => {
    await expect(User.create({ email: 'e@t.com', password: '123456' })).rejects.toThrow();
    await expect(User.create({ name: 'N', password: '123456' })).rejects.toThrow();
    await expect(User.create({ name: 'N', email: 'e@t.com' })).rejects.toThrow();
  });

  test('should enforce unique email', async () => {
    await User.create({ name: 'A', email: 'dup@t.com', password: '123456' });
    await expect(User.create({ name: 'B', email: 'dup@t.com', password: '654321' })).rejects.toThrow();
  });

  test('should store email in lowercase', async () => {
    const user = await User.create({ name: 'Upper', email: 'UPPER@TEST.COM', password: '123456' });
    expect(user.email).toBe('upper@test.com');
  });

  test('should only accept valid roles (user, admin)', async () => {
    await expect(User.create({ name: 'Bad', email: 'b@t.com', password: '123456', role: 'superadmin' })).rejects.toThrow();
  });

  test('should only accept valid statuses (active, suspended)', async () => {
    await expect(User.create({ name: 'Bad', email: 'bs@t.com', password: '123456', status: 'banned' })).rejects.toThrow();
  });

  test('should allow setting admin role and suspended status', async () => {
    const user = await User.create({ name: 'Admin', email: 'a@t.com', password: '123456', role: 'admin', status: 'suspended' });
    expect(user.role).toBe('admin');
    expect(user.status).toBe('suspended');
  });

  test('should have timestamps', async () => {
    const user = await User.create({ name: 'TS', email: 'ts@t.com', password: '123456' });
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────────
// 2. JOURNEY MODEL
// ───────────────────────────────────────────────────────────────
describe('Journey Model', () => {

  let testUser;
  beforeEach(async () => {
    testUser = await User.create({ name: 'JOwner', email: 'jo@t.com', password: '123456' });
  });

  test('should create journey with all gradient fields', async () => {
    const j = await Journey.create({
      userId: testUser._id, origin: 'Manchester', destination: 'London',
      distance: 330, gradient: -0.14, elevationGain: 1240, elevationLoss: 1285,
      gradientModifier: 1.042, emissions: 58000, baseEmissions: 55658
    });
    expect(j.origin).toBe('Manchester');
    expect(j.gradient).toBe(-0.14);
    expect(j.gradientModifier).toBe(1.042);
  });

  test('should require userId, origin, destination, distance', async () => {
    await expect(Journey.create({ origin: 'A', destination: 'B', distance: 10 })).rejects.toThrow();
    await expect(Journey.create({ userId: testUser._id, destination: 'B', distance: 10 })).rejects.toThrow();
    await expect(Journey.create({ userId: testUser._id, origin: 'A', distance: 10 })).rejects.toThrow();
    await expect(Journey.create({ userId: testUser._id, origin: 'A', destination: 'B' })).rejects.toThrow();
  });

  test('should reject negative distance', async () => {
    await expect(Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: -50 })).rejects.toThrow();
  });

  test('should apply correct defaults', async () => {
    const j = await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 10 });
    expect(j.gradient).toBe(0);
    expect(j.elevationGain).toBe(0);
    expect(j.elevationLoss).toBe(0);
    expect(j.gradientModifier).toBe(1.0);
    expect(j.emissions).toBe(0);
    expect(j.baseEmissions).toBe(0);
    expect(j.emissionSource).toBe('mode');
  });

  test('should only allow valid emissionSource values', async () => {
    await expect(Journey.create({
      userId: testUser._id, origin: 'A', destination: 'B', distance: 10, emissionSource: 'magic'
    })).rejects.toThrow();
  });

  test('should default date to current time', async () => {
    const before = new Date();
    const j = await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 10 });
    expect(j.date.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  test('should find journeys by userId', async () => {
    await Journey.create({ userId: testUser._id, origin: 'A', destination: 'B', distance: 10 });
    await Journey.create({ userId: testUser._id, origin: 'C', destination: 'D', distance: 20 });
    const other = await User.create({ name: 'Other', email: 'o@t.com', password: '123456' });
    await Journey.create({ userId: other._id, origin: 'E', destination: 'F', distance: 30 });
    expect(await Journey.find({ userId: testUser._id })).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────────────────────
// 3. TRANSPORT MODE MODEL
// ───────────────────────────────────────────────────────────────
describe('TransportMode Model', () => {

  test('should create mode with usesGradient flag', async () => {
    const car = await TransportMode.create({ name: 'Car', emissionFactor: 170, usesGradient: true });
    const train = await TransportMode.create({ name: 'Train', emissionFactor: 41, usesGradient: false });
    expect(car.usesGradient).toBe(true);
    expect(train.usesGradient).toBe(false);
  });

  test('should require name and emissionFactor', async () => {
    await expect(TransportMode.create({ emissionFactor: 100 })).rejects.toThrow();
    await expect(TransportMode.create({ name: 'Test' })).rejects.toThrow();
  });

  test('should enforce unique name', async () => {
    await TransportMode.create({ name: 'Bus', emissionFactor: 89 });
    await expect(TransportMode.create({ name: 'Bus', emissionFactor: 90 })).rejects.toThrow();
  });

  test('should default isActive to true, usesGradient to false', async () => {
    const m = await TransportMode.create({ name: 'Bike', emissionFactor: 0 });
    expect(m.isActive).toBe(true);
    expect(m.usesGradient).toBe(false);
  });

  test('should toggle isActive', async () => {
    const m = await TransportMode.create({ name: 'Ferry', emissionFactor: 115 });
    m.isActive = false;
    await m.save();
    const updated = await TransportMode.findById(m._id);
    expect(updated.isActive).toBe(false);
  });

  test('should filter active-only modes', async () => {
    await TransportMode.create({ name: 'Active', emissionFactor: 50, isActive: true });
    await TransportMode.create({ name: 'Disabled', emissionFactor: 200, isActive: false });
    expect(await TransportMode.find({ isActive: true })).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────
// 4. VEHICLE MODEL (Euro 6)
// ───────────────────────────────────────────────────────────────
describe('Vehicle Model', () => {

  test('should create vehicle from Euro 6 data', async () => {
    const v = await Vehicle.create({ manufacturer: 'BMW', model: '320d', fuelType: 'Diesel', co2: 127, engineSize: 1995 });
    expect(v.manufacturer).toBe('BMW');
    expect(v.co2).toBe(127);
  });

  test('should require manufacturer and model', async () => {
    await expect(Vehicle.create({ model: 'X' })).rejects.toThrow();
    await expect(Vehicle.create({ manufacturer: 'X' })).rejects.toThrow();
  });

  test('should support case-insensitive manufacturer search', async () => {
    await Vehicle.insertMany([
      { manufacturer: 'BMW', model: '320d' },
      { manufacturer: 'BMW', model: '520d' },
      { manufacturer: 'Audi', model: 'A3' }
    ]);
    expect(await Vehicle.find({ manufacturer: /bmw/i })).toHaveLength(2);
  });

  test('should support bulk insert and aggregation', async () => {
    await Vehicle.insertMany([
      { manufacturer: 'A', model: 'M1', fuelType: 'Petrol', co2: 150 },
      { manufacturer: 'B', model: 'M2', fuelType: 'Petrol', co2: 160 },
      { manufacturer: 'C', model: 'M3', fuelType: 'Diesel', co2: 120 }
    ]);
    const stats = await Vehicle.aggregate([
      { $group: { _id: '$fuelType', avgCo2: { $avg: '$co2' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    expect(stats).toHaveLength(2);
    expect(stats.find(s => s._id === 'Petrol').avgCo2).toBe(155);
  });
});

// ───────────────────────────────────────────────────────────────
// 5. USER VEHICLE MODEL
// ───────────────────────────────────────────────────────────────
describe('UserVehicle Model', () => {

  let testUser;
  beforeEach(async () => {
    testUser = await User.create({ name: 'VOwner', email: 'vo@t.com', password: '123456' });
  });

  test('should require carType (petrol/diesel/hybrid/electric)', async () => {
    // Missing carType should fail
    await expect(UserVehicle.create({
      userId: testUser._id, nickname: 'Car', manufacturer: 'BMW', model: '320d'
    })).rejects.toThrow();
  });

  test('should reject invalid carType values', async () => {
    await expect(UserVehicle.create({
      userId: testUser._id, nickname: 'Car', manufacturer: 'BMW', model: '320d', carType: 'hydrogen'
    })).rejects.toThrow();
  });

  test('should create vehicle with valid carType', async () => {
    const v = await UserVehicle.create({
      userId: testUser._id, nickname: 'Daily', manufacturer: 'BMW', model: '320d',
      carType: 'diesel', co2: 127
    });
    expect(v.carType).toBe('diesel');
    expect(v.co2).toBe(127);
  });

  test('should enforce only one default per user', async () => {
    const v1 = await UserVehicle.create({
      userId: testUser._id, nickname: 'A', manufacturer: 'BMW', model: '1',
      carType: 'petrol', isDefault: true
    });
    await UserVehicle.create({
      userId: testUser._id, nickname: 'B', manufacturer: 'Audi', model: '2',
      carType: 'diesel', isDefault: true
    });
    const reloaded = await UserVehicle.findById(v1._id);
    expect(reloaded.isDefault).toBe(false);
  });

  test('should return correct standard factor via getStandardFactor', () => {
    expect(UserVehicle.getStandardFactor('petrol')).toBe(170);
    expect(UserVehicle.getStandardFactor('diesel')).toBe(155);
    expect(UserVehicle.getStandardFactor('hybrid')).toBe(100);
    expect(UserVehicle.getStandardFactor('electric')).toBe(0);
    expect(UserVehicle.getStandardFactor('unknown')).toBe(170); // fallback
  });

  test('should allow null CO2 for manual vehicles', async () => {
    const v = await UserVehicle.create({
      userId: testUser._id, nickname: 'Old', manufacturer: 'Ford', model: 'Focus',
      carType: 'petrol', co2: null
    });
    expect(v.co2).toBeNull();
  });
});
