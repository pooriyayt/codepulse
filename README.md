<div align="center">

# 🩺 CodePulse

**A visual, zero-AI static-analysis dashboard for your codebase.**

Cyclomatic complexity · duplicate code · dependency cycles · GraphQL schema insights · Graphify knowledge graphs

![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![No build step](https://img.shields.io/badge/build%20step-none-orange) ![Vanilla JS](https://img.shields.io/badge/frontend-vanilla%20JS-yellow)

[English](#-english) · [فارسی](#-فارسی)

</div>

---

## 🇬🇧 English

CodePulse analyzes a code project — uploaded as a ZIP, picked as a folder from your computer, or read from a server path — and renders an interactive report of its health. Everything is computed with pure static analysis (AST parsing + math). **No AI, no external APIs, no database.** It is designed to run anywhere Node.js runs, including cPanel shared hosting, with **no build step** at all.

### ✨ Features

- **Health score (0–100)** — weighted mix of complexity, duplication, file size, dependency health, and nesting, with a green / yellow / red grade.
- **Multi-language analysis** — JavaScript / JSX / TypeScript / TSX via `@babel/parser`, plus heuristic (no-dependency) analyzers for **Python**, **PHP**, **HTML** and **CSS**. Every language reports cyclomatic complexity, function size and nesting depth on the same scale; functions with CC > 10 are flagged as high risk.
- **HTML & CSS checks** — DOM nesting depth, `<img>` tags missing `alt` text, duplicate `id` attributes, duplicate CSS selectors, `!important` overuse, and high-specificity selectors. Inline `<script>`/`<style>` blocks inside HTML are analyzed too.
- **Size warnings** — functions longer than 50 lines, files longer than 300 lines.
- **Deep nesting detection** — blocks nested more than 4 levels deep.
- **Duplicate code detection** — normalized sliding-window block hashing finds copy-pasted fragments with exact file + line locations.
- **Interactive dependency graph** — built from `import` / `require`, with zoom, pan, node details, and **circular dependencies highlighted in red**.
- **GraphQL schema analysis** — parses `.graphql` / `.gql` files, `gql`\`...\` templates and introspection JSON: types, queries, mutations, subscriptions, oversized types (> 20 fields), missing resolvers, and potential N+1 fields — in a dedicated pink/purple tab.
- **Knowledge-graph viewer (Graphify)** — if the project contains `graphify-out/graph.json` from [Graphify](https://github.com/Graphify-Labs/graphify) (or any graph-shaped JSON with `nodes` / `edges`), a dedicated tab renders the concept graph with community colors, god-node ranking, relation-type breakdown, and EXTRACTED / INFERRED / AMBIGUOUS confidence tags.
- **3 ways to analyze** — drag & drop a ZIP, pick a folder straight from your computer (heavy folders like `node_modules` are skipped automatically), or point to a folder path on the server.
- **Premium liquid-glass UI** — frosted-glass surfaces, ambient glow, Font Awesome icons, 5 themes (Dark, Light, Midnight, Ocean, Sunset) and a built-in **Guide** tab that explains every metric.
- **Bilingual interface** — switch between English and Persian (RTL) with one click; language and theme are remembered.
- **Shared-hosting friendly** — single `app.js` entry, `process.env.PORT`, temp files cleaned after every analysis.

### 🚀 Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

Requires Node.js 16+. The frontend is plain HTML/CSS/JS served by Express; Chart.js and vis-network are loaded from CDN.

### 🌐 Deploying on cPanel shared hosting

1. Upload the project files to your host (e.g. `~/code-health`) — everything except `node_modules`.
2. In cPanel open **Setup Node.js App** → *Create Application*: Node 16+, application root `codepulse`, startup file `app.js`.
3. Click **Run NPM Install**, then **Restart**. cPanel injects `PORT` automatically.
4. Open the application URL — done.

### 🌍 Supported languages

| Language | How it's analyzed |
| --- | --- |
| JavaScript / JSX / TypeScript / TSX | Real AST via `@babel/parser` |
| Python | Indentation-based heuristic parser (no dependency) |
| PHP | Brace-depth heuristic parser (no dependency) |
| HTML | Tag-stack scanner; inline `<script>`/`<style>` delegate to the JS/CSS analyzers |
| CSS / SCSS | Rule/selector scanner (duplicate selectors, specificity, `!important`) |

Python, PHP, HTML and CSS support is heuristic rather than a full-grammar parser (no new dependencies were added to keep this build-step-free), so results are a close approximation rather than a byte-perfect AST — good enough to spot real hotspots, but treat edge cases (e.g. unusual string/heredoc syntax) as approximate.

### 📊 Thresholds

| Metric | Threshold | Flag |
|---|---|---|
| Cyclomatic complexity | > 10 | High-risk function |
| Function length | > 50 lines | Long function |
| File length | > 300 lines | Long file |
| Nesting depth | > 4 levels | Deep nesting |
| GraphQL type size | > 20 fields | Oversized type |

Score weights: complexity 30% · duplication 25% · file size 20% · dependencies 15% · nesting 10%. Grades: ≥ 80 healthy · ≥ 60 warning · below 60 critical.

### 🔌 API

| Endpoint | Method | Body |
|---|---|---|
| `/api/analyze/upload` | POST | multipart, ZIP in `project` field |
| `/api/analyze/folder` | POST | multipart, files in `files` + JSON `paths` |
| `/api/analyze/path` | POST | JSON `\{ "path": "/folder/on/server" \}` |

### 🗂 Project structure

```
app.js               Express entry point
routes/analyze.js    Upload / folder / path endpoints
lib/                 Analyzer: scanner, AST metrics, duplicates,
                     dependency graph, GraphQL, knowledge graph, scoring
public/              Static frontend (no build step)
```

### 🤝 Contributing

Issues and pull requests are welcome! The codebase is small and dependency-light on purpose — please keep new features free of build steps and external services.

### 📄 License

[MIT](LICENSE) © 2026 [Pouriya Parniyan](https://pouriyaparniyan.ir)

---

## 🇮🇷 فارسی

**CodePulse** — ابزاری برای تحلیل ایستای پروژه‌های کدنویسی با خروجی بصری و تعاملی. پروژه را به‌صورت ZIP آپلود کنید، یک فولدر از سیستم‌تان انتخاب کنید، یا مسیر یک فولدر روی سرور را بدهید؛ گزارش کامل سلامت کد را ببینید. همه‌چیز با تحلیل ایستای خالص (پارس AST و ریاضیات) انجام می‌شود — **بدون هوش مصنوعی، بدون API خارجی، بدون دیتابیس** و کاملاً **بدون مرحله Build**، مناسب اجرا روی هاست اشتراکی cPanel.

### ✨ امکانات

- **امتیاز سلامت (۰ تا ۱۰۰)** — ترکیب وزن‌دار پیچیدگی، کد تکراری، حجم فایل‌ها، سلامت وابستگی‌ها و تودرتویی، با درجه سبز / زرد / قرمز.
- **تحلیل چند زبانه** — جاوااسکریپت / JSX / تایپ‌اسکریپت / TSX با `@babel/parser`، به‌همراه تحلیل‌گرهای تقریبی (بدون هیچ وابستگی جدید) برای **پایتون**، **PHP**، **HTML** و **CSS**. همه زبان‌ها پیچیدگی سیکلوماتیک، حجم تابع و عمق تودرتویی را با یک معیار یکسان گزارش می‌کنند؛ توابع با پیچیدگی بیشتر از ۱۰ پرریسک علامت می‌خورند.
- **بررسی HTML و CSS** — عمق تودرتویی DOM، تگ‌های `<img>` بدون `alt`، شناسه (`id`) تکراری، سلکتور CSS تکراری، استفاده زیاد از `important!` و سلکتورهای با اختصاصیت بالا. بلوک‌های `<script>`/`<style>` داخل HTML هم تحلیل می‌شوند.
- **هشدار حجم** — توابع بلندتر از ۵۰ خط و فایل‌های بلندتر از ۳۰۰ خط.
- **تشخیص تودرتویی عمیق** — بلاک‌های بیشتر از ۴ سطح.
- **تشخیص کد تکراری** — با هش‌کردن بلاک‌های نرمال‌شده، به‌همراه آدرس دقیق فایل و خط.
- **گراف وابستگی تعاملی** — ساخته‌شده از import / require با زوم، جابه‌جایی، جزئیات هر نود و **نمایش وابستگی‌های حلقوی با رنگ قرمز**.
- **تحلیل GraphQL** — پارس فایل‌های `.graphql` / `.gql`، تمپلیت‌های `gql` و خروجی introspection: تایپ‌ها، کوئری‌ها، میوتیشن‌ها، تایپ‌های خیلی بزرگ (بیش از ۲۰ فیلد)، ریزالورهای جاافتاده و فیلدهای مستعد N+1 — در یک تب اختصاصی صورتی/بنفش.
- **نمایشگر گراف دانش (Graphify)** — اگر پروژه شامل `graphify-out/graph.json` از [Graphify](https://github.com/Graphify-Labs/graphify) باشد (یا هر JSON گراف‌مانند با `nodes` و `edges`)، در یک تب اختصاصی رندر می‌شود: رنگ‌بندی بر اساس community، رتبه‌بندی نودهای پرارتباط (God Nodes)، تفکیک نوع روابط و تگ‌های اطمینان EXTRACTED / INFERRED / AMBIGUOUS.
- **۳ روش تحلیل** — درگ‌اند‌دراپ فایل ZIP، انتخاب مستقیم فولدر از سیستم (فولدرهای سنگین مثل `node_modules` خودکار حذف می‌شوند)، یا دادن مسیر فولدر روی سرور.
- **رابط کاربری پرمیوم شیشه‌ای** — سطوح شیشه‌ای مات (Liquid Glass)، آیکون‌های Font Awesome، ۵ تم ظاهری و تب **راهنما**ی داخلی که همه متریک‌ها را توضیح می‌دهد.
- **رابط دوزبانه** — با یک کلیک بین فارسی (راست‌به‌چپ) و انگلیسی جابه‌جا شوید؛ زبان و تم ذخیره می‌شود.
- **سازگار با هاست اشتراکی** — ورودی واحد `app.js`، پشتیبانی `process.env.PORT`، پاک‌سازی خودکار فایل‌های موقت بعد از هر تحلیل.

### 🚀 اجرای سریع

```bash
npm install
npm start
# سپس http://localhost:3000 را باز کنید
```

به Node.js نسخه ۱۶ به بالا نیاز دارد. فرانت‌اند HTML/CSS/JS خالص است و Chart.js و vis-network از CDN لود می‌شوند.

### 🌐 استقرار روی هاست اشتراکی cPanel

1. فایل‌های پروژه را (به‌جز `node_modules`) روی هاست آپلود کنید، مثلاً در `~/code-health`.
2. در cPanel بخش **Setup Node.js App** را باز کنید → *Create Application*: نسخه Node حداقل ۱۶، ریشه اپلیکیشن `codepulse`، فایل استارتاپ `app.js`.
3. روی **Run NPM Install** و بعد **Restart** بزنید. متغیر `PORT` خودکار تنظیم می‌شود.
4. آدرس اپلیکیشن را باز کنید — تمام!

### 🌍 زبان‌های پشتیبانی‌شده

| زبان | نحوه تحلیل |
| --- | --- |
| جاوااسکریپت / JSX / تایپ‌اسکریپت / TSX | AST واقعی با `@babel/parser` |
| پایتون | پارسر تقریبی مبتنی بر تورفتگی (بدون وابستگی جدید) |
| PHP | پارسر تقریبی مبتنی بر عمق آکولاد (بدون وابستگی جدید) |
| HTML | اسکنر پشته‌ای تگ‌ها؛ بلوک‌های `<script>`/`<style>` داخلی به تحلیل‌گر JS/CSS سپرده می‌شوند |
| CSS / SCSS | اسکنر سلکتور/قاعده (سلکتور تکراری، اختصاصیت، `important!`) |

پشتیبانی از پایتون، PHP، HTML و CSS تقریبی است نه یک پارسر کامل گرامری (برای اینکه بدون هیچ وابستگی و مرحله Build جدیدی باقی بماند)، پس نتایج تخمینی نزدیک هستند نه AST بایت‌به‌بایت — برای پیدا کردن نقاط داغ واقعی کافی است، اما موارد نامتعارف (مثل رشته‌ها/heredoc غیرمعمول) را تقریبی در نظر بگیرید.

### 📊 آستانه‌ها

| متریک | آستانه | هشدار |
|---|---|---|
| پیچیدگی سیکلوماتیک | بیشتر از ۱۰ | تابع پرریسک |
| طول تابع | بیشتر از ۵۰ خط | تابع بلند |
| طول فایل | بیشتر از ۳۰۰ خط | فایل بلند |
| عمق تودرتویی | بیشتر از ۴ سطح | تودرتویی عمیق |
| اندازه تایپ GraphQL | بیشتر از ۲۰ فیلد | تایپ بزرگ |

وزن امتیاز: پیچیدگی ۳۰٪ · کد تکراری ۲۵٪ · حجم فایل ۲۰٪ · وابستگی‌ها ۱۵٪ · تودرتویی ۱۰٪. درجه‌ها: ۸۰ به بالا سالم · ۶۰ به بالا هشدار · کمتر از ۶۰ بحرانی.

### 🤝 مشارکت

ایشوها و پول‌ریکوئست‌ها با آغوش باز پذیرفته می‌شوند! این پروژه عمداً ساده و کم‌وابسته نگه داشته شده است — لطفاً هنگام افزودن قابلیت‌های جدید، از اضافه‌کردن مرحلهٔ Build یا وابستگی به سرویس‌های خارجی خودداری کنید.

### 📄 لایسنس

[MIT](LICENSE) © ۲۰۲۶ — ساخته‌شده توسط [پوریا پرنیان](https://pouriyaparniyan.ir)
