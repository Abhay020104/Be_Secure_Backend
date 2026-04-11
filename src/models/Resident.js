const mongoose = require("mongoose");
const { FACE_DESCRIPTOR_SIZE } = require("../utils/faceMatcher");

const descriptorValidator = (value) =>
  Array.isArray(value) &&
  value.length === FACE_DESCRIPTOR_SIZE &&
  value.every((item) => typeof item === "number" && Number.isFinite(item));

const descriptorSetValidator = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(descriptorValidator);

const residentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    faceDescriptor: {
      type: [Number],
      validate: {
        validator: (value) => value == null || descriptorValidator(value),
        message: `faceDescriptor must be a ${FACE_DESCRIPTOR_SIZE}-length array of finite numbers.`,
      },
    },
    faceDescriptors: {
      type: [[Number]],
      default: undefined,
      validate: {
        validator: (value) => value == null || descriptorSetValidator(value),
        message: `faceDescriptors must be a non-empty array of ${FACE_DESCRIPTOR_SIZE}-length descriptor arrays.`,
      },
    },
    emergencyContacts: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

residentSchema.pre("validate", function syncDescriptorFields() {
  const normalizedFaceDescriptors =
    Array.isArray(this.faceDescriptors) && this.faceDescriptors.length > 0
      ? this.faceDescriptors
      : Array.isArray(this.faceDescriptor) && this.faceDescriptor.length > 0
      ? [this.faceDescriptor]
      : [];

  if (normalizedFaceDescriptors.length === 0) {
    this.invalidate("faceDescriptors", "At least one face descriptor is required.");
    return;
  }

  this.faceDescriptors = normalizedFaceDescriptors;
  this.faceDescriptor = normalizedFaceDescriptors[0];
});

module.exports = mongoose.model("Resident", residentSchema);
