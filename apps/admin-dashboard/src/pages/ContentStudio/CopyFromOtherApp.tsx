import { Copy } from 'lucide-react';
import { useState } from 'react';
import {
  copyContentBlock,
  type ContentApp,
  type ContentBlock,
  type ContentLocale,
} from '../../api/content';

type CopyBlockProps = {
  app: ContentApp;
  blockKey: string;
  locale: ContentLocale;
  onDone: (blocks: ContentBlock[]) => void;
  onError: (message: string) => void;
};

type CopySectionProps = {
  app: ContentApp;
  keys: string[];
  locale: ContentLocale;
  onDone: (blocks: ContentBlock[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

function otherApp(app: ContentApp): ContentApp {
  return app === 'website' ? 'order_app' : 'website';
}

function otherLabel(app: ContentApp): string {
  return app === 'website' ? 'Order App' : 'Website';
}

/** Per-block "Copy from the other app" — uses resolved source via backend copy. */
export function CopyBlockFromOtherApp({ app, blockKey, locale, onDone, onError }: CopyBlockProps) {
  const [busy, setBusy] = useState(false);
  const from = otherApp(app);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            const { blocks } = await copyContentBlock(blockKey, from, app, locale);
            onDone(blocks);
          } catch (e) {
            onError(e instanceof Error ? e.message : 'Copy failed');
          } finally {
            setBusy(false);
          }
        })();
      }}
      style={{
        height: 36, padding: '0 10px', borderRadius: 10, border: '1px solid #E8E0D8',
        background: '#fff', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 12,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Copy size={12} style={{ verticalAlign: -1 }} />{' '}
      {busy ? 'Copying…' : `Copy from ${otherLabel(app)}`}
    </button>
  );
}

/** Per-section copy — loops existing per-block copy endpoint. */
export function CopySectionFromOtherApp({
  app, keys, locale, onDone, onError, disabled,
}: CopySectionProps) {
  const [busy, setBusy] = useState(false);
  const from = otherApp(app);

  if (keys.length === 0) return null;

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => {
        if (!window.confirm(`Copy ${keys.length} block${keys.length === 1 ? '' : 's'} from ${otherLabel(app)}? This overwrites this app's values for the section.`)) {
          return;
        }
        void (async () => {
          setBusy(true);
          try {
            let blocks: ContentBlock[] = [];
            for (const key of keys) {
              const res = await copyContentBlock(key, from, app, locale);
              blocks = res.blocks;
            }
            onDone(blocks);
          } catch (e) {
            onError(e instanceof Error ? e.message : 'Section copy failed');
          } finally {
            setBusy(false);
          }
        })();
      }}
      style={{
        width: '100%', marginTop: 8, height: 36, padding: '0 10px', borderRadius: 10,
        border: '1px solid #E8E0D8', background: '#F8F6F3', cursor: busy || disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: '#6B5D4F',
        opacity: busy || disabled ? 0.5 : 1,
      }}
    >
      {busy ? 'Copying section…' : `Copy section from ${otherLabel(app)}`}
    </button>
  );
}
