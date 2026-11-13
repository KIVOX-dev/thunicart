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
        'navy-50': 'var(--color-navy-50)', 'navy-100': 'var(--color-navy-100)', 'navy-200': 'var(--color-navy-200)',
        'orange-50': 'var(--color-orange-50)', 'orange-100': 'var(--color-orange-100)', 'orange-600': 'var(--color-orange-600)',
        'teal-50': 'var(--color-teal-50)', 'teal-100': 'var(--color-teal-100)', 'teal-700': 'var(--color-teal-700)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { sm: 'var(--radius-sm)', DEFAULT: 'var(--radius-md)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', '2xl': '36px' },
      letterSpacing: { heading: '0.08em' },
      boxShadow: { overlay: 'var(--shadow-overlay)', soft: 'var(--shadow-soft)', lift: 'var(--shadow-lift)', 'pop-orange': 'var(--shadow-pop-orange)', 'pop-teal': 'var(--shadow-pop-teal)' },
    },
  },
  plugins: [],
};
