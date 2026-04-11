const express = require("express");
const { listLogs } = require("../controllers/logController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: List recent alert and entry logs
 *     tags: [Logs]
 *     responses:
 *       200:
 *         description: Recent logs returned
 */
router.use(protect);
router.get("/", listLogs);

module.exports = router;
