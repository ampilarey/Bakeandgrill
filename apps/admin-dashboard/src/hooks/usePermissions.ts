import { useEffect, useState, useCallback } from 'react';
import { getMe, getUserPermissions, type PermissionItem, type StaffUser } from '../api';

interface UsePermissionsResult {
  permissions: PermissionItem[];
  loading: boolean;
  error: boolean;
  can: (slug: string) => boolean;
  refresh: () => void;
}

/**
 * Fetches effective permissions for a given user.
 * Owner role always returns true for all checks.
 */
export function usePermissions(userId: number | null, role?: string | null): UsePermissionsResult {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetch = useCallback(() => {
    if (!userId || role === 'owner') {
      setPermissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    getUserPermissions(userId)
      .then(({ permissions: p }) => { setPermissions(p ?? []); setError(false); })
      .catch(() => {
        // On fetch failure keep previously-loaded permissions so the UI isn't
        // locked out by a transient network error; just mark the error state.
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [userId, role]);

  useEffect(() => { fetch(); }, [fetch]);

  const can = useCallback((slug: string): boolean => {
    if (role === 'owner') return true;
    return permissions.find((p) => p.slug === slug)?.granted ?? false;
  }, [permissions, role]);

  return { permissions, loading, error, can, refresh: fetch };
}

// ── Current-user permissions helper ──────────────────────────────────────────
// Single-flight cache for the active staff user so every consumer doesn't
// trigger its own /auth/me request. Mirrored into module scope (not React
// state) because the same data is needed across components that don't
// share a context.

let _meCache: StaffUser | null = null;
let _mePromise: Promise<StaffUser> | null = null;
const _meListeners = new Set<(u: StaffUser | null) => void>();

function ensureMe(): Promise<StaffUser> {
  if (_meCache) return Promise.resolve(_meCache);
  if (_mePromise) return _mePromise;
  _mePromise = getMe()
    .then((res) => {
      _meCache = res.user;
      _mePromise = null;
      _meListeners.forEach((l) => l(_meCache));
      return _meCache;
    })
    .catch((err) => {
      _mePromise = null;
      throw err;
    });
  return _mePromise;
}

/**
 * No-arg variant: returns helpers for the CURRENTLY logged-in staff user.
 * Used by inline UI gates (sidebar nav, row actions, command palette)
 * where we just need "can the active user do X?".
 *
 * Returns `can('permission.slug')` which is true for owners or for any
 * user that has the explicit grant.
 */
export function useCurrentUserPermissions(): {
  user: StaffUser | null;
  loading: boolean;
  can: (slug?: string) => boolean;
} {
  const [user, setUser] = useState<StaffUser | null>(_meCache);
  const [loading, setLoading] = useState(_meCache === null);

  useEffect(() => {
    const sub = (u: StaffUser | null) => { setUser(u); setLoading(false); };
    _meListeners.add(sub);
    if (_meCache === null) {
      ensureMe().then((u) => sub(u)).catch(() => setLoading(false));
    } else {
      sub(_meCache);
    }
    return () => { _meListeners.delete(sub); };
  }, []);

  const can = useCallback((slug?: string): boolean => {
    if (!slug) return true;
    if (!user) return false;
    if (user.role === 'owner') return true;
    return user.permissions?.includes(slug) ?? false;
  }, [user]);

  return { user, loading, can };
}
