const express = require("express");
const {
  getContacts,
  replaceContacts,
  addContact,
  removeContact,
} = require("../controllers/emergencyController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /api/emergency-contacts/{residentId}:
 *   get:
 *     summary: Get a resident's emergency contacts
 *     tags: [Emergency Contacts]
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Emergency contacts returned
 *   put:
 *     summary: Replace a resident's emergency contacts
 *     tags: [Emergency Contacts]
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmergencyContactsReplaceInput'
 *     responses:
 *       200:
 *         description: Emergency contacts updated
 */
router.route("/:residentId").get(getContacts).put(replaceContacts);

/**
 * @swagger
 * /api/emergency-contacts/{residentId}/add:
 *   post:
 *     summary: Add a single emergency contact to a resident
 *     tags: [Emergency Contacts]
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmergencyContactInput'
 *     responses:
 *       200:
 *         description: Emergency contact added
 */
router.post("/:residentId/add", addContact);

/**
 * @swagger
 * /api/emergency-contacts/{residentId}/{phoneNumber}:
 *   delete:
 *     summary: Remove an emergency contact from a resident
 *     tags: [Emergency Contacts]
 *     parameters:
 *       - in: path
 *         name: residentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: phoneNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Emergency contact removed
 */
router.delete("/:residentId/:phoneNumber", removeContact);

module.exports = router;
