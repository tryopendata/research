// Asserts that every PDF passed in (or every PDF under pdfs/ if no args) is
// exactly 1 page AND that its rendered height matches what scripts/pdf.mjs
// asked Chromium to emit. A 2-page PDF means content overflowed the Chromium
// paper-height cap (~14,400px) or emulateMedia/screen-CSS is misconfigured.

import { PDFDocument } from "pdf-lib";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const HEIGHT_TOLERANCE_PT = 2;

async function resolvePaths(argv) {
  const args = argv.slice(2);
  if (args.length > 0) {
    return args.map((p) => path.resolve(p));
  }
  const pdfsDir = path.join(REPO_ROOT, "pdfs");
  let entries;
  try {
    entries = readdirSync(pdfsDir);
  } catch {
    throw new Error(
      `No PDFs found under ${pdfsDir}. Run \`bun run pdf\` first, or pass paths explicitly.`,
    );
  }
  const matches = entries
    .filter((f) => f.endsWith(".pdf"))
    .map((f) => path.join(pdfsDir, f))
    .sort();
  if (matches.length === 0) {
    throw new Error(`No PDFs found under ${pdfsDir}.`);
  }
  return matches;
}

async function readSidecar(pdfPath) {
  const sidecarPath = pdfPath.replace(/\.pdf$/i, ".meta.json");
  try {
    await stat(sidecarPath);
  } catch {
    return null;
  }
  try {
    const raw = await readFile(sidecarPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Could not read sidecar ${sidecarPath}: ${err?.message ?? String(err)}`,
    );
  }
}

async function inspect(pdfPath) {
  let bytes;
  try {
    bytes = await readFile(pdfPath);
  } catch (err) {
    throw new Error(
      `Could not read PDF ${pdfPath}: ${err?.message ?? String(err)}`,
    );
  }
  const doc = await PDFDocument.load(bytes);
  const pageCount = doc.getPageCount();
  const first = doc.getPage(0);
  const { width, height } = first.getSize();
  return { pageCount, width, height, bytes: bytes.length };
}

async function main() {
  const paths = await resolvePaths(process.argv);
  const failures = [];
  let heightChecksRun = 0;
  let heightChecksSkipped = 0;
  console.log("");
  for (const p of paths) {
    const rel = path.relative(REPO_ROOT, p);
    try {
      const info = await inspect(p);
      const sidecar = await readSidecar(p);
      const w = info.width.toFixed(1);
      const h = info.height.toFixed(1);

      const pageOk = info.pageCount === 1;
      let heightOk = true;
      let heightNote = "";

      if (sidecar && typeof sidecar.requestedHeightPt === "number") {
        const delta = Math.abs(info.height - sidecar.requestedHeightPt);
        heightOk = delta < HEIGHT_TOLERANCE_PT;
        heightChecksRun += 1;
        if (!heightOk) {
          heightNote = `  height drift: actual=${h}pt requested=${sidecar.requestedHeightPt.toFixed(1)}pt delta=${delta.toFixed(2)}pt`;
        }
      } else {
        heightChecksSkipped += 1;
        heightNote = "  (no sidecar found; height check skipped)";
      }

      const ok = pageOk && heightOk;
      console.log(
        `${ok ? "OK  " : "FAIL"}  ${rel}  pages=${info.pageCount}  size=${w}x${h}pt  bytes=${info.bytes}`,
      );
      if (heightNote) console.log(heightNote);

      if (!ok) {
        failures.push({
          path: p,
          pageCount: info.pageCount,
          width: info.width,
          height: info.height,
          requestedHeightPt: sidecar?.requestedHeightPt,
          pageOk,
          heightOk,
        });
      }
    } catch (err) {
      console.log(`FAIL  ${rel}  ${err?.message ?? String(err)}`);
      failures.push({ path: p, error: err });
    }
  }
  console.log("");
  if (failures.length > 0) {
    const detail = failures
      .map((f) => {
        if (f.error) return `  ${f.path}: ${f.error.message ?? f.error}`;
        const reasons = [];
        if (!f.pageOk) reasons.push(`${f.pageCount} pages (expected 1)`);
        if (!f.heightOk) {
          reasons.push(
            `height ${f.height.toFixed(1)}pt drifted from requested ${f.requestedHeightPt?.toFixed(1)}pt (truncation suspected)`,
          );
        }
        return `  ${f.path}: ${reasons.join("; ")}`;
      })
      .join("\n");
    throw new Error(
      `verify-pdf-pages: ${failures.length} of ${paths.length} PDFs failed\n${detail}`,
    );
  }
  const heightSummary =
    heightChecksSkipped > 0
      ? ` (height: ${heightChecksRun} checked, ${heightChecksSkipped} skipped)`
      : ` (height: ${heightChecksRun} checked)`;
  console.log(
    `verify-pdf-pages: all ${paths.length} PDF(s) are exactly 1 page${heightSummary}.`,
  );
}

main().catch((err) => {
  console.error(err?.stack ?? err?.message ?? String(err));
  process.exit(1);
});
