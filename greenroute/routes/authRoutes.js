const express = require("express");
const router = express.Router();
const auth = require("../controllers/authController");

router.get("/register", auth.registerForm);
router.post("/register", auth.register);
router.get("/login", auth.loginForm);
router.post("/login", auth.login);
router.get("/logout", auth.logout);

module.exports = router;
