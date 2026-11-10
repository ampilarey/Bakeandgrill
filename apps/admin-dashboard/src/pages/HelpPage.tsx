import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronDown, Search } from 'lucide-react';
import { Btn, Card, EmptyState, PageHeader, PageShell } from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { canNavItem, getAllNavItems, getNavItemGroupLabel, navItemPathname, type NavItem } from '../components/navConfig';
import { GUIDES, searchGuides, type Guide } from '../help/guides';
import { inputFont } from '../utils/cssVars';

/*
 * Help (owner, 2026-11-10: "lots of different features that I don't know how to use"): short
 * "How do I…" guides, searched by a few words, grouped by the page they belong to. A guide shows
 * only to someone who may open its page. `?page=/promotions` (the "?" in the top bar) shows that
 * page's guides first; `?guide=<id>` opens one. Phone first: one column, guides fold open.
 */

function navItemFor(page: string, items: NavItem[]): NavItem | undefined {
  return items.find((i) => navItemPathname(i.to) === page);
}

function GuideCard({ guide, item, open, onToggle }: { guide: Guide; item: NavItem | undefined; open: boolean; onToggle: () => void }) {
  const target = guide.open ?? { to: guide.page, label: `Open ${item?.label ?? 'the page'}` };
  return (
    <div data-testid={`guide-${guide.id}`} style={{ border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-surface)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text)', fontFamily: 'inherit',
        }}
      >
        <span style={{ flex: '1 1 auto', minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{guide.title}</span>
          {guide.about && !open && (
            <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{guide.about}</span>
          )}
        </span>
        <ChevronDown size={16} aria-hidden style={{ flex: '0 0 auto', color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          {guide.about && <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{guide.about}</p>}
          <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, lineHeight: 1.5, color: 'var(--color-text)' }}>
            {guide.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          {guide.notes && guide.notes.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border-light)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>Good to know</p>
              <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                {guide.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Link to={target.to} style={{ textDecoration: 'none' }} data-testid={`guide-open-${guide.id}`}>
              <Btn small>{target.label} <ArrowRight size={14} aria-hidden /></Btn>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  usePageTitle('Help');
  const { user } = useCurrentUserPermissions();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const page = params.get('page');
  const wanted = params.get('guide');
  const [openId, setOpenId] = useState<string | null>(wanted);

  const items = useMemo(() => getAllNavItems(), []);
  // Only the guides of pages this person may open.
  const mine = useMemo(
    () => GUIDES.filter((g) => {
      const item = navItemFor(g.page, items);
      return item !== undefined && user !== null && canNavItem(user, item);
    }),
    [items, user],
  );

  const found = useMemo(() => searchGuides(query, mine), [query, mine]);
  const pageItem = page ? navItemFor(page, items) : undefined;
  const forPage = page && !query ? found.filter((g) => g.page === page) : [];
  const rest = page && !query ? found.filter((g) => g.page !== page) : found;

  // Grouped by page, in the menu's order.
  const groups = useMemo(() => {
    const out: { item: NavItem; guides: Guide[] }[] = [];
    for (const item of items) {
      const guides = rest.filter((g) => g.page === navItemPathname(item.to));
      if (guides.length > 0) out.push({ item, guides });
    }
    return out;
  }, [items, rest]);

  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <PageShell>
      <PageHeader section="Team" title="Help" subtitle="Short guides: how to do one thing, step by step." />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', marginBottom: 14, border: '1.5px solid var(--color-border)', borderRadius: 12, background: 'var(--color-surface)' }}>
        <Search size={16} aria-hidden style={{ color: 'var(--color-text-muted)', flex: '0 0 auto' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to do? e.g. discount, sold out, QR"
          aria-label="Search the guides"
          data-testid="help-search"
          style={inputFont({ flex: '1 1 auto', minWidth: 0, minHeight: 44, border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontFamily: 'inherit', fontSize: 14 })}
        />
      </label>

      {page && !query && (
        <section data-testid="help-for-page" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--color-text)' }}>On {pageItem?.label ?? 'this page'}</h2>
            <button
              type="button"
              onClick={() => { params.delete('page'); setParams(params, { replace: true }); }}
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}
            >
              Show all guides
            </button>
          </div>
          {forPage.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {forPage.map((g) => <GuideCard key={g.id} guide={g} item={pageItem} open={openId === g.id} onToggle={() => toggle(g.id)} />)}
            </div>
          ) : (
            <Card><p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>No guide for this page yet. The guides for other pages are below.</p></Card>
          )}
        </section>
      )}

      {groups.length === 0 && forPage.length === 0 ? (
        <Card>
          <EmptyState message={query ? `No guide matches "${query}". Try one or two plain words.` : 'No guides for the pages you can open yet.'} />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map(({ item, guides }) => (
            <section key={item.to} data-testid={`help-group-${navItemPathname(item.to)}`}>
              <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: 'var(--color-text-secondary)' }}>
                {getNavItemGroupLabel(item.to)} <span aria-hidden>›</span> {item.label}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {guides.map((g) => <GuideCard key={g.id} guide={g} item={item} open={openId === g.id} onToggle={() => toggle(g.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
