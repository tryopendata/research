#!/usr/bin/env bun
/**
 * Data processing CLI for report generation.
 * Zero dependencies. Reads JSON from stdin or files, writes JSON to stdout.
 *
 * Usage: bun run tools/data.ts <merge|derive|stats|round> [options]
 */

type Row = Record<string, unknown>;

const USAGE = `Usage: bun run tools/data.ts <merge|derive|stats|round> [options]

Modes:
  merge   --on key1,key2 [--join inner|left|outer] fileA.json [fileB.json]
  derive  --pct-change FIELD [--over FIELD] | --rank FIELD | --ratio "name=a/b" [--round N]
  stats   --median FIELD | --stdev FIELD | --corr F1,F2 | --percentile "FIELD:N"
  round   --precision N [--fields f1,f2]

Reads JSON from stdin when piped, or from file arguments.`;

function die(msg: string): never {
  process.stderr.write(`Error: ${msg}\n\n${USAGE}\n`);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

async function loadJSON(pathOrStdin: string | null): Promise<Row[]> {
  const raw = pathOrStdin ? await Bun.file(pathOrStdin).text() : await readStdin();
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.results;
  if (!Array.isArray(rows)) die("Input must be a JSON array or { data: [...] }");
  return rows;
}

function fileArgs(): string[] {
  // Collect positional args after mode that aren't flags or flag values
  const args = process.argv.slice(3);
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) { i++; continue; } // skip flag + value
    files.push(args[i]);
  }
  return files;
}

import { fstatSync } from "fs";
const hasStdin = (() => { try { return fstatSync(0).isFIFO(); } catch { return false; } })();

// --- Merge ---
async function merge() {
  const onKeys = arg("--on")?.split(",");
  if (!onKeys) die("merge requires --on key1[,key2]");
  const joinType = (arg("--join") ?? "inner") as "inner" | "left" | "outer";
  const files = fileArgs();

  let left: Row[], right: Row[];
  if (!hasStdin) {
    if (files.length < 2) die("merge needs two files, or pipe one via stdin");
    [left, right] = await Promise.all([loadJSON(files[0]), loadJSON(files[1])]);
  } else {
    if (files.length < 1) die("merge needs a second dataset as a file argument");
    [left, right] = await Promise.all([loadJSON(null), loadJSON(files[0])]);
  }

  const rightIndex = new Map<string, Row>();
  for (const row of right) {
    const key = onKeys.map(k => String(row[k] ?? "")).join("|");
    rightIndex.set(key, row);
  }

  const result: Row[] = [];
  const matchedKeys = new Set<string>();

  for (const lRow of left) {
    const key = onKeys.map(k => String(lRow[k] ?? "")).join("|");
    const rRow = rightIndex.get(key);
    if (rRow) {
      result.push({ ...lRow, ...rRow });
      matchedKeys.add(key);
    } else if (joinType === "left" || joinType === "outer") {
      result.push({ ...lRow });
    }
  }

  if (joinType === "outer") {
    for (const rRow of right) {
      const key = onKeys.map(k => String(rRow[k] ?? "")).join("|");
      if (!matchedKeys.has(key)) result.push({ ...rRow });
    }
  }

  return result;
}

// --- Derive ---
async function derive() {
  const files = fileArgs();
  let data = await loadJSON(!hasStdin && files.length ? files[0] : null);

  const pctField = arg("--pct-change");
  const overField = arg("--over");
  const rankField = arg("--rank");
  const ratioExpr = arg("--ratio");
  const roundN = arg("--round");

  if (pctField) {
    if (overField) data.sort((a, b) => Number(a[overField]) - Number(b[overField]));
    for (let i = 0; i < data.length; i++) {
      const cur = Number(data[i][pctField]);
      const prev = i > 0 ? Number(data[i - 1][pctField]) : null;
      (data[i] as Record<string, unknown>)[`${pctField}_pct_change`] =
        prev !== null && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
    }
  }

  if (rankField) {
    const sorted = [...data].sort((a, b) => Number(b[rankField]) - Number(a[rankField]));
    sorted.forEach((row, i) => { (row as Record<string, unknown>)[`${rankField}_rank`] = i + 1; });
  }

  if (ratioExpr) {
    const match = ratioExpr.match(/^(\w+)=(\w+)\/(\w+)$/);
    if (!match) die("--ratio format: name=numerator/denominator");
    const [, name, num, den] = match;
    for (const row of data) {
      const d = Number(row[den]);
      (row as Record<string, unknown>)[name] = d !== 0 ? Number(row[num]) / d : null;
    }
  }

  if (roundN !== undefined) {
    const precision = parseInt(roundN, 10);
    data = roundRows(data, precision);
  }

  return data;
}

// --- Stats ---
async function stats() {
  const files = fileArgs();
  const data = await loadJSON(!hasStdin && files.length ? files[0] : null);
  const result: Record<string, number | null> = {};

  const nums = (field: string) => data.map(r => Number(r[field])).filter(n => !isNaN(n));

  const medianField = arg("--median");
  if (medianField) {
    const vals = nums(medianField).sort((a, b) => a - b);
    if (vals.length === 0) { result[`median_${medianField}`] = null; }
    else {
      const mid = Math.floor(vals.length / 2);
      result[`median_${medianField}`] = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    }
  }

  const stdevField = arg("--stdev");
  if (stdevField) {
    const vals = nums(stdevField);
    if (vals.length < 2) { result[`stdev_${stdevField}`] = null; }
    else {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      result[`stdev_${stdevField}`] = Math.sqrt(variance);
    }
  }

  const corrFields = arg("--corr");
  if (corrFields) {
    const [f1, f2] = corrFields.split(",");
    // Filter to rows where both fields are valid numbers to maintain alignment
    const pairs = data
      .map(r => [Number(r[f1]), Number(r[f2])] as const)
      .filter(([x, y]) => !isNaN(x) && !isNaN(y));
    const n = pairs.length;
    if (n < 2) { result[`corr_${f1}_${f2}`] = null; }
    else {
      const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
      const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
      let num = 0, dx2 = 0, dy2 = 0;
      for (const [x, y] of pairs) {
        const dx = x - mx, dy = y - my;
        num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
      }
      result[`corr_${f1}_${f2}`] = dx2 && dy2 ? num / Math.sqrt(dx2 * dy2) : null;
    }
  }

  const pctArg = arg("--percentile");
  if (pctArg) {
    const match = pctArg.match(/^(\w+):(\d+)$/);
    if (!match) die("--percentile format: FIELD:N");
    const [, field, pStr] = match;
    const p = parseInt(pStr, 10);
    const vals = nums(field).sort((a, b) => a - b);
    if (vals.length === 0) { result[`p${p}_${field}`] = null; }
    else {
      const idx = (p / 100) * (vals.length - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      result[`p${p}_${field}`] = lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
    }
  }

  return result;
}

// --- Round ---
function roundRows(data: Row[], precision: number, fields?: string[]): Row[] {
  return data.map(row => {
    const out: Row = { ...row };
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === "number" && (fields === undefined || fields.includes(k))) {
        out[k] = parseFloat(v.toFixed(precision));
      }
    }
    return out;
  });
}

async function round() {
  const files = fileArgs();
  const data = await loadJSON(!hasStdin && files.length ? files[0] : null);
  const precision = parseInt(arg("--precision") ?? "0", 10);
  const fields = arg("--fields")?.split(",");
  return roundRows(data, precision, fields);
}

// --- Main ---
const mode = process.argv[2];
if (hasFlag("--help") || hasFlag("-h")) {
  process.stdout.write(USAGE + "\n");
  process.exit(0);
}
if (!mode) die("No mode specified.");

const runners: Record<string, () => Promise<unknown>> = { merge, derive, stats, round };
if (!runners[mode]) die(`Unknown mode: ${mode}`);

const output = await runners[mode]();
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
