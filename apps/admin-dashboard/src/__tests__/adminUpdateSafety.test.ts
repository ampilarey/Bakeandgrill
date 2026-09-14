import { describe, expect, it } from 'vitest';
import { isNewerAdminBuild, shortBuildId } from '../adminUpdateSafety';

/*
 * Owner, 2026-09-14: "admin app update option etc. Same as pos." The same
 * rules the POS uses to decide whether the server has something newer.
 */
describe('isNewerAdminBuild', () => {
  const local = {
    version: '1.0.0',
    build: '2026-09-14-120000-abc1234',
    commit: 'abc1234',
    built_at: '2026-09-14T12:00:00.000Z',
  };

  it('spots a newer build on the server', () => {
    expect(isNewerAdminBuild({ ...local, build: '2026-09-14-130000-def5678', commit: 'def5678' }, local)).toBe(true);
  });

  it('ignores a placeholder stamp, so a half-deployed server does not nag', () => {
    expect(isNewerAdminBuild({ ...local, build: '2026-09-14-130000-abc1234' }, local)).toBe(false);
    expect(isNewerAdminBuild({ ...local, commit: 'dev', build: '2026-09-14-130000-dev' }, { ...local, commit: 'f00ba12' })).toBe(false);
  });

  it('treats the same build as up to date', () => {
    expect(isNewerAdminBuild(local, local)).toBe(false);
  });

  it('shortens a build id to the time and commit', () => {
    expect(shortBuildId('2026-09-14-120000-abc1234')).toBe('120000-abc1234');
  });
});
