const Resident = require("../models/Resident");

const getResidentOrFail = async (residentId, ownerId) => {
  const resident = await Resident.findOne({ _id: residentId, owner: ownerId });

  if (!resident) {
    const error = new Error("Resident not found.");
    error.statusCode = 404;
    throw error;
  }

  return resident;
};

const getContacts = async (req, res, next) => {
  try {
    const resident = await getResidentOrFail(req.params.residentId, req.user._id);

    res.json({
      success: true,
      data: {
        residentId: resident._id,
        residentName: resident.name,
        emergencyContacts: resident.emergencyContacts,
      },
    });
  } catch (error) {
    next(error);
  }
};

const replaceContacts = async (req, res, next) => {
  try {
    const { emergencyContacts } = req.body;

    if (!Array.isArray(emergencyContacts)) {
      return res.status(400).json({
        success: false,
        message: "emergencyContacts must be an array of phone numbers.",
      });
    }

    const resident = await getResidentOrFail(req.params.residentId, req.user._id);
    resident.emergencyContacts = emergencyContacts;
    await resident.save();

    res.json({
      success: true,
      message: "Emergency contacts updated.",
      data: resident,
    });
  } catch (error) {
    next(error);
  }
};

const addContact = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "phoneNumber is required." });
    }

    const resident = await getResidentOrFail(req.params.residentId, req.user._id);

    if (!resident.emergencyContacts.includes(phoneNumber)) {
      resident.emergencyContacts.push(phoneNumber);
      await resident.save();
    }

    res.json({
      success: true,
      message: "Emergency contact added.",
      data: resident,
    });
  } catch (error) {
    next(error);
  }
};

const removeContact = async (req, res, next) => {
  try {
    const resident = await getResidentOrFail(req.params.residentId, req.user._id);
    resident.emergencyContacts = resident.emergencyContacts.filter(
      (phoneNumber) => phoneNumber !== req.params.phoneNumber
    );
    await resident.save();

    res.json({
      success: true,
      message: "Emergency contact removed.",
      data: resident,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getContacts, replaceContacts, addContact, removeContact };
