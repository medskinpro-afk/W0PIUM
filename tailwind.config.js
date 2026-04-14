/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.{html,js}',
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  corePlugins: {
    // Don't inject Tailwind's base reset — existing style.css handles it
    preflight: false,
  },
  plugins: [],
};
