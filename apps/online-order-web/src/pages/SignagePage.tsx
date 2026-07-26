/**
 * Fullscreen TV signage board — standalone, non-interactive.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_ORIGIN, fetchCategories, fetchItems, fetchOffers } from '../api';
import type { Item } from '../api';
import {
  buildWeightedRotation,
  interpolate,
  SlideCanvas,
  type MenuItemLite,
  type SignageConfig,
  type SignageSlide,
} from '@shared/signage';
import '@shared/signage/signage.css';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';

const CACHE_KEY = 'bg_signage_cache_v1';
const DEVICE_ID_KEY = 'bg_signage_device_id';
const BUILD_VERSION = '2.1';

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-ephemeral-${Date.now()}`;
  }
}

type CacheBlob = {
  config: SignageConfig;
  items: MenuItemLite[];
  savedAt: number;
};

function toLite(items: Item[]): MenuItemLite[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    base_price: Number(i.base_price),
    category_id: i.category_id,
    image_url: i.image_url,
    short_description: i.short_description,
    created_at: i.created_at ?? null,
    sales_30d: i.sales_30d,
    is_combo: i.is_combo,
    special: i.special ?? null,
  }));
}

function readCache(screen: string): CacheBlob | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${screen}`);
    if (!raw) return null;
    return JSON.parse(raw) as CacheBlob;
  } catch {
    return null;
  }
}

function writeCache(screen: string, blob: CacheBlob) {
  try {
    localStorage.setItem(`${CACHE_KEY}:${screen}`, JSON.stringify(blob));
  } catch { /* quota */ }
}

async function fetchConfig(screen: string): Promise<SignageConfig> {
  const path = screen && screen !== 'default' ? `/signage/${encodeURIComponent(screen)}` : '/signage';
  const res = await fetch(`${API_ORIGIN}/api${path}`, { credentials: 'omit' });
  if (!res.ok) throw new Error(`signage ${res.status}`);
  return res.json() as Promise<SignageConfig>;
}

export function SignagePage() {
  const { screen: screenParam } = useParams();
  const screen = screenParam || 'default';
  const navigate = useNavigate();
  const { settings } = useSiteSettingsContext();
  const logoUrl = settings.logo || '/logo.png';

  const [config, setConfig] = useState<SignageConfig | null>(null);
  const [items, setItems] = useState<MenuItemLite[]>([]);
  const [offline, setOffline] = useState(false);
  const [index, setIndex] = useState(0);
  const [pendingConfig, setPendingConfig] = useState<SignageConfig | null>(null);
  const [burnIn, setBurnIn] = useState({ x: 0, y: 0 });
  const [tick, setTick] = useState(0);
  const [command, setCommand] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [black, setBlack] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [deviceApproved, setDeviceApproved] = useState(false);

  const versionRef = useRef<string>('');
  const advanceTimer = useRef<number | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const deviceIdRef = useRef(getOrCreateDeviceId());
  const slideIdRef = useRef<string | null>(null);
  const offlineRef = useRef(false);

  // Live clock variables
  const liveVars = useMemo(() => {
    const base = { ...(config?.variables ?? {}) };
    const now = new Date();
    base.current_time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    base.today = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    return base;
  }, [config?.variables, tick]);

  const slidesById = useMemo(() => {
    const map = new Map<string, SignageSlide>();
    for (const s of config?.slides ?? []) map.set(s.id, s);
    return map;
  }, [config?.slides]);

  const rotation = useMemo(() => {
    if (!config) return [] as string[];
    if (config.rotation?.length) return config.rotation;
    return buildWeightedRotation(config.slides ?? []);
  }, [config]);

  const currentSlide = rotation.length
    ? slidesById.get(rotation[index % rotation.length]) ?? null
    : null;

  // Initial + refresh fetch
  useEffect(() => {
    let cancelled = false;
    const load = async (isRefresh: boolean) => {
      try {
        const [cfg, itemsRes] = await Promise.all([
          fetchConfig(screen),
          fetchItems('online_pickup').catch(() => ({ data: [] as Item[] })),
        ]);
        if (cancelled) return;
        const lite = toLite(itemsRes.data ?? []);
        // Also pull offers into specials hint — items already carry special
        void fetchOffers().catch(() => null);
        void fetchCategories().catch(() => null);

        writeCache(screen, { config: cfg, items: lite, savedAt: Date.now() });
        setOffline(false);
        offlineRef.current = false;
        setItems(lite);

        if (!isRefresh || !versionRef.current) {
          versionRef.current = cfg.playlist_version;
          setConfig(cfg);
        } else if (cfg.playlist_version !== versionRef.current) {
          setPendingConfig(cfg);
        } else {
          // same version — still refresh variables/bestsellers
          setConfig((prev) => (prev ? { ...prev, variables: cfg.variables, bestsellers: cfg.bestsellers } : cfg));
        }
      } catch {
        if (cancelled) return;
        const cached = readCache(screen);
        if (cached) {
          setOffline(true);
          offlineRef.current = true;
          setConfig(cached.config);
          setItems(cached.items);
          versionRef.current = cached.config.playlist_version;
        }
      }
    };

    void load(false);
    const refreshSeconds = Math.max(30, config?.refresh_seconds ?? 120);
    refreshTimer.current = window.setInterval(() => void load(true), refreshSeconds * 1000);
    return () => {
      cancelled = true;
      if (refreshTimer.current) window.clearInterval(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Wake Lock
  useEffect(() => {
    const req = async () => {
      try {
        const anyNav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
        if (anyNav.wakeLock) {
          wakeLockRef.current = await anyNav.wakeLock.request('screen');
        }
      } catch { /* unsupported */ }
    };
    void req();
    return () => { void wakeLockRef.current?.release(); };
  }, []);

  // Clock tick + burn-in drift
  useEffect(() => {
    const t = window.setInterval(() => {
      setTick((n) => n + 1);
      setBurnIn({
        x: Math.sin(Date.now() / 60000) * 4,
        y: Math.cos(Date.now() / 70000) * 3,
      });
    }, 15000);
    return () => window.clearInterval(t);
  }, []);

  // Advance slides
  useEffect(() => {
    if (!currentSlide || paused || black) return;
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    const ms = Math.max(3, Number(currentSlide.seconds ?? 12)) * 1000;
    advanceTimer.current = window.setTimeout(() => {
      // Apply pending config swap on boundary
      if (pendingConfig) {
        versionRef.current = pendingConfig.playlist_version;
        setConfig(pendingConfig);
        setPendingConfig(null);
        setIndex(0);
        return;
      }
      setIndex((i) => i + 1);
    }, ms);
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    };
  }, [currentSlide, index, paused, black, pendingConfig]);

  // Keep current slide id for heartbeat payload
  useEffect(() => {
    slideIdRef.current = currentSlide?.id ?? null;
  }, [currentSlide?.id]);

  // Phase 2 remote commands via custom event (heartbeat wires this)
  useEffect(() => {
    const onCmd = (e: Event) => {
      const detail = (e as CustomEvent).detail as { command?: string; type?: string } | undefined;
      const cmd = detail?.command || detail?.type;
      if (!cmd) return;
      setCommand(cmd);
      if (cmd === 'pause') setPaused(true);
      if (cmd === 'resume') { setPaused(false); setBlack(false); }
      if (cmd === 'black_screen' || cmd === 'maintenance') setBlack(true);
      if (cmd === 'skip') setIndex((i) => i + 1);
      if (cmd === 'refresh' || cmd === 'reload_cache') {
        versionRef.current = '';
        window.location.reload();
      }
      if (cmd === 'restart') window.location.reload();
    };
    window.addEventListener('signage:command', onCmd);
    return () => window.removeEventListener('signage:command', onCmd);
  }, []);

  // Heartbeat + pairing (~60s)
  useEffect(() => {
    let cancelled = false;
    const beat = async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/signage/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({
            device_id: deviceIdRef.current,
            screen,
            current_slide: slideIdRef.current,
            playlist_version: versionRef.current || null,
            browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : null,
            resolution: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null,
            cache_status: offlineRef.current ? 'offline' : 'ok',
            failed_assets: 0,
            build_version: BUILD_VERSION,
          }),
        });
        if (!res.ok || cancelled) return;
        const json = await res.json() as {
          device?: {
            approved?: boolean;
            pairing_code?: string | null;
            screen_slug?: string | null;
          };
          command?: { type?: string; command?: string; payload?: unknown } | null;
        };
        const approved = Boolean(json.device?.approved);
        setDeviceApproved(approved);
        setPairingCode(approved ? null : (json.device?.pairing_code ?? null));

        const assigned = json.device?.screen_slug;
        if (approved && assigned && assigned !== screen && !screenParam) {
          navigate(`/tv/${encodeURIComponent(assigned)}`, { replace: true });
        }

        const cmd = json.command?.type || json.command?.command;
        if (cmd) {
          window.dispatchEvent(new CustomEvent('signage:command', {
            detail: { command: cmd, type: cmd, payload: json.command?.payload },
          }));
        }
      } catch {
        /* offline — retry next interval */
      }
    };

    void beat();
    const t = window.setInterval(() => void beat(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [screen, screenParam, navigate]);

  const transition = currentSlide?.transition || 'fade';
  const orientation = config?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const showPairing = !deviceApproved && Boolean(pairingCode);

  return (
    <div
      className={`signage-page signage-orient-${orientation}`}
      data-testid="signage-page"
      data-command={command ?? ''}
      data-approved={deviceApproved ? '1' : '0'}
    >
      {black && (
        <div className="signage-blackout" data-testid="signage-blackout">
          {command === 'maintenance' ? 'Maintenance' : ''}
        </div>
      )}
      {!black && currentSlide && config && (
        <div
          key={`${currentSlide.id}-${index}`}
          className={`signage-stage signage-tx-${transition}`}
          style={{ animationDuration: `${currentSlide.transition_ms ?? 700}ms` }}
        >
          <SlideCanvas
            slide={currentSlide}
            theme={config.theme}
            variables={liveVars}
            items={items}
            config={config}
            logoUrl={logoUrl}
            burnInOffset={burnIn}
          />
        </div>
      )}
      {!currentSlide && !black && (
        <div className="signage-empty" data-testid="signage-loading">
          {interpolate('{{branch_name}}', { branch_name: settings.site_name || 'Bake & Grill' })}
        </div>
      )}
      {showPairing && (
        <div className="signage-pairing" data-testid="signage-pairing">
          <div className="signage-pairing-card">
            <div className="signage-pairing-label">Pair this TV</div>
            <div className="signage-pairing-code" data-testid="signage-pairing-code">{pairingCode}</div>
            <div className="signage-pairing-hint">Enter this code in Admin → TV Signage → Devices</div>
          </div>
        </div>
      )}
      {offline && (
        <div className="signage-offline" data-testid="signage-offline">offline — showing last menu</div>
      )}
    </div>
  );
}

export default SignagePage;
