"use strict";

/**
 * Analysis API:
 *   POST /api/analyze/upload  - multipart ZIP upload (field name: "project")
 *   POST /api/analyze/folder  - multipart folder upload (field "files" + "paths" JSON array)
 *   POST /api/analyze/path    - analyze a folder path on the server machine
 *
 * Uploads are extracted into a temp folder, analyzed, and deleted right away
 * so shared-hosting disk space is not consumed.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");

const { analyzeProject } = require("../lib/analyzer");

const router = express.Router();

const UPLOAD_DIR = path.join(os.tmpdir(), "codepulse-uploads");
const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100 MB zip
const MAX_ENTRIES = 10000;
const MAX_UNCOMPRESSED = 300 * 1024 * 1024; // 300 MB extracted
const MAX_FOLDER_FILES = 3000;
const MAX_FOLDER_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file when uploading a folder

const SKIP_SEGMENTS = new Set(["node_modules", ".git", "dist", "build", "coverage", "vendor", ".next", "__pycache__", ".cache"]);

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_ZIP_SIZE, files: 1 },
});

const folderUpload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FOLDER_FILE_SIZE, files: MAX_FOLDER_FILES },
});

function shouldSkipEntry(entryName) {
  const segments = entryName.split("/");
  return segments.some((s) => SKIP_SEGMENTS.has(s));
}

/** Normalize a client-provided relative path; returns null when unsafe or ignorable. */
function safeRelativePath(input) {
  const segments = String(input)
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s && s !== "." && s !== "..");
  if (segments.length === 0) return null;
  if (segments.some((s) => SKIP_SEGMENTS.has(s))) return null;
  return segments.join("/");
}

function extractZipSafely(zipPath, targetDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) {
    throw Object.assign(new Error(`ZIP contains too many entries (max ${MAX_ENTRIES})`), { status: 400 });
  }

  const resolvedTarget = path.resolve(targetDir);
  let totalBytes = 0;
  let extracted = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryName = entry.entryName.replace(/\\/g, "/");
    if (shouldSkipEntry(entryName)) continue;

    const destination = path.resolve(resolvedTarget, entryName);
    // Zip-slip protection: never write outside the temp dir
    if (destination !== resolvedTarget && !destination.startsWith(resolvedTarget + path.sep)) continue;

    const data = entry.getData();
    totalBytes += data.length;
    if (totalBytes > MAX_UNCOMPRESSED) {
      throw Object.assign(new Error("ZIP contents exceed the extraction size limit"), { status: 400 });
    }

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
    extracted += 1;
  }

  return extracted;
}

router.post("/analyze/upload", upload.single("project"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded. Send a ZIP file in the 'project' field." });
  }

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepulse-"));
  try {
    const extracted = extractZipSafely(req.file.path, extractDir);
    if (extracted === 0) {
      return res.status(400).json({ error: "The ZIP archive contained no analyzable files." });
    }
    const name = (req.file.originalname || "project").replace(/\.zip$/i, "");
    const report = await analyzeProject(extractDir, { name });
    res.json(report);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Analysis failed" });
  } finally {
    // Always clean up temp files so shared-hosting disk space stays free
    fs.rmSync(extractDir, { recursive: true, force: true });
    if (req.file && req.file.path) fs.rmSync(req.file.path, { force: true });
  }
});

router.post("/analyze/folder", folderUpload.array("files", MAX_FOLDER_FILES), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: "No files received. Choose a folder that contains code files." });
  }

  let paths = [];
  try {
    paths = JSON.parse((req.body && req.body.paths) || "[]");
  } catch (_err) {
    paths = [];
  }
  const usePaths = Array.isArray(paths) && paths.length === files.length;

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepulse-"));
  try {
    let written = 0;
    let rootName = "project";

    for (let i = 0; i < files.length; i++) {
      const rawPath = usePaths ? paths[i] : files[i].originalname;
      const relative = safeRelativePath(rawPath);
      if (!relative) continue;

      if (written === 0) {
        const firstSegment = relative.split("/")[0];
        if (firstSegment && relative.includes("/")) rootName = firstSegment;
      }

      const destination = path.resolve(extractDir, relative);
      if (destination !== path.resolve(extractDir) && !destination.startsWith(path.resolve(extractDir) + path.sep)) continue;

      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(files[i].path, destination);
      written += 1;
    }

    if (written === 0) {
      return res.status(400).json({ error: "The selected folder contained no analyzable files." });
    }

    const report = await analyzeProject(extractDir, { name: rootName });
    res.json(report);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Analysis failed" });
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
    for (const f of files) {
      if (f && f.path) fs.rmSync(f.path, { force: true });
    }
  }
});

router.post("/analyze/path", async (req, res) => {
  const target = req.body && typeof req.body.path === "string" ? req.body.path.trim() : "";
  if (!target) {
    return res.status(400).json({ error: "Provide a folder path in the 'path' field." });
  }

  let stat;
  try {
    stat = fs.statSync(target);
  } catch (_err) {
    return res.status(400).json({ error: `Path not found or not accessible: ${target}` });
  }
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: "The provided path is not a directory." });
  }

  try {
    const report = await analyzeProject(target, { name: path.basename(target) });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

// Friendly errors for multer limits (file too large, too many files, ...)
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || (err.name === "MulterError" ? 400 : 500);
  res.status(status).json({ error: err.message || "Analysis failed" });
});

module.exports = router;
