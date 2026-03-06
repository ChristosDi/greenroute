var express = require("express");
var router = express.Router();
var { isAuthenticated, isUser } = require("../middleware/authMiddleware");
var jc = require("../controllers/journeyController");

// All journey routes require login AND regular user role
// Admins are redirected to /admin instead
router.get("/", isAuthenticated, isUser, jc.listJourneys);
router.get("/new", isAuthenticated, isUser, jc.newJourneyForm);
router.post("/", isAuthenticated, isUser, jc.createJourney);
router.get("/:id", isAuthenticated, isUser, jc.showJourney);
router.get("/:id/edit", isAuthenticated, isUser, jc.editJourneyForm);
router.post("/:id", isAuthenticated, isUser, jc.updateJourney);
router.post("/:id/delete", isAuthenticated, isUser, jc.deleteJourney);

module.exports = router;
