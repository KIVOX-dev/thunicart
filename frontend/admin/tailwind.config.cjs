module.exports = {
  presets: [require('../ui/src/tailwind-preset.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../ui/src/**/*.{ts,tsx}'],
};
