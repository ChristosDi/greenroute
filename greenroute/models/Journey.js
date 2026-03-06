const mongoose = require('mongoose');

const journeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  origin:           { type: String, required: true, trim: true },
  destination:      { type: String, required: true, trim: true },
  distance:         { type: Number, required: true, min: 0 },
  gradient:         { type: Number, default: 0 },
  elevationGain:    { type: Number, default: 0 },
  elevationLoss:    { type: Number, default: 0 },
  gradientModifier: { type: Number, default: 1.0 },
  transportMode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransportMode'
  },
  userVehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserVehicle',
    default: null
  },
  emissions:      { type: Number, default: 0 },
  baseEmissions:  { type: Number, default: 0 },
  emissionSource: { type: String, enum: ['vehicle', 'mode', 'manual'], default: 'mode' },
  date:           { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Journey', journeySchema);
