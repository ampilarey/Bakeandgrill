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
