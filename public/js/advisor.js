"use strict";

/**
 * Advisor - rule-based, offline code-improvement suggestions (no AI).
 * Reads the analysis report and renders prioritized advice with a
 * typewriter animation. All texts are bilingual via I18N.
 */
window.Advisor = (function () {
  let report = null;
  let played = false;
  let timers = [];
  let active = [];

  function t(key, fallback) {
    return window.I18N && typeof window.I18N.t === "function" ? window.I18N.t(key, fallback) : fallback;
  }

  function tt(key, fallback, params) {
    let s = t(key, fallback);
    for (const k in params || {}) s = s.split("{" + k + "}").join(String(params[k]));
    return s;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const SEV = {
    high: { rank: 0, key: "adv.sevHigh", fallback: "High impact" },
    medium: { rank: 1, key: "adv.sevMed", fallback: "Medium" },
    low: { rank: 2, key: "adv.sevLow", fallback: "Polish" },
    success: { rank: 3, key: "adv.sevOk", fallback: "Great job" },
  };

  function countByType(list) {
    const out = {};
    for (const x of list || []) {
      const k = x && x.type ? String(x.type) : "other";
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }

  function buildSuggestions(r) {
    const out = [];
    const th = (r.meta && r.meta.thresholds) || {};
    const cxLimit = th.complexity || 10;
    const fnLimit = th.functionLines || 50;
    const fileLimit = th.fileLines || 300;
    const nestLimit = th.nesting || 4;
    const fns = Array.isArray(r.functions) ? r.functions : [];
    const files = Array.isArray(r.files) ? r.files : [];
    const sum = r.summary || {};

    const risky = fns.filter((f) => f.complexity > cxLimit).sort((a, b) => b.complexity - a.complexity);
    if (risky.length) {
      const w = risky[0];
      out.push({
        sev: "high", icon: "fa-code-branch",
        title: tt("adv.cxTitle", "Break up complex functions ({n} found)", { n: sum.riskyFunctionCount || risky.length }),
        body: tt("adv.cxBody", "\"{name}\" in {file} has cyclomatic complexity {cc} (recommended max {limit}). Split it into smaller single-purpose functions, replace nested if/else chains with early returns, and move each independent rule into its own well-named helper. Start with the biggest branch inside it.", { name: w.name, file: w.file, cc: w.complexity, limit: cxLimit }),
      });
    }

    const longs = fns.filter((f) => f.lines > fnLimit).sort((a, b) => b.lines - a.lines);
    if (longs.length) {
      const w = longs[0];
      out.push({
        sev: "medium", icon: "fa-ruler-vertical",
        title: tt("adv.longTitle", "Shorten long functions ({n} found)", { n: sum.longFunctionCount || longs.length }),
        body: tt("adv.longBody", "\"{name}\" in {file} is {lines} lines long (recommended max {limit}). Extract each logical step (validation, computation, output) into its own helper - short functions are easier to test, reuse and review.", { name: w.name, file: w.file, lines: w.lines, limit: fnLimit }),
      });
    }

    const deep = fns.filter((f) => f.nesting > nestLimit).sort((a, b) => b.nesting - a.nesting);
    if (deep.length) {
      const w = deep[0];
      out.push({
        sev: "medium", icon: "fa-layer-group",
        title: tt("adv.nestTitle", "Flatten deeply nested code ({n} found)", { n: sum.deepFunctionCount || deep.length }),
        body: tt("adv.nestBody", "\"{name}\" in {file} nests {depth} levels deep. Use guard clauses (return early on invalid input), extract inner loops into helpers, and invert conditions to keep the happy path at the top level.", { name: w.name, file: w.file, depth: w.nesting }),
      });
    }

    const bigFiles = files.filter((f) => f.lines > fileLimit).sort((a, b) => b.lines - a.lines);
    if (bigFiles.length) {
      const w = bigFiles[0];
      out.push({
        sev: "medium", icon: "fa-file-circle-exclamation",
        title: tt("adv.fileTitle", "Split oversized files ({n} found)", { n: sum.longFileCount || bigFiles.length }),
        body: tt("adv.fileBody", "{file} is {lines} lines (recommended max {limit}). Group related functions and move each group into its own module - one responsibility per file makes navigation and code review much faster.", { file: w.path, lines: w.lines, limit: fileLimit }),
      });
    }

    const dupPct = r.duplicates && typeof r.duplicates.percentage === "number" ? r.duplicates.percentage : 0;
    const dupBlocks = (r.duplicates && r.duplicates.blocks) || [];
    if (dupPct > 3 && dupBlocks.length) {
      out.push({
        sev: dupPct > 10 ? "high" : "medium", icon: "fa-clone",
        title: tt("adv.dupTitle", "Remove duplicated code ({pct}% of lines)", { pct: dupPct }),
        body: tt("adv.dupBody", "{count} repeated block(s) were found. Extract the shared logic into one function or module and import it everywhere it is needed - every copy is a place where a future fix can be forgotten. The Duplicates tab lists the exact locations.", { count: dupBlocks.length, pct: dupPct }),
      });
    }

    const cycles = (r.dependencyGraph && r.dependencyGraph.cycles) || [];
    if (cycles.length) {
      const chain = Array.isArray(cycles[0]) ? cycles[0].join(" \u2192 ") : String(cycles[0] || "");
      out.push({
        sev: "high", icon: "fa-rotate",
        title: tt("adv.cycleTitle", "Break circular dependencies ({n} cycle(s))", { n: cycles.length }),
        body: tt("adv.cycleBody", "Files import each other in a loop: {chain}. Extract what both sides need into a third shared module, or use dependency injection so one side no longer imports the other. Cycles make code impossible to reuse in isolation.", { chain }),
      });
    }

    const mk = countByType(r.markupIssues);
    if ((sum.markupIssueCount || 0) > 0) {
      const parts = [];
      if (mk["missing-alt"]) parts.push(tt("adv.htmlAlt", "{n} image(s) without alt text", { n: mk["missing-alt"] }));
      if (mk["deprecated-tag"]) parts.push(tt("adv.htmlDep", "{n} deprecated tag(s)", { n: mk["deprecated-tag"] }));
      if (mk["inline-handler"]) parts.push(tt("adv.htmlInl", "{n} inline event handler(s)", { n: mk["inline-handler"] }));
      if (mk["duplicate-id"]) parts.push(tt("adv.htmlDupId", "{n} duplicate id(s)", { n: mk["duplicate-id"] }));
      out.push({
        sev: "low", icon: "fa-code",
        title: t("adv.htmlTitle", "Clean up the HTML"),
        body: tt("adv.htmlBody", "Found: {parts}. Add alt attributes for accessibility and SEO, replace deprecated tags with CSS, and move onclick handlers into addEventListener calls in your scripts. Details are in the Overview issue tables.", { parts: parts.join(", ") || String(sum.markupIssueCount) }),
      });
    }

    const st = countByType(r.styleIssues);
    if ((sum.styleIssueCount || 0) > 0) {
      const parts = [];
      if (st["important"]) parts.push(tt("adv.cssImp", "{n} !important", { n: st["important"] }));
      if (st["duplicate-property"]) parts.push(tt("adv.cssDupProp", "{n} duplicate propertie(s)", { n: st["duplicate-property"] }));
      if (st["duplicate-selector"]) parts.push(tt("adv.cssDupSel", "{n} duplicate selector(s)", { n: st["duplicate-selector"] }));
      if (st["z-index"]) parts.push(tt("adv.cssZ", "{n} extreme z-index value(s)", { n: st["z-index"] }));
      out.push({
        sev: "low", icon: "fa-paintbrush",
        title: t("adv.cssTitle", "Tidy up the CSS"),
        body: tt("adv.cssBody", "Found: {parts}. Prefer more specific selectors over !important, merge duplicate rules into one place, and keep z-index values in a small ordered scale (1, 10, 100) so stacking stays predictable.", { parts: parts.join(", ") || String(sum.styleIssueCount) }),
      });
    }

    const sqlIssues = (r.sqlSchema && r.sqlSchema.issues) || [];
    const dangerous = sqlIssues.filter((x) => x.type === "delete-no-where" || x.type === "update-no-where");
    if (dangerous.length) {
      const w = dangerous[0];
      out.push({
        sev: "high", icon: "fa-database",
        title: tt("adv.sqlDangerTitle", "Guard dangerous SQL statements ({n} found)", { n: dangerous.length }),
        body: tt("adv.sqlDangerBody", "A DELETE or UPDATE without WHERE was found in {file} (line {line}) - it touches every row in the table. Add an explicit WHERE clause, and consider wrapping bulk changes in a transaction so they can be rolled back.", { file: w.file, line: w.line }),
      });
    }
    const stars = sqlIssues.filter((x) => x.type === "select-star");
    if (stars.length) {
      out.push({
        sev: "low", icon: "fa-asterisk",
        title: tt("adv.sqlStarTitle", "Replace SELECT * ({n} found)", { n: stars.length }),
        body: t("adv.sqlStarBody", "List only the columns you actually need. SELECT * transfers unnecessary data, breaks silently when the schema changes, and prevents covering indexes from being used."),
      });
    }

    if ((sum.parseErrorCount || 0) > 0) {
      out.push({
        sev: "low", icon: "fa-bug",
        title: tt("adv.parseTitle", "{n} file(s) could not be fully parsed", { n: sum.parseErrorCount }),
        body: t("adv.parseBody", "Some files were skipped or partially analyzed due to syntax the parser could not read. Check them for syntax errors - fixing them also makes the rest of this report more accurate."),
      });
    }

    out.sort((a, b) => (SEV[a.sev] || SEV.low).rank - (SEV[b.sev] || SEV.low).rank);

    if (!out.length) {
      out.push({
        sev: "success", icon: "fa-trophy",
        title: t("adv.cleanTitle", "Your code is in great shape!"),
        body: t("adv.cleanBody", "No significant problems were found: functions are small, duplication is low and there are no dependency cycles. Keep it that way - re-run the analysis after big changes, keep functions under the limits, and add tests for the most complex parts."),
      });
    }

    return out.slice(0, 10);
  }

  function stopTimers() {
    for (const id of timers) {
      clearTimeout(id);
      clearInterval(id);
    }
    timers = [];
  }

  function skipAll() {
    stopTimers();
    for (const item of active) {
      item.card.classList.remove("pending");
      item.card.classList.add("shown");
      item.textEl.textContent = item.body;
      if (item.cursor) item.cursor.classList.add("done");
    }
  }

  function play() {
    const list = document.getElementById("advisorList");
    if (!list || !report) return;
    stopTimers();
    played = true;
    active = [];
    list.innerHTML = "";
    const items = buildSuggestions(report);
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let delay = 120;

    items.forEach((s) => {
      const sev = SEV[s.sev] || SEV.low;
      const card = document.createElement("article");
      card.className = "card advisor-card adv-" + s.sev;
      card.innerHTML =
        '<div class="advisor-head">' +
        '<span class="advisor-icon"><i class="fa-solid ' + escHtml(s.icon) + '"></i></span>' +
        "<h3></h3>" +
        '<span class="adv-chip adv-chip-' + escHtml(s.sev) + '">' + escHtml(t(sev.key, sev.fallback)) + "</span>" +
        "</div>" +
        '<p class="advisor-body"><span class="adv-text"></span><span class="type-cursor" aria-hidden="true"></span></p>';
      card.querySelector("h3").textContent = s.title;
      list.appendChild(card);

      const textEl = card.querySelector(".adv-text");
      const cursor = card.querySelector(".type-cursor");
      active.push({ card, textEl, cursor, body: s.body });

      if (reduceMotion) {
        card.classList.add("shown");
        textEl.textContent = s.body;
        if (cursor) cursor.classList.add("done");
        return;
      }

      card.classList.add("pending");
      const startId = setTimeout(() => {
        card.classList.remove("pending");
        card.classList.add("shown");
        let pos = 0;
        const iv = setInterval(() => {
          pos += 2;
          textEl.textContent = s.body.slice(0, pos);
          if (pos >= s.body.length) {
            clearInterval(iv);
            if (cursor) cursor.classList.add("done");
          }
        }, 14);
        timers.push(iv);
      }, delay);
      timers.push(startId);
      delay += Math.min(2200, 420 + s.body.length * 5);
    });
  }

  function render(r) {
    report = r;
    played = false;
    const panel = document.getElementById("tab-advisor");
    if (panel && panel.classList.contains("active")) play();
  }

  function init() {
    const list = document.getElementById("advisorList");
    if (list) list.addEventListener("click", skipAll);
    const replayBtn = document.getElementById("advisorReplayBtn");
    if (replayBtn) {
      replayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        play();
      });
    }
    document.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-tab="advisor"]') : null;
      if (!btn) return;
      setTimeout(() => {
        if (!played) play();
      }, 80);
    });
  }

  init();

  return { render, play };
})();
