const express = require('express');
const router  = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const rc = require('../controllers/routeController');
const vc = require('../controllers/vehicleController');
const uvc = require('../controllers/userVehicleController');
const tc = require('../controllers/transportController');

// Route info
router.get('/route-info',      isAuthenticated, rc.getRouteInfo);
router.get("/autocomplete", isAuthenticated, rc.autocomplete);
router.get('/reverse-geocode', isAuthenticated, rc.reverseGeocode);

// Vehicle search API
router.get('/vehicles/search',        isAuthenticated, vc.searchVehicles);
router.get('/vehicles/stats',         isAuthenticated, vc.getStats);
router.get('/vehicles/manufacturers', isAuthenticated, vc.getManufacturers);
router.get('/vehicles/models',        isAuthenticated, vc.getModels);

// User vehicles JSON
router.get('/my-vehicles', isAuthenticated, uvc.getUserVehiclesJSON);

// Transport modes JSON
router.get('/transport-modes', isAuthenticated, tc.getModesJSON);

module.exports = router;
