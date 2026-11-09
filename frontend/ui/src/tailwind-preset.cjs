/** Shared Tailwind preset. Values mirror tokens.css. */
module.exports = {
  theme: {
    extend: {
      colors: {
        navy: 'var(--color-navy)',
        orange: 'var(--color-orange)',
        teal: 'var(--color-teal)',
        mist: 'var(--color-mist)',
        line: 'var(--color-line)',
        muted: 'var(--color-muted)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        'success-bg': 'var(--color-success-bg)',
        'danger-bg': 'var(--color-danger-bg)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { sm: '2px', DEFAULT: '4px', md: '4px' },
      letterSpacing: { heading: '0.08em' },
      boxShadow: { overlay: 'var(--shadow-overlay)' },
    },
  },
  plugins: [],
};
