import noHexInInlineStyle from './no-hex-in-inline-style.js';

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: { name: 'eslint-plugin-local', version: '1.0.0' },
  rules: {
    'no-hex-in-inline-style': noHexInInlineStyle,
  },
};

export default plugin;
