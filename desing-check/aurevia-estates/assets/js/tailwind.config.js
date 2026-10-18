// Aurevia Estates — shared Tailwind theme (loaded right after the Tailwind Play CDN)
tailwind.config = {
  theme: {
    extend: {
      colors: {
        canvas: '#F3F4F4',
        burgundy: { DEFAULT: '#853953', dark: '#6E2E44', light: '#F4E9ED' },
        plum: { DEFAULT: '#612D53', dark: '#4A2240', light: '#EFE8EE' },
        charcoal: { DEFAULT: '#2C2C2C', soft: '#5A5A5A', muted: '#8A8A8A' },
        line: '#E2E3E3',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        bangla: ['"Hind Siliguri"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(44,44,44,.04), 0 8px 24px -12px rgba(44,44,44,.12)',
        lift: '0 2px 4px rgba(44,44,44,.05), 0 18px 40px -18px rgba(97,45,83,.28)',
      },
      letterSpacing: { eyebrow: '.18em' },
    },
  },
};
