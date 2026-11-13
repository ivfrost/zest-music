const tokens = require('./src/theme/tokens.json');

const px = value => `${value}px`;
const kebab = value =>
  value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);

const fontSize = Object.fromEntries(
  Object.entries(tokens.type).map(([name, [size, lineHeight]]) => [
    kebab(name),
    [px(size), px(lineHeight)],
  ]),
);

const borderRadius = Object.fromEntries(
  Object.entries(tokens.radius).map(([name, value]) => [
    `md3-${name}`,
    px(value),
  ]),
);

const spacing = Object.fromEntries(
  Object.entries(tokens.spacing).map(([name, value]) => [name, px(value)]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx,ts,tsx}', './src/components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'on-primary': 'var(--color-on-primary)',
        'primary-container': 'var(--color-primary-container)',
        'on-primary-container': 'var(--color-on-primary-container)',
        background: 'var(--color-background)',
        'on-background': 'var(--color-on-background)',
        surface: 'var(--color-surface)',
        'on-surface': 'var(--color-on-surface)',
        'surface-variant': 'var(--color-surface-variant)',
        'on-surface-variant': 'var(--color-on-surface-variant)',
        'surface-container-low': 'var(--color-surface-container-low)',
        'surface-container': 'var(--color-surface-container)',
        'surface-container-high': 'var(--color-surface-container-high)',
        outline: 'var(--color-outline)',
        'outline-variant': 'var(--color-outline-variant)',
      },
      fontSize,
      borderRadius,
      spacing,
    },
  },
  plugins: [],
};
