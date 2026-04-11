const express = require("express");
const { identify } = require("../controllers/identifyController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /api/identify:
 *   post:
 *     summary: Run the identification and alert pipeline
 *     tags: [Identification]
 *     description: |
 *       Matches incoming face descriptors against residents and active visitors.
 *       When a resident appears with an unknown face, the unknown face is promoted into a 24-hour visitor.
 *       When an unknown face appears without a resident context, an alert is triggered and emergency calling is simulated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IdentifyInput'
 *     responses:
 *       200:
 *         description: Identification processed successfully
 */
router.use(protect);
router.post("/", identify);

module.exports = router;
