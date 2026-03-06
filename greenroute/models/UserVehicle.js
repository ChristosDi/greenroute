const mongoose = require('mongoose');

const userVehicleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Optional reference to Euro 6 database vehicle
  vehicleRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    default: null
  },
  // User-friendly nickname
  nickname:     { type: String, required: true, trim: true },
  manufacturer: { type: String, required: true, trim: true },
  model:        { type: String, required: true, trim: true },
  year:         { type: Number },
  fuelType:     { type: String, trim: true },
  // CO2 in gCO2/km — from Euro 6 DB or user-entered; null = use transport mode default
  co2:          { type: Number, default: null },
  isDefault:    { type: Boolean, default: false }
}, { timestamps: true });

// Ensure only one default per user
userVehicleSchema.pre('save', async function (next) {
  if (this.isDefault) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

userVehicleSchema.index({ userId: 1 });

module.exports = mongoose.model('UserVehicle', userVehicleSchema);
