const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    // Remap each named font-size to the next larger default size.
    // This effectively makes every `text-*` utility one step larger.
    fontSize: {
      xs: defaultTheme.fontSize.sm,
      sm: defaultTheme.fontSize.base,
      base: defaultTheme.fontSize.lg,
      lg: defaultTheme.fontSize.xl,
      xl: defaultTheme.fontSize['2xl'],
      '2xl': defaultTheme.fontSize['3xl'],
      '3xl': defaultTheme.fontSize['4xl'],
      '4xl': defaultTheme.fontSize['5xl'],
      '5xl': defaultTheme.fontSize['6xl'],
      '6xl': defaultTheme.fontSize['7xl'],
      '7xl': defaultTheme.fontSize['8xl'],
      '8xl': defaultTheme.fontSize['9xl'],
      '9xl': defaultTheme.fontSize['9xl'],
    },
    extend: {},
  },
  plugins: [],
};
