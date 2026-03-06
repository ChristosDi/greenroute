// tests/testApp.js
// ─────────────────────────────────────────────────────────────
// TEST APP FACTORY
//
// Creates a fresh Express app configured identically to the real app,
// but WITHOUT starting a server or connecting to a real database.
// This lets Supertest make HTTP requests directly to the Express app.
//
// Why a separate file?
//   - The real app.js calls app.listen() and connectDB() on import
//   - For testing, we don't want that — we use mongodb-memory-server instead
//   - This factory builds the same middleware and routes stack
// ─────────────────────────────────────────────────────────────

const express = require('express');
const session = require('express-session');
const path    = require('path');

function createTestApp() {
  const app = express();

  // ── View engine (same as production) ───────────────────────
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  // ── Body parsing ───────────────────────────────────────────
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // ── Static files ───────────────────────────────────────────
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ── Sessions (in-memory for testing — no MongoStore needed) ─
  app.use(session({
    secret: 'test-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false }
  }));

  // ── Make session data available in views ───────────────────
  app.use((req, res, next) => {
    res.locals.user = req.session.userId ? {
      id:   req.session.userId,
      name: req.session.userName,
      role: req.session.role
    } : null;
    res.locals.currentPath = req.path;
    next();
  });

  // ── Routes (same as production) ────────────────────────────
  const authRoutes        = require('../routes/authRoutes');
  const journeyRoutes     = require('../routes/journeyRoutes');
  const vehicleRoutes     = require('../routes/vehicleRoutes');
  const userVehicleRoutes = require('../routes/userVehicleRoutes');
  const adminRoutes       = require('../routes/adminRoutes');
  const apiRoutes         = require('../routes/apiRoutes');

  app.use('/auth',        authRoutes);
  app.use('/journeys',    journeyRoutes);
  app.use('/vehicles',    vehicleRoutes);
  app.use('/my-vehicles', userVehicleRoutes);
  app.use('/admin',       adminRoutes);
  app.use('/api',         apiRoutes);

  // ── Dashboard route ────────────────────────────────────────
  const Journey     = require('../models/Journey');
  const UserVehicle = require('../models/UserVehicle');

  app.get('/', (req, res) => {
    if (req.session.userId) return res.redirect('/dashboard');
    res.redirect('/auth/login');
  });

  app.get('/dashboard', async (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    try {
      const recentJourneys = await Journey.find({ userId: req.session.userId })
        .populate('transportMode').populate('userVehicle')
        .sort({ date: -1 }).limit(5);

      const mongoose = require('mongoose');
      const stats = await Journey.aggregate([
        { $match: { userId: mongoose.Types.ObjectId.createFromHexString(req.session.userId.toString()) } },
        { $group: { _id: null, totalEmissions: { $sum: '$emissions' }, totalDistance: { $sum: '$distance' }, journeyCount: { $sum: 1 } } }
      ]);

      const defaultVehicle = await UserVehicle.findOne({ userId: req.session.userId, isDefault: true });

      res.render('dashboard', {
        recentJourneys,
        stats: stats[0] || { totalEmissions: 0, totalDistance: 0, journeyCount: 0 },
        defaultVehicle
      });
    } catch (err) {
      res.render('dashboard', {
        recentJourneys: [],
        stats: { totalEmissions: 0, totalDistance: 0, journeyCount: 0 },
        defaultVehicle: null
      });
    }
  });

  // ── 404 ────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).render('error', { message: 'Page not found' });
  });

  return app;
}

module.exports = createTestApp;
