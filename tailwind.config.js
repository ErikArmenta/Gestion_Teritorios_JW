/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
        },
        success: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
        neutral: '#6B7280',
        surface: '#FFFFFF',
        'bg-primary': '#F8FAFC',
        border: '#E2E8F0',
        'text-primary': '#0F172A',
        'text-secondary': '#64748B',
      },
    },
  },
  plugins: [],
}
