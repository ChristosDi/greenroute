const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  manufacturer: { type: String, required: true, index: true },
  model:        { type: String, required: true },
  description:  { type: String },
  fuelType:     { type: String, index: true },
  engineSize:   { type: Number },
  co2:          { type: Number },
  transmission: { type: String },
  year:         { type: Number }
});

// Compound index for search performance
vehicleSchema.index({ manufacturer: 1, model: 1 });
vehicleSchema.index({ co2: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
