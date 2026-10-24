import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../api';

/*
 * One visit beacon per page of the order app, and one as the visitor leaves
 * a page with the seconds it was on screen (owner, 2026-10-24: "Add maximum
 * detail u can get"). No cookie and no IP kept: a random tag for this tab
 * (sessionStorage), a "been before" mark (localStorage), the page, the
 * referrer on the first page, the campaign, the screen width and the
 * language. The website's layout sends the same (SiteVisitCounter). A device
 * marked "Don't count this device" in Admin sends nothing. Silent in tests.
 */

type Beacon = Record<string, string | number | boolean | null>;

const tag = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 20);

function store(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function trackingOff(): boolean {
  try {
    return store('local')?.getItem('bg_no_track') === '1';
  } catch {
    return false;
  }
}

function sessionTag(): string {
  const ss = store('session');
  try {
    const have = ss?.getItem('bg_sid');
    if (have) return have;
    const made = tag();
    ss?.setItem('bg_sid', made);
    return made;
  } catch {
    return tag();
  }
}

/** True when this device was here on an earlier day; marks today either way. */
function returningVisitor(): boolean {
  const ls = store('local');
  const today = new Date().toISOString().slice(0, 10);
  try {
    const seen = ls?.getItem('bg_seen') ?? null;
    ls?.setItem('bg_seen', today);
    return seen !== null && seen < today;
  } catch {
    return false;
  }
}

function send(body: Beacon): void {
  try {
    const url = `${API_BASE_URL.replace(/\/$/, '')}/visits/beacon`;
    const payload = JSON.stringify(body);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    }
  } catch {
    // counting must never break the app
  }
}

export function PageViewTracker() {
  const location = useLocation();
  const first = useRef(true);
  const sid = useRef<string | null>(null);
  const returning = useRef<boolean | null>(null);

  useEffect(() => {
    if (import.meta.env.MODE === 'test' || trackingOff()) return;
    sid.current ??= sessionTag();
    returning.current ??= returningVisitor();
    const pv = tag();
    const q = new URLSearchParams(location.search);
    send({
      surface: 'order', type: 'view', path: `/order${location.pathname === '/' ? '' : location.pathname}`,
      // The referrer belongs to the page the app was opened on; later pages came from inside the app.
      ref: first.current ? document.referrer || null : null,
      sid: sid.current, pv,
      screen: window.screen ? window.screen.width : null,
      lang: navigator.language || null,
      returning: returning.current,
      utm_source: q.get('utm_source'), utm_medium: q.get('utm_medium'), utm_campaign: q.get('utm_campaign'), s: q.get('s'),
    });
    first.current = false;

    // Seconds on screen, sent whenever the page is hidden and when the next page replaces it.
    let shown: number | null = document.visibilityState === 'visible' ? Date.now() : null;
    let spent = 0;
    const leave = () => {
      if (shown !== null) { spent += Date.now() - shown; shown = null; }
      send({ surface: 'order', type: 'leave', sid: sid.current, pv, dur: Math.round(spent / 1000) });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave();
      else if (shown === null) shown = Date.now();
    };
    const onPageHide = () => { if (shown !== null) leave(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      if (shown !== null) leave();
    };
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
