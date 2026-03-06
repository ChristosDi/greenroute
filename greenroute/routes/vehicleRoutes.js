const express = require('express');
const router  = express.Router();
const { isAuthenticated } = require('../middleware/authMiddleware');
const vc = require('../controllers/vehicleController');

router.get('/', isAuthenticated, vc.listVehicles);

module.exports = router;
