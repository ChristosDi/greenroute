var express = require("express");
var router = express.Router();
var { isAuthenticated, isUser } = require("../middleware/authMiddleware");
var uvc = require("../controllers/userVehicleController");

// All user vehicle routes require login AND regular user role
router.get("/", isAuthenticated, isUser, uvc.listUserVehicles);
router.post("/", isAuthenticated, isUser, uvc.addVehicle);
router.post("/:id/default", isAuthenticated, isUser, uvc.setDefault);
router.post("/:id/delete", isAuthenticated, isUser, uvc.deleteVehicle);

module.exports = router;
