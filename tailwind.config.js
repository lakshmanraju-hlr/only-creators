/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Legacy brand alias — mapped to new ink/accent system
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          950: '#172554',
        },
        // Design system palette
        ink: {
          DEFAULT: '#1A1A1A',
          hover:   '#333333',
          pressed: '#111111',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          bg:      '#F8F8F6',
        },
        accent: {
          DEFAULT: '#2563EB',
          light:   '#EFF6FF',
          hover:   '#1D4ED8',
        },
        'pro-gold': {
          DEFAULT: '#F59E0B',
          light:   '#FEF3C7',
          border:  '#FDE68A',
        },
        success: {
          DEFAULT: '#10B981',
          light:   '#ECFDF5',
        },
        muted: {
          DEFAULT:   '#6B7280',
          light:     '#9CA3AF',
          border:    '#E5E7EB',
          disabled:  '#D1D5DB',
        },
      },
      fontSize: {
        // Design system type scale
        'ds-display': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'ds-h1':      ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'ds-h2':      ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        'ds-h3':      ['17px', { lineHeight: '1.4', fontWeight: '600' }],
        'ds-body':    ['15px', { lineHeight: '1.6', fontWeight: '400' }],
        'ds-small':   ['13px', { lineHeight: '1.6', fontWeight: '400' }],
        'ds-caption': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        'ds-badge':   ['11px', { lineHeight: '1.2', fontWeight: '600' }],
        'ds-btn':     ['15px', { lineHeight: '1',   fontWeight: '600' }],
      },
      borderRadius: {
        card:    '12px',
        btn:     '8px',
        input:   '8px',
        badge:   '9999px',
        avatar:  '9999px',
        sheet:   '16px',
        img:     '8px',
      },
      boxShadow: {
        card:   '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        sheet:  '0 -4px 24px rgba(0,0,0,0.08)',
        modal:  '0 20px 60px rgba(0,0,0,0.12)',
        xs:     '0 1px 2px rgba(0,0,0,0.04)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
