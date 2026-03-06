var mongoose = require("mongoose");

var transportModeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    emissionFactor: { type: Number, required: true },
    icon: { type: String, default: "🚗" },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // Whether road gradient affects emissions for this mode
    // true  = road vehicles (car, bus, van, motorcycle, taxi)
    // false = rail, water, human-powered (train, tram, metro, ferry, bike, walking)
    usesGradient: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TransportMode", transportModeSchema);
