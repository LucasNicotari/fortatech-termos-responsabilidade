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
        coral: '#ff5752',
        b24: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          border: 'rgb(var(--color-border) / <alpha-value>)',
          blue: '#2fc6f6',
          'blue-dark': 'rgb(var(--color-blue-dark) / <alpha-value>)'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
