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
        // ── Surfaces ──
        background: '#F9F9F7',
        surface: {
          DEFAULT:  '#FFFFFF',
          elevated: '#F3F3F0',
        },

        // ── Text ──
        text: {
          primary:   '#111111',
          secondary: '#6B7280',
          disabled:  '#D1D5DB',
          inverse:   '#FFFFFF',
          hint:      '#9CA3AF',
        },

        // ── Accent (all CTAs, active nav, buttons, links) ──
        accent: {
          DEFAULT: '#18181B',   // Zinc-900
          hover:   '#3F3F46',   // Zinc-700
          subtle:  '#F4F4F5',   // Zinc-100
        },

        // ── Burgundy — blue replacement accent ──
        burgundy: {
          50:  '#FDF2F4',
          100: '#FBDDE2',
          200: '#F5B8C2',
          300: '#EC8898',
          400: '#DC5A6F',
          600: '#8B1A2C',
          700: '#6E1221',
          800: '#540D19',
          900: '#3D0910',
          950: '#220508',
        },

        // ── Brand — alias for burgundy, used across app ──
        brand: {
          DEFAULT: '#8B1A2C',
          50:  '#FDF2F4',
          100: '#FBDDE2',
          200: '#F5B8C2',
          300: '#EC8898',
          400: '#DC5A6F',
          600: '#8B1A2C',
          700: '#6E1221',
          800: '#540D19',
          950: '#220508',
        },

        // ── Borders ──
        border: {
          DEFAULT: '#E8E8E4',
          strong:  '#D1D1CB',
        },

        // ── Pro Gold — recognition elements only ──
        'pro-gold': {
          DEFAULT: '#F59E0B',
          mid:     '#FCD34D',
          deep:    '#D97706',
          subtle:  '#FEF3C7',
          border:  '#F59E0B',
        },

        // ── Semantic ──
        success: {
          DEFAULT: '#10B981',
          subtle:  '#D1FAE5',
        },
        error: {
          DEFAULT: '#EF4444',
          subtle:  '#FEE2E2',
        },
        warning: '#F59E0B',

        // ── Overlay ──
        overlay: 'rgba(0,0,0,0.4)',
      },

      fontSize: {
        // Design system type scale
        'ds-display':  ['32px', { lineHeight: '1.2',  fontWeight: '700', letterSpacing: '-0.01em' }],
        'ds-h1':       ['24px', { lineHeight: '1.25', fontWeight: '700', letterSpacing: '-0.01em' }],
        'ds-h2':       ['20px', { lineHeight: '1.3',  fontWeight: '600' }],
        'ds-h3':       ['17px', { lineHeight: '1.4',  fontWeight: '600' }],
        'ds-body-lg':  ['16px', { lineHeight: '1.6',  fontWeight: '400' }],
        'ds-body':     ['15px', { lineHeight: '1.6',  fontWeight: '400' }],
        'ds-small':    ['13px', { lineHeight: '1.5',  fontWeight: '400' }],
        'ds-caption':  ['12px', { lineHeight: '1.4',  fontWeight: '400' }],
        'ds-badge':    ['11px', { lineHeight: '1.0',  fontWeight: '600' }],
        'ds-btn':      ['15px', { lineHeight: '1.0',  fontWeight: '600' }],
        'ds-btn-sm':   ['13px', { lineHeight: '1.0',  fontWeight: '600' }],
      },

      borderRadius: {
        card:     '12px',
        btn:      '8px',
        'btn-sm': '6px',
        input:    '8px',
        img:      '8px',
        sheet:    '16px',
        modal:    '16px',
        badge:    '9999px',
        avatar:   '9999px',
        tooltip:  '6px',
      },

      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        sheet: '0 -4px 24px rgba(0,0,0,0.08)',
        modal: '0 20px 60px rgba(0,0,0,0.10)',
        // No shadow on buttons — flat only
      },

      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
