import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        steel: 'rgb(var(--color-steel) / <alpha-value>)',
        mint: '#2fc6f6',
        amber: '#f5a623',
        coral: '#ff5752',
        b24: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          blue: 'rgb(var(--color-primary) / <alpha-value>)',
          'blue-dark': 'rgb(var(--color-blue-dark) / <alpha-value>)',
          green: '#9dcf00'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
