/**
 * What a build knows about itself, and how to tell a newer one apart.
 *
 * Owner, 2026-09-14: "enhance the mobile pwa for admin … admin app update
 * option etc. Same as pos." The POS carries a build stamp and compares it to
 * the one on the server; the admin does the same with the same rules.
 */
export type AdminVersionInfo = {
  version: string;
  build: string;
  commit: string;
  built_at: string;
};

const PLACEHOLDER_COMMITS = new Set(['abc1234', 'dev', 'placeholder']);

function isPlaceholderBuild(info: AdminVersionInfo): boolean {
  return PLACEHOLDER_COMMITS.has(info.commit) || info.build.includes('-abc1234');
}

/** True when the server reports a different deploy than this bundle. */
export function isNewerAdminBuild(server: AdminVersionInfo, local: AdminVersionInfo): boolean {
  // A stale placeholder admin-version.json on the server must not nag
  // everybody every session.
  if (isPlaceholderBuild(server)) return false;
  if (server.build !== local.build) return true;
  if (server.commit !== local.commit && !PLACEHOLDER_COMMITS.has(server.commit)) return true;
  if (server.version !== local.version) return true;
  return false;
}

/** The tail of a build id — the time and commit — for a label. */
export function shortBuildId(build: string): string {
  const parts = build.split('-');
  if (parts.length >= 2) return parts.slice(-2).join('-');
  return build.length > 20 ? build.slice(-20) : build;
}
