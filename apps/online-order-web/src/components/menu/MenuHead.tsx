import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { ShareControl, type ShareControlProps } from '../ShareControl';
import { useLanguage } from '../../context/LanguageContext';
import { API_ORIGIN } from '../../api';
import { useTapOutside } from '../../hooks/useTapOutside';
import { useFold } from '../../hooks/useFold';

/** An uploaded path made absolute against the API's origin. */
export function menuImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** A section's banner colour when it has no photo, the same on the website. */
/**
 * From the brand's rust and browns only (owner, 2026-10-07: purple, blue and
 * green banners were picked from the category number). The website's $tint
 * uses the same six pairs.
 */
const TINTS: Array<[string, string]> = [
  ['#9A3F0A', '#4A220C'], ['#B74B0C', '#5E2A0E'], ['#8A4B1F', '#3E2412'],
  ['#A85A1E', '#4F2810'], ['#7C3A12', '#33190A'], ['#B0602A', '#5A2E12'],
];
export function menuTint(id: number): string {
  const [a, b] = TINTS[Math.abs(id) % TINTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}
export const FEATURED_TINT = 'linear-gradient(135deg, hsl(38 72% 48%) 0%, hsl(24 70% 34%) 100%)';

export type MenuHeadSub = { domId: string; name: string; count: number };
export type MenuHeadSection = {
  /** Stable key: "featured", "cat-12", "other", "events". */
  key: string;
  /** The section element on the page. */
  domId: string;
  name: string;
  count: number;
  image: string | null;
  /** Background when there is no photo. */
  tint: string;
  share?: ShareControlProps | null;
  /** Its sub-categories, in page order; buttons show when there are two or more. */
  subs: MenuHeadSub[];
};
export type MenuHeadHandle = {
  /** Switch the banner to the target at once, then glide the page there. */
  goTo: (domId: string, instant?: boolean) => void;
};

type Props = {
  sections: MenuHeadSection[];
  /** Search results replace the sections: the banner names them and the buttons step aside. */
  override?: { name: string; count: number } | null;
  onSectionChange?: (key: string) => void;
  searchOpen: boolean;
  /** A search or filter is on, so the search button stays lit. */
  searchActive: boolean;
  onSearchToggle: () => void;
  /** A tap or a scroll anywhere outside the open panel and its button closes it. */
  onSearchClose?: () => void;
  /** The search panel (box, sort, filters, layout), shown under the buttons. */
  children?: ReactNode;
};

type Active = { key: string | null; sub: string | null; dir: 1 | -1; instant: boolean };
type TitleLine = { id: number; text: string; cls: string };

const DUR = 320;

function reduceMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Height of the day / mode bar the banner pins under (MenuPage keeps it current). */
function stickyTop(): number {
  if (typeof document === 'undefined') return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--menu-sticky-offset')) || 0;
}

/**
 * Height of the button row under the banner. The row floats over the list
 * (it does not push it), so a section without sub-categories shows no empty
 * strip and the dishes never jump when the row comes or goes.
 */
function barHeight(head: HTMLElement): number {
  return parseFloat(getComputedStyle(head).getPropertyValue('--mh-bar-h')) || 0;
}

/** A section shows the button row when it has two or more sub-categories. */
function hasRow(section: MenuHeadSection | null | undefined): boolean {
  return !!section && section.subs.length > 1;
}

function itemsLabel(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

/**
 * The pinned menu banner (owner, 2026-10-07): "keep the main category in the
 * rail and sub category below the banner ... All the time banner and
 * subcategories shows in the screen", then "when switch to next sub category
 * and next category ... some animation like morphing".
 *
 * One banner for the whole menu, pinned under the day and mode bar. It shows
 * the section in view and its sub-categories as one row of buttons, and it
 * changes in place: the photo cross-fades and settles, the name rolls in the
 * direction of travel, the row slides over and a rust pill glides from button
 * to button. A tap switches everything to the target at once and the page
 * glides there; on arrival the label flashes and the first dishes rise. Every
 * move is transform or opacity, under a third of a second, and none of it
 * runs for someone who asked their device for less motion. The website menu
 * does the same in plain script (`menu.blade.php`).
 */
export const MenuHead = forwardRef<MenuHeadHandle, Props>(function MenuHead(
  { sections, override = null, onSectionChange, searchOpen, searchActive, onSearchToggle, onSearchClose, children },
  ref,
) {
  const { t } = useLanguage();
  const headRef = useRef<HTMLDivElement>(null);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Owner, 2026-10-07: "it should be hidden on any click outside the box",
  // and on a touch to scroll. What was typed stays, so the results do too.
  useTapOutside([searchBtnRef, panelRef], searchOpen && !!onSearchClose, () => onSearchClose?.());
  // It folds open and shut rather than appearing and vanishing at once.
  const panelShown = useFold(searchOpen, panelRef);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const allBtnRef = useRef<HTMLButtonElement>(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const lockRef = useRef<Element | null>(null);
  const lastY = useRef(typeof window !== 'undefined' ? window.scrollY : 0);
  const [active, setActive] = useState<Active>({ key: null, sub: null, dir: 1, instant: true });
  const activeRef = useRef(active);
  activeRef.current = active;

  const section = sections.find((s) => s.key === active.key) ?? sections[0] ?? null;

  const choose = useCallback((key: string, sub: string | null, dir: 1 | -1, instant: boolean) => {
    const cur = activeRef.current;
    if (cur.key === key && cur.sub === sub) return;
    const next: Active = { key, sub, dir, instant: instant || cur.key === null };
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    if (active.key) onSectionChange?.(active.key);
  }, [active.key, onSectionChange]);

  // ── Photo and name ───────────────────────────────────────────────────
  const [layers, setLayers] = useState<[string | null, string | null]>([null, null]);
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  const [titles, setTitles] = useState<TitleLine[]>([]);
  const titleSeq = useRef(0);
  const shown = override ?? (section ? { name: section.name, count: section.count } : null);
  const shownName = shown?.name ?? '';
  const shownImage = override ? null : section?.image ?? null;
  const [still, setStill] = useState(true);

  useLayoutEffect(() => {
    const quiet = active.instant || reduceMotion();
    setStill(quiet);
    const nf = 1 - frontRef.current;
    frontRef.current = nf;
    setFront(nf);
    setLayers((l) => {
      const copy: [string | null, string | null] = [l[0], l[1]];
      copy[nf] = shownImage;
      return copy;
    });
    const id = ++titleSeq.current;
    const d = active.dir < 0 ? 'down' : 'up';
    setTitles((prev) => [
      ...(quiet ? [] : prev.filter((p) => !p.cls.includes('is-out')).map((p) => ({ ...p, cls: `is-out is-out-${d}` }))),
      { id, text: shownName, cls: quiet ? '' : `is-in is-in-${d}` },
    ]);
    if (quiet) return undefined;
    const timer = window.setTimeout(() => {
      setTitles((prev) => prev.filter((p) => !p.cls.includes('is-out')));
    }, DUR + 20);
    return () => window.clearTimeout(timer);
    // The name and photo follow the section (or the results) in view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownName, shownImage]);

  // After an instant switch the next one animates again.
  useEffect(() => {
    if (!still || reduceMotion()) return undefined;
    const raf = window.requestAnimationFrame(() => setStill(false));
    return () => window.cancelAnimationFrame(raf);
  }, [still]);

  // ── Buttons ──────────────────────────────────────────────────────────
  const [leaving, setLeaving] = useState<{ key: string | null; left: boolean }>({ key: null, left: false });
  const prevKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (prevKey.current && prevKey.current !== active.key) {
      setLeaving({ key: prevKey.current, left: active.dir > 0 });
    }
    prevKey.current = active.key;
  }, [active.key, active.dir]);

  const fades = (row: HTMLElement) => {
    row.classList.toggle('fade-l', row.scrollLeft > 4);
    row.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  };

  const [allShown, setAllShown] = useState(false);
  const syncAll = useCallback(() => {
    const row = activeRef.current.key ? rowRefs.current.get(activeRef.current.key) : undefined;
    setAllShown(!!row && !override && row.scrollWidth > row.clientWidth + 2);
    if (row) fades(row);
  }, [override]);

  // The pill glides to the button for the sub-category in view, and the row
  // slides so that button sits in the middle.
  useLayoutEffect(() => {
    const row = active.key ? rowRefs.current.get(active.key) : undefined;
    syncAll();
    if (!row) return;
    const pill = row.querySelector<HTMLElement>('.mh-pill');
    const chip = active.sub
      ? Array.from(row.querySelectorAll<HTMLElement>('[data-target]')).find((c) => c.dataset.target === active.sub) ?? null
      : null;
    if (!pill) return;
    if (!chip) { pill.style.width = '0px'; return; }
    pill.style.width = `${chip.offsetWidth}px`;
    pill.style.transform = `translateX(${chip.offsetLeft}px)`;
    const left = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    if (typeof row.scrollTo === 'function') row.scrollTo({ left, behavior: active.instant || reduceMotion() ? 'auto' : 'smooth' });
  }, [active, syncAll, sections]);

  // ── Where are we ─────────────────────────────────────────────────────
  const spy = useCallback(() => {
    const y = window.scrollY;
    const dir: 1 | -1 = y >= lastY.current ? 1 : -1;
    lastY.current = y;
    // A tap is travelling: keep its target lit rather than flickering
    // through every button on the way.
    if (lockRef.current || override) return;
    const head = headRef.current;
    if (!head) return;
    const current = sectionsRef.current.find((x) => x.key === activeRef.current.key);
    const line = stickyTop() + head.offsetHeight + (hasRow(current) ? barHeight(head) : 0) + 12;
    const found = sectionsRef.current
      .map((s) => ({ s, el: document.getElementById(s.domId) }))
      .filter((x): x is { s: MenuHeadSection; el: HTMLElement } => x.el !== null);
    if (found.length === 0) return;
    let cur = found[0];
    for (const x of found) if (x.el.getBoundingClientRect().top <= line) cur = x;
    const subsOf = (s: MenuHeadSection) => s.subs
      .map((b) => document.getElementById(b.domId))
      .filter((el): el is HTMLElement => el !== null);
    let subs = subsOf(cur.s);
    let sub: HTMLElement | null = subs[0] ?? null;
    for (const el of subs) if (el.getBoundingClientRect().top <= line) sub = el;
    // The bottom of the page: the last sub-category may never reach the line.
    if (window.innerHeight + y >= document.documentElement.scrollHeight - 2 && y > 0) {
      cur = found[found.length - 1];
      subs = subsOf(cur.s);
      sub = subs[subs.length - 1] ?? null;
    }
    choose(cur.s.key, sub?.id ?? null, dir, false);
  }, [choose, override]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => { ticking = false; spy(); });
    };
    const onResize = () => { syncAll(); spy(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    spy();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [spy, syncAll, sections]);

  // The banner's height, for anchors that land under it.
  useEffect(() => {
    const head = headRef.current;
    if (!head) return undefined;
    const root = document.documentElement;
    const apply = () => root.style.setProperty('--menu-head-height', `${Math.ceil(head.getBoundingClientRect().height + barHeight(head))}px`);
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(head);
    return () => {
      ro?.disconnect();
      root.style.removeProperty('--menu-head-height');
    };
  }, []);

  // ── Going somewhere ──────────────────────────────────────────────────
  const goTo = useCallback((domId: string, instant = false) => {
    const el = document.getElementById(domId);
    const head = headRef.current;
    const sec = sectionsRef.current.find((s) => s.domId === domId || s.subs.some((b) => b.domId === domId));
    if (!el || !head || !sec) return;
    const under = hasRow(sec) ? barHeight(head) : 0;
    const line = stickyTop() + head.offsetHeight + under + 12;
    const dir: 1 | -1 = el.getBoundingClientRect().top > line ? 1 : -1;
    const quiet = instant || reduceMotion();
    choose(sec.key, sec.domId === domId ? (sec.subs[0]?.domId ?? null) : domId, dir, quiet);
    const y = Math.max(0, window.scrollY + el.getBoundingClientRect().top - stickyTop() - head.offsetHeight - under + 2);
    if (quiet) {
      window.scrollTo(0, y);
      lastY.current = window.scrollY;
      return;
    }
    lockRef.current = el;
    let timer = 0;
    const done = () => {
      window.removeEventListener('scrollend', done);
      window.clearTimeout(timer);
      if (lockRef.current !== el) return;
      lockRef.current = null;
      lastY.current = window.scrollY;
      const block = el.classList.contains('menu-subcategory') ? el : null;
      const label = block?.querySelector('.menu-subcat-title');
      if (label) {
        label.classList.remove('is-arrived');
        void (label as HTMLElement).offsetWidth;
        label.classList.add('is-arrived');
      }
      if (block) {
        block.classList.add('is-arrived');
        window.setTimeout(() => block.classList.remove('is-arrived'), 900);
      }
    };
    window.scrollTo({ top: y, behavior: 'smooth' });
    timer = window.setTimeout(done, 1200);
    window.addEventListener('scrollend', done);
  }, [choose]);

  useImperativeHandle(ref, () => ({ goTo }), [goTo]);

  // ── All ──────────────────────────────────────────────────────────────
  const [allOpen, setAllOpen] = useState(false);
  const [allIn, setAllIn] = useState(false);
  const [sheetPos, setSheetPos] = useState<{ top: number; right: number } | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const openAll = () => {
    const head = headRef.current;
    const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 769px)').matches;
    if (head && wide) {
      const r = head.getBoundingClientRect();
      setSheetPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    } else {
      setSheetPos(null);
    }
    lastFocus.current = document.activeElement as HTMLElement | null;
    setAllOpen(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setAllIn(true)));
  };
  const closeAll = useCallback(() => {
    setAllIn(false);
    window.setTimeout(() => setAllOpen(false), reduceMotion() ? 0 : DUR);
    lastFocus.current?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!allOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAll(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [allOpen, closeAll]);

  const chipRows = sections.filter((s) => s.subs.length > 1);
  const showRow = !override && hasRow(section);
  // Room for the row under the banner at the top of the page, only when the
  // first section has one; further down the row floats over the dishes.
  const room = !override && hasRow(sections[0]);
  const allSubs = section?.subs ?? [];

  return (
    <div
      ref={headRef}
      className={`mh${still ? ' mh--still' : ''}${showRow ? ' has-row' : ''}${panelShown ? ' has-panel' : ''}${room ? ' mh--room' : ''}`}
      data-testid="menu-head"
    >
      <div className="mh-banner" style={shownImage ? undefined : { background: override ? undefined : section?.tint }}>
        {layers.map((url, i) => (
          <div
            key={i}
            className={`mh-img${i === front && url ? ' is-on' : ''}`}
            style={url ? { backgroundImage: `url("${url.replace(/"/g, '%22')}")` } : undefined}
            aria-hidden="true"
          />
        ))}
        <div className="mh-shade" aria-hidden="true" />
        <div className="mh-copy" aria-live="polite">
          <span className="mh-title">
            {titles.map((line) => (
              <span key={line.id} className={line.cls} aria-hidden={line.cls.includes('is-out') || undefined}>{line.text}</span>
            ))}
          </span>
          {shown && <span className="mh-count" data-testid="menu-head-count">{itemsLabel(shown.count)}</span>}
        </div>
        <div className="mh-actions">
          <button
            type="button"
            ref={searchBtnRef}
            className="mh-search"
            data-testid="menu-controls-toggle"
            aria-label={t('menu.controls_toggle')}
            aria-expanded={searchOpen}
            aria-controls="menu-controls"
            data-on={searchActive || undefined}
            onClick={onSearchToggle}
          >
            <Search size={17} strokeWidth={2.4} aria-hidden="true" />
          </button>
          {!override && section?.share && (
            <div className="mh-share" key={section.key}>
              <ShareControl {...section.share} icon buttonClassName="mh-share-btn" />
            </div>
          )}
        </div>
      </div>
      <div className="mh-under">
      <div className="mh-bar" aria-hidden={!showRow || undefined}>
        <div className="mh-rows">
          {!override && chipRows.map((s) => {
            const on = s.key === section?.key;
            const left = !on && leaving.key === s.key && leaving.left;
            return (
              <nav
                key={s.key}
                ref={(el) => { if (el) rowRefs.current.set(s.key, el); else rowRefs.current.delete(s.key); }}
                className={`mh-chips${on ? ' is-on' : ''}${left ? ' is-left' : ''}`}
                aria-label={`${s.name} sections`}
                aria-hidden={!on || undefined}
                onScroll={(e) => fades(e.currentTarget)}
                data-testid="menu-head-chips"
              >
                <span className="mh-pill" aria-hidden="true" />
                {s.subs.map((b) => {
                  const isOn = on && active.sub === b.domId;
                  return (
                    <button
                      key={b.domId}
                      type="button"
                      className={`mh-chip${isOn ? ' is-active' : ''}`}
                      data-target={b.domId}
                      aria-current={isOn || undefined}
                      tabIndex={on ? 0 : -1}
                      onClick={() => goTo(b.domId)}
                    >
                      {b.name}<em>{b.count}</em>
                    </button>
                  );
                })}
              </nav>
            );
          })}
        </div>
        {allShown && (
          <button
            ref={allBtnRef}
            type="button"
            className="mh-all"
            data-testid="menu-head-all"
            aria-haspopup="dialog"
            aria-expanded={allOpen}
            onClick={openAll}
          >
            {t('menu.all_sections')}
            <ChevronDown size={15} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
      </div>
      {panelShown && (
        <div ref={panelRef} className="mh-panel" id="menu-controls" data-testid="menu-controls">
          {children}
        </div>
      )}
      </div>
      {allOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className={`mh-scrim${allIn ? ' is-open' : ''}`} onClick={closeAll} aria-hidden="true" />
          <div
            className={`mh-sheet${allIn ? ' is-open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={section?.name}
            data-testid="menu-head-sheet"
            style={sheetPos ? { top: sheetPos.top, right: sheetPos.right } : undefined}
          >
            <div className="mh-sheet-grab" aria-hidden="true" />
            <div className="mh-sheet-head">
              <h2 className="mh-sheet-title">{section?.name}</h2>
              <span className="mh-sheet-count">{t('menu.sections_count').replace('{n}', String(allSubs.length))}</span>
              <button type="button" className="mh-sheet-x" onClick={closeAll} aria-label={t('common.close')} autoFocus>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <ul className="mh-sheet-list">
              {allSubs.map((b, i) => (
                <li key={b.domId} style={{ transitionDelay: reduceMotion() ? '0ms' : `${40 + i * 25}ms` }}>
                  <button
                    type="button"
                    className={active.sub === b.domId ? 'is-active' : undefined}
                    onClick={() => {
                      closeAll();
                      window.setTimeout(() => goTo(b.domId), reduceMotion() ? 0 : 180);
                    }}
                  >
                    <i aria-hidden="true" />
                    <b>{b.name}</b>
                    <span>{itemsLabel(b.count)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
});
