var User = require("../models/User");
var Journey = require("../models/Journey");
var Vehicle = require("../models/Vehicle");
var TransportMode = require("../models/TransportMode");
var UserVehicle = require("../models/UserVehicle");

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

    var recentJourneys = await Journey.find()
      .populate("userId", "name email")
      .populate("transportMode")
      .sort({ createdAt: -1 })
      .limit(10);

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
    // Cannot suspend yourself
    if (req.params.id === req.session.userId.toString()) {
      return res.redirect("/admin/users");
    }

    var user = await User.findById(req.params.id);
    if (!user) return res.redirect("/admin/users");

    // Toggle status
    user.status = user.status === "suspended" ? "active" : "suspended";
    await user.save();

    res.redirect("/admin/users");
  } catch (err) {
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
    await Promise.all([
      User.findByIdAndDelete(req.params.id),
      Journey.deleteMany({ userId: req.params.id }),
      UserVehicle.deleteMany({ userId: req.params.id }),
    ]);
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("error", { message: "Failed to delete user" });
  }
};
