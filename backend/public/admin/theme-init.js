// Pre-paint theme bootstrap — must stay a tiny external file because the CSP
// is script-src 'self' (no inline scripts). Runs synchronously in <head> so
// dark-mode users never see a light flash before React mounts.
try {
  if (localStorage.getItem('bg_theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
} catch (e) {
  // localStorage unavailable (private mode) — default light theme is fine.
}
