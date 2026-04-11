const Log = require("../models/Log");

const listLogs = async (req, res, next) => {
  try {
    const logs = await Log.find({ owner: req.user._id }).sort({ timestamp: -1 }).limit(100);

    res.json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listLogs };
