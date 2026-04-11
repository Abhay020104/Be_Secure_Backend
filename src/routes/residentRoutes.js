const express = require("express");
const { createResident, listResidents } = require("../controllers/residentController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /api/residents:
 *   post:
 *     summary: Register a resident with face descriptor data
 *     tags: [Residents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResidentInput'
 *     responses:
 *       201:
 *         description: Resident registered successfully
 *   get:
 *     summary: List all residents
 *     tags: [Residents]
 *     responses:
 *       200:
 *         description: Resident list
 */
router.use(protect);
router.route("/").post(createResident).get(listResidents);

module.exports = router;
