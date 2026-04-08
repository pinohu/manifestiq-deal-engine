/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: { 0: '#0a0a0c', 1: '#111114', 2: '#1a1a1f', 3: '#242429' },
        accent: { DEFAULT: '#10b981', dim: '#065f46', bright: '#34d399' },
        warn: '#f59e0b',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};
