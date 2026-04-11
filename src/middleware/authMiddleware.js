const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization token is required." });
    }

    const token = authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-passwordHash");

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid token user." });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Unauthorized." });
  }
};

module.exports = { protect };
