import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { Btn, Card, ConfirmDialog, EmptyState, Input, Pagination, TabScrollRow, useConfirmDialog } from '../components/SharedUI';
import {
  downloadNewsletterSubscribers, fetchNewsletterIssue, fetchNewsletterIssues, fetchNewsletterPreview, fetchNewsletterSubscribers,
  fetchPromotions, retryNewsletter, saveNewsletterIssue, sendNewsletter, sendNewsletterTest,
  type NewsletterDraft, type NewsletterIssue, type NewsletterIssueSummary, type NewsletterSubscriberRow, type Promotion,
} from '../api';

/*
 * Customers & Marketing → Newsletter (iruali import plan, feature 4). Write an
 * issue in English and Dhivehi, tick what it shows (new dishes, specials, an
 * offer, coming soon), remove dishes one by one, preview both languages at
 * phone and computer width, send a test, then send. It goes to confirmed
 * subscribers and customers who allow offers by email, once per address.
 */
const EMPTY: NewsletterDraft = { subject_en: '', subject_dv: '', body_en: '', body_dv: '', header_image_url: '', sections: { new: true, new_days: 14 }, removed_item_ids: [] };

const chip = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
  color: active ? 'var(--color-on-primary)' : 'var(--color-text-secondary)', whiteSpace: 'nowrap',
});

const textarea: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid var(--color-border)',
  background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14, fontFamily: 'inherit',
};

function Preview({ id, refreshKey }: { id: number; refreshKey: number }) {
  const [locale, setLocale] = useState<'en' | 'dv'>('en');
  const [phone, setPhone] = useState(true);
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    let url = '';
    fetchNewsletterPreview(id, locale).then((b) => { url = URL.createObjectURL(b); if (live) setSrc(url); }).catch(() => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id, locale, refreshKey]);
  return (
    <div>
      <TabScrollRow fit style={{ gap: 6, marginBottom: 8 }} aria-label="Preview">
        <button type="button" style={chip(locale === 'en')} onClick={() => setLocale('en')}>English</button>
        <button type="button" style={chip(locale === 'dv')} onClick={() => setLocale('dv')}>Dhivehi</button>
        <button type="button" style={chip(phone)} onClick={() => setPhone(true)}>Phone</button>
        <button type="button" style={chip(!phone)} onClick={() => setPhone(false)}>Computer</button>
      </TabScrollRow>
      <div style={{ width: '100%', maxWidth: phone ? 390 : 680, border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg)' }}>
        {src && <iframe title="Newsletter preview" src={src} sandbox="" style={{ width: '100%', height: 640, border: 0, display: 'block' }} />}
      </div>
    </div>
  );
}

function Editor({ id, onBack }: { id: number | null; onBack: () => void }) {
  const [issueId, setIssueId] = useState<number | null>(id);
  const [issue, setIssue] = useState<NewsletterIssue | null>(null);
  const [draft, setDraft] = useState<NewsletterDraft>(EMPTY);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { state: dlg, ask, close } = useConfirmDialog();

  const take = (i: NewsletterIssue) => {
    setIssue(i);
    setDraft({ subject_en: i.subject_en, subject_dv: i.subject_dv ?? '', body_en: i.body_en ?? '', body_dv: i.body_dv ?? '', header_image_url: i.header_image_url ?? '', sections: i.sections ?? {}, removed_item_ids: i.removed_item_ids ?? [] });
  };
  useEffect(() => { if (issueId) fetchNewsletterIssue(issueId).then((r) => take(r.issue)).catch((e: Error) => setMsg({ ok: false, text: e.message })); }, [issueId]);
  useEffect(() => { fetchPromotions({ status: 'active' }).then((r) => setPromos(r.data ?? [])).catch(() => {}); }, []);

  const draftOnly = !issue || issue.status === 'draft';
  const set = <K extends keyof NewsletterDraft>(k: K, v: NewsletterDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setSection = (patch: Partial<NewsletterDraft['sections']>) => setDraft((d) => ({ ...d, sections: { ...d.sections, ...patch } }));

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setMsg(null);
    try { const text = await fn(); if (text) setMsg({ ok: true, text }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const r = await saveNewsletterIssue(issueId, { ...draft, header_image_url: draft.header_image_url || null });
    take(r.issue); setIssueId(r.issue.id); setRefreshKey((k) => k + 1);
    return 'Saved.';
  });
  const remove = (dishId: number) => set('removed_item_ids', [...draft.removed_item_ids, dishId]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div><Btn small variant="secondary" onClick={onBack}>Back to newsletters</Btn></div>
      <Card>
        <div style={{ display: 'grid', gap: 10 }}>
          <Input label="Subject (English)" value={draft.subject_en} maxLength={150} disabled={!draftOnly} onChange={(v) => set('subject_en', v)} />
          <Input label="Subject (Dhivehi)" value={draft.subject_dv ?? ''} maxLength={150} dir="rtl" disabled={!draftOnly} onChange={(v) => set('subject_dv', v)} />
          <label style={{ fontSize: 13, fontWeight: 600 }}>Message (English)
            <textarea style={{ ...textarea, marginTop: 4 }} rows={4} value={draft.body_en ?? ''} disabled={!draftOnly} onChange={(e) => set('body_en', e.target.value)} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Message (Dhivehi)
            <textarea style={{ ...textarea, marginTop: 4 }} dir="rtl" rows={4} value={draft.body_dv ?? ''} disabled={!draftOnly} onChange={(e) => set('body_dv', e.target.value)} />
          </label>
          <Input label="Header picture (link to an image)" value={draft.header_image_url ?? ''} disabled={!draftOnly} onChange={(v) => set('header_image_url', v)} placeholder="https://…" />
          <fieldset disabled={!draftOnly} style={{ border: '1px solid var(--color-border-light)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            <legend style={{ fontSize: 13, fontWeight: 700 }}>What it shows</legend>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={Boolean(draft.sections.new)} onChange={(e) => setSection({ new: e.target.checked })} />
              New on the menu, added in the last
              <input type="number" min={1} max={90} value={draft.sections.new_days ?? 14} onChange={(e) => setSection({ new_days: Number(e.target.value) || 14 })} style={{ width: 64, minHeight: 32, borderRadius: 8, border: '1px solid var(--color-border)', padding: '0 6px', background: 'var(--color-surface)', color: 'var(--color-text)' }} aria-label="Days" />
              days
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={Boolean(draft.sections.specials)} onChange={(e) => setSection({ specials: e.target.checked })} /> Daily specials
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={Boolean(draft.sections.coming)} onChange={(e) => setSection({ coming: e.target.checked })} /> Coming soon
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
              An offer
              <select value={draft.sections.offer_id ?? ''} onChange={(e) => setSection({ offer_id: e.target.value ? Number(e.target.value) : null })} style={{ minHeight: 36, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', padding: '0 8px' }} aria-label="Offer">
                <option value="">None</option>
                {promos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </fieldset>
          {issue && (issue.picks.new.length > 0 || issue.picks.coming.length > 0) && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>Dishes picked (remove any, then Save)</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[...issue.picks.new, ...issue.picks.coming].filter((d) => !draft.removed_item_ids.includes(d.id)).map((d) => (
                  <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 10px', borderRadius: 999, background: 'var(--color-tone-brown-bg)', color: 'var(--color-tone-brown-text)', fontSize: 13 }}>
                    {d.name}
                    {draftOnly && <Btn small variant="danger-outline" onClick={() => remove(d.id)} aria-label={`Remove ${d.name}`}>Remove</Btn>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {msg && <p role="status" style={{ margin: 0, fontSize: 13, color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{msg.text}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {draftOnly && <Btn onClick={() => void save()} disabled={busy || draft.subject_en.trim() === ''}>Save</Btn>}
          </div>
        </div>
      </Card>

      {issueId && (
        <Card>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Preview</h3>
          <Preview id={issueId} refreshKey={refreshKey} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}><Input label="Send a test to" type="email" value={testTo} onChange={(v) => setTestTo(v)} placeholder="you@example.com" /></div>
            <Btn variant="secondary" disabled={busy || !testTo.includes('@')} onClick={() => void run(async () => (await sendNewsletterTest(issueId, testTo, 'en')).message)}>Send test</Btn>
            <Btn variant="secondary" disabled={busy || !testTo.includes('@')} onClick={() => void run(async () => (await sendNewsletterTest(issueId, testTo, 'dv')).message)}>Send Dhivehi test</Btn>
          </div>
          {issue?.status === 'draft' && (
            <div style={{ marginTop: 16 }}>
              <Btn variant="danger" disabled={busy} onClick={() => ask({
                title: 'Send the newsletter',
                message: 'It goes now to every confirmed subscriber and every customer who allows offers by email. The dishes are fixed as they are.',
                confirmLabel: 'Send now',
                danger: true,
                onConfirm: () => void run(async () => { const r = await sendNewsletter(issueId); fetchNewsletterIssue(issueId).then((x) => take(x.issue)); return r.message; }),
              })}>Send newsletter</Btn>
            </div>
          )}
          {issue && issue.status !== 'draft' && (
            <p style={{ marginTop: 12, fontSize: 13 }}>
              Sent {issue.counts.sent} · waiting {issue.counts.pending} · failed {issue.counts.failed}{issue.counts.bounced ? ` · bounced ${issue.counts.bounced}` : ''}
              {issue.counts.failed > 0 && <> <Btn small variant="secondary" disabled={busy} onClick={() => void run(async () => `${(await retryNewsletter(issueId)).queued} queued again.`)}>Retry failed</Btn></>}
            </p>
          )}
        </Card>
      )}
      <ConfirmDialog state={dlg} close={close} />
    </div>
  );
}

function Subscribers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<NewsletterSubscriberRow[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  useEffect(() => { fetchNewsletterSubscribers(q, page).then((r) => { setRows(r.data); setMeta(r.meta); }).catch(() => {}); }, [q, page]);
  const download = async () => {
    const blob = await downloadNewsletterSubscribers();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'newsletter-subscribers.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}><Input label="Search" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Email" /></div>
        <Btn variant="secondary" onClick={() => void download()}>Download CSV</Btn>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{meta.total} addresses</p>
      {rows.length === 0 ? <EmptyState message="No subscribers yet." /> : (
        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: 'start' }}>Email</th><th>Language</th><th>From</th><th>Confirmed</th><th>Stopped</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td><td>{r.locale}</td><td>{r.source}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString() : 'Not yet'}</td>
                  <td style={{ whiteSpace: 'nowrap' }} title={r.bounce_reason ?? undefined}>
                    {r.unsubscribed_at ? new Date(r.unsubscribed_at).toLocaleDateString()
                      : r.bounced_at ? `Bounced ${new Date(r.bounced_at).toLocaleDateString()}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />
    </Card>
  );
}

export default function NewsletterPage() {
  usePageTitle('Newsletter');
  const [view, setView] = useState<'issues' | 'subscribers'>('issues');
  const [editing, setEditing] = useState<number | null | 'new'>(null);
  const [issues, setIssues] = useState<NewsletterIssueSummary[]>([]);
  const [audience, setAudience] = useState(0);
  const load = () => fetchNewsletterIssues().then((r) => { setIssues(r.issues); setAudience(r.audience); }).catch(() => {});
  useEffect(() => { void load(); }, []);

  if (editing !== null) {
    return <Editor id={editing === 'new' ? null : editing} onBack={() => { setEditing(null); void load(); }} />;
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <TabScrollRow fit style={{ gap: 6 }} role="tablist" aria-label="Newsletter">
        <button type="button" role="tab" aria-selected={view === 'issues'} style={chip(view === 'issues')} onClick={() => setView('issues')}>Newsletters</button>
        <button type="button" role="tab" aria-selected={view === 'subscribers'} style={chip(view === 'subscribers')} onClick={() => setView('subscribers')}>Subscribers</button>
      </TabScrollRow>
      {view === 'subscribers' ? <Subscribers /> : (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {audience} confirmed subscribers, plus customers who allow offers by email. Sign-up is on the website's footer.
            </p>
            <Btn onClick={() => setEditing('new')}>New newsletter</Btn>
          </div>
          {issues.length === 0 ? <EmptyState message="No newsletters yet." /> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {issues.map((i) => (
                <button key={i.id} type="button" onClick={() => setEditing(i.id)} data-testid={`newsletter-${i.id}`}
                  style={{ textAlign: 'start', padding: 12, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <strong>{i.subject_en}</strong>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {i.status === 'draft' ? 'Draft' : i.status === 'sending' ? 'Sending' : `Sent ${i.sent_at ? new Date(i.sent_at).toLocaleDateString() : ''}`}
                    {i.status !== 'draft' && ` · ${i.counts.sent} sent${i.counts.failed ? ` · ${i.counts.failed} failed` : ''}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
