import { exportJPG, exportPNG, exportSVGWithFonts } from "@opendata-ai/openchart-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

type ExportFormat = "svg" | "png" | "jpg";

interface ExportButtonProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function getChartTitle(svg: SVGElement): string {
  const titleEl = svg.querySelector(".viz-title");
  return titleEl?.textContent?.trim() || "chart";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadString(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(blob, filename);
}

export function ExportButton({ containerRef }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const svg = containerRef.current?.querySelector("svg");
      if (!svg) return;

      setExporting(format);
      setOpen(false);

      try {
        const title = slugify(getChartTitle(svg));

        switch (format) {
          case "svg": {
            const svgString = await exportSVGWithFonts(svg);
            downloadString(svgString, `${title}.svg`, "image/svg+xml");
            break;
          }
          case "png": {
            const blob = await exportPNG(svg, { dpi: 2 });
            downloadBlob(blob, `${title}.png`);
            break;
          }
          case "jpg": {
            const blob = await exportJPG(svg, { dpi: 2, quality: 0.92 });
            downloadBlob(blob, `${title}.jpg`);
            break;
          }
        }
      } catch (err) {
        console.error(`Export failed (${format}):`, err);
      } finally {
        setExporting(null);
      }
    },
    [containerRef],
  );

  const formats: { id: ExportFormat; label: string }[] = [
    { id: "svg", label: "SVG" },
    { id: "png", label: "PNG" },
    { id: "jpg", label: "JPG" },
  ];

  return (
    <div ref={dropdownRef} className="absolute top-2 right-2 z-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!!exporting}
        aria-label="Export chart"
        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-muted-foreground/70 opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100 hover:bg-white hover:text-foreground focus:opacity-100 touch-visible dark:bg-neutral-900/80 dark:hover:bg-neutral-900"
      >
        {exporting ? (
          <svg width="16" height="16" viewBox="0 0 16 16" className="animate-spin">
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="28"
              strokeDashoffset="8"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M4.5 7.5 8 10l3.5-2.5" />
            <path d="M3 12v1.5h10V12" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 min-w-[72px] overflow-hidden rounded-md border border-border bg-white/90 shadow-sm backdrop-blur-sm dark:bg-neutral-900/90">
          {formats.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleExport(id)}
              className="block w-full px-3 py-1.5 text-left font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
