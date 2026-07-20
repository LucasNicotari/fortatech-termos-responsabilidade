import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2933',
        steel: '#52616b',
        mint: '#2a9d8f',
        amber: '#e9a03b',
        coral: '#d85c4a'
      }
    }
  },
  plugins: []
} satisfies Config;
