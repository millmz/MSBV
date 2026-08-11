import React from "react";

/**
 * Lemon League brand mark + icon system.
 * The mark: a lemon reduced to pure geometry — ellipse and two nubs on a
 * 30° axis, white on a citrus-gradient rounded square. Works from 16px
 * favicon to hero size, monochrome-capable via `flat`.
 * Icons: 24-grid, 1.8 stroke, round caps — quiet, consistent, no emoji.
 */

export function LemonMark({ size = 28, flat = false }: { size?: number; flat?: boolean }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: "none", display: "block" }}>
      {!flat && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe24d" />
            <stop offset="1" stopColor="#ffb700" />
          </linearGradient>
        </defs>
      )}
      <rect width="64" height="64" rx="15" fill={flat ? "currentColor" : `url(#${id})`} />
      <g transform="rotate(-30 32 32)" fill={flat ? "#fffcf2" : "#ffffff"}>
        <ellipse cx="32" cy="32" rx="13.5" ry="9.8" />
        <circle cx="17" cy="32" r="3.1" />
        <circle cx="47" cy="32" r="3.1" />
      </g>
    </svg>
  );
}

/** Inline lemon glyph (no container) — for the lemon seat and small brand accents. */
export function LemonGlyph({ size = 14, color = "#e8a400" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="lemon seat" style={{ display: "inline", verticalAlign: "-2px" }}>
      <g transform="rotate(-30 32 32)" fill={color}>
        <ellipse cx="32" cy="32" rx="17" ry="12.5" />
        <circle cx="13" cy="32" r="4" />
        <circle cx="51" cy="32" r="4" />
      </g>
    </svg>
  );
}

export function Wordmark({ size = "1.05rem" }: { size?: string }) {
  return (
    <span
      style={{
        fontWeight: 800,
        fontSize: size,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        color: "var(--ink)",
        whiteSpace: "nowrap",
      }}
    >
      Lemon League
    </span>
  );
}

type IconProps = { size?: number };

function Svg({ children, size = 20 }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11.2 12 4.6l8 6.6" />
    <path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" />
  </Svg>
);

export const IconLineup = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
    <circle cx="4.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="17.5" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconWaivers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 3v4h-4" />
  </Svg>
);

export const IconTrades = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5h13.5M14.5 5.5l3.5 3-3.5 3" />
    <path d="M20 15.5H6.5M9.5 12.5l-3.5 3 3.5 3" />
  </Svg>
);

export const IconDraft = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </Svg>
);

export const IconRanks = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20V12M12 20V5M19 20v-5" />
  </Svg>
);

export const IconEdge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.2 3 5.6 13.4h5l-1.6 7.6 7.7-10.4h-5z" />
  </Svg>
);

export const IconSetup = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9" />
    <circle cx="15.2" cy="7.5" r="2.1" />
    <circle cx="8.8" cy="16.5" r="2.1" />
  </Svg>
);
