/** Resolve which logo URL to show for the active theme. Falls back to light logo, then /logo.png. */
export function brandLogoSrc(
  settings: { logo?: string | null; logo_dark?: string | null },
  darkMode: boolean,
): string {
  const light = (settings.logo ?? '').trim();
  const dark = (settings.logo_dark ?? '').trim();
  if (darkMode && dark) return dark;
  if (light) return light;
  return '/logo.png';
}

/** Whether Admin still uses the standard logo, so the drawn one can stand in for it. */
export function isStandardLogo(settings: { logo?: string | null; logo_dark?: string | null }): boolean {
  const path = (v: string | null | undefined) => {
    const s = (v ?? '').trim();
    if (s === '') return '';
    try {
      return new URL(s, 'https://x.invalid').pathname;
    } catch {
      return s;
    }
  };
  return (
    ['', '/logo.png', '/brand/logo-light.png', '/brand/logo-light-cream.png'].includes(path(settings.logo)) &&
    ['', '/brand/logo-dark.png'].includes(path(settings.logo_dark))
  );
}
