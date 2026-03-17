import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Island, PrayerTimes, PrayerKey, Theme, Lang } from './types';

/* ═══════════════════════ constants ═══════════════════════ */

const PRAYER_META: Record<PrayerKey, { dv: string; en: string; icon: string }> = {
  fajr:    { dv: 'ފަތިސް',      en: 'Fajr',    icon: '🌙' },
  sunrise: { dv: 'އިރު ނެގުން',  en: 'Sunrise', icon: '🌅' },
  dhuhr:   { dv: 'މެންދުރު',    en: 'Dhuhr',   icon: '☀️' },
  asr:     { dv: 'އަޞްރު',      en: 'Asr',     icon: '🌤' },
  maghrib: { dv: 'މަޣްރިބް',    en: 'Maghrib', icon: '🌆' },
  isha:    { dv: 'ޢިޝާ',       en: 'Isha',    icon: '🌟' },
};

const KEYS: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

/* ═══════════════════════ helpers ═══════════════════════ */

function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h   = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  return [h, min, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ═══════════════════════ sub-components ═══════════════════════ */

const TOKEN_DARK: React.CSSProperties = {
  '--bg':      '#1e293b',
  '--bg2':     '#263347',
  '--border':  '#334155',
  '--text':    '#f1f5f9',
  '--muted':   '#94a3b8',
  '--primary': '#38bdf8',
  '--accent':  '#f59e0b',
  '--next-bg': 'rgba(56,189,248,.12)',
} as React.CSSProperties;

const TOKEN_LIGHT: React.CSSProperties = {
  '--bg':      '#ffffff',
  '--bg2':     '#f1f5f9',
  '--border':  '#e2e8f0',
  '--text':    '#0f172a',
  '--muted':   '#64748b',
  '--primary': '#0284c7',
  '--accent':  '#d97706',
  '--next-bg': 'rgba(2,132,199,.08)',
} as React.CSSProperties;

/* ═══════════════════════ main component ═══════════════════════ */

export interface PrayerTimesWidgetProps {
  /** Base URL of the salat API server, e.g. "https://salat.yourdomain.mv" */
  apiBase: string;
  /** Pre-select an island by id */
  islandId?: number;
  /** "dark" | "light" */
  theme?: Theme;
  /** "dv" (Dhivehi) | "en" (English) */
  lang?: Lang;
  /** CSS class name for the outer wrapper */
  className?: string;
}

export function PrayerTimesWidget({
  apiBase,
  islandId: initialIslandId,
  theme = 'dark',
  lang  = 'dv',
  className,
}: PrayerTimesWidgetProps) {
  const base = apiBase.replace(/\/$/, '');

  const [islands,  setIslands]  = useState<Island[]>([]);
  const [islandId, setIslandId] = useState<number>(initialIslandId ?? 0);
  const [prayers,  setPrayers]  = useState<PrayerTimes | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // live countdown
  const [nowMin, setNowMin] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── tick every second ── */
  useEffect(() => {
    timerRef.current = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
      setTick(t => t + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  /* ── load islands ── */
  useEffect(() => {
    fetch(`${base}/api/prayer-times/islands`)
      .then(r => r.json())
      .then((data: { islands: Island[] }) => {
        setIslands(data.islands || []);
        if (!initialIslandId) {
          const male = data.islands.find(i => i.name === 'މާލެ') ?? data.islands[0];
          if (male) setIslandId(male.id);
        }
      })
      .catch(() => setError('ރަށްތައް ލޯޑު ނުވި'));
  }, [base, initialIslandId]);

  /* ── load prayer times when islandId changes ── */
  useEffect(() => {
    if (!islandId) return;
    setLoading(true);
    setError(null);
    fetch(`${base}/api/prayer-times?island_id=${islandId}&date=${todayStr()}`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data: { prayers: PrayerTimes }) => {
        setPrayers(data.prayers);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [base, islandId]);

  /* ── geolocation ── */
  const handleGeo = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      fetch(`${base}/api/prayer-times/nearest?lat=${latitude}&lng=${longitude}`)
        .then(r => r.json())
        .then((data: { island: Island }) => {
          if (data.island) setIslandId(data.island.id);
        })
        .catch(() => {});
    });
  }, [base]);

  /* ── compute next prayer ── */
  const { nextKey, countdown } = useMemo(() => {
    if (!prayers) return { nextKey: null, countdown: '––:––:––' };
    const now = new Date();
    const nm  = now.getHours() * 60 + now.getMinutes();
    let nextKey: PrayerKey | null = null;
    for (const k of KEYS) {
      if (parseHHMM(prayers[k]) > nm) { nextKey = k; break; }
    }
    let countdown = '––:––:––';
    if (nextKey) {
      const [nh, nmin] = prayers[nextKey].split(':').map(Number);
      const target = new Date(); target.setHours(nh, nmin, 0, 0);
      countdown = formatCountdown(target.getTime() - now.getTime());
    }
    return { nextKey, countdown };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prayers, tick]);

  const tokens = theme === 'light' ? TOKEN_LIGHT : TOKEN_DARK;

  const wrapStyle: React.CSSProperties = {
    ...tokens,
    background:   'var(--bg)',
    border:       '1px solid var(--border)',
    borderRadius: 14,
    padding:      '1.25rem',
    color:        'var(--text)',
    fontFamily:   "'MV Faseyha','MV Waheed',serif",
    direction:    'rtl',
  };

  /* ── grouped select options ── */
  const grouped = useMemo(() => {
    const g: Record<string, Island[]> = {};
    islands.forEach(i => { (g[i.atoll] ??= []).push(i); });
    return g;
  }, [islands]);

  if (error) {
    return (
      <div style={wrapStyle} className={className}>
        <p style={{ color: '#f87171', textAlign: 'center', fontSize: '.85rem' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={wrapStyle} className={className}>
      {/* ── top controls ── */}
      <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select
          value={islandId}
          onChange={e => setIslandId(Number(e.target.value))}
          style={{
            flex: 1, minWidth: 140,
            background: 'var(--bg2)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '.5rem .75rem', fontSize: '.9rem',
            fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
          }}
        >
          {Object.entries(grouped).map(([atoll, list]) => (
            <optgroup key={atoll} label={atoll}>
              {list.map(isl => (
                <option key={isl.id} value={isl.id}>{isl.name}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <button
          onClick={handleGeo}
          style={{
            background: 'transparent', color: 'var(--primary)',
            border: '1px solid var(--primary)', borderRadius: 8,
            padding: '.5rem .75rem', fontSize: '.8rem',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          📍 {lang === 'dv' ? 'ތިބާ ހުރި ތަން' : 'My location'}
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem', fontSize: '.9rem' }}>
          {lang === 'dv' ? 'ލޯޑު ވަނީ...' : 'Loading...'}
        </p>
      ) : prayers ? (
        <>
          {/* ── countdown ── */}
          <div style={{
            background: 'var(--next-bg)', border: '1px solid rgba(56,189,248,.25)',
            borderRadius: 10, padding: '.9rem 1rem', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '.5rem',
          }}>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', flex: '0 0 100%' }}>
              {lang === 'dv' ? 'ދެން ވަންނަ ނަމާދު' : 'Next prayer'}
            </div>
            <div>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {nextKey ? PRAYER_META[nextKey][lang] : (lang === 'dv' ? 'ދެން ވަންނަ ނަމާދެއް ނެތް' : 'No more prayers today')}
              </span>
              {nextKey && (
                <span style={{ fontSize: '.8rem', color: 'var(--muted)', marginInlineStart: '.4rem' }}>
                  {prayers[nextKey]}
                </span>
              )}
            </div>
            <div style={{
              fontFamily: "'Inter',monospace,sans-serif", fontSize: '1.4rem',
              fontWeight: 700, color: 'var(--accent)', letterSpacing: '.04em',
            }}>
              {countdown}
            </div>
          </div>

          {/* ── prayer grid ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '.6rem',
          }}>
            {KEYS.map(key => {
              const tMin  = parseHHMM(prayers[key]);
              const isNext = key === nextKey;
              const isPast = tMin <= nowMin && !isNext;
              return (
                <div
                  key={key}
                  style={{
                    background:   isNext ? 'var(--next-bg)' : 'var(--bg2)',
                    border:       `1px solid ${isNext ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 10,
                    padding:      '.7rem .8rem',
                    display:      'flex',
                    flexDirection:'column',
                    alignItems:   'center',
                    gap:          '.3rem',
                    opacity:      isPast ? 0.5 : 1,
                    position:     'relative',
                    transition:   'border-color .2s',
                  }}
                >
                  {isNext && (
                    <span style={{
                      position: 'absolute', top: '.3rem', left: '.4rem',
                      fontSize: '.6rem', color: 'var(--primary)',
                      background: 'rgba(56,189,248,.15)',
                      padding: '.1rem .35rem', borderRadius: 4, fontWeight: 600,
                    }}>
                      {lang === 'dv' ? 'ދެން' : 'next'}
                    </span>
                  )}
                  <div style={{ fontSize: '1.35rem', lineHeight: 1 }}>{PRAYER_META[key].icon}</div>
                  <div style={{ fontSize: '.78rem', fontWeight: 600, textAlign: 'center' }}>
                    {PRAYER_META[key][lang]}
                  </div>
                  <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'Inter',sans-serif" }}>
                    {PRAYER_META[key].en}
                  </div>
                  <div style={{
                    fontSize: '1.1rem', fontWeight: 700,
                    color: isNext ? 'var(--primary)' : 'var(--text)',
                    fontFamily: "'Inter',monospace,sans-serif",
                    letterSpacing: '.02em',
                  }}>
                    {prayers[key]}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default PrayerTimesWidget;
