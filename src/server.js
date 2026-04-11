require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");

const port = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
