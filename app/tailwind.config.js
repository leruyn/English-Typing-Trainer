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
        ink: "#0f172a",
      },
      fontFamily: {
        sans: ["Outfit"],
        mono: ["JetBrainsMono"],
      },
    },
  },
  plugins: [],
};
