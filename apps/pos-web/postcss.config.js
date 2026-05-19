// Bug-038: Tailwind removed from the POS pipeline — see index.css for
// the rationale. Only autoprefixer remains so vendor-prefixed CSS still
// goes through PostCSS.
export default {
  plugins: {
    autoprefixer: {},
  },
}
