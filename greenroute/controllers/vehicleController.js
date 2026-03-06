const Vehicle = require('../models/Vehicle');

// GET /vehicles — paginated list
exports.listVehicles = async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.manufacturer) filter.manufacturer = new RegExp(req.query.manufacturer, 'i');
    if (req.query.fuelType)     filter.fuelType = new RegExp(req.query.fuelType, 'i');

    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter).sort({ manufacturer: 1, model: 1 }).skip(skip).limit(limit),
      Vehicle.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit);

    // Get unique manufacturers and fuel types for filters
    const [manufacturers, fuelTypes] = await Promise.all([
      Vehicle.distinct('manufacturer'),
      Vehicle.distinct('fuelType')
    ]);

    res.render('vehicles/index', {
      vehicles, page, totalPages, total,
      manufacturers: manufacturers.sort(),
      fuelTypes: fuelTypes.filter(Boolean).sort(),
      query: req.query
    });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load vehicles' });
  }
};

// GET /api/vehicles/search — JSON search for autocomplete
exports.searchVehicles = async (req, res) => {
  try {
    const { q, manufacturer, fuelType } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { manufacturer: new RegExp(q, 'i') },
        { model: new RegExp(q, 'i') }
      ];
    }
    if (manufacturer) filter.manufacturer = new RegExp(manufacturer, 'i');
    if (fuelType)     filter.fuelType = new RegExp(fuelType, 'i');

    const vehicles = await Vehicle.find(filter)
      .sort({ manufacturer: 1, model: 1 })
      .limit(30);

    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
};

// GET /api/vehicles/stats — aggregated stats
exports.getStats = async (req, res) => {
  try {
    const [totalCount, fuelStats, avgCo2] = await Promise.all([
      Vehicle.countDocuments(),
      Vehicle.aggregate([
        { $group: { _id: '$fuelType', count: { $sum: 1 }, avgCo2: { $avg: '$co2' } } },
        { $sort: { count: -1 } }
      ]),
      Vehicle.aggregate([
        { $group: { _id: null, avgCo2: { $avg: '$co2' }, minCo2: { $min: '$co2' }, maxCo2: { $max: '$co2' } } }
      ])
    ]);

    res.json({ totalCount, fuelStats, overall: avgCo2[0] || {} });
  } catch (err) {
    res.status(500).json({ error: 'Stats failed' });
  }
};

// GET /api/vehicles/manufacturers — unique manufacturer list
exports.getManufacturers = async (req, res) => {
  try {
    const manufacturers = await Vehicle.distinct('manufacturer');
    res.json(manufacturers.sort());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get manufacturers' });
  }
};

// GET /api/vehicles/models?manufacturer=BMW — models for a manufacturer
exports.getModels = async (req, res) => {
  try {
    const { manufacturer } = req.query;
    if (!manufacturer) return res.json([]);

    const vehicles = await Vehicle.find({ manufacturer: new RegExp('^' + manufacturer + '$', 'i') })
      .select('model fuelType co2 engineSize year transmission')
      .sort({ model: 1 });

    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get models' });
  }
};
