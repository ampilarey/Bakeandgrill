function e(n,t=0){const r=parseFloat(String(n??t));return isNaN(r)?t:r}function o(n,t=2){return e(n).toFixed(t)}function i(n){return`MVR ${o(n,2)}`}export{i as m};
