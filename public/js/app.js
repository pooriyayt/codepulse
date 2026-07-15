"use strict";

/**
 * App bootstrap: themes, language switch, view switching,
 * ZIP / folder / path submission, tabs.
 * Defensive: missing elements or panels never break the whole app.
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const on = (el, event, handler) => { if (el) el.addEventListener(event, handler); };
  const t = (key, fallback) => (window.I18N ? window.I18N.t(key) : fallback);

  const uploadView = $("uploadView");
  const loadingView = $("loadingView");
  const dashboardView = $("dashboardView");
  const errorBanner = $("uploadError");
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const folderBtn = $("folderBtn");
  const folderInput = $("folderInput");
  const pathForm = $("pathForm");
  const pathInput = $("pathInput");
  const newAnalysisBtn = $("newAnalysisBtn");
  const shareBtn = $("shareBtn");
  const themeBtn = $("themeBtn");
  const themeMenu = $("themeMenu");
  const langBtn = $("langBtn");
  const graphqlTabBtn = $("graphqlTabBtn");
  const kgTabBtn = $("kgTabBtn");
  const loadingProgressWrap = $("loadingProgressWrap");
  const loadingProgressFill = $("loadingProgressFill");
  const loadingPhaseLabel = $("loadingPhaseLabel");
  const loadingPercentLabel = $("loadingPercentLabel");
  const confirmModal = $("confirmModal");
  const confirmBackdrop = $("confirmBackdrop");
  const confirmTitle = $("confirmTitle");
  const confirmMessage = $("confirmMessage");
  const confirmCancelBtn = $("confirmCancelBtn");
  const confirmOkBtn = $("confirmOkBtn");
  const confirmCloseBtn = $("confirmCloseBtn");

  let lastReport = null;

  // ---------- panels refresh (charts read CSS vars / direction) ----------

  function refreshPanels() {
    for (const name of ["Dashboard", "GraphQLPanel", "KnowledgePanel", "SqlSchemaPanel"]) {
      const panel = window[name];
      if (panel && typeof panel.refreshTheme === "function") {
        try { panel.refreshTheme(); } catch (err) { console.error(name, err); }
      }
    }
  }

  // ---------- language ----------

  if (window.I18N) {
    let savedLang = null;
    try { savedLang = localStorage.getItem("chd-lang"); } catch (_err) { /* ignore */ }
    window.I18N.apply(savedLang === "fa" ? "fa" : "en");
  }

  on(langBtn, "click", () => {
    if (!window.I18N) return;
    window.I18N.apply(window.I18N.current() === "fa" ? "en" : "fa");
    refreshPanels();
  });

  // ---------- themes ----------

  const THEMES = ["dark", "light", "midnight", "ocean", "sunset", "nord", "dracula", "solarized", "glass"];

  function applyTheme(name) {
    if (!THEMES.includes(name)) name = "dark";
    document.documentElement.dataset.theme = name;
    if (themeMenu) {
      themeMenu.querySelectorAll(".theme-option").forEach((option) => {
        option.classList.toggle("active", option.dataset.themeChoice === name);
      });
    }
  }

  let savedTheme = null;
  try { savedTheme = localStorage.getItem("chd-theme"); } catch (_err) { /* private mode */ }
  applyTheme(savedTheme || "dark");

  on(themeBtn, "click", (e) => {
    e.stopPropagation();
    if (themeMenu) themeMenu.hidden = !themeMenu.hidden;
  });
  document.addEventListener("click", (e) => {
    if (themeMenu && !themeMenu.hidden && !themeMenu.contains(e.target)) themeMenu.hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && themeMenu) themeMenu.hidden = true;
  });
  if (themeMenu) {
    themeMenu.querySelectorAll(".theme-option").forEach((option) => {
      option.addEventListener("click", () => {
        applyTheme(option.dataset.themeChoice);
        try { localStorage.setItem("chd-theme", option.dataset.themeChoice); } catch (_err) { /* ignore */ }
        themeMenu.hidden = true;
        refreshPanels();
      });
    });
  }

  // ---------- view switching ----------

  function showView(view) {
    for (const v of [uploadView, loadingView, dashboardView]) {
      if (v) v.hidden = v !== view;
    }
    if (newAnalysisBtn) newAnalysisBtn.hidden = view !== dashboardView;
    if (shareBtn) shareBtn.hidden = view !== dashboardView;
    window.scrollTo({ top: 0 });
  }

  function showError(message) {
    if (errorBanner) {
      errorBanner.textContent = message;
      errorBanner.hidden = false;
    }
    showView(uploadView);
  }

  on(newAnalysisBtn, "click", () => {
    if (errorBanner) errorBanner.hidden = true;
    if (fileInput) fileInput.value = "";
    if (folderInput) folderInput.value = "";
    showView(uploadView);
  });

  // ---------- tabs ----------

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const panel = document.getElementById(`tab-${tab.dataset.tab}`);
      if (!panel) return;
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      panel.classList.add("active");
    });
  });

  function resetToOverviewTab() {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === "overview"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-overview"));
  }

  // ---------- analysis requests ----------

  async function handleResponse(response) {
    let payload;
    try {
      payload = await response.json();
    } catch (_err) {
      throw new Error(`Unexpected server response (HTTP ${response.status})`);
    }
    if (!response.ok) throw new Error(payload.error || `Analysis failed (HTTP ${response.status})`);
    return payload;
  }

  // ---------- progress + confirm helpers ----------

  function resetProgress() {
    if (loadingProgressWrap) loadingProgressWrap.hidden = true;
    if (loadingProgressFill) {
      loadingProgressFill.classList.remove("indeterminate");
      loadingProgressFill.style.width = "0%";
    }
    if (loadingPercentLabel) loadingPercentLabel.textContent = "";
  }

  function setProgress(phase, percent) {
    if (!loadingProgressWrap) return;
    loadingProgressWrap.hidden = false;
    if (loadingPhaseLabel) loadingPhaseLabel.textContent = phase;
    if (percent == null) {
      if (loadingProgressFill) {
        loadingProgressFill.classList.add("indeterminate");
        loadingProgressFill.style.width = "";
      }
      if (loadingPercentLabel) loadingPercentLabel.textContent = "";
    } else {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      if (loadingProgressFill) {
        loadingProgressFill.classList.remove("indeterminate");
        loadingProgressFill.style.width = `${clamped}%`;
      }
      if (loadingPercentLabel) loadingPercentLabel.textContent = `${clamped}%`;
    }
  }

  function showConfirm({ title, message, confirmLabel, cancelLabel }) {
    return new Promise((resolve) => {
      if (!confirmModal) {
        resolve(true);
        return;
      }
      if (confirmTitle) confirmTitle.textContent = title;
      if (confirmMessage) confirmMessage.textContent = message;
      if (confirmOkBtn && confirmLabel) confirmOkBtn.textContent = confirmLabel;
      if (confirmCancelBtn && cancelLabel) confirmCancelBtn.textContent = cancelLabel;
      confirmModal.hidden = false;

      function cleanup(result) {
        confirmModal.hidden = true;
        if (confirmOkBtn) confirmOkBtn.removeEventListener("click", onOk);
        if (confirmCancelBtn) confirmCancelBtn.removeEventListener("click", onCancel);
        if (confirmBackdrop) confirmBackdrop.removeEventListener("click", onCancel);
        if (confirmCloseBtn) confirmCloseBtn.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onKeydown(e) { if (e.key === "Escape") cleanup(false); }

      if (confirmOkBtn) confirmOkBtn.addEventListener("click", onOk);
      if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", onCancel);
      if (confirmBackdrop) confirmBackdrop.addEventListener("click", onCancel);
      if (confirmCloseBtn) confirmCloseBtn.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
    });
  }

  function xhrUpload(url, body, onUploadProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      if (xhr.upload && onUploadProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        let payload = null;
        try { payload = JSON.parse(xhr.responseText); } catch (_err) { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload || {});
        } else {
          reject(new Error((payload && payload.error) || `Analysis failed (HTTP ${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload."));
      xhr.send(body);
    });
  }

  function renderReport(report) {
    lastReport = report;
    resetToOverviewTab();
    showView(dashboardView);
    if (window.Dashboard && typeof window.Dashboard.render === "function") {
      window.Dashboard.render(report);
    }

    const hasGraphql = Boolean(report.graphql && report.graphql.present);
    if (graphqlTabBtn) graphqlTabBtn.hidden = !hasGraphql;
    if (hasGraphql && window.GraphQLPanel && typeof window.GraphQLPanel.render === "function") {
      window.GraphQLPanel.render(report.graphql);
    }

    // Prefer a user-provided graph.json; otherwise fall back to the
    // auto-generated project knowledge graph (built without AI).
    const userKg = report.knowledgeGraph && report.knowledgeGraph.present ? report.knowledgeGraph : null;
    const autoKg = report.projectGraph && report.projectGraph.present ? report.projectGraph : null;
    const kgData = userKg || autoKg;
    if (kgTabBtn) kgTabBtn.hidden = !kgData;
    if (kgData && window.KnowledgePanel && typeof window.KnowledgePanel.render === "function") {
      window.KnowledgePanel.render(kgData);
    }

    const hasSql = Boolean(report.sqlSchema && report.sqlSchema.present);
    const sqlTabBtn = $("sqlTabBtn");
    if (sqlTabBtn) sqlTabBtn.hidden = !hasSql;
    if (hasSql && window.SqlSchemaPanel && typeof window.SqlSchemaPanel.render === "function") {
      window.SqlSchemaPanel.render(report.sqlSchema);
    }
  }

  function startLoading(label) {
    if (errorBanner) errorBanner.hidden = true;
    const loadingText = $("loadingText");
    if (loadingText) loadingText.textContent = label;
    resetProgress();
    showView(loadingView);
  }

  async function analyzeZip(file) {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      showError("Please choose a .zip file.");
      return;
    }
    startLoading(`${t("loading.analyzing", "Analyzing")} ${file.name}\u2026`);
    setProgress(t("loading.uploading", "Uploading"), 0);
    try {
      const body = new FormData();
      body.append("project", file);
      const payload = await xhrUpload("api/analyze/upload", body, (pct) => {
        if (pct >= 100) {
          setProgress(t("loading.processing", "Processing on server"), null);
        } else {
          setProgress(t("loading.uploading", "Uploading"), pct);
        }
      });
      renderReport(payload);
    } catch (err) {
      showError(err.message);
    } finally {
      resetProgress();
    }
  }

  // Skip heavy folders in the browser so folder uploads stay small and fast
  const FOLDER_SKIP_RE = /(^|\/)(node_modules|\.git|dist|build|coverage|vendor|\.next|__pycache__|\.cache)(\/|$)/;
  const MAX_FOLDER_FILES = 3000;
  const MAX_FOLDER_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file
  const MAX_FOLDER_TOTAL = 80 * 1024 * 1024; // 80 MB total
  const CONFIRM_FOLDER_FILES = 150; // show our own themed confirmation above this count
  const CONFIRM_FOLDER_BYTES = 15 * 1024 * 1024; // ...or above this size

  async function analyzeFolder(fileList) {
    const all = Array.from(fileList || []);
    if (all.length === 0) return;

    const kept = [];
    let totalBytes = 0;
    for (const file of all) {
      const relative = file.webkitRelativePath || file.name;
      if (FOLDER_SKIP_RE.test(relative)) continue;
      if (file.size > MAX_FOLDER_FILE_SIZE) continue;
      kept.push(file);
      totalBytes += file.size;
      if (kept.length > MAX_FOLDER_FILES) {
        showError(`That folder has too many files (max ${MAX_FOLDER_FILES} after skipping node_modules etc).`);
        return;
      }
      if (totalBytes > MAX_FOLDER_TOTAL) {
        showError("That folder is too large to upload (max 80 MB). Try zipping a subfolder instead.");
        return;
      }
    }

    if (kept.length === 0) {
      showError("No analyzable files found in that folder.");
      return;
    }

    if (kept.length > CONFIRM_FOLDER_FILES || totalBytes > CONFIRM_FOLDER_BYTES) {
      const sizeMb = (totalBytes / (1024 * 1024)).toFixed(1);
      const message = t(
        "confirm.folderMessage",
        "You are about to upload {count} files (~{size} MB). This may take a moment depending on your connection."
      )
        .replace("{count}", kept.length)
        .replace("{size}", sizeMb);
      const proceed = await showConfirm({
        title: t("confirm.title", "Large folder selected"),
        message,
        confirmLabel: t("confirm.continue", "Continue"),
        cancelLabel: t("confirm.cancel", "Cancel"),
      });
      if (!proceed) {
        if (folderInput) folderInput.value = "";
        return;
      }
    }

    const rootName = (kept[0].webkitRelativePath || "").split("/")[0] || "folder";
    startLoading(`${t("loading.analyzing", "Analyzing")} ${rootName} (${kept.length} files)\u2026`);
    setProgress(t("loading.uploading", "Uploading"), 0);

    try {
      const body = new FormData();
      body.append("paths", JSON.stringify(kept.map((f) => f.webkitRelativePath || f.name)));
      for (const file of kept) body.append("files", file, file.name);
      const payload = await xhrUpload("api/analyze/folder", body, (pct) => {
        if (pct >= 100) {
          setProgress(t("loading.processing", "Processing on server"), null);
        } else {
          setProgress(t("loading.uploading", "Uploading"), pct);
        }
      });
      renderReport(payload);
    } catch (err) {
      showError(err.message);
    } finally {
      resetProgress();
    }
  }

  async function analyzePath(path) {
    startLoading(`${t("loading.analyzing", "Analyzing")} ${path}\u2026`);
    setProgress(t("loading.processing", "Processing on server"), null);
    try {
      const response = await fetch("api/analyze/path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      renderReport(await handleResponse(response));
    } catch (err) {
      showError(err.message);
    } finally {
      resetProgress();
    }
  }

  // ---------- upload interactions ----------

  on(dropzone, "click", () => fileInput && fileInput.click());
  on(dropzone, "keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (fileInput) fileInput.click();
    }
  });
  on(fileInput, "change", () => analyzeZip(fileInput.files[0]));

  on(folderBtn, "click", () => folderInput && folderInput.click());
  on(folderInput, "change", () => analyzeFolder(folderInput.files));

  if (dropzone) {
    ["dragenter", "dragover"].forEach((eventName) =>
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((eventName) =>
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      })
    );
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      analyzeZip(file);
    });
  }

  on(pathForm, "submit", (e) => {
    e.preventDefault();
    const value = pathInput ? pathInput.value.trim() : "";
    if (value) analyzePath(value);
  });

  on(shareBtn, "click", () => {
    if (lastReport && window.SharePanel && typeof window.SharePanel.open === "function") {
      window.SharePanel.open(lastReport);
    }
  });

  // Exposed so other panels (e.g. the Knowledge Graph tab) can reuse the same
  // themed confirmation dialog instead of the native browser confirm().
  window.AppConfirm = showConfirm;
})();
