const { identifyFaces } = require("../services/identificationService");

const identify = async (req, res, next) => {
  try {
    const { descriptors, screenshotUrl } = req.body;

    if (!Array.isArray(descriptors) || descriptors.length === 0) {
      return res.status(400).json({
        success: false,
        message: "descriptors must be a non-empty array of face descriptor arrays.",
      });
    }

    const result = await identifyFaces({
      userId: req.user._id,
      descriptors,
      screenshotUrl,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { identify };
