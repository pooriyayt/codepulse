"use strict";

/**
 * CodePulse - entry point.
 *
 * Designed for shared hosting (e.g. cPanel "Setup Node.js App"):
 *  - single entry file (app.js)
 *  - reads the port from process.env.PORT (injected by the host)
 *  - serves the frontend as static files from /public
 *  - no database, no external services, no build step
 */

const path = require("path");
const express = require("express");

const analyzeRouter = require("./routes/analyze");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// API routes
app.use("/api", analyzeRouter);

// Frontend (vanilla HTML/CSS/JS, no build step)
app.use(express.static(path.join(__dirname, "public")));

// Fallback to the dashboard for unknown GET routes (keeps deep links working)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Central error handler (multer errors, JSON errors, ...)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  res.status(status).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CodePulse running on port ${PORT}`);
});
