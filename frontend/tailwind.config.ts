import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#525c69',
        steel: '#6a737f',
        mint: '#2fc6f6',
        amber: '#f5a623',
        coral: '#ff5752',
        b24: {
          bg: '#eef2f4',
          border: '#dfe3e8',
          blue: '#2fc6f6',
          'blue-dark': '#19a9d5',
          green: '#9dcf00'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
