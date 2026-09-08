/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        indigo: {
          DEFAULT: '#1E1B4B',
          deep: '#151235',
        },
        amber: {
          DEFAULT: '#F5B301',
        },
        cream: '#FAF9F6',
        success: '#1F9D55',
        danger: '#DC2626',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
