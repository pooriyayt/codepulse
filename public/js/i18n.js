"use strict";

/**
 * Tiny i18n engine: English + Persian (RTL).
 * Static UI text is tagged with data-i18n / data-i18n-html / data-i18n-ph attributes.
 */

window.I18N = (function () {
  const DICT = {
    "brand": { en: "CodePulse", fa: "CodePulse" },
    "newAnalysis": { en: "New analysis", fa: "\u062a\u062d\u0644\u06cc\u0644 \u062c\u062f\u06cc\u062f" },
    "hero.title": { en: "How healthy is your codebase?", fa: "\u06a9\u062f\u0628\u06cc\u0633 \u0634\u0645\u0627 \u0686\u0642\u062f\u0631 \u0633\u0627\u0644\u0645\u0647\u061f" },
    "hero.sub": { en: "Upload a project and get an instant static-analysis report: cyclomatic complexity, duplicate code, dependency cycles, and GraphQL schema insights. Everything runs locally \u2014 no AI, no external APIs.", fa: "\u067e\u0631\u0648\u0698\u0647\u200c\u062a\u0648\u0646 \u0631\u0648 \u0622\u067e\u0644\u0648\u062f \u06a9\u0646\u06cc\u062f \u0648 \u0641\u0648\u0631\u06cc \u06af\u0632\u0627\u0631\u0634 \u062a\u062d\u0644\u06cc\u0644 \u0627\u06cc\u0633\u062a\u0627 \u0628\u06af\u06cc\u0631\u06cc\u062f: \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc \u0633\u06cc\u06a9\u0644\u0648\u0645\u0627\u062a\u06cc\u06a9\u060c \u06a9\u062f \u062a\u06a9\u0631\u0627\u0631\u06cc\u060c \u0648\u0627\u0628\u0633\u062a\u06af\u06cc\u200c\u0647\u0627\u06cc \u062d\u0644\u0642\u0648\u06cc \u0648 \u062a\u062d\u0644\u06cc\u0644 \u0627\u0633\u06a9\u06cc\u0645\u0627\u06cc GraphQL. \u0647\u0645\u0647\u200c\u0686\u06cc\u0632 \u0645\u062d\u0644\u06cc \u0627\u062c\u0631\u0627 \u0645\u06cc\u200c\u0634\u0647 \u2014 \u0628\u062f\u0648\u0646 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06cc \u0648 \u0628\u062f\u0648\u0646 API \u062e\u0627\u0631\u062c\u06cc." },
    "drop.title": { en: "Drop a <strong>.zip</strong> of your project here", fa: "\u0641\u0627\u06cc\u0644 <strong>.zip</strong> \u067e\u0631\u0648\u0698\u0647\u200c\u062a\u0648\u0646 \u0631\u0648 \u0627\u06cc\u0646\u062c\u0627 \u0631\u0647\u0627 \u06a9\u0646\u06cc\u062f" },
    "drop.sub": { en: "or click to choose a file \u00b7 JS / TS / GraphQL \u00b7 up to 100 MB", fa: "\u06cc\u0627 \u06a9\u0644\u06cc\u06a9 \u06a9\u0646\u06cc\u062f \u0648 \u0641\u0627\u06cc\u0644 \u0631\u0648 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f \u00b7 JS / TS / GraphQL \u00b7 \u062a\u0627 \u06f1\u06f0\u06f0 \u0645\u06af\u0627\u0628\u0627\u06cc\u062a" },
    "folderBtn": { en: "Choose a folder from your computer", fa: "\u0627\u0646\u062a\u062e\u0627\u0628 \u0641\u0648\u0644\u062f\u0631 \u0627\u0632 \u06a9\u0627\u0645\u067e\u06cc\u0648\u062a\u0631 \u0634\u0645\u0627" },
    "folderHint": { en: "Heavy folders like node_modules and .git are skipped automatically before upload.", fa: "\u0641\u0648\u0644\u062f\u0631\u0647\u0627\u06cc \u0633\u0646\u06af\u06cc\u0646 \u0645\u062b\u0644 node_modules \u0648 .git \u0642\u0628\u0644 \u0627\u0632 \u0622\u067e\u0644\u0648\u062f \u062e\u0648\u062f\u06a9\u0627\u0631 \u062d\u0630\u0641 \u0645\u06cc\u200c\u0634\u0646." },
    "divider": { en: "or analyze a folder on the server", fa: "\u06cc\u0627 \u0645\u0633\u06cc\u0631 \u06cc\u06a9 \u0641\u0648\u0644\u062f\u0631 \u0631\u0648\u06cc \u0633\u0631\u0648\u0631 \u0631\u0648 \u062a\u062d\u0644\u06cc\u0644 \u06a9\u0646\u06cc\u062f" },
    "path.ph": { en: "e.g. /home/user/projects/my-app  or  C:\\projects\\my-app", fa: "\u0645\u062b\u0644\u0627\u064b /home/user/projects/my-app \u06cc\u0627 C:\\projects\\my-app" },
    "analyzeBtn": { en: "Analyze path", fa: "\u062a\u062d\u0644\u06cc\u0644 \u0645\u0633\u06cc\u0631" },
    "path.hint": { en: "The path must exist on the machine running this app (useful when running locally).", fa: "\u0627\u06cc\u0646 \u0645\u0633\u06cc\u0631 \u0628\u0627\u06cc\u062f \u0631\u0648\u06cc \u0647\u0645\u0648\u0646 \u062f\u0633\u062a\u06af\u0627\u0647\u06cc \u0628\u0627\u0634\u0647 \u06a9\u0647 \u0627\u067e \u0631\u0648\u0634 \u0627\u062c\u0631\u0627 \u0645\u06cc\u200c\u0634\u0647 (\u0628\u0631\u0627\u06cc \u0627\u062c\u0631\u0627\u06cc \u0645\u062d\u0644\u06cc \u06a9\u0627\u0631\u0628\u0631\u062f\u06cc\u0647)." },
    "f1": { en: "Cyclomatic complexity per function", fa: "\u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc \u0633\u06cc\u06a9\u0644\u0648\u0645\u0627\u062a\u06cc\u06a9 \u0647\u0631 \u062a\u0627\u0628\u0639" },
    "f2": { en: "Function & file length checks", fa: "\u0628\u0631\u0631\u0633\u06cc \u0637\u0648\u0644 \u062a\u0648\u0627\u0628\u0639 \u0648 \u0641\u0627\u06cc\u0644\u200c\u0647\u0627" },
    "f3": { en: "Duplicate code detection", fa: "\u062a\u0634\u062e\u06cc\u0635 \u06a9\u062f \u062a\u06a9\u0631\u0627\u0631\u06cc" },
    "f4": { en: "Circular dependency detection", fa: "\u062a\u0634\u062e\u06cc\u0635 \u0648\u0627\u0628\u0633\u062a\u06af\u06cc \u062d\u0644\u0642\u0648\u06cc" },
    "f5": { en: "GraphQL schema analysis", fa: "\u062a\u062d\u0644\u06cc\u0644 \u0627\u0633\u06a9\u06cc\u0645\u0627\u06cc GraphQL" },
    "f6": { en: "Graphify knowledge graph viewer", fa: "\u0646\u0645\u0627\u06cc\u0634\u06af\u0631 \u06af\u0631\u0627\u0641 \u062f\u0627\u0646\u0634 Graphify" },
    "loading.analyzing": { en: "Analyzing", fa: "\u062f\u0631 \u062d\u0627\u0644 \u062a\u062d\u0644\u06cc\u0644" },
    "loading.text": { en: "Analyzing project\u2026", fa: "\u062f\u0631 \u062d\u0627\u0644 \u062a\u062d\u0644\u06cc\u0644 \u067e\u0631\u0648\u0698\u0647\u2026" },
    "loading.sub": { en: "Parsing files, measuring complexity, hashing blocks, building graphs.", fa: "\u062f\u0631 \u062d\u0627\u0644 \u067e\u0627\u0631\u0633 \u0641\u0627\u06cc\u0644\u200c\u0647\u0627\u060c \u0645\u062d\u0627\u0633\u0628\u0647 \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc\u060c \u0647\u0634 \u0628\u0644\u0627\u06a9\u200c\u0647\u0627 \u0648 \u0633\u0627\u062e\u062a \u06af\u0631\u0627\u0641\u200c\u0647\u0627." },
    "theme.dark": { en: "Dark", fa: "تاریک" },
    "theme.light": { en: "Light", fa: "روشن" },
    "theme.midnight": { en: "Midnight", fa: "نیمه‌شب" },
    "theme.ocean": { en: "Ocean", fa: "اقیانوس" },
    "theme.sunset": { en: "Sunset", fa: "فرورو" },
    "theme.nord": { en: "Nord", fa: "نورد" },
    "theme.dracula": { en: "Dracula", fa: "دراکولا" },
    "theme.solarized": { en: "Solarized", fa: "سولارایزد" },
    "theme.glass": { en: "Glass", fa: "شیشه‌ای" },
    "loading.uploading": { en: "Uploading", fa: "در حال آپلود" },
    "loading.processing": { en: "Processing on server", fa: "در حال پردازش روی سرور" },
    "confirm.title": { en: "Large folder selected", fa: "پوشه‌ای بزرگ انتخاب شد" },
    "confirm.folderMessage": { en: "You are about to upload {count} files (~{size} MB). This may take a moment depending on your connection.", fa: "قراره {count} فایل (حدود {size} مگابایت) آپلود شود. بسته به سرعت اینترنتت��ن ممک�� است کمی طول بکشد." },
    "confirm.cancel": { en: "Cancel", fa: "انصراف" },
    "confirm.continue": { en: "Continue", fa: "ادامه" },
    "tab.overview": { en: "Overview", fa: "\u0646\u0645\u0627\u06cc \u06a9\u0644\u06cc" },
    "tab.files": { en: "Files", fa: "\u0641\u0627\u06cc\u0644\u200c\u0647\u0627" },
    "tab.deps": { en: "Dependencies", fa: "\u0648\u0627\u0628\u0633\u062a\u06af\u06cc\u200c\u0647\u0627" },
    "tab.dups": { en: "Duplicates", fa: "\u06a9\u062f \u062a\u06a9\u0631\u0627\u0631\u06cc" },
    "tab.gql": { en: "GraphQL Schema", fa: "\u0627\u0633\u06a9\u06cc\u0645\u0627\u06cc GraphQL" },
    "tab.sql": { en: "SQL Schema", fa: "اسکیمای SQL" },
    "err.network": { en: "Connection to the server was lost during upload/analysis. Check that the app is running (open /api/health), make sure the ZIP is under 100 MB, then try again.", fa: "اتصال به سرور وسط آپلود/تحلیل قطع شد. مطمئن شوید اپ روشن است (آدرس /api/health را باز کنید)، حجم ZIP زیر ۱۰۰ مگابایت باشد و دوباره امتحان کنید." },
    "err.timeout": { en: "The server took too long to answer. Try a smaller ZIP or remove heavy folders (node_modules, database dumps, ...) and try again.", fa: "پاسخ سرور خیلی طول کشید. یک ZIP کوچک‌تر امتحان کنید یا فولدرهای سنگین (node_modules، دامپ دیتابیس و…) را حذف کنید." },
    "err.aborted": { en: "Upload was cancelled.", fa: "آپلود لغو شد." },
    "err.zipTooBig": { en: "This ZIP is larger than the 100 MB upload limit. Remove build folders, node_modules or database dumps and try again.", fa: "حجم این ZIP از سقف آپلود (۱۰۰ مگابایت) بیشتر است. فولدرهای بیلد، node_modules یا دامپ دیتابیس را حذف کنید و دوباره امتحان کنید." },
    "sql.sub": { en: "Tables and foreign-key relations extracted from your .sql files — no AI, pure static parsing.", fa: "جدول‌ها و روابط کلید خارجی استخراج‌شده از فایل‌های .sql پروژه — بدون AI و فقط با تحلیل ایستا." },
    "sql.er": { en: "ER graph", fa: "گراف ER" },
    "sql.erSub": { en: "Each node is a table; arrows point from the referencing table to the referenced one. Drag to pan, scroll to zoom.", fa: "هر گره یک جدول است؛ جهت فلش از جدول ارجاع‌دهنده به جدول مقصد است. برای جابه‌جایی بکشید و برای بزرگ‌نمایی اسکرول کنید." },
    "sql.tables": { en: "Tables", fa: "جدول‌ها" },
    "sql.tablesSub": { en: "Columns, keys and the file each table is defined in.", fa: "ستون‌ها، کلیدها و فایلی که هر جدول در آن تعریف شده است." },
    "sql.issues": { en: "SQL issues", fa: "مشکلات SQL" },
    "sql.issuesSub": { en: "SELECT *, DELETE/UPDATE without WHERE and heavy JOINs.", fa: "SELECT *، حذف/به‌روزرسانی بدون WHERE و کوئری‌های با JOIN زیاد." },
    "sql.chipTables": { en: "Tables", fa: "جدول" },
    "sql.chipRelations": { en: "Relations", fa: "رابطه" },
    "sql.chipIssues": { en: "Issues", fa: "مشکل" },
    "kg.downloadJson": { en: "Download graph.json", fa: "دانلود graph.json" },
    "kg.generatedNote": { en: "Auto-generated from your code structure by static analysis — no AI needed.", fa: "به‌صورت خودکار از ساختار کد شما با تحلیل ایستا ساخته شده — بدون نیاز به AI." },
    "g.sql.t": { en: "SQL Schema tab", fa: "تب اسکیمای SQL" },
    "g.sql.d": { en: "Appears when the project contains .sql files. CodePulse parses CREATE TABLE / FOREIGN KEY statements and draws an ER graph of your database, plus warnings like SELECT * or DELETE without WHERE.", fa: "وقتی پروژه فایل .sql داشته باشد نمایش داده می‌شود. CodePulse دستورات CREATE TABLE و FOREIGN KEY را تحلیل می‌کند و گراف ER دیتابیس شما را رسم می‌کند؛ به‌علاوه هشدارهایی مثل SELECT * یا DELETE بدون WHERE." },
    "g.autokg.t": { en: "Auto knowledge graph", fa: "گراف دانش خودکار" },
    "g.autokg.d": { en: "If no graph.json is found, CodePulse builds a knowledge graph of your project automatically from static analysis (files, classes, functions, imports, SQL tables) — no AI. You can download it as a Graphify-compatible graph.json.", fa: "اگر graph.json در پروژه نباشد، CodePulse گراف دانش پروژه را به‌طور خودکار از تحلیل ایستا می‌سازد (فایل‌ها، کلاس‌ها، توابع، ایمپورت‌ها و جدول‌های SQL) — بدون AI. می‌توانید آن را به‌صورت graph.json سازگار با Graphify دانلود کنید." },
    "tab.kg": { en: "Knowledge Graph", fa: "\u06af\u0631\u0627\u0641 \u062f\u0627\u0646\u0634" },
    "tab.guide": { en: "Guide", fa: "\u0631\u0627\u0647\u0646\u0645\u0627" },
    "score.caption": { en: "Overall health score \u2014 weighted mix of complexity, duplication, size, dependencies and nesting.", fa: "\u0627\u0645\u062a\u06cc\u0627\u0632 \u06a9\u0644\u06cc \u0633\u0644\u0627\u0645\u062a \u2014 \u062a\u0631\u06a9\u06cc\u0628 \u0648\u0632\u0646\u200c\u062f\u0627\u0631 \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc\u060c \u06a9\u062f \u062a\u06a9\u0631\u0627\u0631\u06cc\u060c \u062d\u062c\u0645\u060c \u0648\u0627\u0628\u0633\u062a\u06af\u06cc\u200c\u0647\u0627 \u0648 \u062a\u0648\u062f\u0631\u062a\u0648\u06cc\u06cc." },
    "ov.breakdown": { en: "Score breakdown", fa: "\u0627\u062c\u0632\u0627\u06cc \u0627\u0645\u062a\u06cc\u0627\u0632" },
    "ov.dist": { en: "Complexity distribution", fa: "\u062a\u0648\u0632\u06cc\u0639 \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc" },
    "ov.distSub": { en: "Functions per cyclomatic-complexity bucket", fa: "\u062a\u0639\u062f\u0627\u062f \u062a\u0648\u0627\u0628\u0639 \u062f\u0631 \u0647\u0631 \u0628\u0627\u0632\u0647 \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc \u0633\u06cc\u06a9\u0644\u0648\u0645\u0627\u062a\u06cc\u06a9" },
    "ov.risky": { en: "Highest-complexity functions", fa: "\u067e\u06cc\u0686\u06cc\u062f\u0647\u200c\u062a\u0631\u06cc\u0646 \u062a\u0648\u0627\u0628\u0639" },
    "ov.riskySub": { en: "Functions with cyclomatic complexity above 10 are flagged as high risk", fa: "\u062a\u0648\u0627\u0628\u0639 \u0628\u0627 \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc \u0628\u06cc\u0634\u062a\u0631 \u0627\u0632 \u06f1\u06f0 \u0628\u0647\u200c\u0639\u0646\u0648\u0627\u0646 \u067e\u0631\u0631\u06cc\u0633\u06a9 \u0639\u0644\u0627\u0645\u062a \u0645\u06cc\u200c\u062e\u0648\u0631\u0646\u062f" },
    "ov.parse": { en: "Parse errors", fa: "\u062e\u0637\u0627\u0647\u0627\u06cc \u067e\u0627\u0631\u0633" },
    "ov.parseSub": { en: "These files could not be fully parsed and may be partially analyzed", fa: "\u0627\u06cc\u0646 \u0641\u0627\u06cc\u0644\u200c\u0647\u0627 \u06a9\u0627\u0645\u0644 \u067e\u0627\u0631\u0633 \u0646\u0634\u062f\u0646\u062f \u0648 \u0645\u0645\u06a9\u0646 \u0627\u0633\u062a \u0646\u0627\u0642\u0635 \u062a\u062d\u0644\u06cc\u0644 \u0634\u062f\u0647 \u0628\u0627\u0634\u0646\u062f" },
    "th.fn": { en: "Function", fa: "\u062a\u0627\u0628\u0639" },
    "th.file": { en: "File", fa: "\u0641\u0627\u06cc\u0644" },
    "th.line": { en: "Line", fa: "\u062e\u0637" },
    "th.cc": { en: "Complexity", fa: "\u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc" },
    "th.lines": { en: "Lines", fa: "\u062e\u0637\u0648\u0637" },
    "th.nesting": { en: "Nesting", fa: "\u062a\u0648\u062f\u0631\u062a\u0648\u06cc\u06cc" },
    "th.functions": { en: "Functions", fa: "\u062a\u0648\u0627\u0628\u0639" },
    "th.avgcc": { en: "Avg CC", fa: "\u0645\u06cc\u0627\u0646\u06af\u06cc\u0646 CC" },
    "th.maxcc": { en: "Max CC", fa: "\u0628\u06cc\u0634\u06cc\u0646\u0647 CC" },
    "th.riskyfns": { en: "Risky fns", fa: "\u062a\u0648\u0627\u0628\u0639 \u067e\u0631\u0631\u06cc\u0633\u06a9" },
    "th.warnings": { en: "Warnings", fa: "\u0647\u0634\u062f\u0627\u0631\u0647\u0627" },
    "th.lang": { en: "Lang", fa: "زبان" },
    "ov.markup": { en: "Markup & style issues", fa: "موارد HTML و CSS" },
    "ov.markupSub": { en: "Heuristic checks for HTML and CSS files: missing alt text, duplicate ids, duplicate selectors, overuse of !important, and high-specificity selectors.", fa: "بررسی تقریبی فایل‌های HTML و CSS‌: نبود alt، شناسه تکراری، سلکتور تکراری، استفاده زیاد از important! و سلکتورهای با اختصاصیت بالا." },
    "files.sub": { en: "Click a column header to sort. Flagged files exceed at least one threshold.", fa: "\u0628\u0631\u0627\u06cc \u0645\u0631\u062a\u0628\u200c\u0633\u0627\u0632\u06cc \u0631\u0648\u06cc \u0639\u0646\u0648\u0627\u0646 \u0633\u062a\u0648\u0646 \u06a9\u0644\u06cc\u06a9 \u06a9\u0646\u06cc\u062f. \u0641\u0627\u06cc\u0644\u200c\u0647\u0627\u06cc \u0639\u0644\u0627\u0645\u062a\u200c\u062e\u0648\u0631\u062f\u0647 \u062d\u062f\u0627\u0642\u0644 \u0627\u0632 \u06cc\u06a9 \u0622\u0633\u062a\u0627\u0646\u0647 \u0639\u0628\u0648\u0631 \u06a9\u0631\u062f\u0647\u200c\u0627\u0646\u062f." },
    "files.filter": { en: "Filter by path\u2026", fa: "\u0641\u06cc\u0644\u062a\u0631 \u0628\u0631 \u0627\u0633\u0627\u0633 \u0645\u0633\u06cc\u0631\u2026" },
    "deps.title": { en: "File dependency graph", fa: "\u06af\u0631\u0627\u0641 \u0648\u0627\u0628\u0633\u062a\u06af\u06cc \u0641\u0627\u06cc\u0644\u200c\u0647\u0627" },
    "deps.sub": { en: "Built from import / require statements. Drag to pan, scroll to zoom, click a node for details.", fa: "\u0633\u0627\u062e\u062a\u0647\u200c\u0634\u062f\u0647 \u0627\u0632 import / require. \u0628\u06a9\u0634\u06cc\u062f \u062a\u0627 \u062c\u0627\u0628\u0647\u200c\u062c\u0627 \u0634\u0648\u062f\u060c \u0627\u0633\u06a9\u0631\u0648\u0644 \u06a9\u0646\u06cc\u062f \u062a\u0627 \u0632\u0648\u0645 \u0634\u0648\u062f\u060c \u0631\u0648\u06cc \u0647\u0631 \u0646\u0648\u062f \u06a9\u0644\u06cc\u06a9 \u06a9\u0646\u06cc\u062f." },
    "deps.normal": { en: "normal", fa: "\u0639\u0627\u062f\u06cc" },
    "deps.cycle": { en: "in a cycle", fa: "\u062f\u0631 \u062d\u0644\u0642\u0647" },
    "deps.cycles": { en: "Circular dependencies", fa: "\u0648\u0627\u0628\u0633\u062a\u06af\u06cc\u200c\u0647\u0627\u06cc \u062d\u0644\u0642\u0648\u06cc" },
    "deps.ext": { en: "External packages", fa: "\u067e\u06a9\u06cc\u062c\u200c\u0647\u0627\u06cc \u062e\u0627\u0631\u062c\u06cc" },
    "deps.extSub": { en: "Most-imported third-party modules", fa: "\u067e\u0631\u0627\u0633\u062a\u0641\u0627\u062f\u0647\u200c\u062a\u0631\u06cc\u0646 \u0645\u0627\u0698\u0648\u0644\u200c\u0647\u0627\u06cc \u0634\u062e\u0635 \u062b\u0627\u0644\u062b" },
    "dups.title": { en: "Duplicate code", fa: "\u06a9\u062f \u062a\u06a9\u0631\u0627\u0631\u06cc" },
    "gql.rel": { en: "Type relation graph", fa: "\u06af\u0631\u0627\u0641 \u0631\u0648\u0627\u0628\u0637 \u062a\u0627\u06cc\u067e\u200c\u0647\u0627" },
    "gql.relSub": { en: "Which type references which, through its fields. Click a node to see its fields.", fa: "\u0647\u0631 \u062a\u0627\u06cc\u067e \u0627\u0632 \u0637\u0631\u06cc\u0642 \u0641\u06cc\u0644\u062f\u0647\u0627\u0634 \u0628\u0647 \u06a9\u062f\u0648\u0645 \u062a\u0627\u06cc\u067e \u0627\u0634\u0627\u0631\u0647 \u0645\u06cc\u200c\u06a9\u0646\u0647. \u0631\u0648\u06cc \u0646\u0648\u062f \u06a9\u0644\u06cc\u06a9 \u06a9\u0646\u06cc\u062f \u062a\u0627 \u0641\u06cc\u0644\u062f\u0647\u0627\u0634 \u0631\u0648 \u0628\u0628\u06cc\u0646\u06cc\u062f." },
    "gql.ops": { en: "Operations", fa: "\u0639\u0645\u0644\u06cc\u0627\u062a\u200c\u0647\u0627" },
    "gql.warn": { en: "Schema warnings", fa: "\u0647\u0634\u062f\u0627\u0631\u0647\u0627\u06cc \u0627\u0633\u06a9\u06cc\u0645\u0627" },
    "gql.types": { en: "Types", fa: "\u062a\u0627\u06cc\u067e\u200c\u0647\u0627" },
    "th.type": { en: "Type", fa: "\u062a\u0627\u06cc\u067e" },
    "th.kind": { en: "Kind", fa: "\u0646\u0648\u0639" },
    "th.fields": { en: "Fields", fa: "\u0641\u06cc\u0644\u062f\u0647\u0627" },
    "th.defin": { en: "Defined in", fa: "\u062a\u0639\u0631\u06cc\u0641\u200c\u0634\u062f\u0647 \u062f\u0631" },
    "th.notes": { en: "Notes", fa: "\u06cc\u0627\u062f\u062f\u0627\u0634\u062a\u200c\u0647\u0627" },
    "kg.concept": { en: "Concept graph", fa: "\u06af\u0631\u0627\u0641 \u0645\u0641\u0627\u0647\u06cc\u0645" },
    "kg.conceptSub": { en: "Nodes are code concepts (functions, classes, files, docs); colors are communities. Dashed edges were inferred rather than extracted from source. Drag to pan, scroll to zoom, click a node for details.", fa: "\u0646\u0648\u062f\u0647\u0627 \u0645\u0641\u0627\u0647\u06cc\u0645 \u06a9\u062f \u0647\u0633\u062a\u0646\u062f (\u062a\u0648\u0627\u0628\u0639\u060c \u06a9\u0644\u0627\u0633\u200c\u0647\u0627\u060c \u0641\u0627\u06cc\u0644\u200c\u0647\u0627\u060c \u0645\u0633\u062a\u0646\u062f\u0627\u062a) \u0648 \u0631\u0646\u06af\u200c\u0647\u0627 \u0646\u0634\u0627\u0646\u200c\u062f\u0647\u0646\u062f\u0647 community \u0647\u0633\u062a\u0646\u062f. \u06cc\u0627\u0644\u200c\u0647\u0627\u06cc \u062e\u0637\u200c\u0686\u06cc\u0646 \u0627\u0633\u062a\u0646\u0628\u0627\u0637\u06cc\u200c\u0627\u0646\u062f \u0646\u0647 \u0645\u0633\u062a\u0642\u06cc\u0645 \u0627\u0632 \u06a9\u062f. \u0628\u06a9\u0634\u06cc\u062f\u060c \u0632\u0648\u0645 \u06a9\u0646\u06cc\u062f \u0648 \u0631\u0648\u06cc \u0646\u0648\u062f\u0647\u0627 \u06a9\u0644\u06cc\u06a9 \u06a9\u0646\u06cc\u062f." },
    "kg.god": { en: "God nodes", fa: "\u0646\u0648\u062f\u0647\u0627\u06cc \u06a9\u0644\u06cc\u062f\u06cc" },
    "kg.godSub": { en: "The most connected concepts \u2014 everything flows through these", fa: "\u067e\u0631\u0627\u0631\u062a\u0628\u0627\u0637\u200c\u062a\u0631\u06cc\u0646 \u0645\u0641\u0627\u0647\u06cc\u0645 \u2014 \u0647\u0645\u0647\u200c\u0686\u06cc\u0632 \u0627\u0632 \u0627\u06cc\u0646\u0647\u0627 \u0645\u06cc\u200c\u06af\u0630\u0631\u062f" },
    "kg.loadFull": { en: "Load full graph", fa: "بارگذاری گراف کامل" },
    "kg.loadFullActive": { en: "Showing full graph", fa: "در حال نمایش گراف کامل" },
    "kg.showTopOnly": { en: "Show top nodes only", fa: "فقط گره‌های پرارتباطترین" },
    "kg.confirmFullTitle": { en: "Load the full graph?", fa: "گراف کامل لود شود؟" },
    "kg.confirmFullMessage": { en: "This graph has many nodes. Rendering all of them may take a moment and feel slower to pan/zoom.", fa: "این گراف گره‌های زیادی دارد. نمایش کامل ممکنه کمی طول بکشد و جمعوجوکردن/زوم کند‌تر شود." },
    "kg.confirmFullOk": { en: "Load full graph", fa: "بارگذاری گراف کامل" },
    "kg.confirmFullCancel": { en: "Cancel", fa: "انصراف" },
    "kg.exportBtn": { en: "Export as image", fa: "خروج به صورت عکس" },
    "kg.exportSummary": { en: "Knowledge graph snapshot", fa: "خلاصه گراف دانش" },
    "kg.rels": { en: "Relation types", fa: "\u0627\u0646\u0648\u0627\u0639 \u0631\u0648\u0627\u0628\u0637" },
    "kg.relsSub": { en: "Edge counts by relationship kind", fa: "\u062a\u0639\u062f\u0627\u062f \u06cc\u0627\u0644\u200c\u0647\u0627 \u0628\u0647 \u062a\u0641\u06a9\u06cc\u06a9 \u0646\u0648\u0639 \u0631\u0627\u0628\u0637\u0647" },
    "guide.title": { en: "Guide \u2014 what everything means", fa: "\u0631\u0627\u0647\u0646\u0645\u0627 \u2014 \u0647\u0631 \u0628\u062e\u0634 \u06cc\u0639\u0646\u06cc \u0686\u06cc\u061f" },
    "guide.intro": { en: "A quick tour of every metric and section in this dashboard, so you always know what you are looking at.", fa: "\u0645\u0631\u0648\u0631 \u0633\u0631\u06cc\u0639 \u0647\u0645\u0647 \u0645\u062a\u0631\u06cc\u06a9\u200c\u0647\u0627 \u0648 \u0628\u062e\u0634\u200c\u0647\u0627\u06cc \u0627\u06cc\u0646 \u062f\u0627\u0634\u0628\u0648\u0631\u062f\u060c \u062a\u0627 \u0647\u0645\u06cc\u0634\u0647 \u0628\u062f\u0648\u0646\u06cc\u062f \u062f\u0642\u06cc\u0642\u0627\u064b \u0628\u0647 \u0686\u06cc \u0646\u06af\u0627\u0647 \u0645\u06cc\u200c\u06a9\u0646\u06cc\u062f." },
    "g.score.t": { en: "Health score (0\u2013100)", fa: "\u0627\u0645\u062a\u06cc\u0627\u0632 \u0633\u0644\u0627\u0645\u062a (\u06f0 \u062a\u0627 \u06f1\u06f0\u06f0)" },
    "g.score.d": { en: "A weighted mix: complexity 30%, duplication 25%, file size 20%, dependencies 15%, nesting 10%. 80 and above is healthy (green), 60\u201379 needs attention (yellow), below 60 is critical (red).", fa: "\u062a\u0631\u06a9\u06cc\u0628 \u0648\u0632\u0646\u200c\u062f\u0627\u0631: \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc \u06f3\u06f0\u066a\u060c \u06a9\u062f \u062a\u06a9\u0631\u0627\u0631\u06cc \u06f2\u06f5\u066a\u060c \u062d\u062c\u0645 \u0641\u0627\u06cc\u0644 \u06f2\u06f0\u066a\u060c \u0648\u0627\u0628\u0633\u062a\u06af\u06cc\u200c\u0647\u0627 \u06f1\u06f5\u066a \u0648 \u062a\u0648\u062f\u0631\u062a\u0648\u06cc\u06cc \u06f1\u06f0\u066a. \u0627\u0645\u062a\u06cc\u0627\u0632 \u06f8\u06f0 \u0628\u0647 \u0628\u0627\u0644\u0627 \u0633\u0627\u0644\u0645 (\u0633\u0628\u0632)\u060c \u06f6\u06f0 \u062a\u0627 \u06f7\u06f9 \u0646\u06cc\u0627\u0632\u0645\u0646\u062f \u062a\u0648\u062c\u0647 (\u0632\u0631\u062f) \u0648 \u0632\u06cc\u0631 \u06f6\u06f0 \u0628\u062d\u0631\u0627\u0646\u06cc (\u0642\u0631\u0645\u0632) \u0627\u0633\u062a." },
    "g.cc.t": { en: "Cyclomatic complexity", fa: "\u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc \u0633\u06cc\u06a9\u0644\u0648\u0645\u0627\u062a\u06cc\u06a9" },
    "g.cc.d": { en: "The number of independent paths through a function \u2014 every if, loop, case, && or || adds one. Above 10 a function becomes hard to test and maintain; consider splitting it.", fa: "\u062a\u0639\u062f\u0627\u062f \u0645\u0633\u06cc\u0631\u0647\u0627\u06cc \u0645\u0633\u062a\u0642\u0644 \u0627\u062c\u0631\u0627 \u062f\u0631 \u06cc\u06a9 \u062a\u0627\u0628\u0639 \u2014 \u0647\u0631 if\u060c \u062d\u0644\u0642\u0647\u060c case\u060c && \u06cc\u0627 || \u06cc\u06a9 \u0648\u0627\u062d\u062f \u0627\u0636\u0627\u0641\u0647 \u0645\u06cc\u200c\u06a9\u0646\u062f. \u0628\u0627\u0644\u0627\u06cc \u06f1\u06f0 \u06cc\u0639\u0646\u06cc \u062a\u0633\u062a \u0648 \u0646\u06af\u0647\u062f\u0627\u0631\u06cc \u0633\u062e\u062a \u0645\u06cc\u200c\u0634\u0648\u062f\u061b \u0628\u0647\u062a\u0631 \u0627\u0633\u062a \u062a\u0627\u0628\u0639 \u0631\u0627 \u0628\u0634\u06a9\u0646\u06cc\u062f." },
    "g.hist.t": { en: "Complexity distribution", fa: "\u062a\u0648\u0632\u06cc\u0639 \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc" },
    "g.hist.d": { en: "A histogram of all functions grouped by complexity. A healthy project has most functions in the low buckets and only a few in the red zone.", fa: "\u0647\u06cc\u0633\u062a\u0648\u06af\u0631\u0627\u0645 \u0647\u0645\u0647 \u062a\u0648\u0627\u0628\u0639 \u0628\u0631 \u0627\u0633\u0627\u0633 \u067e\u06cc\u0686\u06cc\u062f\u06af\u06cc. \u062f\u0631 \u06cc\u06a9 \u067e\u0631\u0648\u0698\u0647 \u0633\u0627\u0644\u0645 \u0628\u06cc\u0634\u062a\u0631 \u062a\u0648\u0627\u0628\u0639 \u062f\u0631 \u0628\u0627\u0632\u0647\u200c\u0647\u0627\u06cc \u067e\u0627\u06cc\u06cc\u0646 \u0647\u0633\u062a\u0646\u062f \u0648 \u0641\u0642\u0637 \u062a\u0639\u062f\u0627\u062f \u06a9\u0645\u06cc \u062f\u0631 \u0646\u0627\u062d\u06cc\u0647 \u0642\u0631\u0645\u0632." },
    "g.size.t": { en: "Size warnings", fa: "\u0647\u0634\u062f\u0627\u0631\u0647\u0627\u06cc \u062d\u062c\u0645" },
    "g.size.d": { en: "Functions longer than 50 lines and files longer than 300 lines get flagged \u2014 long units of code are harder to read, review and reuse.", fa: "\u062a\u0648\u0627\u0628\u0639 \u0628\u0644\u0646\u062f\u062a\u0631 \u0627\u0632 \u06f5\u06f0 \u062e\u0637 \u0648 \u0641\u0627\u06cc\u0644\u200c\u0647\u0627\u06cc \u0628\u0644\u0646\u062f\u062a\u0631 \u0627\u0632 \u06f3\u06f0\u06f0 \u062e\u0637 \u0639\u0644\u0627\u0645\u062a \u0645\u06cc\u200c\u062e\u0648\u0631\u0646\u062f \u2014 \u06a9\u062f \u0637\u0648\u0644\u0627\u0646\u06cc \u0633\u062e\u062a\u200c\u062a\u0631 \u062e\u0648\u0627\u0646\u062f\u0647\u060c \u0628\u0627\u0632\u0628\u06cc\u0646\u06cc \u0648 \u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u0645\u062c\u062f\u062f \u0645\u06cc\u200c\u0634\u0648\u062f." },
    "g.nest.t": { en: "Nesting depth", fa: "\u0639\u0645\u0642 \u062a\u0648\u062f\u0631\u062a\u0648\u06cc\u06cc" },
    "g.nest.d": { en: "How deeply blocks (if / for / while\u2026) are nested inside each other. More than 4 levels usually means the logic should be flattened or extracted.", fa: "\u0628\u0644\u0627\u06a9\u200c\u0647\u0627 (if / for / while\u2026) \u0686\u0642\u062f\u0631 \u062f\u0627\u062e\u0644 \u0647\u0645 \u0641\u0631\u0648 \u0631\u0641\u062a\u0647\u200c\u0627\u0646\u062f. \u0628\u06cc\u0634\u062a\u0631 \u0627\u0632 \u06f4 \u0633\u0637\u062d \u0645\u0639\u0645\u0648\u0644\u0627\u064b \u06cc\u0639\u0646\u06cc \u0645\u0646\u0637\u0642 \u0628\u0627\u06cc\u062f \u0633\u0627\u062f\u0647 \u06cc\u0627 \u062c\u062f\u0627 \u0634\u0648\u062f." },
    "g.dup.t": { en: "Duplicate code", fa: "\u06a9\u062f \u062a\u06a9\u0631\u0627\u0631\u06cc" },
    "g.dup.d": { en: "Code blocks are normalized and hashed; identical 5-line windows across files are reported with exact file and line locations. Copy-paste means every bug must be fixed twice.", fa: "\u0628\u0644\u0627\u06a9\u200c\u0647\u0627\u06cc \u06a9\u062f \u0646\u0631\u0645\u0627\u0644 \u0648 \u0647\u0634 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f\u061b \u067e\u0646\u062c\u0631\u0647\u200c\u0647\u0627\u06cc \u06f5\u062e\u0637\u06cc \u06cc\u06a9\u0633\u0627\u0646 \u0628\u0627 \u0622\u062f\u0631\u0633 \u062f\u0642\u06cc\u0642 \u0641\u0627\u06cc\u0644 \u0648 \u062e\u0637 \u06af\u0632\u0627\u0631\u0634 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f. \u06a9\u067e\u06cc\u200c\u067e\u06cc\u0633\u062a \u06cc\u0639\u0646\u06cc \u0647\u0631 \u0628\u0627\u06af \u0631\u0627 \u0628\u0627\u06cc\u062f \u062f\u0648 \u0628\u0627\u0631 \u0631\u0641\u0639 \u06a9\u0646\u06cc\u062f." },
    "g.deps.t": { en: "Dependency graph & cycles", fa: "\u06af\u0631\u0627\u0641 \u0648\u0627\u0628\u0633\u062a\u06af\u06cc \u0648 \u062d\u0644\u0642\u0647\u200c\u0647\u0627" },
    "g.deps.d": { en: "Each node is a file; each arrow is an import. Red nodes are part of a circular dependency (A needs B, B needs A) which makes code fragile and hard to refactor.", fa: "\u0647\u0631 \u0646\u0648\u062f \u06cc\u06a9 \u0641\u0627\u06cc\u0644 \u0648 \u0647\u0631 \u0641\u0644\u0634 \u06cc\u06a9 import \u0627\u0633\u062a. \u0646\u0648\u062f\u0647\u0627\u06cc \u0642\u0631\u0645\u0632 \u062f\u0631 \u0648\u0627\u0628\u0633\u062a\u06af\u06cc \u062d\u0644\u0642\u0648\u06cc \u0647\u0633\u062a\u0646\u062f (A \u0628\u0647 B \u0646\u06cc\u0627\u0632 \u062f\u0627\u0631\u062f \u0648 B \u0628\u0647 A) \u06a9\u0647 \u06a9\u062f \u0631\u0627 \u0634\u06a9\u0646\u0646\u062f\u0647 \u0648 \u0631\u06cc\u0641\u06a9\u062a\u0648\u0631 \u0631\u0627 \u0633\u062e\u062a \u0645\u06cc\u200c\u06a9\u0646\u062f." },
    "g.gql.t": { en: "GraphQL Schema tab", fa: "\u062a\u0628 \u0627\u0633\u06a9\u06cc\u0645\u0627\u06cc GraphQL" },
    "g.gql.d": { en: "Appears only when the project actually contains GraphQL: .graphql / .gql files, gql`` templates or introspection JSON. Shows types, queries, mutations, subscriptions, oversized types (more than 20 fields), missing resolvers and potential N+1 fields.", fa: "\u0641\u0642\u0637 \u0648\u0642\u062a\u06cc \u0638\u0627\u0647\u0631 \u0645\u06cc\u200c\u0634\u0648\u062f \u06a9\u0647 \u067e\u0631\u0648\u0698\u0647 \u0648\u0627\u0642\u0639\u0627\u064b GraphQL \u062f\u0627\u0634\u062a\u0647 \u0628\u0627\u0634\u062f: \u0641\u0627\u06cc\u0644\u200c\u0647\u0627\u06cc .graphql / .gql\u060c \u062a\u0645\u067e\u0644\u06cc\u062a\u200c\u0647\u0627\u06cc gql \u06cc\u0627 introspection JSON. \u062a\u0627\u06cc\u067e\u200c\u0647\u0627\u060c \u06a9\u0648\u0626\u0631\u06cc\u200c\u0647\u0627\u060c \u0645\u06cc\u0648\u062a\u06cc\u0634\u0646\u200c\u0647\u0627\u060c \u062a\u0627\u06cc\u067e\u200c\u0647\u0627\u06cc \u0628\u0632\u0631\u06af (\u0628\u06cc\u0634 \u0627\u0632 \u06f2\u06f0 \u0641\u06cc\u0644\u062f)\u060c \u0631\u06cc\u0632\u0627\u0644\u0648\u0631\u0647\u0627\u06cc \u062c\u0627\u0627\u0641\u062a\u0627\u062f\u0647 \u0648 \u0641\u06cc\u0644\u062f\u0647\u0627\u06cc \u0645\u0633\u062a\u0639\u062f N+1 \u0631\u0627 \u0646\u0634\u0627\u0646 \u0645\u06cc\u200c\u062f\u0647\u062f." },
    "g.kg.t": { en: "Knowledge Graph tab", fa: "\u062a\u0628 \u06af\u0631\u0627\u0641 \u062f\u0627\u0646\u0634" },
    "g.kg.d": { en: "Appears when the project contains a Graphify output (graphify-out/graph.json) or any JSON with nodes/edges arrays. Nodes are functions, classes and concepts; colors are community clusters; dashed edges are inferred; god nodes are the most connected concepts.", fa: "\u0648\u0642\u062a\u06cc \u0638\u0627\u0647\u0631 \u0645\u06cc\u200c\u0634\u0648\u062f \u06a9\u0647 \u067e\u0631\u0648\u0698\u0647 \u062e\u0631\u0648\u062c\u06cc Graphify (graphify-out/graph.json) \u06cc\u0627 \u0647\u0631 JSON \u0628\u0627 \u0622\u0631\u0627\u06cc\u0647\u200c\u0647\u0627\u06cc nodes/edges \u062f\u0627\u0634\u062a\u0647 \u0628\u0627\u0634\u062f. \u0646\u0648\u062f\u0647\u0627 \u062a\u0648\u0627\u0628\u0639\u060c \u06a9\u0644\u0627\u0633\u200c\u0647\u0627 \u0648 \u0645\u0641\u0627\u0647\u06cc\u0645\u200c\u0627\u0646\u062f\u061b \u0631\u0646\u06af\u200c\u0647\u0627 \u062e\u0648\u0634\u0647\u200c\u0647\u0627\u06cc community\u060c \u06cc\u0627\u0644\u200c\u0647\u0627\u06cc \u062e\u0637\u200c\u0686\u06cc\u0646 \u0627\u0633\u062a\u0646\u0628\u0627\u0637\u06cc \u0648 \u0646\u0648\u062f\u0647\u0627\u06cc \u06a9\u0644\u06cc\u062f\u06cc \u067e\u0631\u0627\u0631\u062a\u0628\u0627\u0637\u200c\u062a\u0631\u06cc\u0646 \u0645\u0641\u0627\u0647\u06cc\u0645 \u0647\u0633\u062a\u0646\u062f." },
    "g.ui.t": { en: "Themes & language", fa: "\u062a\u0645\u200c\u0647\u0627 \u0648 \u0632\u0628\u0627\u0646" },
    "g.ui.d": { en: "Pick one of 5 themes from the palette button and switch between English and Persian with the language button \u2014 both choices are remembered on this device.", fa: "\u0627\u0632 \u062f\u06a9\u0645\u0647 \u067e\u0627\u0644\u062a \u06cc\u06a9\u06cc \u0627\u0632 \u06f5 \u062a\u0645 \u0631\u0627 \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f \u0648 \u0628\u0627 \u062f\u06a9\u0645\u0647 \u0632\u0628\u0627\u0646 \u0628\u06cc\u0646 \u0641\u0627\u0631\u0633\u06cc \u0648 \u0627\u0646\u06af\u0644\u06cc\u0633\u06cc \u062c\u0627\u0628\u0647\u200c\u062c\u0627 \u0634\u0648\u06cc\u062f \u2014 \u0647\u0631 \u062f\u0648 \u0627\u0646\u062a\u062e\u0627\u0628 \u0631\u0648\u06cc \u0627\u06cc\u0646 \u062f\u0633\u062a\u06af\u0627\u0647 \u0630\u062e\u06cc\u0631\u0647 \u0645\u06cc\u200c\u0634\u0648\u062f." },
    "footer.line1": { en: "Pure static analysis \u2014 runs entirely on this server. No AI, no external APIs.", fa: "\u062a\u062d\u0644\u06cc\u0644 \u0627\u06cc\u0633\u062a\u0627\u06cc \u062e\u0627\u0644\u0635 \u2014 \u06a9\u0627\u0645\u0644\u0627\u064b \u0631\u0648\u06cc \u0647\u0645\u06cc\u0646 \u0633\u0631\u0648\u0631 \u0627\u062c\u0631\u0627 \u0645\u06cc\u200c\u0634\u0648\u062f. \u0628\u062f\u0648\u0646 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06cc\u060c \u0628\u062f\u0648\u0646 API \u062e\u0627\u0631\u062c\u06cc." },
    "footer.credit": { en: "Made with <span class=\"heart\">&#10084;</span> by <a href=\"https://pouriyaparniyan.ir\" target=\"_blank\" rel=\"noopener\">Pouriya Parniyan</a> &copy; 2026 &mdash; MIT License", fa: "\u0633\u0627\u062e\u062a\u0647\u200c\u0634\u062f\u0647 \u0628\u0627 <span class=\"heart\">&#10084;</span> \u062a\u0648\u0633\u0637 <a href=\"https://pouriyaparniyan.ir\" target=\"_blank\" rel=\"noopener\">\u067e\u0648\u0631\u06cc\u0627 \u067e\u0631\u0646\u06cc\u0627\u0646</a> &copy; \u06f2\u06f0\u06f2\u06f6 \u2014 \u0645\u062c\u0648\u0632 MIT" },
    "shareBtn": { en: "Share", fa: "اشتراک" },
    "share.title": { en: "Share project snapshot", fa: "اشتراک‌گذاری خلاصه پروژه" },
    "share.subtitle": { en: "Pick a theme and download a shareable image of this report.", fa: "یک تم انتخاب کنید و تصویر قابل اشتراک‌گذاری این گزارش را دانلود کنید." },
    "share.download": { en: "Download PNG", fa: "دانلود تصویر PNG" },
    "share.healthy": { en: "Healthy", fa: "سالم" },
    "share.warning": { en: "Needs attention", fa: "نیازمند توجه" },
    "share.critical": { en: "Critical", fa: "بحرانی" },
    "share.scoreCaption": { en: "Overall health score", fa: "امتیاز کلی سلامت" },
    "share.stat.files": { en: "Files", fa: "فایل‌ها" },
    "share.stat.functions": { en: "Functions", fa: "توابع" },
    "share.stat.avgcc": { en: "Avg complexity", fa: "میانگین پیچیدگی" },
    "share.stat.maxcc": { en: "Max complexity", fa: "بیشینه پیچیدگی" },
    "share.stat.dup": { en: "Duplication", fa: "کد تکراری" },
    "share.stat.cycles": { en: "Dep. cycles", fa: "حلقه وابستگی" },
    "share.badge.gql": { en: "GraphQL detected", fa: "GraphQL شناسایی شد" },
    "share.badge.kg": { en: "Knowledge graph detected", fa: "گراف دانش شناسایی شد" },
    "footer.github": { en: "Source code on GitHub", fa: "سورس پروژه در گیت‌هاب" },
    "share.footerNote": { en: "Static analysis snapshot — no AI, no external APIs", fa: "خلاصه تحلیل ایستا — بدون هوش مصنوعی، بدون API خارجی" },
    "theme.dark": { en: "Dark", fa: "تاریک" },
    "theme.light": { en: "Light", fa: "روشن" },
    "theme.midnight": { en: "Midnight", fa: "نیمه‌شب" },
    "theme.ocean": { en: "Ocean", fa: "اقیانوس" },
    "theme.sunset": { en: "Sunset", fa: "مهتاب" },
  };

  let lang = "en";

  function apply(next) {
    lang = next === "fa" ? "fa" : "en";
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    try { localStorage.setItem("chd-lang", lang); } catch (_err) { /* ignore */ }

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const entry = DICT[el.dataset.i18n];
      if (entry) el.textContent = entry[lang];
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const entry = DICT[el.dataset.i18nHtml];
      if (entry) el.innerHTML = entry[lang];
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      const entry = DICT[el.dataset.i18nPh];
      if (entry) el.setAttribute("placeholder", entry[lang]);
    });

    const langLabel = document.getElementById("langLabel");
    if (langLabel) langLabel.textContent = lang === "fa" ? "EN" : "\u0641\u0627";
  }

  function t(key) {
    const entry = DICT[key];
    return entry ? entry[lang] : key;
  }

  function current() {
    return lang;
  }

  return { apply, t, current };
})();
