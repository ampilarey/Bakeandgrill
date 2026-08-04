import { describe, expect, it } from 'vitest';
import { PERM_ALIASES } from '../components/navConfig';

/**
 * Pins admin PERM_ALIASES to fixtures/permission_satisfied_by_parity.json so it
 * cannot drift from PermissionCatalog::SATISFIED_BY (PHPUnit asserts the other side).
 */
const REPO_RELATIVE = 'fixtures/permission_satisfied_by_parity.json';

async function loadFixture(): Promise<{
  repo_relative_path: string;
  satisfied_by: Record<string, string[]>;
}> {
  const fs = await import('node:fs') as { readFileSync: (p: string, e: string) => string };
  const path = await import('node:path') as {
    dirname: (p: string) => string;
    join: (...p: string[]) => string;
  };
  const url = await import('node:url') as { fileURLToPath: (u: string) => string };
  // apps/admin-dashboard/src/__tests__ → repo root is 4 levels up
  const dir = path.dirname(url.fileURLToPath(import.meta.url));
  const fixturePath = path.join(dir, '../../../../', REPO_RELATIVE);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Awaited<ReturnType<typeof loadFixture>>;
}

describe('permission SATISFIED_BY ↔ PERM_ALIASES parity', () => {
  it('reads the shared repo-root fixture', async () => {
    const fixture = await loadFixture();
    expect(fixture.repo_relative_path).toBe(REPO_RELATIVE);
    expect(Object.keys(fixture.satisfied_by).length).toBeGreaterThan(0);
  });

  it('PERM_ALIASES matches the fixture exactly (both directions)', async () => {
    const fixture = await loadFixture();
    expect(PERM_ALIASES).toEqual(fixture.satisfied_by);
    expect(fixture.satisfied_by).toEqual(PERM_ALIASES);
  });

  it('does not grant devices.manage from devices.approve (backend has no reverse alias)', () => {
    expect(PERM_ALIASES['devices.manage']).toBeUndefined();
    expect(PERM_ALIASES['devices.approve']).toEqual(['devices.manage']);
  });
});
