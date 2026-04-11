const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const buildToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "name, email, and password are required." });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured.");
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return res.status(409).json({ success: false, message: "User already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
        token: buildToken(user._id),
      },
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "email and password are required." });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured.");
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    res.json({
      success: true,
      message: "Login successful.",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
        token: buildToken(user._id),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res) => {
  res.json({
    success: true,
    data: req.user,
  });
};

module.exports = { register, login, getProfile };
