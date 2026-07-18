import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../api/client';
import { useLanguage } from '../context/LanguageContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Island {
  id: number;
  name: string;
  name_latin: string;
  atoll: string;
  atoll_latin: string;
}

interface PrayerData {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

interface IslandInfo {
  id: number;
  atollLatin: string;
  nameLatin: string;
}

interface TickInfo {
  pName: string;
  pTime: string;
  cdStr: string;
  clock: string;
}

interface DropPos {
  top: number;
  left: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRAYERS: (keyof PrayerData)[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_EN: Record<keyof PrayerData, string> = {
  fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};
const ATOLL_ABBR: Record<string, string> = {
  'Haa Alif': 'HA', 'Haa Dhaalu': 'HDh', 'Shaviyani': 'Sh', 'Noonu': 'N',
  'Raa': 'R', 'Baa': 'B', 'Lhaviyani': 'Lh', 'Kaafu': 'K',
  'Alif Alif': 'AA', 'Alif Dhaalu': 'ADh', 'Vaavu': 'V', 'Meemu': 'M',
  'Faafu': 'F', 'Dhaalu': 'Dh', 'Thaa': 'Th', 'Laamu': 'L',
  'Gaafu Alif': 'GA', 'Gaafu Dhaalu': 'GDh', 'Gnaviyani': 'Gn', 'Seenu': 'S',
  'Malé': 'K',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMVT() { return new Date(Date.now() + timeSkew + 5 * 3600 * 1000); }

// Sync server clock once: eliminates drift when device clock is wrong
let timeSkew = 0;
(function syncClock() {
  fetch(`${API_BASE_URL}/health`, { method: 'HEAD' }).then(r => {
    try {
      const d = r.headers.get('Date');
      if (d) { const s = new Date(d).getTime(); if (!isNaN(s)) timeSkew = s - Date.now(); }
    } catch { /* ignore */ }
  }).catch(() => { /* ignore */ });
})();

function parseHHMM(s: string) {
  const [h, m] = s.split(':');
  return +h * 60 + +m;
}

function mvtDateStr(offsetDays = 0) {
  const d = getMVT();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.getUTCFullYear() + '-'
    + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
    + String(d.getUTCDate()).padStart(2, '0');
}

function fmtCountdown(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtClock(d: Date) {
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${h}:${m}  ·  ${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function makeLabel(atollLatin: string, nameLatin: string) {
  const abbr = ATOLL_ABBR[atollLatin] || (atollLatin ? atollLatin.split(' ')[0] : '');
  return (abbr ? abbr + '. ' : '') + (nameLatin || '');
}

const MALE_DV = 'މާލެ';
const MALE_FALLBACK: IslandInfo = { id: 102, atollLatin: 'Kaafu', nameLatin: 'Malé' };

function isMaleLatinName(nameLatin: string | null | undefined): boolean {
  if (!nameLatin) return false;
  return nameLatin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase() === 'male';
}

function findMaleIsland(islands: Island[]): IslandInfo {
  const male = islands.find(i => i.name === MALE_DV || isMaleLatinName(i.name_latin));
  return male
    ? { id: male.id, atollLatin: male.atoll_latin || 'Kaafu', nameLatin: male.name_latin || 'Malé' }
    : MALE_FALLBACK;
}

function computeTick(prayers: PrayerData, tomorrowPrayers?: PrayerData | null): TickInfo {
  const mv = getMVT();
  const nowMin = mv.getUTCHours() * 60 + mv.getUTCMinutes();
  let pName = '', pTime = '', cdStr = '';
  for (const key of PRAYERS) {
    const raw = prayers[key];
    if (!raw) continue; // sunrise may be absent from older cached data
    const pMin = parseHHMM(raw);
    if (pMin > nowMin) {
      const ms = (pMin - nowMin) * 60000 - mv.getUTCSeconds() * 1000;
      pName = PRAYER_EN[key];
      pTime = prayers[key];
      cdStr = `(${fmtCountdown(ms)})`;
      break;
    }
  }
  if (!pName) {
    // All prayers done — count down to tomorrow's actual Fajr
    const tomorrowFajr = tomorrowPrayers?.fajr ?? prayers.fajr;
    const fajrMin = parseHHMM(tomorrowFajr);
    const msToMidnight = (24 * 60 - nowMin) * 60000 - mv.getUTCSeconds() * 1000;
    const msToFajr = msToMidnight + fajrMin * 60000;
    pName = 'Fajr';
    pTime = tomorrowFajr;
    cdStr = `(${fmtCountdown(msToFajr)})`;
  }
  return { pName, pTime, cdStr, clock: fmtClock(mv) };
}

// ── GeoIcon SVG ───────────────────────────────────────────────────────────────

function GeoIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'ptSpin 1s linear infinite' } : undefined}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="8" opacity={0.18} />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PrayerBar() {
  const { t } = useLanguage();
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [servedFromCache, setServedFromCache] = useState(false);
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );
  const [expanded, setExpanded] = useState(() => {
    try {
      return sessionStorage.getItem('pt_banner_expanded') === '1';
    } catch {
      return false;
    }
  });
  const [geoSpinning, setGeoSpinning] = useState(false);
  const [island, setIsland] = useState<IslandInfo | null>(null);
  const [tick, setTick] = useState<TickInfo | null>(null);
  const [allIslands, setAllIslands] = useState<Island[]>([]);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropPos, setDropPos] = useState<DropPos>({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  /** Snapshot of today's prayers for the expanded grid. */
  const [prayerTimes, setPrayerTimes] = useState<PrayerData | null>(null);

  const prayersRef = useRef<PrayerData | null>(null);
  const tomorrowPrayersRef = useRef<PrayerData | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const dropTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ── Prayer data loader ──────────────────────────────────────────────────

  const loadPrayers = useCallback((islandId: number, cb: (fromCache: boolean) => void) => {
    const today    = mvtDateStr();
    const tomorrow = mvtDateStr(1);
    const cKey = `pt_day_${today}_${islandId}`;
    const tKey = `pt_day_${tomorrow}_${islandId}`;

    // Restore both days from cache synchronously if available
    try {
      const ct = localStorage.getItem(tKey);
      if (ct) {
        const parsed = JSON.parse(ct);
        if (parsed.sunrise) tomorrowPrayersRef.current = parsed;
        else localStorage.removeItem(tKey);
      }
    } catch { /* ignore */ }

    try {
      const c = localStorage.getItem(cKey);
      if (c) {
        const parsed = JSON.parse(c);
        // Invalidate cache if sunrise is missing (old cached data pre-dates the sunrise field)
        if (!parsed.sunrise) {
          localStorage.removeItem(cKey);
        } else {
          prayersRef.current = parsed;
          cb(true);
          // Still prefetch tomorrow in parallel if not yet cached
          if (!tomorrowPrayersRef.current) prefetchTomorrow(islandId, tKey);
          return;
        }
      }
    } catch { /* ignore */ }

    // Fetch today and tomorrow in parallel
    Promise.all([
      fetch(`${API_BASE_URL}/prayer-times?island_id=${islandId}&date=${today}`).then(r => r.json()),
      tomorrowPrayersRef.current
        ? Promise.resolve(null)
        : fetch(`${API_BASE_URL}/prayer-times?island_id=${islandId}&date=${tomorrow}`).then(r => r.json()),
    ])
      .then(([todayData, tomorrowData]) => {
        if (todayData?.prayers) {
          prayersRef.current = todayData.prayers;
          try { localStorage.setItem(cKey, JSON.stringify(todayData.prayers)); } catch { /* ignore */ }
        }
        if (tomorrowData?.prayers) {
          tomorrowPrayersRef.current = tomorrowData.prayers;
          try { localStorage.setItem(tKey, JSON.stringify(tomorrowData.prayers)); } catch { /* ignore */ }
        }
        cb(false);
      })
      .catch(() => cb(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prefetchTomorrow = useCallback((islandId: number, tKey: string) => {
    if (tomorrowPrayersRef.current) return; // already cached
    const tomorrow = mvtDateStr(1);
    fetch(`${API_BASE_URL}/prayer-times?island_id=${islandId}&date=${tomorrow}`)
      .then(r => r.json())
      .then(d => {
        if (d.prayers) {
          tomorrowPrayersRef.current = d.prayers;
          try { localStorage.setItem(tKey, JSON.stringify(d.prayers)); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  // ── Start tick timer ────────────────────────────────────────────────────

  const startTick = useCallback(() => {
    if (tickTimer.current) return;
    tickTimer.current = setInterval(() => {
      if (prayersRef.current) setTick(computeTick(prayersRef.current, tomorrowPrayersRef.current));
    }, 1000);
  }, []);

  // ── Select island ───────────────────────────────────────────────────────

  const finishLoad = useCallback((fromCache: boolean) => {
    if (prayersRef.current) {
      setPrayerTimes(prayersRef.current);
      setTick(computeTick(prayersRef.current, tomorrowPrayersRef.current));
      setLoaded(true);
      setUnavailable(false);
      if (fromCache) setServedFromCache(true);
      startTick();
    } else {
      setPrayerTimes(null);
      setLoaded(true);
      setUnavailable(true);
    }
  }, [startTick]);

  const selectIsland = useCallback((isl: Island) => {
    const info: IslandInfo = {
      id: isl.id,
      atollLatin: isl.atoll_latin || '',
      nameLatin: isl.name_latin || isl.name,
    };
    setIsland(info);
    try { localStorage.setItem('pt_island', JSON.stringify(info)); } catch { /* ignore */ }
    prayersRef.current = null;
    tomorrowPrayersRef.current = null;
    setServedFromCache(false);
    loadPrayers(info.id, finishLoad);
  }, [loadPrayers, finishLoad]);

  // ── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let savedIsland: IslandInfo | null = null;
    try {
      const s = localStorage.getItem('pt_island');
      if (s) savedIsland = JSON.parse(s);
    } catch { /* ignore */ }

    if (savedIsland) {
      setIsland(savedIsland);
      loadPrayers(savedIsland.id, finishLoad);
      return;
    }

    // Default to Malé — with 3-second fallback so the bar shows even if API is slow
    let didLoad = false;
    const useIsland = (info: IslandInfo) => {
      if (didLoad) return; didLoad = true;
      setIsland(info);
      try { localStorage.setItem('pt_island', JSON.stringify(info)); } catch { /* ignore */ }
      loadPrayers(info.id, finishLoad);
    };
    const fallbackTimer = setTimeout(() => useIsland(MALE_FALLBACK), 3000);
    fetch(`${API_BASE_URL}/prayer-times/islands`)
      .then(r => r.json())
      .then(d => {
        clearTimeout(fallbackTimer);
        const islands: Island[] = d.islands || [];
        setAllIslands(islands);
        try { localStorage.setItem('pt_islands_list', JSON.stringify(islands)); } catch { /* ignore */ }
        useIsland(findMaleIsland(islands));
      })
      .catch(() => { clearTimeout(fallbackTimer); useIsland(MALE_FALLBACK); });
  }, [loadPrayers, finishLoad]);

  // ── Cleanup tick on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => { if (tickTimer.current) clearInterval(tickTimer.current); };
  }, []);

  // ── Geolocation ─────────────────────────────────────────────────────────

  const handleGeo = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoSpinning(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetch(`${API_BASE_URL}/prayer-times/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`)
          .then(r => r.json())
          .then(d => {
            setGeoSpinning(false);
            if (d.island) {
              try { localStorage.removeItem('pt_island'); } catch { /* ignore */ }
              selectIsland(d.island);
            }
          })
          .catch(() => setGeoSpinning(false));
      },
      () => setGeoSpinning(false),
      { timeout: 8000 }
    );
  }, [selectIsland]);

  // ── Island dropdown ─────────────────────────────────────────────────────

  const openIslands = useCallback((trigger: HTMLElement) => {
    if (dropOpen) { setDropOpen(false); return; }
    dropTriggerRef.current = trigger;
    const r = trigger.getBoundingClientRect();
    const pw = 290;
    let left = r.left;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    setDropPos({ top: r.bottom + 6, left });
    setSearchQuery('');

    const openPanel = (islands: Island[]) => {
      setAllIslands(islands);
      setDropOpen(true);
      setTimeout(() => searchRef.current?.focus(), 30);
    };

    if (allIslands.length) { openPanel(allIslands); return; }
    try {
      const c = localStorage.getItem('pt_islands_list');
      if (c) { openPanel(JSON.parse(c)); return; }
    } catch { /* ignore */ }
    fetch(`${API_BASE_URL}/prayer-times/islands`)
      .then(r => r.json())
      .then(d => {
        const islands: Island[] = d.islands || [];
        try { localStorage.setItem('pt_islands_list', JSON.stringify(islands)); } catch { /* ignore */ }
        openPanel(islands);
      })
      .catch(() => { /* ignore */ });
  }, [dropOpen, allIslands]);

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!dropOpen) return;
    const close = () => setDropOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDropOpen(false); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropOpen]);

  // ── Filtered island list ────────────────────────────────────────────────

  const groupedIslands = (() => {
    const q = searchQuery.toLowerCase().trim();
    const groups: Record<string, Island[]> = {};
    const order: string[] = [];
    allIslands.forEach(isl => {
      const a = isl.atoll_latin || isl.atoll || '–';
      if (!groups[a]) { groups[a] = []; order.push(a); }
      const vis = !q
        || (isl.name_latin || isl.name || '').toLowerCase().includes(q)
        || a.toLowerCase().includes(q);
      if (vis) groups[a].push(isl);
    });
    return order
      .map(atoll => ({ atoll, islands: groups[atoll] }))
      .filter(g => g.islands.length > 0);
  })();

  // ── Shared pill/strip data ──────────────────────────────────────────────

  const dropdown = dropOpen ? createPortal(
    <div
      className="order-hpt-panel"
      style={{ top: dropPos.top, left: dropPos.left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="order-hpt-search-row">
        <input
          ref={searchRef}
          type="text"
          className="order-hpt-search-input"
          placeholder={t('prayer.search_island')}
          autoComplete="off"
          spellCheck={false}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onClick={e => e.stopPropagation()}
        />
      </div>
      <div className="order-hpt-list">
        {groupedIslands.length === 0 ? (
          <div className="order-hpt-no-results">{t('prayer.no_islands')}</div>
        ) : groupedIslands.map(({ atoll, islands }) => (
          <div key={atoll}>
            <div className="order-hpt-group-label">
              {(ATOLL_ABBR[atoll] || atoll)}  —  {atoll}
            </div>
            {islands.map(isl => (
              <div
                key={isl.id}
                className={`order-hpt-option${island && isl.id === island.id ? ' selected' : ''}`}
                onClick={e => { e.stopPropagation(); setDropOpen(false); selectIsland(isl); }}
              >
                {isl.name_latin || isl.name}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try { sessionStorage.setItem('pt_banner_expanded', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const showOfflineCaption = offline || servedFromCache;
  const cdDisplay = (tick?.cdStr ?? '').replace(/[()]/g, '');
  const locLabel = island ? makeLabel(island.atollLatin, island.nameLatin) : 'K. Malé';

  // ── §12 banner (Home / Account) ─────────────────────────────────────────
  return (
    <>
        <section
          className={`prayer-banner${expanded ? ' is-expanded' : ''}${!loaded ? ' is-loading' : ''}`}
          aria-label={t('prayer.aria')}
        >
          {!loaded && (
            <div className="prayer-banner-skeleton" aria-hidden>
              <span className="prayer-banner-skeleton-bar" />
            </div>
          )}

          {loaded && unavailable && (
            <div className="prayer-banner-row prayer-banner-unavailable">
              <span>{t('prayer.unavailable')}</span>
            </div>
          )}

          {loaded && !unavailable && (
            <>
              <div className="prayer-banner-summary">
                <button
                  type="button"
                  className="prayer-banner-expand"
                  aria-expanded={expanded}
                  onClick={toggleExpanded}
                >
                  <span className="prayer-banner-summary-left">
                    <span className="prayer-banner-title">
                      {t('prayer.title')}
                      <span className="prayer-banner-dot">·</span>
                    </span>
                    <span className="prayer-banner-next">
                      {tick ? (
                        <>
                          <strong>{tick.pName}</strong> {tick.pTime}
                          <span className="prayer-banner-cd" aria-live="off">
                            {' '}{t('prayer.next_in').replace('{t}', cdDisplay)}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="prayer-banner-chevron" aria-hidden>{expanded ? '⌃' : '▾'}</span>
                </button>
                <button
                  type="button"
                  className="prayer-banner-island"
                  onClick={(e) => openIslands(e.currentTarget)}
                >
                  {locLabel} ▾
                </button>
              </div>

              {showOfflineCaption && (
                <p className="prayer-banner-caption">
                  {offline ? t('prayer.offline_cached') : t('prayer.cached')}
                </p>
              )}

              <div
                className="prayer-banner-panel"
                hidden={!expanded}
              >
                <div className="prayer-banner-grid" role="list">
                  {PRAYERS.map((key) => {
                    const isNext = tick?.pName === PRAYER_EN[key];
                    return (
                      <div
                        key={key}
                        role="listitem"
                        className={`prayer-banner-cell${isNext ? ' is-next' : ''}`}
                      >
                        <span className="prayer-banner-cell-name">{PRAYER_EN[key]}</span>
                        <span className="prayer-banner-cell-time">{prayerTimes?.[key] ?? '—'}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="prayer-banner-actions">
                  <button
                    type="button"
                    className="prayer-banner-action"
                    disabled={geoSpinning}
                    onClick={() => handleGeo()}
                  >
                    <GeoIcon spinning={geoSpinning} /> {t('prayer.use_location')}
                  </button>
                  <button
                    type="button"
                    className="prayer-banner-action"
                    onClick={(e) => openIslands(e.currentTarget)}
                  >
                    {t('prayer.change_island')}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
        {dropdown}
      </>
  );
}
