/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'ui-monospace', 'Cascadia Code', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#fff0f2',
          100: '#ffe0e5',
          200: '#ffc2cb',
          300: '#ff94a8',
          400: '#e05570',
          500: '#b3002a',
          600: '#800020',
          700: '#600018',
          800: '#400010',
          950: '#1f000a',
        },
      },
      boxShadow: {
        xs:   '0 1px 2px rgba(0,0,0,0.04)',
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
