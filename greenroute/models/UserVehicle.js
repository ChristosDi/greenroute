var mongoose = require("mongoose");

var userVehicleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vehicleRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      default: null,
    },
    nickname: { type: String, required: true, trim: true },
    manufacturer: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number },
    fuelType: { type: String, trim: true },
    // CO2 from Euro 6 DB or manually entered; null = use carType standard
    co2: { type: Number, default: null },
    // Mandatory car type — determines fallback emission factor
    // petrol=170, diesel=155, hybrid=100, electric=0
    carType: {
      type: String,
      enum: ["petrol", "diesel", "hybrid", "electric"],
      required: true,
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Ensure only one default per user
userVehicleSchema.pre("save", async function (next) {
  if (this.isDefault) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false },
    );
  }
  next();
});

// Static: get the standard emission factor for a car type
userVehicleSchema.statics.getStandardFactor = function (carType) {
  var standards = { petrol: 170, diesel: 155, hybrid: 100, electric: 0 };
  return standards[carType] || 170;
};

userVehicleSchema.index({ userId: 1 });

module.exports = mongoose.model("UserVehicle", userVehicleSchema);
