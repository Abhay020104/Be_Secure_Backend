const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["Alert", "Entry"],
      required: true,
    },
    screenshotUrl: {
      type: String,
      default: null,
    },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Log", logSchema);
