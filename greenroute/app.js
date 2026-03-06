require("dotenv").config();

const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const connectDB = require("./config/db");

const app = express();

// ── Connect to MongoDB ────────────────────────────────────────
connectDB();

// ── View engine ───────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Static files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Sessions ──────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || "greenroute-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60, // 1 day
    }),
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// ── Make session data available in all views ─────────────────
app.use((req, res, next) => {
  res.locals.user = req.session.userId
    ? {
        id: req.session.userId,
        name: req.session.userName,
        role: req.session.role,
      }
    : null;
  res.locals.currentPath = req.path;
  next();
});

// ── Routes ────────────────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");
const journeyRoutes = require("./routes/journeyRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const userVehicleRoutes = require("./routes/userVehicleRoutes");
const adminRoutes = require("./routes/adminRoutes");
const apiRoutes = require("./routes/apiRoutes");

app.use("/auth", authRoutes);
app.use("/journeys", journeyRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/my-vehicles", userVehicleRoutes);
app.use("/admin", adminRoutes);
app.use("/api", apiRoutes);

// ── Home / Dashboard ──────────────────────────────────────────
const Journey = require("./models/Journey");
const UserVehicle = require("./models/UserVehicle");

app.get("/", (req, res) => {
  if (!req.session.userId) return res.redirect("/auth/login");
  // Admins go to admin panel, users go to dashboard
  if (req.session.role === "admin") return res.redirect("/admin");
  res.redirect("/dashboard");
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.userId) return res.redirect("/auth/login");

  // Admins don't have a personal dashboard — redirect to admin panel
  if (req.session.role === "admin") return res.redirect("/admin");

  try {
    const recentJourneys = await Journey.find({ userId: req.session.userId })
      .populate("transportMode")
      .populate("userVehicle")
      .sort({ date: -1 })
      .limit(5);

    const mongoose = require("mongoose");
    const stats = await Journey.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId.createFromHexString(
            req.session.userId.toString(),
          ),
        },
      },
      {
        $group: {
          _id: null,
          totalEmissions: { $sum: "$emissions" },
          totalDistance: { $sum: "$distance" },
          journeyCount: { $sum: 1 },
        },
      },
    ]);

    const defaultVehicle = await UserVehicle.findOne({
      userId: req.session.userId,
      isDefault: true,
    });

    res.render("dashboard", {
      recentJourneys,
      stats: stats[0] || {
        totalEmissions: 0,
        totalDistance: 0,
        journeyCount: 0,
      },
      defaultVehicle,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.render("dashboard", {
      recentJourneys: [],
      stats: { totalEmissions: 0, totalDistance: 0, journeyCount: 0 },
      defaultVehicle: null,
    });
  }
});

// ── Profile ───────────────────────────────────────────────────
const User = require("./models/User");

app.get("/profile", async (req, res) => {
  if (!req.session.userId) return res.redirect("/auth/login");
  // Admins don't have a personal profile page
  if (req.session.role === "admin") return res.redirect("/admin");
  try {
    const userDoc = await User.findById(req.session.userId).select("-password");
    const vehicleCount = await UserVehicle.countDocuments({
      userId: req.session.userId,
    });
    const journeyCount = await Journey.countDocuments({
      userId: req.session.userId,
    });
    res.render("profile", { userDoc, vehicleCount, journeyCount });
  } catch (err) {
    res.status(500).render("error", { message: "Failed to load profile" });
  }
});

app.post("/profile", async (req, res) => {
  if (!req.session.userId) return res.redirect("/auth/login");
  if (req.session.role === "admin") return res.redirect("/admin");
  try {
    const { name, email } = req.body;
    await User.findByIdAndUpdate(req.session.userId, {
      name,
      email: email.toLowerCase(),
    });
    req.session.userName = name;
    res.redirect("/profile");
  } catch (err) {
    res.status(500).render("error", { message: "Failed to update profile" });
  }
});

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render("error", { message: "Page not found" });
});

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GreenRoute listening on http://localhost:${PORT}`);
});

module.exports = app;
