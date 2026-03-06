var Journey = require("../models/Journey");
var TransportMode = require("../models/TransportMode");
var UserVehicle = require("../models/UserVehicle");

// GET /journeys
exports.listJourneys = async (req, res) => {
  try {
    var journeys = await Journey.find({ userId: req.session.userId })
      .populate("transportMode")
      .populate("userVehicle")
      .sort({ date: -1 });

    var totalEmissions = journeys.reduce(function (sum, j) {
      return sum + (j.emissions || 0);
    }, 0);
    var totalDistance = journeys.reduce(function (sum, j) {
      return sum + (j.distance || 0);
    }, 0);

    res.render("journeys/index", {
      journeys: journeys,
      totalEmissions: totalEmissions,
      totalDistance: totalDistance,
    });
  } catch (err) {
    res.status(500).render("error", { message: "Failed to load journeys" });
  }
};

// GET /journeys/new
exports.newJourneyForm = async (req, res) => {
  try {
    var transportModes = await TransportMode.find({ isActive: true }).sort({
      name: 1,
    });
    var userVehicles = await UserVehicle.find({
      userId: req.session.userId,
    }).sort({ nickname: 1 });
    var defaultVehicle =
      userVehicles.find(function (v) {
        return v.isDefault;
      }) || null;

    res.render("journeys/new", {
      transportModes: transportModes,
      userVehicles: userVehicles,
      defaultVehicle: defaultVehicle,
      error: null,
    });
  } catch (err) {
    res.status(500).render("error", { message: "Failed to load form" });
  }
};

// POST /journeys
exports.createJourney = async (req, res) => {
  try {
    var origin = req.body.origin;
    var destination = req.body.destination;
    var distance = req.body.distance;
    var transportModeId = req.body.transportModeId;
    var gradient = req.body.gradient;
    var elevationGain = req.body.elevationGain;
    var elevationLoss = req.body.elevationLoss;
    var gradientModifier = req.body.gradientModifier;
    var userVehicleId = req.body.userVehicleId;
    var manualDistance = req.body.manualDistance;

    if (!origin || !destination) {
      var transportModes = await TransportMode.find({ isActive: true });
      var userVehicles = await UserVehicle.find({ userId: req.session.userId });
      return res.status(400).render("journeys/new", {
        error: "Origin and destination are required",
        transportModes: transportModes,
        userVehicles: userVehicles,
        defaultVehicle: null,
      });
    }

    // Use manual distance if provided, otherwise auto-calculated
    var finalDistance =
      parseFloat(manualDistance) > 0
        ? parseFloat(manualDistance)
        : parseFloat(distance);

    if (!finalDistance || finalDistance <= 0) {
      var transportModes = await TransportMode.find({ isActive: true });
      var userVehicles = await UserVehicle.find({ userId: req.session.userId });
      return res.status(400).render("journeys/new", {
        error: "A valid distance is required",
        transportModes: transportModes,
        userVehicles: userVehicles,
        defaultVehicle: null,
      });
    }

    // ── Determine emission factor ───────────────────────────
    var emissionFactor = 0;
    var emissionSource = "mode";
    var mode = null;

    if (transportModeId) {
      mode = await TransportMode.findById(transportModeId);
    }

    // Vehicle CO2 takes priority over transport mode
    if (userVehicleId) {
      var userVehicle = await UserVehicle.findById(userVehicleId);
      if (userVehicle && userVehicle.co2) {
        emissionFactor = userVehicle.co2;
        emissionSource = "vehicle";
      }
    }

    // Fall back to transport mode if no vehicle CO2
    if (emissionFactor === 0 && mode) {
      emissionFactor = mode.emissionFactor;
    }

    // ── Gradient modifier logic ─────────────────────────────
    // Only apply gradient to road-based modes (car, bus, van, etc.)
    // Rail, water, and human-powered modes are not affected by road gradient
    var gMod = 1.0;
    var finalGradient = parseFloat(gradient) || 0;
    var finalElevGain = parseFloat(elevationGain) || 0;
    var finalElevLoss = parseFloat(elevationLoss) || 0;

    // Check if this transport mode uses gradient
    var applyGradient = false;
    if (mode && mode.usesGradient) {
      applyGradient = true;
    }
    // If using a vehicle (car), gradient always applies
    if (emissionSource === "vehicle") {
      applyGradient = true;
    }

    if (applyGradient) {
      gMod = parseFloat(gradientModifier) || 1.0;
    } else {
      // Non-road modes: reset gradient data — it's not relevant
      gMod = 1.0;
      finalGradient = 0;
      finalElevGain = 0;
      finalElevLoss = 0;
    }

    // ── Calculate emissions ─────────────────────────────────
    var baseEmissions = finalDistance * emissionFactor;
    var adjustedEmissions = Math.round(baseEmissions * gMod);

    await Journey.create({
      userId: req.session.userId,
      origin: origin,
      destination: destination,
      distance: finalDistance,
      gradient: finalGradient,
      elevationGain: finalElevGain,
      elevationLoss: finalElevLoss,
      gradientModifier: gMod,
      transportMode: transportModeId || null,
      userVehicle: userVehicleId || null,
      baseEmissions: Math.round(baseEmissions),
      emissions: adjustedEmissions,
      emissionSource: emissionSource,
    });

    res.redirect("/journeys");
  } catch (err) {
    if (err.name === "ValidationError") {
      var transportModes = await TransportMode.find({ isActive: true });
      var userVehicles = await UserVehicle.find({ userId: req.session.userId });
      return res.status(400).render("journeys/new", {
        error: err.message,
        transportModes: transportModes,
        userVehicles: userVehicles,
        defaultVehicle: null,
      });
    }
    console.error("Create journey error:", err);
    res.status(500).render("error", { message: "Server error" });
  }
};

// GET /journeys/:id
exports.showJourney = async (req, res) => {
  try {
    var journey = await Journey.findOne({
      _id: req.params.id,
      userId: req.session.userId,
    })
      .populate("transportMode")
      .populate("userVehicle");

    if (!journey)
      return res.status(404).render("error", { message: "Journey not found" });
    res.render("journeys/show", { journey: journey });
  } catch (err) {
    res.status(500).render("error", { message: "Server error" });
  }
};

// GET /journeys/:id/edit
exports.editJourneyForm = async (req, res) => {
  try {
    var journey = await Journey.findOne({
      _id: req.params.id,
      userId: req.session.userId,
    })
      .populate("transportMode")
      .populate("userVehicle");

    if (!journey)
      return res.status(404).render("error", { message: "Journey not found" });

    var transportModes = await TransportMode.find({ isActive: true }).sort({
      name: 1,
    });
    var userVehicles = await UserVehicle.find({
      userId: req.session.userId,
    }).sort({ nickname: 1 });

    res.render("journeys/edit", {
      journey: journey,
      transportModes: transportModes,
      userVehicles: userVehicles,
      error: null,
    });
  } catch (err) {
    res.status(500).render("error", { message: "Failed to load form" });
  }
};

// POST /journeys/:id
exports.updateJourney = async (req, res) => {
  try {
    var origin = req.body.origin;
    var destination = req.body.destination;
    var distance = req.body.distance;
    var transportModeId = req.body.transportModeId;
    var gradient = req.body.gradient;
    var elevationGain = req.body.elevationGain;
    var elevationLoss = req.body.elevationLoss;
    var gradientModifier = req.body.gradientModifier;
    var userVehicleId = req.body.userVehicleId;
    var manualDistance = req.body.manualDistance;

    var finalDistance =
      parseFloat(manualDistance) > 0
        ? parseFloat(manualDistance)
        : parseFloat(distance);

    if (!origin || !destination || !finalDistance) {
      var journey = await Journey.findById(req.params.id);
      var transportModes = await TransportMode.find({ isActive: true });
      var userVehicles = await UserVehicle.find({ userId: req.session.userId });
      return res.status(400).render("journeys/edit", {
        error: "All fields are required",
        journey: journey,
        transportModes: transportModes,
        userVehicles: userVehicles,
      });
    }

    // Determine emission factor
    var emissionFactor = 0;
    var emissionSource = "mode";
    var mode = null;

    if (transportModeId) {
      mode = await TransportMode.findById(transportModeId);
    }

    if (userVehicleId) {
      var uv = await UserVehicle.findById(userVehicleId);
      if (uv && uv.co2) {
        emissionFactor = uv.co2;
        emissionSource = "vehicle";
      }
    }
    if (emissionFactor === 0 && mode) {
      emissionFactor = mode.emissionFactor;
    }

    // Gradient logic — same as create
    var gMod = 1.0;
    var finalGradient = parseFloat(gradient) || 0;
    var finalElevGain = parseFloat(elevationGain) || 0;
    var finalElevLoss = parseFloat(elevationLoss) || 0;

    var applyGradient = false;
    if (mode && mode.usesGradient) applyGradient = true;
    if (emissionSource === "vehicle") applyGradient = true;

    if (!applyGradient) {
      gMod = 1.0;
      finalGradient = 0;
      finalElevGain = 0;
      finalElevLoss = 0;
    } else {
      gMod = parseFloat(gradientModifier) || 1.0;
    }

    var baseEmissions = finalDistance * emissionFactor;
    var adjustedEmissions = Math.round(baseEmissions * gMod);

    var journey = await Journey.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      {
        origin: origin,
        destination: destination,
        distance: finalDistance,
        gradient: finalGradient,
        elevationGain: finalElevGain,
        elevationLoss: finalElevLoss,
        gradientModifier: gMod,
        transportMode: transportModeId || null,
        userVehicle: userVehicleId || null,
        baseEmissions: Math.round(baseEmissions),
        emissions: adjustedEmissions,
        emissionSource: emissionSource,
      },
      { new: true, runValidators: true },
    );

    if (!journey)
      return res.status(404).render("error", { message: "Journey not found" });
    res.redirect("/journeys/" + journey._id);
  } catch (err) {
    console.error("Update journey error:", err);
    res.status(500).render("error", { message: "Server error" });
  }
};

// POST /journeys/:id/delete
exports.deleteJourney = async (req, res) => {
  try {
    await Journey.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId,
    });
    res.redirect("/journeys");
  } catch (err) {
    res.status(500).render("error", { message: "Server error" });
  }
};
