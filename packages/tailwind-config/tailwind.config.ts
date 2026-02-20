import type { Config } from 'tailwindcss/types/config';

export default {
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#000000',
          hover: '#1a1a1a',
          soft: '#f5f5f5',
          light: '#e5e5e5',
          muted: '#a3a3a3',
          foreground: '#171717',
        },
        brand: {
          dark: '#0a0a0a',
          'dark-lighter': '#1a1a1a',
        },
      },
    },
  },
  plugins: [],
} as Omit<Config, 'content'>;
