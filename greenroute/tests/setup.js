// tests/setup.js
// ═══════════════════════════════════════════════════════════════
// SHARED TEST HELPER — MongoDB Memory Server
//
// Why mongodb-memory-server?
//   - Spins up a REAL MongoDB instance entirely in RAM
//   - No external database needed — tests run offline
//   - Each test file gets a clean, isolated database
//   - Never touches your real MongoDB Atlas data
//   - Works on any machine without installing MongoDB
//
// Usage in every test file:
//   const { connect, disconnect, clearDatabase } = require('./setup');
//   beforeAll(connect);      ← start in-memory DB
//   afterEach(clearDatabase); ← clean between tests
//   afterAll(disconnect);     ← stop in-memory DB
// ═══════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Start an in-memory MongoDB and connect Mongoose
async function connect() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

// Close connection and stop the server
async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) await mongoServer.stop();
}

// Remove all documents from all collections between tests
// This ensures test isolation — one test's data never leaks into another
async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

module.exports = { connect, disconnect, clearDatabase };
