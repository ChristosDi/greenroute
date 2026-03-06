const TransportMode = require('../models/TransportMode');

// GET /transport-modes — list
exports.listModes = async (req, res) => {
  try {
    const modes = await TransportMode.find().sort({ name: 1 });
    res.render('admin/transport-modes', { modes, error: null, success: null });
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to load transport modes' });
  }
};

// POST /transport-modes — create (admin)
exports.createMode = async (req, res) => {
  try {
    const { name, emissionFactor, icon, description } = req.body;
    await TransportMode.create({
      name, emissionFactor: parseFloat(emissionFactor),
      icon: icon || '🚗', description
    });
    res.redirect('/admin/transport-modes');
  } catch (err) {
    const modes = await TransportMode.find().sort({ name: 1 });
    res.status(400).render('admin/transport-modes', {
      modes, error: err.message, success: null
    });
  }
};

// POST /transport-modes/:id/toggle — toggle active (admin)
exports.toggleMode = async (req, res) => {
  try {
    const mode = await TransportMode.findById(req.params.id);
    if (mode) {
      mode.isActive = !mode.isActive;
      await mode.save();
    }
    res.redirect('/admin/transport-modes');
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to toggle mode' });
  }
};

// POST /transport-modes/:id/delete (admin)
exports.deleteMode = async (req, res) => {
  try {
    await TransportMode.findByIdAndDelete(req.params.id);
    res.redirect('/admin/transport-modes');
  } catch (err) {
    res.status(500).render('error', { message: 'Failed to delete mode' });
  }
};

// GET /api/transport-modes — JSON
exports.getModesJSON = async (req, res) => {
  try {
    const modes = await TransportMode.find({ isActive: true }).sort({ name: 1 });
    res.json(modes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load transport modes' });
  }
};
