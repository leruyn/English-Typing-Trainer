/**
 * Single source of truth for design tokens (colors, fonts) that need to be
 * referenced outside of NativeWind className strings — e.g. inline style
 * props, SVG fills, chart libraries, or anywhere a raw value is required.
 *
 * Keep these values in sync with `tailwind.config.js` theme.extend.
 */

export const colors = {
  cream: "#fcf9f4",
  // Secondary cream, used for pill-shaped tracks/switch backgrounds (mode
  // switcher, keyboard tray) - matches the mockup's `--cream-2`.
  cream2: "#f5f0e6",
  ink: "#0f172a",
  inkMuted: "#475569",
  inkFaint: "#94a3b8",
  border: "#e7e2d6",
  // Tailwind's default emerald-500 / indigo-600 — kept here as raw hex so
  // non-NativeWind consumers (SVGs, native driver animations, etc.) don't
  // need to depend on Tailwind's runtime config to get the same value.
  emerald500: "#10b981",
  emerald600: "#059669",
  emerald100: "#d1fae5",
  // Mockup's `--indigo` (base accent) vs `--indigo-600` (darker accent) are
  // two distinct shades - kept both since some UI (badges, chips) uses the
  // brighter base while active/pressed states use the darker one.
  indigo: "#4f46e5",
  indigo600: "#4338ca",
  indigo100: "#e0e7ff",
  amber: "#f59e0b",
  amber600: "#b45309",
  amber100: "#fef3c7",
  rose: "#f43f5e",
  rose600: "#be123c",
  rose100: "#ffe4e6",
} as const;

export const fonts = {
  /** Headings/display text (`h1,h2,h3,.display` in the mockup). */
  display: "Outfit",
  /** Body/UI copy (buttons, labels, paragraphs) - the mockup's default `body` font. */
  sans: "PlusJakartaSans",
  /** Typing characters + numeric stats/metrics (`.mono` in the mockup). */
  mono: "JetBrainsMono",
} as const;

export const theme = {
  colors,
  fonts,
} as const;

export default theme;
