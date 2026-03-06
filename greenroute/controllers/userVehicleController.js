const UserVehicle = require('../models/UserVehicle');
const User        = require('../models/User');
const Vehicle     = require('../models/Vehicle');

// GET /my-vehicles
exports.listUserVehicles = async (req, res) => {
  try {
    const vehicles = await UserVehicle.find({ userId: req.session.userId })
      .populate('vehicleRef')
      .sort({ isDefault: -1, nickname: 1 });

    res.render('user-vehicles/index', { vehicles });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load vehicles' });
  }
};

// POST /my-vehicles — add a vehicle
exports.addVehicle = async (req, res) => {
  try {
    const {
      nickname, manufacturer, model, year, fuelType, co2,
      vehicleRefId, setAsDefault
    } = req.body;

    if (!nickname || !manufacturer || !model) {
      return res.status(400).json({ error: 'Nickname, manufacturer, and model are required' });
    }

    const vehicleData = {
      userId:       req.session.userId,
      nickname:     nickname.trim(),
      manufacturer: manufacturer.trim(),
      model:        model.trim(),
      year:         year ? parseInt(year) : null,
      fuelType:     fuelType || null,
      co2:          co2 ? parseFloat(co2) : null,
      vehicleRef:   vehicleRefId || null,
      isDefault:    setAsDefault === 'true' || setAsDefault === true
    };

    const vehicle = await UserVehicle.create(vehicleData);

    // Update user's defaultVehicle reference if this is default
    if (vehicle.isDefault) {
      await User.findByIdAndUpdate(req.session.userId, { defaultVehicle: vehicle._id });
    }

    res.redirect('/my-vehicles');
  } catch (err) {
    console.error('Add vehicle error:', err);
    res.status(500).render('error', { message: 'Failed to add vehicle' });
  }
};

// POST /my-vehicles/:id/default — set as default
exports.setDefault = async (req, res) => {
  try {
    // Unset all defaults for this user
    await UserVehicle.updateMany(
      { userId: req.session.userId },
      { isDefault: false }
    );

    // Set this one as default
    await UserVehicle.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      { isDefault: true }
    );

    await User.findByIdAndUpdate(req.session.userId, { defaultVehicle: req.params.id });

    res.redirect('/my-vehicles');
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to set default' });
  }
};

// POST /my-vehicles/:id/delete
exports.deleteVehicle = async (req, res) => {
  try {
    const vehicle = await UserVehicle.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });

    // If deleted vehicle was default, clear user's default
    if (vehicle && vehicle.isDefault) {
      await User.findByIdAndUpdate(req.session.userId, { defaultVehicle: null });
    }

    res.redirect('/my-vehicles');
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to delete vehicle' });
  }
};

// GET /api/my-vehicles — JSON list for dropdowns
exports.getUserVehiclesJSON = async (req, res) => {
  try {
    const vehicles = await UserVehicle.find({ userId: req.session.userId })
      .sort({ isDefault: -1, nickname: 1 });
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load vehicles' });
  }
};
