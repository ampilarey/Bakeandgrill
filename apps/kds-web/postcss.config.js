// Tailwind is not in the KDS pipeline — see src/index.css for why. It was
// installed at v4 while index.css still used the v3 `@tailwind` directives,
// so no utility was ever generated and every className in the app was inert.
// Rather than leave a framework that can silently stop working, the KDS
// writes its own CSS, as apps/pos-web does. Only autoprefixer remains.
export default {
  plugins: {
    autoprefixer: {},
  },
}
