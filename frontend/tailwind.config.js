/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tradeo: {
          ink: '#172522',
          canvas: '#f5f7f5',
          green: '#17836d',
          forest: '#15463d',
          mint: '#eaf5f0',
          line: '#e6ebe7',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Manrope', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
