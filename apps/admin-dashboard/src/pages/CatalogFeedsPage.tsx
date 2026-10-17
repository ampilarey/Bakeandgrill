import { useEffect, useState } from 'react';
import { Btn, Card, ConfirmDialog, useConfirmDialog } from '../components/SharedUI';
import { fetchCatalogFeeds, rotateCatalogFeeds, type CatalogFeedLinks } from '../api';

/*
 * Catalogue feeds (iruali import plan, feature 11): the menu as a Facebook /
 * Instagram catalogue (CSV) and a Google Merchant Center feed (XML), behind a
 * secret link. Dishes kept off sale and coming soon are left out; sold-out and
 * snoozed ones show as out of stock. Rebuilt within 30 minutes of a menu change.
 */
function FeedRow({ label, url, hint }: { label: string; url: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the link stays visible to select */ }
  };
  return (
    <div style={{ display: 'grid', gap: 6, padding: '12px 0', borderTop: '1px solid var(--color-border-light)' }}>
      <strong style={{ fontSize: 14 }}>{label}</strong>
      <code data-testid={`feed-url-${label}`} style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--color-bg)', padding: '6px 8px', borderRadius: 8, color: 'var(--color-text)' }}>{url}</code>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Btn small variant="secondary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Btn>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</span>
      </div>
    </div>
  );
}

export default function CatalogFeedsPage() {
  const [links, setLinks] = useState<CatalogFeedLinks | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { state: dlg, ask, close } = useConfirmDialog();

  useEffect(() => {
    fetchCatalogFeeds().then((r) => { setLinks(r.links); setCount(r.count); }).catch((e: Error) => setError(e.message));
  }, []);

  const rotate = () => ask({
    title: 'Make new feed links',
    message: 'The current links stop working at once. Paste the new ones into Facebook Commerce Manager and Google Merchant Center.',
    confirmLabel: 'Make new links',
    danger: true,
    onConfirm: async () => {
      setBusy(true); setError('');
      try { setLinks((await rotateCatalogFeeds()).links); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    },
  });

  return (
    <Card>
      <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>Catalogue feeds</h3>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Your menu for Facebook and Instagram shops and for Google. One row per dish and size, with its photo, price and whether it can be ordered.
        Dishes switched off or coming soon are left out. {links ? `${count} rows now.` : ''}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>
        Google limits restaurant food in Merchant Center, so the Google feed may only show in some places. The Facebook catalogue works for Instagram and Facebook shops.
      </p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
      {links && (
        <>
          <FeedRow label="Facebook and Instagram (CSV)" url={links.facebook} hint="Commerce Manager → Catalogue → Data sources → Scheduled feed" />
          <FeedRow label="Google Merchant Center (XML)" url={links.google} hint="Merchant Center → Products → Feeds → Scheduled fetch" />
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border-light)' }}>
            <Btn small variant="danger-outline" onClick={rotate} disabled={busy}>Make new links</Btn>
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>If a link was shared by mistake.</span>
          </div>
        </>
      )}
      <ConfirmDialog state={dlg} close={close} />
    </Card>
  );
}
