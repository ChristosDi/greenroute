var User = require("../models/User");
var Journey = require("../models/Journey");
var Vehicle = require("../models/Vehicle");
var TransportMode = require("../models/TransportMode");
var UserVehicle = require("../models/UserVehicle");

// GET /admin
// GET /admin
exports.dashboard = async function (req, res) {
  try {
    var counts = await Promise.all([
      User.countDocuments(),
      Journey.countDocuments(),
      Vehicle.countDocuments(),
      TransportMode.countDocuments(),
      UserVehicle.countDocuments(),
    ]);

    var emissionStats = await Journey.aggregate([
      {
        $group: {
          _id: null,
          totalEmissions: { $sum: "$emissions" },
          avgEmissions: { $avg: "$emissions" },
          totalDistance: { $sum: "$distance" },
        },
      },
    ]);

    // ── All transport modes for the filter dropdown ──────────
    var allModes = await TransportMode.find().sort({ name: 1 });

    // ── Top modes chart data ────────────────────────────────
    var topModes = await Journey.aggregate([
      {
        $group: {
          _id: "$transportMode",
          count: { $sum: 1 },
          totalEmissions: { $sum: "$emissions" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    var populatedModes = await TransportMode.populate(topModes, {
      path: "_id",
    });

    // ── Journey filtering & sorting from query params ───────
    var jSortBy = req.query.jSortBy || "date";
    var jMode = req.query.jMode || "";
    var jMinCo2 = parseInt(req.query.jMinCo2) || 0;
    var jMaxCo2 = req.query.jMaxCo2 ? parseInt(req.query.jMaxCo2) : null;
    var jMinDist = parseFloat(req.query.jMinDist) || 0;
    var jMaxDist = req.query.jMaxDist ? parseFloat(req.query.jMaxDist) : null;

    // Build journey query
    var journeyFilter = {};
    if (jMode) journeyFilter.transportMode = jMode;
    if (jMinCo2 > 0) journeyFilter.emissions = { $gte: jMinCo2 };
    if (jMaxCo2 !== null) {
      journeyFilter.emissions = journeyFilter.emissions || {};
      journeyFilter.emissions.$lte = jMaxCo2;
    }
    if (jMinDist > 0) journeyFilter.distance = { $gte: jMinDist };
    if (jMaxDist !== null) {
      journeyFilter.distance = journeyFilter.distance || {};
      journeyFilter.distance.$lte = jMaxDist;
    }

    // Build sort
    var journeySort = { createdAt: -1 }; // default: newest first
    if (jSortBy === "co2_desc") journeySort = { emissions: -1 };
    if (jSortBy === "co2_asc") journeySort = { emissions: 1 };
    if (jSortBy === "dist_desc") journeySort = { distance: -1 };
    if (jSortBy === "dist_asc") journeySort = { distance: 1 };

    var recentJourneys = await Journey.find(journeyFilter)
      .populate("userId", "name email")
      .populate("transportMode")
      .sort(journeySort)
      .limit(50);

    res.render("admin/dashboard", {
      totalUsers: counts[0],
      totalJourneys: counts[1],
      totalVehicles: counts[2],
      totalModes: counts[3],
      totalUserVehicles: counts[4],
      stats: emissionStats[0] || {
        totalEmissions: 0,
        avgEmissions: 0,
        totalDistance: 0,
      },
      recentJourneys: recentJourneys,
      topModes: populatedModes,
      allModes: allModes,
      query: req.query,
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res
      .status(500)
      .render("error", { message: "Failed to load admin dashboard" });
  }
};

// GET /admin/users — with sorting, filtering, status
exports.listUsers = async function (req, res) {
  try {
    var sortBy = req.query.sortBy || "name";
    var sortDir = req.query.sortDir || "asc";
    var minCo2 = parseFloat(req.query.minCo2) || 0;
    var maxCo2 = req.query.maxCo2 ? parseFloat(req.query.maxCo2) : null;
    var minJourneys = parseInt(req.query.minJourneys) || 0;
    var maxJourneys = req.query.maxJourneys
      ? parseInt(req.query.maxJourneys)
      : null;
    var roleFilter = req.query.role || "";
    var statusFilter = req.query.status || "";
    var searchName = (req.query.search || "").trim();

    // Build query
    var userQuery = {};
    if (roleFilter) userQuery.role = roleFilter;
    if (statusFilter) userQuery.status = statusFilter;
    if (searchName) userQuery.name = new RegExp(searchName, "i");

    var users = await User.find(userQuery).select("-password");

    // Journey stats per user
    var journeyStats = await Journey.aggregate([
      {
        $group: {
          _id: "$userId",
          journeyCount: { $sum: 1 },
          totalEmissions: { $sum: "$emissions" },
          totalDistance: { $sum: "$distance" },
        },
      },
    ]);

    var statsMap = {};
    journeyStats.forEach(function (s) {
      statsMap[s._id.toString()] = s;
    });

    // Merge
    var usersWithStats = users.map(function (u) {
      var s = statsMap[u._id.toString()] || {
        journeyCount: 0,
        totalEmissions: 0,
        totalDistance: 0,
      };
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status || "active",
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        journeyCount: s.journeyCount,
        totalEmissions: s.totalEmissions,
        totalDistance: Math.round(s.totalDistance * 100) / 100,
      };
    });

    // CO2 filters (input in kg, data in g)
    if (minCo2 > 0) {
      usersWithStats = usersWithStats.filter(function (u) {
        return u.totalEmissions >= minCo2 * 1000;
      });
    }
    if (maxCo2 !== null) {
      usersWithStats = usersWithStats.filter(function (u) {
        return u.totalEmissions <= maxCo2 * 1000;
      });
    }

    // Journey count filters
    if (minJourneys > 0) {
      usersWithStats = usersWithStats.filter(function (u) {
        return u.journeyCount >= minJourneys;
      });
    }
    if (maxJourneys !== null) {
      usersWithStats = usersWithStats.filter(function (u) {
        return u.journeyCount <= maxJourneys;
      });
    }

    // Sort
    var direction = sortDir === "desc" ? -1 : 1;
    usersWithStats.sort(function (a, b) {
      if (sortBy === "emissions")
        return (a.totalEmissions - b.totalEmissions) * direction;
      if (sortBy === "journeys")
        return (a.journeyCount - b.journeyCount) * direction;
      if (sortBy === "date")
        return (new Date(a.createdAt) - new Date(b.createdAt)) * direction;
      var nameA = a.name.toLowerCase(),
        nameB = b.name.toLowerCase();
      if (nameA < nameB) return -1 * direction;
      if (nameA > nameB) return 1 * direction;
      return 0;
    });

    res.render("admin/users", { users: usersWithStats, query: req.query });
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).render("error", { message: "Failed to load users" });
  }
};

// GET /admin/users/:id/journeys
exports.viewUserJourneys = async function (req, res) {
  try {
    var targetUser = await User.findById(req.params.id).select("-password");
    if (!targetUser)
      return res.status(404).render("error", { message: "User not found" });

    var journeys = await Journey.find({ userId: req.params.id })
      .populate("transportMode")
      .populate("userVehicle")
      .sort({ date: -1 });

    var totalEmissions = 0,
      totalDistance = 0,
      totalBaseEmissions = 0;
    journeys.forEach(function (j) {
      totalEmissions += j.emissions || 0;
      totalBaseEmissions += j.baseEmissions || 0;
      totalDistance += j.distance || 0;
    });

    res.render("admin/user-journeys", {
      targetUser: targetUser,
      journeys: journeys,
      totals: {
        emissions: totalEmissions,
        baseEmissions: totalBaseEmissions,
        distance: Math.round(totalDistance * 100) / 100,
        count: journeys.length,
      },
    });
  } catch (err) {
    console.error("View user journeys error:", err);
    res
      .status(500)
      .render("error", { message: "Failed to load user journeys" });
  }
};

// POST /admin/users/:id/role
exports.updateRole = async function (req, res) {
  try {
    if (!["user", "admin"].includes(req.body.role))
      return res.redirect("/admin/users");
    await User.findByIdAndUpdate(req.params.id, { role: req.body.role });
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("error", { message: "Failed to update role" });
  }
};

// POST /admin/users/:id/suspend — toggle suspend/activate
exports.toggleSuspend = async function (req, res) {
  try {
    if (req.params.id === req.session.userId.toString())
      return res.redirect("/admin/users");
    var user = await User.findById(req.params.id);
    if (!user) return res.redirect("/admin/users");

    user.status = user.status === "suspended" ? "active" : "suspended";
    await user.save();

    // If suspending, immediately destroy all their active sessions
    // Sessions are stored in MongoDB by connect-mongo in the 'sessions' collection
    // Each session document has a 'session' field containing JSON with userId
    if (user.status === "suspended") {
      var mongoose = require("mongoose");
      var db = mongoose.connection.db;
      // connect-mongo stores sessions with the userId inside a JSON string
      // We search for any session containing this user's ID and delete them all
      await db.collection("sessions").deleteMany({
        session: { $regex: user._id.toString() },
      });
    }

    res.redirect("/admin/users");
  } catch (err) {
    console.error("Toggle suspend error:", err);
    res
      .status(500)
      .render("error", { message: "Failed to update user status" });
  }
};

// POST /admin/users/:id/delete
exports.deleteUser = async function (req, res) {
  try {
    if (req.params.id === req.session.userId.toString())
      return res.redirect("/admin/users");

    // First, destroy all their active sessions immediately
    // This logs them out before we delete their data
    var mongoose = require("mongoose");
    var db = mongoose.connection.db;
    await db.collection("sessions").deleteMany({
      session: { $regex: req.params.id },
    });

    // Then delete the user and all their data
    await Promise.all([
      User.findByIdAndDelete(req.params.id),
      Journey.deleteMany({ userId: req.params.id }),
      UserVehicle.deleteMany({ userId: req.params.id }),
    ]);

    res.redirect("/admin/users");
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).render("error", { message: "Failed to delete user" });
  }
};
// GET /admin/journeys — view, filter, sort ALL journeys from all users
exports.listAllJourneys = async function (req, res) {
  try {
    // ── Read filter/sort params ─────────────────────────────
    var sortBy = req.query.sortBy || "date";
    var modeFilter = req.query.mode || "";
    var minCo2 = parseInt(req.query.minCo2) || 0;
    var maxCo2 = req.query.maxCo2 ? parseInt(req.query.maxCo2) : null;
    var minDist = parseFloat(req.query.minDist) || 0;
    var maxDist = req.query.maxDist ? parseFloat(req.query.maxDist) : null;
    var searchUser = (req.query.searchUser || "").trim();

    // ── Build journey query ─────────────────────────────────
    var journeyFilter = {};

    if (modeFilter) {
      journeyFilter.transportMode = modeFilter;
    }

    // CO2 range filter
    if (minCo2 > 0 || maxCo2 !== null) {
      journeyFilter.emissions = {};
      if (minCo2 > 0) journeyFilter.emissions.$gte = minCo2;
      if (maxCo2 !== null) journeyFilter.emissions.$lte = maxCo2;
    }

    // Distance range filter
    if (minDist > 0 || maxDist !== null) {
      journeyFilter.distance = {};
      if (minDist > 0) journeyFilter.distance.$gte = minDist;
      if (maxDist !== null) journeyFilter.distance.$lte = maxDist;
    }

    // ── Build sort ──────────────────────────────────────────
    var journeySort = { createdAt: -1 };
    if (sortBy === "co2_desc") journeySort = { emissions: -1 };
    if (sortBy === "co2_asc") journeySort = { emissions: 1 };
    if (sortBy === "dist_desc") journeySort = { distance: -1 };
    if (sortBy === "dist_asc") journeySort = { distance: 1 };
    if (sortBy === "date_asc") journeySort = { createdAt: 1 };

    // ── Fetch journeys ──────────────────────────────────────
    var journeys = await Journey.find(journeyFilter)
      .populate("userId", "name email")
      .populate("transportMode")
      .populate("userVehicle")
      .sort(journeySort)
      .limit(200);

    // ── Filter by user name if provided ─────────────────────
    // Done post-query because we need the populated user name
    if (searchUser) {
      var regex = new RegExp(searchUser, "i");
      journeys = journeys.filter(function (j) {
        return j.userId && regex.test(j.userId.name);
      });
    }

    // ── Totals for the filtered set ─────────────────────────
    var totalEmissions = 0;
    var totalDistance = 0;
    journeys.forEach(function (j) {
      totalEmissions += j.emissions || 0;
      totalDistance += j.distance || 0;
    });

    // ── All transport modes for the filter dropdown ──────────
    var allModes = await TransportMode.find().sort({ name: 1 });

    res.render("admin/journeys", {
      journeys: journeys,
      allModes: allModes,
      query: req.query,
      totals: {
        count: journeys.length,
        emissions: totalEmissions,
        distance: Math.round(totalDistance * 100) / 100,
      },
    });
  } catch (err) {
    console.error("Admin list journeys error:", err);
    res.status(500).render("error", { message: "Failed to load journeys" });
  }
};

// POST /admin/journeys/:id/delete — delete any journey
exports.deleteAnyJourney = async function (req, res) {
  try {
    await Journey.findByIdAndDelete(req.params.id);
    // Redirect back with existing query params preserved
    var backUrl = "/admin/journeys";
    if (
      req.headers.referer &&
      req.headers.referer.includes("/admin/journeys")
    ) {
      // Preserve filters by redirecting back to referer
      backUrl = req.headers.referer;
    }
    res.redirect(backUrl);
  } catch (err) {
    res.status(500).render("error", { message: "Failed to delete journey" });
  }
};
