/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        canvas: 'var(--canvas)',
        node: 'var(--node)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        saved: 'var(--saved)',
        added: 'var(--added)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['"Familjen Grotesk Variable"', 'system-ui', 'sans-serif'],
        mono: ['"Martian Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { sm: '2px', DEFAULT: '3px', md: '4px' },
    },
  },
  plugins: [],
}
