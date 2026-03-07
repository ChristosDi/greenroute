var User = require("../models/User");

exports.registerForm = function (req, res) {
  res.render("auth/register", { error: null });
};

exports.register = async function (req, res) {
  try {
    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;
    var confirmPassword = req.body.confirmPassword;

    if (!name || !email || !password) {
      return res
        .status(400)
        .render("auth/register", { error: "All fields are required" });
    }
    if (password.length < 6) {
      return res.status(400).render("auth/register", {
        error: "Password must be at least 6 characters",
      });
    }
    if (password !== confirmPassword) {
      return res
        .status(400)
        .render("auth/register", { error: "Passwords do not match" });
    }

    var existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res
        .status(400)
        .render("auth/register", { error: "Email already registered" });
    }

    var user = await User.create({
      name: name,
      email: email.toLowerCase(),
      password: password,
    });

    req.session.userId = user._id;
    req.session.userName = user.name;
    req.session.role = user.role;

    res.redirect("/dashboard");
  } catch (err) {
    res.status(500).render("auth/register", {
      error: "Registration failed. Please try again.",
    });
  }
};

exports.loginForm = function (req, res) {
  res.render("auth/login", { error: null });
};

exports.login = async function (req, res) {
  try {
    var email = req.body.email;
    var password = req.body.password;

    if (!email || !password) {
      return res
        .status(400)
        .render("auth/login", { error: "All fields are required" });
    }

    var user = await User.findOne({ email: email.toLowerCase() });
      if (!user) return res.status(401).render('auth/login', { error: 'Invalid email or password' });
      if (user.status === 'suspended') return res.status(403).render('auth/login', { error: 'Your account has been suspended. Please contact an administrator for assistance.' });
    }

    // ── Check if account is suspended ───────────────────────
    // Suspended users get a clear, specific message explaining
    // why they cannot log in and who to contact
    if (user.status === "suspended") {
      return res.status(403).render("auth/login", {
        error:
          "Your account has been suspended. Please contact an administrator for assistance.",
      });
    }

    var isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .render("auth/login", { error: "Invalid email or password" });
    }

    req.session.userId = user._id;
    req.session.userName = user.name;
    req.session.role = user.role;

    res.redirect("/dashboard");
  } catch (err) {
    res
      .status(500)
      .render("auth/login", { error: "Login failed. Please try again." });
  }
};

exports.logout = function (req, res) {
  req.session.destroy(function () {
    res.clearCookie("connect.sid");
    res.redirect("/auth/login");
  });
};
