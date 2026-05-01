import type { ReactNode } from "react";
import { ChartErrorBoundary } from "./ChartErrorBoundary";

interface FigureProps {
  /** Path to image or video (relative to /images/posts/) */
  src?: string;
  /** Alt text for accessibility */
  alt: string;
  /** Caption displayed below the media */
  caption?: string;
  /** Whether this is a placeholder to be replaced later */
  placeholder?: boolean;
  /** Full-bleed width (breaks out of prose container) */
  breakout?: boolean;
  /** Custom content (e.g. a chart component) to render inside the figure */
  children?: ReactNode;
  /** Minimum height to reserve while children load (prevents layout shift) */
  minHeight?: number;
  /** Poster image for video (shows before video loads) */
  poster?: string;
}

/**
 * Media figure for blog articles. Handles images and videos with
 * optional captions and placeholder states.
 *
 * Usage in MDX:
 *   <Figure src="/images/posts/architecture.png" alt="System architecture" caption="The two-box split" />
 *   <Figure alt="Architecture diagram" caption="TODO: Add architecture diagram" placeholder />
 */
export function Figure({
  src,
  alt,
  caption,
  placeholder = false,
  breakout = false,
  children,
  minHeight = 400,
  poster,
}: FigureProps) {
  const isVideo = src?.endsWith(".mp4") || src?.endsWith(".webm");
  const hasMedia = !placeholder && (src || children);

  return (
    <figure
      className={`not-prose my-10 ${breakout ? "figure-breakout" : ""}`}
    >
      {children ? (
        <div
          className="group relative rounded-lg border border-border overflow-hidden"
          style={{ minHeight }}
        >
          <ChartErrorBoundary>
            {children}
          </ChartErrorBoundary>
        </div>
      ) : placeholder || !src ? (
        <div
          className="flex aspect-video min-h-[200px] items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30"
        >
          <div
            className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground"
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-50"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-sm font-medium">{alt}</span>
            {caption && (
              <span className="text-xs opacity-70">
                {caption}
              </span>
            )}
          </div>
        </div>
      ) : isVideo ? (
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="w-full"
          poster={poster}
        >
          <source src={src} type={src.endsWith(".webm") ? "video/webm" : "video/mp4"} />
        </video>
      ) : (
        <img
          src={src}
          alt={alt}
          className="m-0 w-full"
          loading="lazy"
          decoding="async"
        />
      )}
      {caption && hasMedia && (
        <figcaption
          className="mt-3 font-sans text-sm text-muted-foreground"
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
