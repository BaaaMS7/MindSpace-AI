/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ms: { bg: '#131314', surface: '#1E1F20', hover: '#282A2C', text: '#E3E3E3', textmuted: '#C4C7C5', primary: '#A8C7FA' },
        mood: { tenang: '#6EE7B7', senang: '#93C5FD', cemas: '#FCD34D', sedih: '#A78BFA', stres: '#FCA5A5' }
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    },
  },
  plugins: [],
}
