var User = require("../models/User");

// Checks if user is logged in AND account is active
// If suspended, destroys session and redirects to login
exports.isAuthenticated = async function (req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.originalUrl.startsWith("/api/")) {
      return res.status(401).json({ error: "Authentication required" });
    }
    return res.redirect("/auth/login");
  }

  // ── Check if account is still active ──────────────────────
  // This catches cases where an admin suspends a user while
  // they are already logged in with an active session
  try {
    var user = await User.findById(req.session.userId).select("status");
    if (!user || user.status === "suspended") {
      // Destroy their session immediately
      req.session.destroy(function () {
        if (req.originalUrl.startsWith("/api/")) {
          return res.status(403).json({ error: "Account suspended" });
        }
        res.clearCookie("connect.sid");
        res.redirect("/auth/login");
      });
      return;
    }
  } catch (err) {
    // If DB check fails, still allow through (fail-open for usability)
    // In production you might want fail-closed instead
  }

  next();
};

// Checks if the user is an admin
exports.isAdmin = function (req, res, next) {
  if (req.session && req.session.role === "admin") {
    return next();
  }
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(403).json({ error: "Admin access required" });
  }
  res.status(403).render("error", { message: "Access denied — admin only" });
};

// Checks if the user is a regular user (NOT admin)
// Admins get redirected to admin dashboard
exports.isUser = function (req, res, next) {
  if (req.session && req.session.role === "admin") {
    return res.redirect("/admin");
  }
  return next();
};
