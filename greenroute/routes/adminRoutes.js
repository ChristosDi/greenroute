var express = require("express");
var router = express.Router();
var { isAuthenticated, isAdmin } = require("../middleware/authMiddleware");
var admin = require("../controllers/adminController");
var tc = require("../controllers/transportController");

router.get("/", isAuthenticated, isAdmin, admin.dashboard);
router.get("/users", isAuthenticated, isAdmin, admin.listUsers);
router.get(
  "/users/:id/journeys",
  isAuthenticated,
  isAdmin,
  admin.viewUserJourneys,
);
router.post("/users/:id/role", isAuthenticated, isAdmin, admin.updateRole);
router.post(
  "/users/:id/suspend",
  isAuthenticated,
  isAdmin,
  admin.toggleSuspend,
);
router.post("/users/:id/delete", isAuthenticated, isAdmin, admin.deleteUser);
router.get("/journeys", isAuthenticated, isAdmin, admin.listAllJourneys);
router.post(
  "/journeys/:id/delete",
  isAuthenticated,
  isAdmin,
  admin.deleteAnyJourney,
);
router.get("/transport-modes", isAuthenticated, isAdmin, tc.listModes);
router.post("/transport-modes", isAuthenticated, isAdmin, tc.createMode);
router.post(
  "/transport-modes/:id/toggle",
  isAuthenticated,
  isAdmin,
  tc.toggleMode,
);
router.post(
  "/transport-modes/:id/delete",
  isAuthenticated,
  isAdmin,
  tc.deleteMode,
);

module.exports = router;
