// Render Vite-built reports to single-page PDFs via headless Chromium.
//
// Usage:
//   node scripts/pdf.mjs <slug>          # one PDF
//   node scripts/pdf.mjs --all           # every report
//
// This is a Vite SPA with client-side routing, so we serve the built dist/
// and navigate to each report's route (e.g. /american-healthcare-cost). We
// wait for React to mount and the report content to render before measuring.
//
// Load-bearing patches (see Basel's _spikes/PDF.md):
//   1. page.emulateMedia({ media: 'screen' }) BEFORE page.pdf() — prevents
//      any @page CSS rules from overriding explicit width/height.
//   2. waitUntil: 'networkidle' for font loading.
//   3. After document.fonts.ready, await two requestAnimationFrame ticks
//      (data-URL font decode lag in some Chromium versions).
//
// We deliberately do NOT pass `pageRanges: '1'` to page.pdf() — it would
// silently truncate a 2-page render instead of failing loudly.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extname, join, normalize } from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(REPO_ROOT, "dist");
const PDFS_DIR = path.join(REPO_ROOT, "pdfs");

// Report layout max-width is 780px. Add padding for full-bleed charts/figures
// that might extend slightly beyond the prose column.
const REPORT_WIDTH = 860;

// Chromium paper-height cap is ~14,400px. Warn ~6% under.
const HEIGHT_WARN_THRESHOLD = 13_500;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function mimeFor(filePath) {
  return MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Start a static-file server bound to 127.0.0.1 on an ephemeral port.
 * Serves dist/ with SPA fallback (unknown paths get index.html).
 */
function startServer(rootDir) {
  return new Promise((resolveStart, rejectStart) => {
    const server = createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        let urlPath = decodeURIComponent(reqUrl.pathname);
        let filePath = normalize(join(rootDir, urlPath));
        if (!filePath.startsWith(rootDir)) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        let st;
        try {
          st = await stat(filePath);
        } catch {
          // SPA fallback: serve index.html for client-side routes
          filePath = join(rootDir, "index.html");
          try {
            st = await stat(filePath);
          } catch {
            res.statusCode = 404;
            res.end("not found");
            return;
          }
        }
        if (st.isDirectory()) {
          filePath = join(filePath, "index.html");
          try {
            st = await stat(filePath);
          } catch {
            res.statusCode = 404;
            res.end("not found");
            return;
          }
        }
        const body = await readFile(filePath);
        res.statusCode = 200;
        res.setHeader("content-type", mimeFor(filePath));
        res.setHeader("content-length", body.length);
        res.end(body);
      } catch (err) {
        res.statusCode = 500;
        res.end(`server error: ${err?.message ?? String(err)}`);
      }
    });

    server.on("error", rejectStart);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        rejectStart(new Error("Failed to bind ephemeral port"));
        return;
      }
      const url = `http://127.0.0.1:${addr.port}`;
      resolveStart({
        url,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

/**
 * Discover report slugs from src/reports/*.mdx (excluding _-prefixed files).
 */
async function discoverReports() {
  const reportsDir = path.join(REPO_ROOT, "src", "reports");
  const entries = await readdir(reportsDir);
  return entries
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
    .map((f) => f.replace(/\.mdx$/, ""))
    .sort();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args[0] === "--all" || args.length === 0) {
    return { mode: "all" };
  }
  if (args.length === 1 && args[0]) {
    return { mode: "single", slug: args[0] };
  }
  throw new Error(
    "Usage:\n" +
      "  node scripts/pdf.mjs <slug>\n" +
      "  node scripts/pdf.mjs --all",
  );
}

/**
 * Render one report URL to a single-page PDF.
 */
async function renderOne(browser, baseUrl, slug) {
  const width = REPORT_WIDTH;
  const url = `${baseUrl}/${slug}`;
  const ctx = await browser.newContext({
    viewport: { width, height: 1024 },
  });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle" });
    if (!resp || !resp.ok()) {
      throw new Error(
        `Navigation to ${url} failed: status=${resp?.status() ?? "no-response"}`,
      );
    }

    // Wait for React to render the report content (the article element
    // appears once React Router resolves the route and Suspense loads the
    // MDX component).
    await page.waitForSelector("article", { timeout: 15_000 });

    // Wait for all SVG-based OpenChart visualizations to finish rendering.
    await page.waitForFunction(() => {
      const ready = (selector) =>
        Array.from(document.querySelectorAll(selector)).every(
          (el) => el.querySelector("svg"),
        );
      return (
        ready(".oc-chart-root") &&
        ready(".oc-sankey-root") &&
        ready(".oc-graph-root")
      );
    }, { timeout: 30_000 });

    // Force light mode for PDF output
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    });

    // Force screen-media so any @page rules don't override our dimensions.
    await page.emulateMedia({ media: "screen" });

    // Wait for fonts + 2x rAF (data-URL font decode lag in some Chromium versions).
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
    });

    // Hide the reading progress bar and navigation header for clean PDF output
    await page.evaluate(() => {
      // Hide the fixed progress bar
      const progressBar = document.querySelector(".fixed.top-0");
      if (progressBar) progressBar.style.display = "none";

      // Hide the dark mode toggle
      const header = document.querySelector("header.border-b");
      if (header) header.style.display = "none";
    });

    // Use Math.ceil(getBoundingClientRect().height) instead of scrollHeight.
    // scrollHeight truncates fractional pixels, which can overflow content
    // onto a second page. Math.ceil on the bounding rect avoids that.
    const scrollHeight = await page.evaluate(() =>
      Math.ceil(document.body.getBoundingClientRect().height),
    );

    if (scrollHeight > HEIGHT_WARN_THRESHOLD) {
      console.warn(
        `  warn: scrollHeight ${scrollHeight}px is within ${
          14_400 - HEIGHT_WARN_THRESHOLD
        }px of Chromium's ~14,400px paper-height cap.`,
      );
    }

    const pdfBytes = await page.pdf({
      width: `${width}px`,
      height: `${scrollHeight}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    await mkdir(PDFS_DIR, { recursive: true });
    const outPath = path.join(PDFS_DIR, `${slug}.pdf`);
    await writeFile(outPath, pdfBytes);

    // Sidecar with requested dimensions (1px = 0.75pt). The page-count
    // verifier reads this to confirm the emitted PDF height matches what
    // we asked Chromium to produce.
    const metaPath = path.join(PDFS_DIR, `${slug}.meta.json`);
    const meta = {
      width,
      requestedHeightPx: scrollHeight,
      requestedHeightPt: scrollHeight * 0.75,
      generatedAt: new Date().toISOString(),
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n");

    return { slug, width, scrollHeight, outPath, bytes: pdfBytes.length };
  } finally {
    await ctx.close();
  }
}

function printSummary(rows) {
  const headers = ["report", "width", "height", "size", "path"];
  const widths = headers.map((h) => h.length);
  const stringRows = rows.map((r) => [
    r.slug,
    `${r.width}px`,
    `${r.scrollHeight}px`,
    `${(r.bytes / 1024).toFixed(0)}kb`,
    path.relative(REPO_ROOT, r.outPath),
  ]);
  for (const row of stringRows) {
    row.forEach((v, i) => {
      if (v.length > widths[i]) widths[i] = v.length;
    });
  }
  const fmt = (cells) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("");
  console.log(fmt(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of stringRows) console.log(fmt(row));
  console.log("");
}

async function main() {
  const args = parseArgs(process.argv);

  try {
    await stat(DIST_DIR);
  } catch {
    throw new Error(
      `dist/ does not exist at ${DIST_DIR}. Run \`bun run build\` first.`,
    );
  }

  let targets;
  if (args.mode === "single") {
    targets = [args.slug];
  } else {
    targets = await discoverReports();
    if (targets.length === 0) {
      throw new Error("No reports found under src/reports/.");
    }
  }

  const server = await startServer(DIST_DIR);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const rows = [];
    for (const slug of targets) {
      console.log(`rendering ${slug}...`);
      const row = await renderOne(browser, server.url, slug);
      console.log(
        `  ${row.scrollHeight}px tall -> ${path.relative(REPO_ROOT, row.outPath)} (${(row.bytes / 1024).toFixed(0)}kb)`,
      );
      rows.push(row);
    }
    printSummary(rows);

    // Chain into the page-count verifier
    await runVerifier(rows.map((r) => r.outPath));
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}

function runVerifier(pdfPaths) {
  const verifierPath = path.join(
    REPO_ROOT,
    "scripts",
    "lib",
    "verify-pdf-pages.mjs",
  );
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [verifierPath, ...pdfPaths], {
      stdio: "inherit",
    });
    child.on("error", rej);
    child.on("exit", (code) => {
      if (code === 0) res();
      else rej(new Error(`verify-pdf-pages exited with code ${code}`));
    });
  });
}

main().catch((err) => {
  console.error(err?.stack ?? err?.message ?? String(err));
  process.exit(1);
});
