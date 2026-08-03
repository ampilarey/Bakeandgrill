/**
 * Fullscreen TV signage board — standalone, non-interactive.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { API_ORIGIN, fetchCategories, fetchItems, fetchOffers } from '../api';
import type { Item } from '../api';
import type { Category } from '@shared/types';
import {
  AUTO_MENU_ORIGIN,
  buildWeightedRotation,
  expandPlaylist,
  brandCardSlide,
  SignageBanner,
  shouldShowBanner,
  SlideCanvas,
  type MenuItemLite,
  type SignageCategoryLite,
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
  categories?: SignageCategoryLite[];
  savedAt: number;
};

function toLite(items: Item[]): MenuItemLite[] {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    base_price: Number(i.base_price),
    category_id: i.category_id,
    image_url: i.image_url,
    thumb_url: i.thumb_url ?? null,
    short_description: i.short_description,
    created_at: i.created_at ?? null,
    sales_30d: i.sales_30d,
    is_combo: i.is_combo,
    special: i.special ?? null,
    show_on_signage: i.show_on_signage,
    is_signage_promoted: i.is_signage_promoted,
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

/** True when running inside an iframe. Cross-origin access to top can throw. */
function detectIframeEmbedded(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.self !== window.top;
  } catch {
    return true;
  }
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
  const [searchParams] = useSearchParams();
  const { settings } = useSiteSettingsContext();
  // Dark board (#0d0a07) — prefer the dark-surface logo so a light mark doesn't wash out.
  const logoUrl = settings.logo_dark || settings.logo || '/logo.png';
  const idleSlide = useMemo(() => brandCardSlide(), []);

  const [config, setConfig] = useState<SignageConfig | null>(null);
  const [items, setItems] = useState<MenuItemLite[]>([]);
  const [categories, setCategories] = useState<SignageCategoryLite[]>([]);
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
  const [inIframe] = useState(detectIframeEmbedded);
  // Honour ?embed=1 via the router (and window.location as a belt-and-braces for
  // non-router entry points) so admin preview can force embed layout in tests too.
  const forceEmbed = searchParams.get('embed') === '1'
    || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1');
  const embedded = forceEmbed || inIframe;

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

  const hasAutoMenu = useMemo(
    () => (config?.slides ?? []).some((s) => s.template_origin === AUTO_MENU_ORIGIN),
    [config?.slides],
  );

  // The expanded rotation has a fixed length (the showcase window is capped and
  // every generated slide carries weight 1), so loop N can be derived from the
  // running slide index without feeding the expansion back into itself.
  const rotationLength = useMemo(() => {
    if (!config) return 0;
    if (!hasAutoMenu) return (config.rotation?.length ? config.rotation : buildWeightedRotation(config.slides ?? [])).length;
    return buildWeightedRotation(expandPlaylist(config.slides ?? [], items, categories, 0)).length;
  }, [config, hasAutoMenu, items, categories]);

  const loopIndex = rotationLength > 0 ? Math.floor(index / rotationLength) : 0;

  const slides = useMemo(
    () => (hasAutoMenu ? expandPlaylist(config?.slides ?? [], items, categories, loopIndex) : (config?.slides ?? [])),
    [config?.slides, hasAutoMenu, items, categories, loopIndex],
  );

  const slidesById = useMemo(() => {
    const map = new Map<string, SignageSlide>();
    for (const s of slides) map.set(s.id, s);
    return map;
  }, [slides]);

  const rotation = useMemo(() => {
    if (!config) return [] as string[];
    // Generated slide ids are not in the server-built rotation — rebuild locally.
    if (hasAutoMenu) return buildWeightedRotation(slides);
    if (config.rotation?.length) return config.rotation;
    return buildWeightedRotation(config.slides ?? []);
  }, [config, hasAutoMenu, slides]);

  const currentSlide = rotation.length
    ? slidesById.get(rotation[index % rotation.length]) ?? null
    : null;

  // Initial + refresh fetch
  useEffect(() => {
    let cancelled = false;
    const load = async (isRefresh: boolean) => {
      try {
        const [cfg, itemsRes, catsRes] = await Promise.all([
          fetchConfig(screen),
          fetchItems('online_pickup').catch(() => ({ data: [] as Item[] })),
          // Category names title the generated menu slides. A failure here
          // degrades to untitled groups rather than blanking the board.
          fetchCategories().catch(() => ({ data: [] as Category[] })),
        ]);
        if (cancelled) return;
        const lite = toLite(itemsRes.data ?? []);
        const cats: SignageCategoryLite[] = (catsRes.data ?? [])
          .map((c) => ({ id: Number(c.id), name: String(c.name ?? '') }))
          .filter((c) => Number.isFinite(c.id) && c.name !== '');
        // Also pull offers into specials hint — items already carry special
        void fetchOffers().catch(() => null);

        writeCache(screen, { config: cfg, items: lite, categories: cats, savedAt: Date.now() });
        setOffline(false);
        offlineRef.current = false;
        setItems(lite);
        setCategories(cats);

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
          setCategories(cached.categories ?? []);
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
  const showBanner = Boolean(
    config
    && !black
    && shouldShowBanner(config.banner, config.mode),
  );
  const isLoading = !config && !offline;
  const showIdleBrand = Boolean(config && !currentSlide && !black);

  return (
    <div
      className={`signage-page signage-orient-${orientation}${embedded ? ' signage-embed' : ''}`}
      data-testid="signage-page"
      data-embed={embedded ? '1' : '0'}
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
      {showIdleBrand && config && (
        <div className="signage-stage" data-testid="signage-idle-brand">
          <SlideCanvas
            slide={idleSlide}
            theme={config.theme}
            variables={{
              ...liveVars,
              branch_name: liveVars.branch_name || settings.site_name || 'Bake & Grill',
              business_phone: liveVars.business_phone || settings.business_phone || '',
              business_website: liveVars.business_website || settings.business_website || '',
            }}
            items={items}
            config={config}
            logoUrl={logoUrl}
            burnInOffset={burnIn}
          />
        </div>
      )}
      {showBanner && config?.banner && (
        <SignageBanner
          banner={config.banner}
          schedule={config.prayer_schedule ?? []}
          mode={config.mode}
          burnInOffset={burnIn}
          timeLabel={liveVars.current_time || undefined}
          variables={liveVars}
        />
      )}
      {isLoading && !black && (
        <div className="signage-loading" data-testid="signage-loading">
          Loading board…
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
