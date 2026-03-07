// tests/testApp.js
// ═══════════════════════════════════════════════════════════════
// TEST APP FACTORY
//
// Creates a fresh Express app identical to the real app.js, but:
//   - Does NOT call app.listen() (Supertest handles HTTP internally)
//   - Does NOT connect to a real database (we use mongodb-memory-server)
//   - Uses in-memory sessions (no MongoStore needed for tests)
//
// This factory is called in every route test file to get a
// testable Express app that Supertest can send requests to.
// ═══════════════════════════════════════════════════════════════

var express = require('express');
var session = require('express-session');
var path    = require('path');

function createTestApp() {
  var app = express();

  // View engine — same as production
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  // Body parsing — same as production
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Static files
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Sessions — in-memory for testing (no MongoStore)
  app.use(session({
    secret: 'test-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false }
  }));

  // Make session data available in all EJS views
  app.use(function(req, res, next) {
    res.locals.user = req.session.userId ? {
      id:   req.session.userId,
      name: req.session.userName,
      role: req.session.role
    } : null;
    res.locals.currentPath = req.path;
    next();
  });

  // Mount all routes — identical to production app.js
  app.use('/auth',        require('../routes/authRoutes'));
  app.use('/journeys',    require('../routes/journeyRoutes'));
  app.use('/vehicles',    require('../routes/vehicleRoutes'));
  app.use('/my-vehicles', require('../routes/userVehicleRoutes'));
  app.use('/admin',       require('../routes/adminRoutes'));
  app.use('/api',         require('../routes/apiRoutes'));

  // Dashboard + Profile + Home — same logic as app.js
  var Journey     = require('../models/Journey');
  var UserVehicle = require('../models/UserVehicle');
  var User        = require('../models/User');
  var mongoose    = require('mongoose');

  app.get('/', function(req, res) {
    if (!req.session.userId) return res.redirect('/auth/login');
    if (req.session.role === 'admin') return res.redirect('/admin');
    res.redirect('/dashboard');
  });

  app.get('/dashboard', async function(req, res) {
    if (!req.session.userId) return res.redirect('/auth/login');
    if (req.session.role === 'admin') return res.redirect('/admin');
    try {
      var recentJourneys = await Journey.find({ userId: req.session.userId })
        .populate('transportMode').populate('userVehicle').sort({ date: -1 }).limit(5);
      var stats = await Journey.aggregate([
        { $match: { userId: mongoose.Types.ObjectId.createFromHexString(req.session.userId.toString()) } },
        { $group: { _id: null, totalEmissions: { $sum: '$emissions' }, totalDistance: { $sum: '$distance' }, journeyCount: { $sum: 1 } } }
      ]);
      var defaultVehicle = await UserVehicle.findOne({ userId: req.session.userId, isDefault: true });
      res.render('dashboard', { recentJourneys: recentJourneys, stats: stats[0] || { totalEmissions: 0, totalDistance: 0, journeyCount: 0 }, defaultVehicle: defaultVehicle });
    } catch (err) {
      res.render('dashboard', { recentJourneys: [], stats: { totalEmissions: 0, totalDistance: 0, journeyCount: 0 }, defaultVehicle: null });
    }
  });

  app.get('/profile', async function(req, res) {
    if (!req.session.userId) return res.redirect('/auth/login');
    if (req.session.role === 'admin') return res.redirect('/admin');
    try {
      var userDoc = await User.findById(req.session.userId).select('-password');
      var vc = await UserVehicle.countDocuments({ userId: req.session.userId });
      var jc = await Journey.countDocuments({ userId: req.session.userId });
      res.render('profile', { userDoc: userDoc, vehicleCount: vc, journeyCount: jc });
    } catch (err) { res.status(500).render('error', { message: 'Failed' }); }
  });

  // 404
  app.use(function(req, res) {
    res.status(404).render('error', { message: 'Page not found' });
  });

  return app;
}

module.exports = createTestApp;
