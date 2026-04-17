require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

// ── Route imports ──────────────────────────────────────
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const userRoutes = require("./routes/users");
const adminRoutes = require("./routes/admin");
const contactRoutes = require("./routes/contact");
const paymentRoutes = require("./routes/payments");
const emailRoutes = require("./routes/emailTemplates");

const app = express();

// ── CORS ───────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_VERCEL,
  process.env.FRONTEND_URL_VERCEL2,
  process.env.FRONTEND_URL_LOCAL,
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Body parsers ───────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Mount routes ───────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/email-templates", emailRoutes);

// ── Health check ───────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({
    status: "OK",
    message: "ProteinSpot API is running",
    brand: process.env.APP_NAME || "ProteinSpot",
  }),
);

// ── 404 handler ────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Global error handler ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.stack);
  res
    .status(500)
    .json({ message: "Internal server error", error: err.message });
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(
        `🚀 ProteinSpot API running on port ${PORT} [${process.env.NODE_ENV || "development"}]`,
      ),
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

module.exports = { app };
