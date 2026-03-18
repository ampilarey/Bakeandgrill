/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary:       'var(--color-primary)',
        'primary-hover':'var(--color-primary-hover)',
        'primary-light':'var(--color-primary-light)',
        'primary-glow': 'var(--color-primary-glow)',
        dark:          'var(--color-dark)',
        muted:         'var(--color-text-muted)',
        border:        'var(--color-border)',
        surface:       'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        bg:            'var(--color-bg)',
        'text-base':   'var(--color-text)',
        success:       'var(--color-success)',
        error:         'var(--color-error)',
        warning:       'var(--color-warning)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        '2xl':'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", 'sans-serif'],
      },
    },
  },
  plugins: [],
};
