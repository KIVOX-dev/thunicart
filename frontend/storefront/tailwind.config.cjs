module.exports = {
  presets: [require('../ui/src/tailwind-preset.cjs')],
  content: ['./src/**/*.{ts,tsx}', '../ui/src/**/*.{ts,tsx}'],
};
