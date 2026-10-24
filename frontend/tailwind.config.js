/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./*.html', './js/*.js'],
  theme: {
    extend: {
      colors: {
        background: '#f8f9fb',
        'on-surface': '#191c1e',
        'on-surface-variant': '#44474e',
        'inverse-surface': '#0f172a',
        'inverse-on-surface': '#e2e8f0',

        primary: '#1d4ed8',
        'on-primary': '#ffffff',
        'primary-container': '#2563eb',
        'primary-fixed-dim': '#a9c7ff',

        secondary: '#b45309',
        'secondary-container': '#fde7c3',
        'on-secondary-container': '#5b3a00',

        tertiary: '#047857',
        'tertiary-fixed': '#b7f0d5',

        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',

        outline: '#74777f',
        'outline-variant': '#c4c6d0',

        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f1f3f6',
        'surface-container-high': '#e4e7ec',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'headline-lg': ['2rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        'headline-md': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'headline-sm': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        'body-md': ['1rem', { lineHeight: '1.5rem' }],
        'body-sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'label-md': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        'label-sm': ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        'data-tabular-md': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
      },
      spacing: {
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2.5rem',
        gutter: '1rem',
        margin: '2rem',
      },
    },
  },
  plugins: [],
};