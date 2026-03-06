// tests/setup.js
// ─────────────────────────────────────────────────────────────
// SHARED TEST HELPER — MongoDB Memory Server
//
// Why mongodb-memory-server?
//   - Spins up a real MongoDB instance in RAM (no external DB needed)
//   - Each test file gets a clean, isolated database
//   - Tests never touch your real Atlas database
//   - Runs on any machine without installing MongoDB locally
//
// Usage in test files:
//   const { connect, disconnect, clearDatabase } = require('./setup');
//   beforeAll(connect);
//   afterEach(clearDatabase);
//   afterAll(disconnect);
// ─────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

/**
 * connect() — Start an in-memory MongoDB and connect Mongoose to it
 * Called in beforeAll() at the start of each test file
 */
async function connect() {
  // Create a new in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  // Connect Mongoose to the in-memory DB
  await mongoose.connect(uri);
}

/**
 * disconnect() — Close Mongoose connection and stop the in-memory server
 * Called in afterAll() at the end of each test file
 */
async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * clearDatabase() — Remove all documents from all collections
 * Called in afterEach() between tests for isolation
 * This ensures one test's data doesn't leak into the next
 */
async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

module.exports = { connect, disconnect, clearDatabase };
