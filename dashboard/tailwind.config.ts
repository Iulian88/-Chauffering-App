import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base:           '#0B0B0C',
        card:           '#121214',
        'card-hover':   '#161618',
        border:         '#1F1F23',
        'border-subtle':'#18181C',
        accent:         '#C6A96A',
        'accent-dim':   '#8A7448',
        'accent-muted': '#1A1710',
        primary:        '#F0F0F2',
        secondary:      '#8A8A94',
        muted:          '#3D3D45',
        // Status palette — all muted/desaturated on dark
        'status-pending':   '#8A8A94',
        'status-confirmed': '#5B8AF7',
        'status-dispatched':'#C6A96A',
        'status-progress':  '#4CAF7D',
        'status-completed': '#F0F0F2',
        'status-cancelled': '#E05252',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        widest: '0.2em',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.4)',
        'modal': '0 8px 32px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}

export default config
