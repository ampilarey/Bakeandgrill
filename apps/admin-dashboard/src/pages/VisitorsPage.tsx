import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Clock, Database, Eye, MousePointerClick, Repeat, Undo2, Users, Layers } from 'lucide-react';
import { deleteVisitDetail, fetchSiteAnalytics, setVisitRetention, type SiteAnalytics, type VisitCount, type VisitStorage, type VisitSurface, type VisitTotals } from '../api';
import { Btn, Card, ConfirmDialog, DateInput, EmptyState, ErrorMsg, InlineIcon, PageHeader, PageShell, Select, Spinner, StatCard, Switch, TabScrollRow, TableCard, TD, TD_NOWRAP, TH, useConfirmDialog } from '../components/SharedUI';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { usePageTitle } from '../hooks/usePageTitle';

/*
 * Website visitors (owner, 2026-10-24: "Add maximum detail u can get"). Every
 * page of the website and the order app sends a beacon with the page, where the
 * visitor came from, the campaign, the screen and language, and the seconds on
 * screen as they leave; the server adds the device, browser, system and country
 * and keeps no IP address (SiteVisitCounter, SiteAnalytics). This page reads it
 * all: totals against the period before, the daily trend, the busiest hours,
 * the pages, where visits come in and leave, the sources and campaigns, the
 * devices and countries, the way to an order, and the latest views live.
 */

const PERIODS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: '1 year' },
  // Everything stored: kept for ever unless a time is set below.
  { days: 3660, label: 'All' },
] as const;

const SURFACES: { value: VisitSurface; label: string }[] = [
  { value: 'all', label: 'Both' },
  { value: 'web', label: 'Website' },
  { value: 'order', label: 'Order app' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const NO_TRACK_KEY = 'bg_no_track';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Seconds as "1m 05s", "42s". */
export function duration(s: number): string {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

/** A page's address in words, the address beneath. */
export function pageName(path: string): string {
  const known: Record<string, string> = {
    '/': 'Website home', '/menu': 'Website menu', '/offers': 'Offers', '/hours': 'Opening hours', '/contact': 'Contact',
    '/privacy': 'Privacy', '/terms': 'Terms', '/refund': 'Refund policy', '/prayer-times': 'Prayer times',
    '/order': 'Order app home', '/order/menu': 'Order app menu', '/order/checkout': 'Checkout', '/order/orders/:id': 'Order placed (order page)',
    '/order/track/:token': 'Order tracking link', '/order/account': 'Account', '/order/rewards': 'Rewards', '/order/order-history': 'Order history',
    '/order/gift-cards': 'Gift cards', '/order/catering': 'Catering', '/order/events': 'Events', '/order/reservations': 'Reservations',
  };
  if (known[path]) return known[path];
  if (path.startsWith('/dv')) return `${pageName(path.slice(3) || '/')} (Dhivehi)`;
  if (path.startsWith('/menu/c/')) return `Menu: ${path.slice(8).replace(/-/g, ' ')}`;
  if (path.startsWith('/menu/')) return `Dish: ${path.slice(6).replace(/-/g, ' ')}`;
  return path;
}

let countryNames: Intl.DisplayNames | null = null;
function countryName(code: string | null): string {
  if (!code) return 'Unknown';
  try {
    countryNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

let languageNames: Intl.DisplayNames | null = null;
function languageName(code: string | null): string {
  if (!code) return 'Unknown';
  if (code.startsWith('dv')) return 'Dhivehi';
  try {
    languageNames ??= new Intl.DisplayNames(['en'], { type: 'language' });
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}

const DEVICE_NAMES: Record<string, string> = { mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer' };
const APP_NAMES: Record<string, string> = { web: 'Website', order: 'Order app' };

/** The change against the period before, as a StatCard trend. Lower is better for the bounce rate. */
function trend(now: number, before: number, lowerIsBetter = false): { value: string; positive?: boolean } | undefined {
  if (!before) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { value: '0%' };
  return { value: `${pct > 0 ? '+' : ''}${pct}%`, positive: lowerIsBetter ? pct < 0 : pct > 0 };
}

function readNoTrack(): boolean {
  try { return localStorage.getItem(NO_TRACK_KEY) === '1'; } catch { return false; }
}

export default function VisitorsPage() {
  usePageTitle('Website visitors');
  const [days, setDays] = useState<number>(7);
  const [surface, setSurface] = useState<VisitSurface>('all');
  const [data, setData] = useState<SiteAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [noTrack, setNoTrack] = useState(readNoTrack);

  useEffect(() => {
    let live = true;
    fetchSiteAnalytics({ days, surface })
      .then((r) => { if (live) { setData(r); setError(null); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load the visitors.'); });
    return () => { live = false; };
  }, [days, surface, tick]);

  // The live count and the feed refresh every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const toggleNoTrack = (on: boolean) => {
    try { if (on) localStorage.setItem(NO_TRACK_KEY, '1'); else localStorage.removeItem(NO_TRACK_KEY); } catch { /* private window */ }
    setNoTrack(on);
  };

  return (
    <PageShell>
      <PageHeader title="Website visitors" subtitle="Who visits the website and the order app: pages, sources, devices, countries, time spent and the way to an order. No IP address is kept." />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <TabScrollRow role="group" aria-label="Period" style={{ gap: 6 }}>
          {PERIODS.map((p) => (
            <Btn key={p.days} small variant={days === p.days ? 'primary' : 'secondary'} aria-pressed={days === p.days} onClick={() => setDays(p.days)}>{p.label}</Btn>
          ))}
        </TabScrollRow>
        <TabScrollRow role="group" aria-label="App" style={{ gap: 6 }}>
          {SURFACES.map((s) => (
            <Btn key={s.value} small variant={surface === s.value ? 'primary' : 'secondary'} aria-pressed={surface === s.value} onClick={() => setSurface(s.value)}>{s.label}</Btn>
          ))}
        </TabScrollRow>
      </div>

      {error && <ErrorMsg message={error} />}
      {!data && !error && <Spinner />}
      {data && <Report data={data} />}

      {data?.storage && <StorageCard storage={data.storage} onChanged={() => setTick((n) => n + 1)} />}

      <Card style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <Switch checked={noTrack} onChange={toggleNoTrack} aria-label="Don't count this device" data-testid="visitors-no-track" />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Don&apos;t count this device</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>For the till, the kitchen screen and staff phones, so your own visits stay out of the numbers. It applies to this browser on this device.</span>
          </span>
        </label>
      </Card>
    </PageShell>
  );
}

function Report({ data }: { data: SiteAnalytics }) {
  const t = data.totals;
  const p = data.previous;
  if (t.views === 0 && data.live.visitors === 0 && data.recent.length === 0) {
    return <EmptyState message="No visits recorded yet for this period. Visits are counted from the day this page was added." />;
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <LiveNow data={data} />
      <Totals t={t} p={p} days={data.range.days} busiest={busiestDay(data.daily)} />
      <Section title="Visitors by day" hint="Each bar is one day's visitors; hold a bar to read it.">
        <DailyBars daily={data.daily} />
      </Section>
      <Section title="Busiest hours" hint="Page views by day of the week and hour, Maldives time. Darker is busier.">
        <HourGrid hours={data.hours} />
      </Section>
      <Section title="The way to an order" hint="Visits that reached each step in this period.">
        <Funnel funnel={data.funnel} />
      </Section>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
        <Section title="Pages" hint="Views, visitors and the average time on the page.">
          <BarList rows={data.pages.map((r) => ({ label: pageName(r.path), detail: r.path, value: r.views, extra: `${fmt(r.visitors)} visitors · ${duration(r.avg_s)}` }))} unit="views" />
        </Section>
        <Section title="Where they came from" hint="The site that sent each visit; apps such as WhatsApp and Viber send none, so they count as direct.">
          <BarList rows={data.sources.map((r) => ({ label: r.name, detail: r.hosts.slice(0, 3).join(', ') || undefined, value: r.sessions }))} unit="visits" />
        </Section>
        <Section title="Came in on" hint="The first page of each visit.">
          <BarList rows={data.entries.map((r) => ({ label: pageName(r.path), detail: r.path, value: r.sessions }))} unit="visits" />
        </Section>
        <Section title="Left from" hint="The last page of each visit.">
          <BarList rows={data.exits.map((r) => ({ label: pageName(r.path), detail: r.path, value: r.sessions }))} unit="visits" />
        </Section>
        <Section title="Campaigns" hint="Links tagged with utm_source, utm_medium and utm_campaign, and Social Hub posts.">
          {data.campaigns.length === 0
            ? <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>No tagged links yet. Add ?utm_source=facebook&amp;utm_campaign=ramadan to a link you share to see it here.</p>
            : <BarList rows={data.campaigns.map((r) => ({ label: r.campaign ?? r.source ?? 'Untitled', detail: [r.source, r.medium].filter(Boolean).join(' · ') || undefined, value: r.sessions }))} unit="visits" />}
        </Section>
        <Section title="Countries" hint="From the visitor's connection; unknown when the site is not behind Cloudflare.">
          <BarList rows={countRows(data.countries, countryName)} unit="visitors" />
        </Section>
        <Section title="Devices">
          <BarList rows={countRows(data.devices, (n) => DEVICE_NAMES[n ?? ''] ?? n ?? 'Unknown')} unit="visitors" />
        </Section>
        <Section title="Screen sizes">
          <BarList rows={data.screens.map((r) => ({ label: r.name, value: r.visitors }))} unit="visitors" />
        </Section>
        <Section title="Browsers and apps" hint="An app's own browser (Facebook, Instagram…) says where the link was tapped.">
          <BarList rows={countRows(data.browsers, (n) => n ?? 'Unknown')} unit="visitors" />
        </Section>
        <Section title="Systems">
          <BarList rows={countRows(data.systems, (n) => n ?? 'Unknown')} unit="visitors" />
        </Section>
        <Section title="Languages" hint="The language the visitor's phone or computer is set to.">
          <BarList rows={countRows(data.languages, languageName)} unit="visitors" />
        </Section>
        <Section title="Website or order app" hint="Both apps, whatever is picked above.">
          <BarList rows={countRows(data.apps, (n) => APP_NAMES[n ?? ''] ?? n ?? 'Unknown')} unit="visitors" />
        </Section>
      </div>
      <Section title="Latest views" hint="The newest 40 page views; the same tag is the same visit. Refreshes every 30 seconds.">
        <RecentTable rows={data.recent} />
      </Section>
    </div>
  );
}

function countRows(rows: VisitCount[], name: (n: string | null) => string) {
  return rows.map((r) => ({ label: name(r.name), value: r.visitors, extra: `${fmt(r.views)} views` }));
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card style={{ minWidth: 0 }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 800, color: 'var(--color-text)' }}>{title}</h2>
      {hint && <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--color-text-muted)' }}>{hint}</p>}
      {!hint && <div style={{ height: 8 }} />}
      {children}
    </Card>
  );
}

function LiveNow({ data }: { data: SiteAnalytics }) {
  return (
    <Card data-testid="visitors-live" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: data.live.visitors > 0 ? 'var(--color-success)' : 'var(--color-border)', boxShadow: data.live.visitors > 0 ? '0 0 0 4px color-mix(in srgb, var(--color-success) 25%, transparent)' : 'none' }} />
        {fmt(data.live.visitors)} {data.live.visitors === 1 ? 'person' : 'people'} on the site now
      </span>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>in the last 5 minutes{data.live.pages.length > 0 ? ': ' : ''}{data.live.pages.map((p) => `${pageName(p.path)} (${p.visitors})`).join(', ')}</span>
    </Card>
  );
}

function Totals({ t, p, days, busiest }: { t: VisitTotals; p: VisitTotals; days: number; busiest: string }) {
  const vs = days === 1 ? 'vs yesterday' : `vs the ${days} days before`;
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }} data-testid="visitors-totals">
      <StatCard label="Visitors" value={fmt(t.visitors)} icon={Users} trend={trend(t.visitors, p.visitors)} sub={vs} />
      <StatCard label="Visits" value={fmt(t.sessions)} icon={MousePointerClick} trend={trend(t.sessions, p.sessions)} sub="one visit per open tab" />
      <StatCard label="Page views" value={fmt(t.views)} icon={Eye} trend={trend(t.views, p.views)} />
      <StatCard label="Pages per visit" value={String(t.pages_per_session)} icon={Layers} trend={trend(t.pages_per_session, p.pages_per_session)} />
      <StatCard label="Average visit" value={duration(t.avg_session_s)} icon={Clock} trend={trend(t.avg_session_s, p.avg_session_s)} sub={`${duration(t.avg_view_s)} a page`} />
      <StatCard label="Left after one page" value={`${t.bounce_rate}%`} icon={Undo2} trend={trend(t.bounce_rate, p.bounce_rate, true)} sub="lower is better" />
      <StatCard label="Came back" value={`${t.returning_rate}%`} icon={Repeat} trend={trend(t.returning_rate, p.returning_rate)} sub="visited on an earlier day" />
      <StatCard label="Busiest day" value={busiest} icon={Activity} />
    </div>
  );
}

/** The day with the most visitors, as "Fri 24 Oct". */
export function busiestDay(daily: SiteAnalytics['daily']): string {
  const top = daily.reduce<SiteAnalytics['daily'][number] | null>((a, b) => (a === null || b.visitors > a.visitors ? b : a), null);
  return top && top.visitors > 0 ? new Date(`${top.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
}

function DailyBars({ daily }: { daily: SiteAnalytics['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.visitors));
  const labelEvery = Math.max(1, Math.ceil(daily.length / 7));
  return (
    <div data-testid="visitors-daily">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: daily.length > 60 ? 1 : 3, height: 140 }}>
        {daily.map((d) => (
          <div key={d.date} title={`${d.date}: ${fmt(d.visitors)} visitors, ${fmt(d.sessions)} visits, ${fmt(d.views)} views`}
            style={{ flex: '1 1 0', minWidth: 0, height: `${Math.max(2, (d.visitors / max) * 100)}%`, background: d.visitors > 0 ? 'var(--color-primary)' : 'var(--color-border-light)', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: daily.length > 60 ? 1 : 3, marginTop: 4 }}>
        {daily.map((d, i) => (
          <span key={d.date} style={{ flex: '1 1 0', minWidth: 0, fontSize: 10, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'visible' }}>
            {i % labelEvery === 0 ? new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function HourGrid({ hours }: { hours: number[][] }) {
  const max = Math.max(1, ...hours.flat());
  // Monday first, as the week is read.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div data-testid="visitors-hours" style={{ display: 'grid', gridTemplateColumns: '30px repeat(24, minmax(0, 1fr))', gap: 2, alignItems: 'center', maxWidth: 640 }}>
      <span />
      {Array.from({ length: 24 }, (_, h) => (
        <span key={h} style={{ fontSize: 9, color: 'var(--color-text-muted)', textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</span>
      ))}
      {order.map((d) => (
        <RowCells key={d} label={DAYS[d]} cells={hours[d] ?? []} max={max} />
      ))}
    </div>
  );
}

function RowCells({ label, cells, max }: { label: string; cells: number[]; max: number }) {
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</span>
      {Array.from({ length: 24 }, (_, h) => {
        const n = cells[h] ?? 0;
        const pct = n === 0 ? 0 : Math.round(15 + (n / max) * 85);
        return (
          <span key={h} title={`${label} ${String(h).padStart(2, '0')}:00 · ${fmt(n)} views`}
            style={{ aspectRatio: '1', borderRadius: 3, background: n === 0 ? 'var(--color-border-light)' : `color-mix(in srgb, var(--color-primary) ${pct}%, transparent)` }} />
        );
      })}
    </>
  );
}

function Funnel({ funnel }: { funnel: SiteAnalytics['funnel'] }) {
  const base = Math.max(1, funnel[0]?.sessions ?? 0);
  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="visitors-funnel">
      {funnel.map((s) => {
        const pct = Math.round((s.sessions / base) * 1000) / 10;
        return (
          <div key={s.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>{fmt(s.sessions)} · {pct}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 99, background: 'var(--color-border-light)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-primary)', borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type BarRow = { label: string; detail?: string; value: number; extra?: string };

function BarList({ rows, unit }: { rows: BarRow[]; unit: string }) {
  const [all, setAll] = useState(false);
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r.value)), [rows]);
  if (rows.length === 0) return <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing yet.</p>;
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {shown.map((r, i) => (
        <div key={`${r.label}-${i}`} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', padding: '6px 8px' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, width: `${(r.value / max) * 100}%`, background: 'var(--color-tone-rust-bg)' }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflowWrap: 'anywhere' }}>{r.label}</span>
              {(r.detail && r.detail !== r.label) || r.extra ? (
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>{[r.detail !== r.label ? r.detail : null, r.extra].filter(Boolean).join(' · ')}</span>
              ) : null}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }} title={unit}>{fmt(r.value)}</span>
          </div>
        </div>
      ))}
      {rows.length > 8 && (
        <Btn small variant="ghost" onClick={() => setAll((a) => !a)} style={{ justifySelf: 'start' }}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Btn>
      )}
    </div>
  );
}

function RecentTable({ rows }: { rows: SiteAnalytics['recent'] }) {
  if (rows.length === 0) return <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>Nothing yet.</p>;
  return (
    <TableCard>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={TH}>Time</th>
            <th style={TH}>Visit</th>
            <th style={TH}>Page</th>
            <th style={TH}>Came from</th>
            <th style={TH}>Device</th>
            <th style={TH}>Country</th>
            <th style={TH}>Time on page</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.at}-${i}`}>
              <td style={TD_NOWRAP}>{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td style={TD_NOWRAP}>#{r.visit}{r.returning ? ' · back again' : ''}</td>
              <td style={TD}>{pageName(r.path)}<span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>{APP_NAMES[r.surface]} · {r.path}</span></td>
              <td style={TD}>{r.source ?? '—'}</td>
              <td style={TD}>{DEVICE_NAMES[r.device] ?? r.device} · {r.browser} · {r.os}</td>
              <td style={TD}>{countryName(r.country)}</td>
              <td style={TD_NOWRAP}>{r.duration_s === null ? '—' : duration(r.duration_s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

const KEEP_NAMES: Record<number, string> = { 0: 'Never: keep everything', 90: 'After 3 months', 180: 'After 6 months', 365: 'After 1 year', 730: 'After 2 years' };

const megabytes = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toLocaleString('en-US')} MB`);

/**
 * How much visit detail is stored, and the owner's two ways to trim it
 * (owner, 2026-10-24: "When data is large add manual del or auto del settings
 * in the admin"): delete automatically after a set time (visits:prune, each
 * night), or delete everything before a date now. Kept for ever by default.
 * The daily totals on the Dashboard are never deleted. The controls need
 * settings.update; anyone who can read the report sees the size.
 */
export function StorageCard({ storage, onChanged }: { storage: VisitStorage; onChanged: () => void }) {
  const canChange = useCurrentUserPermissions().can('settings.update');
  const [keep, setKeep] = useState(storage.keep_days);
  const [before, setBefore] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { state: dlg, ask, close } = useConfirmDialog();
  useEffect(() => { setKeep(storage.keep_days); }, [storage.keep_days]);

  const saveKeep = async (days: number) => {
    setKeep(days); setBusy(true); setNote(null);
    try {
      await setVisitRetention(days);
      setNote(days === 0 ? 'Visit details are kept for ever.' : `Details older than ${KEEP_NAMES[days].replace('After ', '').toLowerCase()} are deleted each night from now on.`);
      onChanged();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not save.');
      setKeep(storage.keep_days);
    } finally { setBusy(false); }
  };

  const deleteNow = () => {
    if (!before) return;
    const when = new Date(`${before}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    ask({
      title: 'Delete visit details?',
      message: `Every page view before ${when} is deleted for good: pages, sources, devices and countries for those days. The daily visitor totals on the Dashboard stay.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusy(true); setNote(null);
        try {
          const r = await deleteVisitDetail(before);
          setNote(`Deleted ${r.deleted.toLocaleString('en-US')} page views from before ${when}.`);
          setBefore('');
          onChanged();
        } catch (e) {
          setNote(e instanceof Error ? e.message : 'Could not delete.');
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <Card style={{ marginTop: 16, ...(storage.large ? { borderColor: 'color-mix(in srgb, var(--color-warning) 45%, transparent)' } : {}) }} data-testid="visitors-storage">
      <h2 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}><InlineIcon icon={Database} /> Stored visit details</h2>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-secondary)' }} data-testid="visitors-storage-size">
        {storage.views.toLocaleString('en-US')} page views{storage.oldest ? ` since ${new Date(`${storage.oldest}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}, about {megabytes(storage.approx_mb)}. {storage.keep_days === 0 ? 'Kept for ever.' : `Deleted automatically ${KEEP_NAMES[storage.keep_days]?.toLowerCase() ?? `after ${storage.keep_days} days`}.`}
      </p>
      {storage.large && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-warning-strong)' }} data-testid="visitors-storage-large">
          This is getting large and makes the report slower. Delete older details below, or set them to go automatically.
        </p>
      )}
      {canChange ? (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'end' }}>
          <Select label="Delete automatically" value={String(keep)} disabled={busy} data-testid="visitors-keep"
            onChange={(v) => void saveKeep(Number(v))}
            options={storage.choices.map((d) => ({ value: String(d), label: KEEP_NAMES[d] ?? `After ${d} days` }))} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <DateInput label="Delete everything before" value={before} onChange={setBefore} max={new Date().toISOString().slice(0, 10)} />
            </div>
            <Btn variant="danger-outline" disabled={!before || busy} onClick={deleteNow} data-testid="visitors-delete">Delete</Btn>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>Someone who can change settings can delete older details here.</p>
      )}
      {note && <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>{note}</p>}
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>The daily visitor totals on the Dashboard are never deleted.</p>
      <ConfirmDialog state={dlg} close={close} />
    </Card>
  );
}
