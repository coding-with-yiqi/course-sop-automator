import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        matcha: {
          DEFAULT: '#256c2b',
          container: '#89d385',
          fixed: '#a9f5a3',
        },
        aqua: {
          DEFAULT: '#00677d',
          container: '#7bdffe',
        },
        lavender: {
          DEFAULT: '#5555a5',
          container: '#bcbbff',
        },
        blush: '#EFCCEA',
        canvas: '#F6FCF4',
        forest: '#1A4D17',
        sage: '#3D5C3A',
        mist: '#6B7C65',
        'border-subtle': '#E2EFE0',

        surface: {
          lowest: '#ffffff',
          low: '#dffcd6',
          DEFAULT: '#daf6d0',
          high: '#d4f0cb',
          highest: '#ceeac6',
          variant: '#ceeac6',
          bright: '#ecffe3',
          dim: '#c6e2bd',
        },
        on: {
          surface: '#0a2009',
          'surface-variant': '#40493e',
          primary: '#ffffff',
          'primary-container': '#115c1d',
          'secondary-container': '#006277',
          'tertiary-container': '#464695',
          error: '#ffffff',
          'error-container': '#93000a',
        },
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        chip: {
          processing: '#C4EEFF',
          completed: '#D1EFBD',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'serif'],
      },
      fontSize: {
        'headline-lg': ['34px', { lineHeight: '1.4', letterSpacing: '0.03em' }],
        'headline-md': ['24px', { lineHeight: '1.5' }],
        'title-sm': ['18px', { lineHeight: '1.5' }],
        'body-md': ['15.5px', { lineHeight: '1.85' }],
        'body-sm': ['13.5px', { lineHeight: '1.8' }],
        'label-caps': ['12px', { lineHeight: '1', letterSpacing: '0.15em' }],
        'display-num': ['48px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'display-num-lg': ['90px', { lineHeight: '1', letterSpacing: '-3px' }],
      },
      borderRadius: {
        card: '18px',
        input: '12px',
        pill: '100px',
      },
      maxWidth: {
        canvas: '1280px',
        page: '1024px',
      },
      width: {
        sidebar: '260px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(26, 77, 23, 0.05), 0 1px 3px rgba(26, 77, 23, 0.06)',
        'card-hover': '0 4px 12px rgba(26, 77, 23, 0.08), 0 2px 4px rgba(26, 77, 23, 0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config;
