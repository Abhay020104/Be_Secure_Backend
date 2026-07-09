const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const residentRoutes = require("./routes/residentRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const identifyRoutes = require("./routes/identifyRoutes");
const logRoutes = require("./routes/logRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");
const setupSwagger = require("./config/swagger");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Security camera backend is running.",
    docs: "/api/docs",
    health: "/api/health",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Security camera backend is running.",
    timestamp: new Date().toISOString(),
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/residents", residentRoutes);
app.use("/api/emergency-contacts", emergencyRoutes);
app.use("/api/identify", identifyRoutes);
app.use("/api/logs", logRoutes);

setupSwagger(app);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
