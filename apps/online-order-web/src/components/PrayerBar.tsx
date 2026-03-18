import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

const PRAYERS: (keyof PrayerData)[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_EN: Record<keyof PrayerData, string> = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
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

function getMVT() { return new Date(Date.now() + 5 * 3600 * 1000); }

function parseHHMM(s: string) {
  const [h, m] = s.split(':');
  return +h * 60 + +m;
}

function mvtDateStr() {
  const d = getMVT();
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
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 || 12;
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(h12).padStart(2, '0')}:${m}${h24 >= 12 ? ' PM' : ' AM'}  ·  ${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

function makeLabel(atollLatin: string, nameLatin: string) {
  const abbr = ATOLL_ABBR[atollLatin] || (atollLatin ? atollLatin.split(' ')[0] : '');
  return (abbr ? abbr + '. ' : '') + (nameLatin || '');
}

function computeTick(prayers: PrayerData): TickInfo {
  const mv = getMVT();
  const nowMin = mv.getUTCHours() * 60 + mv.getUTCMinutes();
  let pName = '', pTime = '', cdStr = '';
  for (const key of PRAYERS) {
    const pMin = parseHHMM(prayers[key]);
    if (pMin > nowMin) {
      const ms = (pMin - nowMin) * 60000 - mv.getUTCSeconds() * 1000;
      pName = PRAYER_EN[key];
      pTime = prayers[key];
      cdStr = `(${fmtCountdown(ms)})`;
      break;
    }
  }
  if (!pName) {
    // All prayers done — count down to tomorrow's Fajr (today's Fajr time ≈ tomorrow's)
    const fajrMin = parseHHMM(prayers.fajr);
    const msToMidnight = (24 * 60 - nowMin) * 60000 - mv.getUTCSeconds() * 1000;
    const msToFajr = msToMidnight + fajrMin * 60000;
    pName = 'Fajr';
    pTime = prayers.fajr;
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
  const [loaded, setLoaded] = useState(false);
  const [geoSpinning, setGeoSpinning] = useState(false);
  const [island, setIsland] = useState<IslandInfo | null>(null);
  const [tick, setTick] = useState<TickInfo | null>(null);
  const [allIslands, setAllIslands] = useState<Island[]>([]);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropPos, setDropPos] = useState<DropPos>({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState('');

  const prayersRef = useRef<PrayerData | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const dropTriggerRef = useRef<HTMLElement | null>(null);

  // ── Prayer data loader ──────────────────────────────────────────────────

  const loadPrayers = useCallback((islandId: number, cb: () => void) => {
    const today = mvtDateStr();
    const cKey = `pt_day_${today}_${islandId}`;
    try {
      const c = localStorage.getItem(cKey);
      if (c) { prayersRef.current = JSON.parse(c); cb(); return; }
    } catch { /* ignore */ }
    fetch(`/api/prayer-times?island_id=${islandId}&date=${today}`)
      .then(r => r.json())
      .then(d => {
        if (d.prayers) {
          prayersRef.current = d.prayers;
          try { localStorage.setItem(cKey, JSON.stringify(d.prayers)); } catch { /* ignore */ }
        }
        cb();
      })
      .catch(() => cb());
  }, []);

  // ── Start tick timer ────────────────────────────────────────────────────

  const startTick = useCallback(() => {
    if (tickTimer.current) return;
    tickTimer.current = setInterval(() => {
      if (prayersRef.current) setTick(computeTick(prayersRef.current));
    }, 1000);
  }, []);

  // ── Select island ───────────────────────────────────────────────────────

  const selectIsland = useCallback((isl: Island) => {
    const info: IslandInfo = {
      id: isl.id,
      atollLatin: isl.atoll_latin || '',
      nameLatin: isl.name_latin || isl.name,
    };
    setIsland(info);
    try { localStorage.setItem('pt_island', JSON.stringify(info)); } catch { /* ignore */ }
    prayersRef.current = null;
    loadPrayers(info.id, () => {
      if (prayersRef.current) {
        setTick(computeTick(prayersRef.current));
        setLoaded(true);
        startTick();
      }
    });
  }, [loadPrayers, startTick]);

  // ── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    let savedIsland: IslandInfo | null = null;
    try {
      const s = localStorage.getItem('pt_island');
      if (s) savedIsland = JSON.parse(s);
    } catch { /* ignore */ }

    if (savedIsland) {
      setIsland(savedIsland);
      loadPrayers(savedIsland.id, () => {
        if (prayersRef.current) {
          setTick(computeTick(prayersRef.current));
          setLoaded(true);
          startTick();
        }
      });
      return;
    }

    // Default to Malé
    fetch('/api/prayer-times/islands')
      .then(r => r.json())
      .then(d => {
        const islands: Island[] = d.islands || [];
        setAllIslands(islands);
        try { localStorage.setItem('pt_islands_list', JSON.stringify(islands)); } catch { /* ignore */ }
        const male = islands.find(i =>
          (i.name_latin || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase() === 'male'
        );
        if (male) {
          const info: IslandInfo = {
            id: male.id,
            atollLatin: male.atoll_latin || 'Kaafu',
            nameLatin: male.name_latin || 'Malé',
          };
          setIsland(info);
          try { localStorage.setItem('pt_island', JSON.stringify(info)); } catch { /* ignore */ }
          loadPrayers(info.id, () => {
            if (prayersRef.current) {
              setTick(computeTick(prayersRef.current));
              setLoaded(true);
              startTick();
            }
          });
        }
      })
      .catch(() => { /* ignore */ });
  }, [loadPrayers, startTick]);

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
        fetch(`/api/prayer-times/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`)
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
    fetch('/api/prayer-times/islands')
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

  const locLabel = island ? makeLabel(island.atollLatin, island.nameLatin) : 'K. Malé';

  // ── Portal targets ──────────────────────────────────────────────────────

  const stripRoot = document.getElementById('prayer-strip-root');

  // ── Dropdown portal ─────────────────────────────────────────────────────

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
          placeholder="Search island or atoll…"
          autoComplete="off"
          spellCheck={false}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onClick={e => e.stopPropagation()}
        />
      </div>
      <div className="order-hpt-list">
        {groupedIslands.length === 0 ? (
          <div className="order-hpt-no-results">No islands found</div>
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

  // ── Desktop Pill ────────────────────────────────────────────────────────

  const pill = (
    <div className={`order-pt-pill${loaded ? ' pt-loaded' : ''}`} aria-label="Prayer times">
      {/* Geo button */}
      <button
        type="button"
        className="order-pt-geo-btn"
        title="Detect my location"
        disabled={geoSpinning}
        onClick={e => { e.stopPropagation(); handleGeo(); }}
      >
        <GeoIcon spinning={geoSpinning} />
      </button>

      {/* Island selector */}
      <button
        type="button"
        className="order-pt-isl-btn"
        onClick={e => { e.stopPropagation(); openIslands(e.currentTarget); }}
      >
        <span>{locLabel}</span>
        <span className="order-pt-isl-arrow">▾</span>
      </button>

      {/* Prayer info → links to prayer-times page */}
      <a href="/prayer-times" className="order-pt-pill-info" onClick={e => e.stopPropagation()}>
        <span className="order-pt-div">·</span>
        <span className="order-pt-prayer">{tick?.pName}</span>
        <span className="order-pt-ptime">{tick?.pTime}</span>
        <span className="order-pt-cd">{tick?.cdStr}</span>
        <span className="order-pt-div">·</span>
        <span className="order-pt-clock">{tick?.clock}</span>
      </a>
    </div>
  );

  // ── Mobile Strip ────────────────────────────────────────────────────────

  const strip = (
    <div className={`order-pt-strip${loaded ? ' pt-loaded' : ''}`} aria-label="Prayer times">
      <div className="order-pt-strip-controls">
        <button
          type="button"
          className="order-pt-geo-btn"
          title="Detect my location"
          disabled={geoSpinning}
          onClick={e => { e.stopPropagation(); handleGeo(); }}
        >
          <GeoIcon spinning={geoSpinning} />
        </button>
        <button
          type="button"
          className="order-pt-isl-btn"
          onClick={e => { e.stopPropagation(); openIslands(e.currentTarget); }}
        >
          <span>{locLabel}</span>
          <span className="order-pt-isl-arrow">▾</span>
        </button>
      </div>
      <a href="/prayer-times" className="order-pt-strip-info">
        <span className="order-pt-prayer">{tick?.pName}</span>
        <span className="order-pt-ptime">{tick?.pTime}</span>
        <span className="order-pt-cd">{tick?.cdStr}</span>
        <span className="order-pt-div">·</span>
        <span className="order-pt-clock">{tick?.clock}</span>
      </a>
    </div>
  );

  return (
    <>
      {pill}
      {stripRoot ? createPortal(strip, stripRoot) : null}
      {dropdown}
    </>
  );
}
