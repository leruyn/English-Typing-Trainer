/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        cream: "#fcf9f4",
        "cream-2": "#f5f0e6",
        ink: "#0f172a",
        border: "#e7e2d6",
      },
      fontFamily: {
        // Outfit stays available as `font-display` for headings; NativeWind's
        // default `font-sans` now resolves to the mockup's body font
        // (Plus Jakarta Sans) so plain `className="font-sans"` text matches
        // the mockup without every call site needing an inline style.
        display: ["Outfit"],
        sans: ["PlusJakartaSans"],
        mono: ["JetBrainsMono"],
      },
    },
  },
  plugins: [],
};
