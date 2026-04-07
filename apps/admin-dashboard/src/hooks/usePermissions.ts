import { useEffect, useState, useCallback } from 'react';
import { getUserPermissions, type PermissionItem } from '../api';

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
      .then(({ permissions: p }) => { setPermissions(p); setError(false); })
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
