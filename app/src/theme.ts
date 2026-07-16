/**
 * Single source of truth for design tokens (colors, fonts) that need to be
 * referenced outside of NativeWind className strings — e.g. inline style
 * props, SVG fills, chart libraries, or anywhere a raw value is required.
 *
 * Keep these values in sync with `tailwind.config.js` theme.extend.
 */

export const colors = {
  cream: "#fcf9f4",
  ink: "#0f172a",
  // Tailwind's default emerald-500 / indigo-600 — kept here as raw hex so
  // non-NativeWind consumers (SVGs, native driver animations, etc.) don't
  // need to depend on Tailwind's runtime config to get the same value.
  emerald500: "#10b981",
  indigo600: "#4f46e5",
} as const;

export const fonts = {
  sans: "Outfit",
  mono: "JetBrainsMono",
} as const;

export const theme = {
  colors,
  fonts,
} as const;

export default theme;
