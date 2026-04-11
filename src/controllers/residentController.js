const Resident = require("../models/Resident");
const { normalizeDescriptorSet } = require("../utils/faceMatcher");

const createResident = async (req, res, next) => {
  try {
    const { name, faceDescriptor, faceDescriptors, emergencyContacts = [] } = req.body;
    const descriptorInput = faceDescriptors ?? faceDescriptor;
    const normalizedDescriptors = normalizeDescriptorSet(descriptorInput);
    const requestedDescriptorCount =
      Array.isArray(faceDescriptors) && Array.isArray(faceDescriptors[0])
        ? faceDescriptors.length
        : faceDescriptor
        ? 1
        : 0;

    if (
      !name ||
      normalizedDescriptors.length === 0 ||
      (requestedDescriptorCount > 0 && normalizedDescriptors.length !== requestedDescriptorCount)
    ) {
      return res.status(400).json({
        success: false,
        message: "name and at least one valid face descriptor are required.",
      });
    }

    const resident = await Resident.create({
      owner: req.user._id,
      name,
      faceDescriptor: normalizedDescriptors[0],
      faceDescriptors: normalizedDescriptors,
      emergencyContacts,
    });

    res.status(201).json({
      success: true,
      message: "Resident registered successfully.",
      data: resident,
    });
  } catch (error) {
    console.error("Error creating resident:", error);
    next(error);
  }
};

const listResidents = async (req, res, next) => {
  try {
    const residents = await Resident.find({ owner: req.user._id }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: residents.length,
      data: residents,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createResident, listResidents };
