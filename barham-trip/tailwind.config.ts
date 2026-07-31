import type { Config } from 'tailwindcss'

// Palette lifted straight from the printed itinerary PDF so the app feels
// like the same document. Do not drift these hex values.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0e3a48', dark: '#062b36' },
        coral: { DEFAULT: '#e08853', dark: '#c86c3a' },
        sand: { DEFAULT: '#f4e7d5', 2: '#fbf3e5' },
        teal: { DEFAULT: '#4a8896' },
        page: '#fbf9f5',
      },
      fontFamily: {
        // Serif display for titles; system sans for body.
        display: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // Phone-first scale — body bumped to ~15px.
        body: ['15px', { lineHeight: '1.55' }],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(14, 58, 72, 0.08), 0 6px 20px rgba(14, 58, 72, 0.06)',
        sheet: '0 -12px 40px rgba(0,0,0,0.35)',
      },
      backgroundImage: {
        // Cover-style gradient: peach → coral → navy.
        cover: 'linear-gradient(160deg, #f6c9a0 0%, #e08853 42%, #0e3a48 100%)',
        'leg-header': 'linear-gradient(135deg, #e08853 0%, #0e3a48 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config
