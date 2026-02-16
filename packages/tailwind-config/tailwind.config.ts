import type { Config } from 'tailwindcss/types/config';

export default {
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#3d828f',
          hover: '#346e79',
          soft: '#f0f7f8',
          light: '#dff0f2',
          muted: '#70b5c2',
          foreground: '#2a5f69',
        },
        brand: {
          dark: '#0b252a',
          'dark-lighter': '#153a40',
        },
      },
    },
  },
  plugins: [],
} as Omit<Config, 'content'>;
