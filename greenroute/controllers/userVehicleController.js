var UserVehicle = require("../models/UserVehicle");
var User = require("../models/User");

// GET /my-vehicles
exports.listUserVehicles = async function (req, res) {
  try {
    var vehicles = await UserVehicle.find({ userId: req.session.userId })
      .populate("vehicleRef")
      .sort({ isDefault: -1, nickname: 1 });
    res.render("user-vehicles/index", { vehicles: vehicles });
  } catch (err) {
    res.status(500).render("error", { message: "Failed to load vehicles" });
  }
};

// POST /my-vehicles
exports.addVehicle = async function (req, res) {
  try {
    var nickname = (req.body.nickname || "").trim();
    var manufacturer = (req.body.manufacturer || "").trim();
    var model = (req.body.model || "").trim();
    var carType = req.body.carType;

    if (!nickname || !manufacturer || !model || !carType) {
      return res.status(400).render("error", {
        message: "Nickname, manufacturer, model, and car type are required",
      });
    }

    var vehicleData = {
      userId: req.session.userId,
      nickname: nickname,
      manufacturer: manufacturer,
      model: model,
      year: req.body.year ? parseInt(req.body.year) : null,
      fuelType: req.body.fuelType || null,
      co2: req.body.co2 ? parseFloat(req.body.co2) : null,
      carType: carType,
      vehicleRef: req.body.vehicleRefId || null,
      isDefault: req.body.setAsDefault === "true",
    };

    var vehicle = await UserVehicle.create(vehicleData);

    if (vehicle.isDefault) {
      await User.findByIdAndUpdate(req.session.userId, {
        defaultVehicle: vehicle._id,
      });
    }

    res.redirect("/my-vehicles");
  } catch (err) {
    console.error("Add vehicle error:", err);
    res.status(500).render("error", { message: "Failed to add vehicle" });
  }
};

// POST /my-vehicles/:id/default
exports.setDefault = async function (req, res) {
  try {
    await UserVehicle.updateMany(
      { userId: req.session.userId },
      { isDefault: false },
    );
    await UserVehicle.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      { isDefault: true },
    );
    await User.findByIdAndUpdate(req.session.userId, {
      defaultVehicle: req.params.id,
    });
    res.redirect("/my-vehicles");
  } catch (err) {
    res.status(500).render("error", { message: "Failed to set default" });
  }
};

// POST /my-vehicles/:id/delete
exports.deleteVehicle = async function (req, res) {
  try {
    var vehicle = await UserVehicle.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId,
    });
    if (vehicle && vehicle.isDefault) {
      await User.findByIdAndUpdate(req.session.userId, {
        defaultVehicle: null,
      });
    }
    res.redirect("/my-vehicles");
  } catch (err) {
    res.status(500).render("error", { message: "Failed to delete vehicle" });
  }
};

// GET /api/my-vehicles
exports.getUserVehiclesJSON = async function (req, res) {
  try {
    var vehicles = await UserVehicle.find({ userId: req.session.userId }).sort({
      isDefault: -1,
      nickname: 1,
    });
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: "Failed to load vehicles" });
  }
};
