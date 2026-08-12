import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchPageBlocks, type PageBlockRow } from '../api';

type PageBlocksContextValue = {
  blocks: PageBlockRow[];
  loading: boolean;
  reload: () => Promise<void>;
};

const PageBlocksCtx = createContext<PageBlocksContextValue | null>(null);

function previewTokenFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('previewToken');
}

/**
 * Single fetch of order_app page_blocks for shell chrome + home layout.
 * Public API returns enabled blocks only; shell uses surface helpers to gate placement.
 */
export function PageBlocksProvider({ children }: { children: ReactNode }) {
  const [blocks, setBlocks] = useState<PageBlockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPageBlocks({
        app: 'order_app',
        previewToken: previewTokenFromLocation(),
      });
      setBlocks(res.blocks ?? []);
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ blocks, loading, reload }),
    [blocks, loading, reload],
  );

  return <PageBlocksCtx.Provider value={value}>{children}</PageBlocksCtx.Provider>;
}

export function usePageBlocks(): PageBlocksContextValue {
  const ctx = useContext(PageBlocksCtx);
  if (!ctx) {
    return {
      blocks: [],
      loading: false,
      reload: async () => {},
    };
  }
  return ctx;
}
