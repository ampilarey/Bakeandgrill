import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Copy, ExternalLink, Pencil, Save, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  approveSignageDevice,
  buildSignageTemplate,
  commandSignageDevice,
  createSignageCampaign,
  createSignageGroup,
  createSignagePlaylist,
  createSignageScreen,
  fetchSignageDevices,
  getSignageOverview,
  getSiteSettings,
  setSignageBanner,
  setSignageEmergency,
  setSignageEmergencyConfig,
  setSignagePrayer,
  updateSignageGroup,
  updateSignagePlaylist,
  type SignageBannerItem,
  type SignageCampaign,
  type SignageDevice,
  type SignageEmergencyEntry,
  type SignageGroup,
  type SignageOverview,
  type SignagePlaylist,
  type SignageScreen,
} from '../api';
import {
  BANNER_REPEAT_SLIDER,
  BANNER_SPEED_PRESETS,
  BANNER_SPEED_RANGE,
  EMERGENCY_ICON_NAMES,
  normalizeBannerSettings,
  newBannerItem,
  resolveBannerScrollMode,
} from '@shared/signage';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../components/ui';
import { MediaPicker } from '../components/MediaPicker';
import { Btn, Card, EmptyState, Input, PageHeader, PageShell, Select, Spinner } from '../components/SharedUI';
import { BannerAppearanceEditor } from './signage/BannerAppearanceEditor';
import { BannerLivePreview } from './signage/BannerLivePreview';
import { nearestPresetValue } from './signage/bannerAppearanceUx';
import { SignageDesigner, type DesignerSlide } from './signage/SignageDesigner';

const BANNER_FIELD_OPTS = [
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'next_prayer', label: 'Next prayer' },
  { value: 'countdown', label: 'Countdown' },
  { value: 'all_prayers', label: 'All prayers' },
] as const;

type Tab = 'screens' | 'playlists' | 'campaigns' | 'emergency' | 'prayer' | 'banner' | 'devices';

type SlideDraft = {
  id: string;
  name?: string;
  seconds?: number;
  weight?: number;
  transition?: string;
  template_origin?: string;
  [key: string]: unknown;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'screens', label: 'Screens & Groups' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'prayer', label: 'Prayer' },
  { id: 'banner', label: 'Banner' },
  { id: 'devices', label: 'Devices' },
];

const EMERGENCY_MODES = [
  { value: 'none', label: 'None — normal rotation' },
  { value: 'closed', label: 'Closed' },
  { value: 'prayer_break', label: 'Prayer break (manual)' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'fire_alarm', label: 'Fire alarm / evacuate' },
  { value: 'power_failure', label: 'Power failure' },
  { value: 'kitchen_closed', label: 'Kitchen closed' },
  { value: 'staff_only', label: 'Staff only' },
  { value: 'private_event', label: 'Private event' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'special_notice', label: 'Special notice' },
  { value: 'reopening_soon', label: 'Reopening soon' },
] as const;

const EMERGENCY_LAYOUTS = [
  { value: 'notice', label: 'Notice' },
  { value: 'alert', label: 'Alert' },
  { value: 'split', label: 'Split' },
  { value: 'countdown', label: 'Countdown' },
  { value: 'full_bleed', label: 'Full bleed' },
] as const;

const EMERGENCY_MEDIA_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'icon', label: 'Icon' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
] as const;

const EMERGENCY_ICON_OPTS = EMERGENCY_ICON_NAMES.map((name) => ({
  value: name,
  label: name.charAt(0).toUpperCase() + name.slice(1),
}));

const SCHEDULE_DAY_OPTS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

function emergencyEntryId(): string {
  return `emg-${Math.random().toString(36).slice(2, 10)}`;
}

function newEmergencyEntry(): SignageEmergencyEntry {
  return {
    id: emergencyEntryId(),
    mode: 'special_notice',
    priority: 10,
    is_active: true,
    layout: 'notice',
    title: '',
    body: '',
    title_dv: '',
    body_dv: '',
    reopen_at: null,
    schedule: null,
    media_type: 'none',
    media_url: '',
    icon: 'megaphone',
  };
}

function pickSiteSetting(
  settings: Record<string, { key: string; value: string | null }[]>,
  key: string,
): string | null {
  for (const group of Object.values(settings)) {
    const row = group.find((s) => s.key === key);
    if (row?.value) return row.value;
  }
  return null;
}

const PRAYER_OPTIONS = [
  { value: 'fajr', label: 'Fajr' },
  { value: 'dhuhr', label: 'Dhuhr' },
  { value: 'asr', label: 'Asr' },
  { value: 'maghrib', label: 'Maghrib' },
  { value: 'isha', label: 'Isha' },
] as const;

const TRANSITIONS = ['fade', 'slide', 'zoom', 'dissolve', 'flip', 'push', 'cube', 'wipe'];

const cardTitle: CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 12px' };
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block' };
const fieldStyle: CSSProperties = { minHeight: 44, width: '100%', borderRadius: 10, border: '1px solid var(--color-border)', padding: '0 12px', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const tabBtn = (active: boolean): CSSProperties => ({
  height: 44,
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: active ? 700 : 500,
  fontSize: 13,
  border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
  background: active ? 'var(--color-warning-bg)' : 'var(--color-surface)',
  color: active ? '#9A3412' : 'var(--color-text-secondary)',
});

function tvUrl(slug: string): string {
  const path = `/order/tv/${encodeURIComponent(slug || 'default')}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

/** Board pixel size for thumbnail scaling — honour orientation when resolution is landscape-labelled. */
export function boardPixelSize(
  resolution: string | null | undefined,
  orientation: string | null | undefined,
): { width: number; height: number } {
  const m = /^(\d+)\s*[xX×]\s*(\d+)$/.exec(String(resolution || '1920x1080').trim());
  let width = m ? Number(m[1]) : 1920;
  let height = m ? Number(m[2]) : 1080;
  if (!Number.isFinite(width) || width <= 0) width = 1920;
  if (!Number.isFinite(height) || height <= 0) height = 1080;
  const portrait = String(orientation || '').toLowerCase() === 'portrait';
  if (portrait && width > height) {
    return { width: height, height: width };
  }
  if (!portrait && height > width) {
    return { width: height, height: width };
  }
  return { width, height };
}

function SignageScreenPreview({ screen, url }: { screen: SignageScreen; url: string }) {
  const { width: boardW, height: boardH } = boardPixelSize(screen.resolution, screen.orientation);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() => 240 / boardH);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      setScale(240 / boardH);
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width: cw, height: ch } = entry.contentRect;
      if (cw <= 0 || ch <= 0) return;
      setScale(Math.min(cw / boardW, ch / boardH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [boardW, boardH]);

  const previewSrc = `${url}${url.includes('?') ? '&' : '?'}embed=1`;

  // ~240px tall thumbnail; width follows board aspect (portrait stays portrait).
  const thumbH = 240;
  const thumbW = thumbH * (boardW / boardH);

  return (
    <div
      ref={boxRef}
      data-testid={`signage-preview-${screen.slug}`}
      style={{
        marginTop: 16,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
        background: '#111',
        position: 'relative',
        width: `min(100%, ${thumbW}px)`,
        aspectRatio: `${boardW} / ${boardH}`,
        maxHeight: thumbH,
      }}
    >
      <iframe
        title={`Preview ${screen.name}`}
        src={previewSrc}
        data-testid={`signage-preview-frame-${screen.slug}`}
        style={{
          width: boardW,
          height: boardH,
          border: 'none',
          display: 'block',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function asSlides(raw: unknown): SlideDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => {
    const slide = (s && typeof s === 'object' ? s : {}) as SlideDraft;
    return {
      ...slide,
      id: String(slide.id ?? `slide-${i}`),
      seconds: Number(slide.seconds ?? 12),
      weight: Number(slide.weight ?? 1),
      transition: String(slide.transition ?? 'fade'),
    };
  });
}

function slideLabel(slide: SlideDraft): string {
  return slide.name || slide.template_origin || slide.smart_type?.toString() || slide.id;
}

export function SignagePage() {
  usePageTitle('TV Signage');
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('screens');
  const [designIndex, setDesignIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<SignageOverview | null>(null);

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [playlistSaving, setPlaylistSaving] = useState(false);
  const [templateKey, setTemplateKey] = useState('');
  const [addingSlide, setAddingSlide] = useState(false);

  const [groupDrafts, setGroupDrafts] = useState<Record<number, number | ''>>({});
  const [groupSaving, setGroupSaving] = useState<number | null>(null);

  const [emergencyMode, setEmergencyMode] = useState('none');
  const [emergencyEntries, setEmergencyEntries] = useState<SignageEmergencyEntry[]>([]);
  const [emergencySaving, setEmergencySaving] = useState(false);
  const [emergencyConfigSaving, setEmergencyConfigSaving] = useState(false);
  const [emergencyMediaPick, setEmergencyMediaPick] = useState<{ id: string; mediaType: 'image' | 'video' } | null>(null);

  const [prayerEnabled, setPrayerEnabled] = useState(true);
  const [prayerBreak, setPrayerBreak] = useState('15');
  const [prayerSelected, setPrayerSelected] = useState<string[]>([]);
  const [prayerIslandId, setPrayerIslandId] = useState('');
  const [prayerSaving, setPrayerSaving] = useState(false);

  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerItems, setBannerItems] = useState<SignageBannerItem[]>(() => normalizeBannerSettings({}).banners);
  const [bannerShowLogoBetween, setBannerShowLogoBetween] = useState(false);
  const [bannerLogoUrl, setBannerLogoUrl] = useState<string | null>(null);
  const [bannerSaving, setBannerSaving] = useState(false);

  const [campaignForm, setCampaignForm] = useState({
    name: '',
    playlist_id: '',
    priority: '10',
    date_start: '',
    date_end: '',
  });
  const [campaignSaving, setCampaignSaving] = useState(false);

  const [screenForm, setScreenForm] = useState({
    name: '',
    slug: '',
    group_id: '',
    playlist_id: '',
    orientation: 'landscape',
  });
  const [screenSaving, setScreenSaving] = useState(false);

  const [playlistForm, setPlaylistForm] = useState({ name: '' });
  const [playlistCreating, setPlaylistCreating] = useState(false);

  const [groupForm, setGroupForm] = useState({
    name: '',
    playlist_id: '',
    orientation: 'landscape',
    refresh_seconds: '120',
  });
  const [groupCreating, setGroupCreating] = useState(false);

  const [devices, setDevices] = useState<SignageDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState<number | null>(null);
  const [approveScreen, setApproveScreen] = useState<Record<number, string>>({});

  const applyOverview = useCallback((data: SignageOverview) => {
    setOverview(data);
    const emergencyCfg = typeof data.emergency === 'string'
      ? { manual: data.emergency, entries: [] as SignageEmergencyEntry[] }
      : data.emergency;
    setEmergencyMode(emergencyCfg?.manual || 'none');
    setEmergencyEntries(emergencyCfg?.entries ?? []);
    setPrayerEnabled(data.prayer?.enabled ?? true);
    setPrayerBreak(String(data.prayer?.break_minutes ?? 15));
    setPrayerSelected(data.prayer?.prayers ?? []);
    setPrayerIslandId(data.prayer?.island_id ? String(data.prayer.island_id) : '');
    const normalizedBanner = normalizeBannerSettings(data.banner ?? {});
    setBannerEnabled(normalizedBanner.enabled);
    setBannerItems(normalizedBanner.banners);
    setBannerShowLogoBetween(Boolean(normalizedBanner.show_logo_between));
    const drafts: Record<number, number | ''> = {};
    for (const g of data.groups) drafts[g.id] = g.playlist_id ?? '';
    setGroupDrafts(drafts);
    if (!selectedPlaylistId && data.playlists[0]) {
      setSelectedPlaylistId(data.playlists[0].id);
      setSlides(asSlides(data.playlists[0].slides));
    }
  }, [selectedPlaylistId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSignageOverview();
      applyOverview(data);
      if (selectedPlaylistId) {
        const pl = data.playlists.find((p) => p.id === selectedPlaylistId);
        if (pl) setSlides(asSlides(pl.slides));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load signage');
    } finally {
      setLoading(false);
    }
  }, [applyOverview, selectedPlaylistId, toast]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'banner') return;
    void getSiteSettings()
      .then(({ settings }) => {
        const logoDark = pickSiteSetting(settings, 'logo_dark');
        const logo = pickSiteSetting(settings, 'logo');
        setBannerLogoUrl(logoDark || logo || null);
      })
      .catch(() => { /* preview works without logo */ });
  }, [tab]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetchSignageDevices();
      setDevices(res.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load devices');
    } finally {
      setDevicesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (tab !== 'devices') return;
    void loadDevices();
    const t = window.setInterval(() => void loadDevices(), 30_000);
    return () => window.clearInterval(t);
  }, [tab, loadDevices]);

  const playlists = overview?.playlists ?? [];
  const groups = overview?.groups ?? [];
  const screens = overview?.screens ?? [];
  const campaigns = overview?.campaigns ?? [];
  const templates = overview?.templates ?? [];
  const pendingDevices = devices.filter((d) => !d.approved);
  const approvedDevices = devices.filter((d) => d.approved);

  const playlistOptions = useMemo(
    () => playlists.map((p) => ({ value: String(p.id), label: p.name })),
    [playlists],
  );

  const onSelectPlaylist = (id: number) => {
    setSelectedPlaylistId(id);
    const pl = playlists.find((p) => p.id === id);
    setSlides(asSlides(pl?.slides));
  };

  const onSavePlaylist = async () => {
    if (!selectedPlaylistId) return;
    setPlaylistSaving(true);
    try {
      const res = await updateSignagePlaylist(selectedPlaylistId, { slides });
      const updated = res.data;
      setOverview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          playlists: prev.playlists.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
        };
      });
      setSlides(asSlides(updated.slides));
      toast.success('Playlist saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPlaylistSaving(false);
    }
  };

  const onAddSlide = async () => {
    if (!templateKey) {
      toast.error('Choose a template first.');
      return;
    }
    setAddingSlide(true);
    try {
      const res = await buildSignageTemplate(templateKey);
      const slide = res.slide as SlideDraft;
      setSlides((prev) => [...prev, {
        ...slide,
        id: String(slide.id ?? `slide-${Date.now()}`),
        seconds: Number(slide.seconds ?? 12),
        weight: Number(slide.weight ?? 1),
        transition: String(slide.transition ?? 'fade'),
      }]);
      setTemplateKey('');
      toast.success('Slide added — save playlist to publish.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not build template');
    } finally {
      setAddingSlide(false);
    }
  };

  const moveSlide = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= slides.length) return;
    setSlides((prev) => {
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row);
      return copy;
    });
  };

  const onDeleteSlide = (index: number) => {
    const slide = slides[index];
    if (!slide) return;
    const label = slideLabel(slide);
    if (!window.confirm(`Delete slide "${label}"? Save the playlist to publish.`)) {
      return;
    }
    setSlides((prev) => prev.filter((_, i) => i !== index));
    setDesignIndex((current) => {
      if (current == null) return current;
      if (current === index) return null;
      if (index < current) return current - 1;
      return current;
    });
    toast.success('Slide removed — save playlist to publish.');
  };

  const onSaveGroup = async (group: SignageGroup) => {
    const draft = groupDrafts[group.id];
    const playlistId = draft === '' ? null : Number(draft);
    setGroupSaving(group.id);
    try {
      const res = await updateSignageGroup(group.id, { playlist_id: playlistId });
      setOverview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) => (g.id === group.id ? { ...g, ...res.data } : g)),
        };
      });
      toast.success(`Group "${group.name}" updated.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Group update failed');
    } finally {
      setGroupSaving(null);
    }
  };

  const onSaveEmergency = async () => {
    setEmergencySaving(true);
    try {
      const res = await setSignageEmergency(emergencyMode);
      setEmergencyMode(res.manual);
      setEmergencyEntries(res.entries ?? []);
      setOverview((prev) => (prev ? { ...prev, emergency: res } : prev));
      toast.success('Emergency mode updated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Emergency update failed');
    } finally {
      setEmergencySaving(false);
    }
  };

  const patchEmergencyEntry = (id: string, patch: Partial<SignageEmergencyEntry>) => {
    setEmergencyEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const onSaveEmergencyConfig = async () => {
    setEmergencyConfigSaving(true);
    try {
      const res = await setSignageEmergencyConfig({ entries: emergencyEntries });
      setEmergencyEntries(res.entries ?? emergencyEntries);
      setOverview((prev) => (prev ? { ...prev, emergency: res } : prev));
      toast.success('Scheduled emergencies saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scheduled emergencies failed');
    } finally {
      setEmergencyConfigSaving(false);
    }
  };

  const onSavePrayer = async () => {
    const breakMinutes = Number.parseInt(prayerBreak, 10);
    if (!Number.isFinite(breakMinutes) || breakMinutes < 1 || breakMinutes > 60) {
      toast.error('Break minutes must be between 1 and 60.');
      return;
    }
    setPrayerSaving(true);
    try {
      const islandId = Number.parseInt(prayerIslandId, 10);
      const res = await setSignagePrayer({
        enabled: prayerEnabled,
        prayers: prayerSelected,
        break_minutes: breakMinutes,
        ...(Number.isFinite(islandId) && islandId > 0 ? { island_id: islandId } : {}),
      });
      setOverview((prev) => (prev ? { ...prev, prayer: res.prayer } : prev));
      if (res.prayer?.island_id) setPrayerIslandId(String(res.prayer.island_id));
      toast.success('Prayer break settings saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Prayer settings failed');
    } finally {
      setPrayerSaving(false);
    }
  };

  const patchBannerItem = (id: string, patch: Partial<SignageBannerItem>) => {
    setBannerItems((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const moveBanner = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= bannerItems.length) return;
    setBannerItems((prev) => {
      const copy = [...prev];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row);
      return copy;
    });
  };

  const onSaveBanner = async () => {
    for (const b of bannerItems) {
      if (b.speed_seconds < BANNER_SPEED_RANGE.min || b.speed_seconds > BANNER_SPEED_RANGE.max) {
        toast.error(`“${b.label}” speed must be between ${BANNER_SPEED_RANGE.min} and ${BANNER_SPEED_RANGE.max}.`);
        return;
      }
      const repeats = Number(b.repeat_count ?? 1);
      if (!Number.isFinite(repeats) || repeats < 1 || repeats > 20) {
        toast.error(`“${b.label}” repeat count must be between 1 and 20.`);
        return;
      }
    }
    setBannerSaving(true);
    try {
      const res = await setSignageBanner({
        enabled: bannerEnabled,
        show_logo_between: bannerShowLogoBetween,
        banners: bannerItems,
      });
      const normalized = normalizeBannerSettings(res.banner);
      setBannerEnabled(normalized.enabled);
      setBannerItems(normalized.banners);
      setBannerShowLogoBetween(Boolean(normalized.show_logo_between));
      setOverview((prev) => (prev ? { ...prev, banner: normalized } : prev));
      toast.success('Banner settings saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Banner settings failed');
    } finally {
      setBannerSaving(false);
    }
  };

  const onCreateCampaign = async () => {
    const name = campaignForm.name.trim();
    if (!name) {
      toast.error('Campaign name is required.');
      return;
    }
    setCampaignSaving(true);
    try {
      const body: Partial<SignageCampaign> & { name: string } = {
        name,
        priority: Number.parseInt(campaignForm.priority, 10) || 0,
      };
      if (campaignForm.playlist_id) body.playlist_id = Number(campaignForm.playlist_id);
      if (campaignForm.date_start) body.date_start = campaignForm.date_start;
      if (campaignForm.date_end) body.date_end = campaignForm.date_end;
      const res = await createSignageCampaign(body);
      setOverview((prev) => (prev ? { ...prev, campaigns: [res.data, ...prev.campaigns] } : prev));
      setCampaignForm({ name: '', playlist_id: '', priority: '10', date_start: '', date_end: '' });
      toast.success('Campaign created.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Campaign create failed');
    } finally {
      setCampaignSaving(false);
    }
  };

  const onCreateScreen = async () => {
    const name = screenForm.name.trim();
    if (!name) {
      toast.error('Screen name is required.');
      return;
    }
    setScreenSaving(true);
    try {
      const body: Partial<SignageScreen> & { name: string } = {
        name,
        orientation: screenForm.orientation || 'landscape',
      };
      const slug = screenForm.slug.trim();
      if (slug) body.slug = slug;
      if (screenForm.group_id) body.group_id = Number(screenForm.group_id);
      if (screenForm.playlist_id) body.playlist_id = Number(screenForm.playlist_id);
      const res = await createSignageScreen(body);
      setOverview((prev) => (prev ? { ...prev, screens: [res.data, ...prev.screens] } : prev));
      setScreenForm({ name: '', slug: '', group_id: '', playlist_id: '', orientation: 'landscape' });
      toast.success('Screen created.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Screen create failed');
    } finally {
      setScreenSaving(false);
    }
  };

  const onCreatePlaylist = async () => {
    const name = playlistForm.name.trim();
    if (!name) {
      toast.error('Playlist name is required.');
      return;
    }
    setPlaylistCreating(true);
    try {
      const body: Partial<SignagePlaylist> & { name: string } = { name, slides: [], is_active: true };
      const res = await createSignagePlaylist(body);
      setOverview((prev) => (prev ? { ...prev, playlists: [res.data, ...prev.playlists] } : prev));
      setPlaylistForm({ name: '' });
      setSelectedPlaylistId(res.data.id);
      setSlides(asSlides(res.data.slides));
      toast.success('Playlist created.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Playlist create failed');
    } finally {
      setPlaylistCreating(false);
    }
  };

  const onCreateGroup = async () => {
    const name = groupForm.name.trim();
    if (!name) {
      toast.error('Group name is required.');
      return;
    }
    const refreshSeconds = Number.parseInt(groupForm.refresh_seconds, 10);
    if (!Number.isFinite(refreshSeconds) || refreshSeconds < 15 || refreshSeconds > 3600) {
      toast.error('Refresh seconds must be between 15 and 3600.');
      return;
    }
    setGroupCreating(true);
    try {
      const body: Partial<SignageGroup> & { name: string } = {
        name,
        orientation: groupForm.orientation || 'landscape',
        refresh_seconds: refreshSeconds,
      };
      if (groupForm.playlist_id) body.playlist_id = Number(groupForm.playlist_id);
      const res = await createSignageGroup(body);
      setOverview((prev) => (prev ? { ...prev, groups: [res.data, ...prev.groups] } : prev));
      setGroupDrafts((prev) => ({ ...prev, [res.data.id]: res.data.playlist_id ?? '' }));
      setGroupForm({ name: '', playlist_id: '', orientation: 'landscape', refresh_seconds: '120' });
      toast.success('Group created.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Group create failed');
    } finally {
      setGroupCreating(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('URL copied.');
    } catch {
      toast.error('Could not copy URL.');
    }
  };

  const renderScreenCard = (screen: SignageScreen) => {
    const url = tvUrl(screen.slug);
    return (
      <div key={screen.id} data-testid={`signage-screen-${screen.slug}`}>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 280px' }}>
            <h3 style={cardTitle}>{screen.name}{screen.is_default ? ' (default)' : ''}</h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Slug: <code style={{ fontSize: 12 }}>{screen.slug}</code>
              {screen.group?.name ? ` · Group: ${screen.group.name}` : ''}
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 13, wordBreak: 'break-all', color: 'var(--color-text)' }}>{url}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Btn variant="secondary" onClick={() => void copyUrl(url)} style={{ minHeight: 44 }}>
                <Copy size={16} /> Copy URL
              </Btn>
              <Btn variant="secondary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} style={{ minHeight: 44 }}>
                <ExternalLink size={16} /> Open
              </Btn>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <QRCodeSVG value={url} size={120} level="M" />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Scan to open on TV</span>
          </div>
        </div>
        <SignageScreenPreview screen={screen} url={url} />
      </Card>
      </div>
    );
  };

  const prayerIslandOptions = (overview?.prayer_islands ?? []).map((i) => ({
    value: String(i.id),
    label: i.label,
  }));
  const prayerIslandLabel =
    prayerIslandOptions.find((o) => o.value === prayerIslandId)?.label
    || prayerIslandOptions[0]?.label
    || 'Malé';

  const boardTheme = useMemo(() => {
    const pl = overview?.playlists.find((p) => p.id === selectedPlaylistId)
      ?? overview?.playlists[0];
    const t = (pl?.theme && typeof pl.theme === 'object' ? pl.theme : {}) as Record<string, unknown>;
    return {
      background: typeof t.background === 'string' ? t.background : '#1C1408',
      surface: typeof t.surface === 'string' ? t.surface : '#2A2118',
      primary: typeof t.primary === 'string' ? t.primary : '#D4813A',
      text: typeof t.text === 'string' ? t.text : '#FFF8F0',
      muted: typeof t.muted === 'string' ? t.muted : '#C4B5A5',
    };
  }, [overview?.playlists, selectedPlaylistId]);

  return (
    <div data-testid="signage-studio" className="signage-studio">
    <PageShell>
      <PageHeader
        title="TV Signage"
        subtitle="Digital menu boards, playlists, campaigns & emergency overrides"
      />

      <div className="signage-tab-row" data-testid="signage-tab-row" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" style={tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {tab === 'screens' && (
            <div>
              <div data-testid="signage-new-screen">
              <Card style={{ marginBottom: 20 }}>
                <h3 style={cardTitle}>New screen</h3>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <Input
                    id="signage-screen-name"
                    label="Name"
                    value={screenForm.name}
                    onChange={(val) => setScreenForm((f) => ({ ...f, name: val }))}
                  />
                  <Input
                    id="signage-screen-slug"
                    label="Slug (optional)"
                    value={screenForm.slug}
                    onChange={(val) => setScreenForm((f) => ({ ...f, slug: val }))}
                    placeholder="auto from name"
                  />
                  <Select
                    label="Group"
                    value={screenForm.group_id}
                    onChange={(val) => setScreenForm((f) => ({ ...f, group_id: val }))}
                    options={[
                      { value: '', label: '— optional —' },
                      ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                    ]}
                  />
                  <Select
                    label="Playlist"
                    value={screenForm.playlist_id}
                    onChange={(val) => setScreenForm((f) => ({ ...f, playlist_id: val }))}
                    options={[{ value: '', label: '— optional —' }, ...playlistOptions]}
                  />
                  <Select
                    label="Orientation"
                    value={screenForm.orientation}
                    onChange={(val) => setScreenForm((f) => ({ ...f, orientation: val }))}
                    options={[
                      { value: 'landscape', label: 'Landscape' },
                      { value: 'portrait', label: 'Portrait' },
                    ]}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Btn onClick={() => void onCreateScreen()} disabled={screenSaving} style={{ minHeight: 44 }} data-testid="signage-create-screen">
                    {screenSaving ? 'Creating…' : 'Create screen'}
                  </Btn>
                </div>
              </Card>
              </div>

              <h2 style={{ ...cardTitle, fontSize: 17, marginBottom: 16 }}>Screens</h2>
              {screens.length === 0 ? (
                <EmptyState message="No screens yet. Create one above to get a TV URL and QR code." />
              ) : (
                screens.map(renderScreenCard)
              )}

              <h2 style={{ ...cardTitle, fontSize: 17, margin: '24px 0 16px' }}>Groups</h2>
              <div data-testid="signage-new-group">
              <Card style={{ marginBottom: 16 }}>
                <h3 style={cardTitle}>New group</h3>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <Input
                    id="signage-group-name"
                    label="Name"
                    value={groupForm.name}
                    onChange={(val) => setGroupForm((f) => ({ ...f, name: val }))}
                  />
                  <Select
                    label="Playlist"
                    value={groupForm.playlist_id}
                    onChange={(val) => setGroupForm((f) => ({ ...f, playlist_id: val }))}
                    options={[{ value: '', label: '— optional —' }, ...playlistOptions]}
                  />
                  <Select
                    label="Orientation"
                    value={groupForm.orientation}
                    onChange={(val) => setGroupForm((f) => ({ ...f, orientation: val }))}
                    options={[
                      { value: 'landscape', label: 'Landscape' },
                      { value: 'portrait', label: 'Portrait' },
                    ]}
                  />
                  <Input
                    label="Refresh seconds"
                    type="number"
                    value={groupForm.refresh_seconds}
                    onChange={(val) => setGroupForm((f) => ({ ...f, refresh_seconds: val }))}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Btn onClick={() => void onCreateGroup()} disabled={groupCreating} style={{ minHeight: 44 }} data-testid="signage-create-group">
                    {groupCreating ? 'Creating…' : 'Create group'}
                  </Btn>
                </div>
              </Card>
              </div>
              {groups.length === 0 ? (
                <EmptyState message="No groups yet. Groups bundle screens with a shared playlist." />
              ) : (
                groups.map((group) => (
                  <div key={group.id} data-testid={`signage-group-card-${group.id}`}>
                  <Card style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 200px' }}>
                        <strong style={{ display: 'block', marginBottom: 4 }}>{group.name}</strong>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{group.orientation} · refresh {group.refresh_seconds}s</span>
                      </div>
                      <div style={{ flex: '2 1 260px' }}>
                        <label style={labelStyle}>Playlist</label>
                        <select
                          value={String(groupDrafts[group.id] ?? '')}
                          onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [group.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                          style={fieldStyle}
                          data-testid={`signage-group-playlist-${group.id}`}
                        >
                          <option value="">— inherit / none —</option>
                          {playlists.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <Btn
                        onClick={() => void onSaveGroup(group)}
                        disabled={groupSaving === group.id}
                        style={{ minHeight: 44 }}
                        data-testid={`signage-group-save-${group.id}`}
                      >
                        <Save size={16} /> {groupSaving === group.id ? 'Saving…' : 'Save'}
                      </Btn>
                    </div>
                  </Card>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'playlists' && (
            <div>
              {designIndex != null && slides[designIndex] && (
                <div data-testid="signage-designer-host">
                <Card style={{ marginBottom: 16 }}>
                  <SignageDesigner
                    slide={slides[designIndex] as DesignerSlide}
                    onClose={() => setDesignIndex(null)}
                    onChange={(next) => {
                      setSlides((prev) => prev.map((s, i) => (i === designIndex ? { ...s, ...next } : s)));
                      setDesignIndex(null);
                    }}
                  />
                </Card>
                </div>
              )}

              <div data-testid="signage-new-playlist">
              <Card style={{ marginBottom: 16 }}>
                <h3 style={cardTitle}>New playlist</h3>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <Input
                    id="signage-playlist-name"
                    label="Name"
                    value={playlistForm.name}
                    onChange={(val) => setPlaylistForm((f) => ({ ...f, name: val }))}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Btn onClick={() => void onCreatePlaylist()} disabled={playlistCreating} style={{ minHeight: 44 }} data-testid="signage-create-playlist">
                    {playlistCreating ? 'Creating…' : 'Create playlist'}
                  </Btn>
                </div>
              </Card>
              </div>

              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 220px' }}>
                    <Select
                      label="Playlist"
                      value={selectedPlaylistId ? String(selectedPlaylistId) : ''}
                      onChange={(val) => onSelectPlaylist(Number(val))}
                      options={playlistOptions.length > 0 ? playlistOptions : [{ value: '', label: '— create a playlist first —' }]}
                    />
                  </div>
                  <Btn onClick={() => void onSavePlaylist()} disabled={!selectedPlaylistId || playlistSaving} style={{ minHeight: 44 }}>
                    <Save size={16} /> {playlistSaving ? 'Saving…' : 'Save playlist'}
                  </Btn>
                </div>
              </Card>

              <Card style={{ marginBottom: 16 }}>
                <h3 style={cardTitle}>Add slide from template</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '2 1 260px' }}>
                    <label style={labelStyle}>Template</label>
                    <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} style={fieldStyle}>
                      <option value="">Select template…</option>
                      {templates.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <Btn onClick={() => void onAddSlide()} disabled={!templateKey || addingSlide} style={{ minHeight: 44 }}>
                    {addingSlide ? 'Adding…' : '+ Add slide'}
                  </Btn>
                </div>
              </Card>

              {slides.length === 0 ? (
                <EmptyState message="No slides yet. Add a template slide to this playlist." />
              ) : (
                slides.map((slide, index) => (
                  <div key={slide.id} data-testid={`signage-slide-${index}`}>
                  <Card style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{slideLabel(slide)}</strong>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>ID: {slide.id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Btn variant="secondary" onClick={() => setDesignIndex(index)} style={{ minHeight: 44 }} data-testid={`signage-design-${index}`}>
                          <Pencil size={14} /> Design
                        </Btn>
                        <Btn variant="secondary" onClick={() => moveSlide(index, -1)} disabled={index === 0} style={{ minHeight: 44 }}>↑</Btn>
                        <Btn variant="secondary" onClick={() => moveSlide(index, 1)} disabled={index === slides.length - 1} style={{ minHeight: 44 }}>↓</Btn>
                        <Btn variant="danger" onClick={() => onDeleteSlide(index)} style={{ minHeight: 44 }} data-testid={`signage-delete-${index}`}>
                          <Trash2 size={14} /> Delete
                        </Btn>
                      </div>
                    </div>
                    <div className="form-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
                      <div>
                        <label style={labelStyle}>Seconds</label>
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={slide.seconds ?? 12}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, seconds: val } : s)));
                          }}
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Weight</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={slide.weight ?? 1}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, weight: val } : s)));
                          }}
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Transition</label>
                        <select
                          value={slide.transition ?? 'fade'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, transition: val } : s)));
                          }}
                          style={fieldStyle}
                        >
                          {TRANSITIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </Card>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'campaigns' && (
            <div>
              <Card style={{ marginBottom: 20 }}>
                <h3 style={cardTitle}>New campaign</h3>
                <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <Input
                    label="Name"
                    value={campaignForm.name}
                    onChange={(val) => setCampaignForm((f) => ({ ...f, name: val }))}
                  />
                  <Select
                    label="Playlist"
                    value={campaignForm.playlist_id}
                    onChange={(val) => setCampaignForm((f) => ({ ...f, playlist_id: val }))}
                    options={[{ value: '', label: '— optional —' }, ...playlistOptions]}
                  />
                  <Input
                    label="Priority"
                    type="number"
                    value={campaignForm.priority}
                    onChange={(val) => setCampaignForm((f) => ({ ...f, priority: val }))}
                  />
                  <Input
                    label="Start date"
                    type="date"
                    value={campaignForm.date_start}
                    onChange={(val) => setCampaignForm((f) => ({ ...f, date_start: val }))}
                  />
                  <Input
                    label="End date"
                    type="date"
                    value={campaignForm.date_end}
                    onChange={(val) => setCampaignForm((f) => ({ ...f, date_end: val }))}
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <Btn onClick={() => void onCreateCampaign()} disabled={campaignSaving} style={{ minHeight: 44 }}>
                    {campaignSaving ? 'Creating…' : 'Create campaign'}
                  </Btn>
                </div>
              </Card>

              {campaigns.length === 0 ? (
                <EmptyState message="No campaigns yet. Scheduled playlists override the default rotation." />
              ) : (
                campaigns.map((c) => {
                  const playlistName = playlists.find((p) => p.id === c.playlist_id)?.name;
                  return (
                  <Card key={c.id} style={{ marginBottom: 10 }}>
                    <strong>{c.name}</strong>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                      Priority {c.priority}
                      {playlistName ? ` · ${playlistName}` : ''}
                      {c.date_start ? ` · ${c.date_start}` : ''}
                      {c.date_end ? ` → ${c.date_end}` : ''}
                      {c.is_active ? '' : ' · inactive'}
                    </div>
                  </Card>
                  );
                })
              )}
            </div>
          )}

          {tab === 'emergency' && (
            <div data-testid="signage-emergency-panel">
            <Card>
              <h3 style={cardTitle}>Emergency override</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 560 }}>
                Instantly replaces all TV slides with a full-screen emergency message. Clears automatically when set back to None.
              </p>
              <label style={labelStyle}>Mode</label>
              <select
                data-testid="signage-emergency-select"
                value={emergencyMode}
                onChange={(e) => setEmergencyMode(e.target.value)}
                style={{ ...fieldStyle, maxWidth: 420, marginBottom: 16 }}
              >
                {EMERGENCY_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <Btn onClick={() => void onSaveEmergency()} disabled={emergencySaving} style={{ minHeight: 44 }}>
                <Save size={16} /> {emergencySaving ? 'Saving…' : 'Save emergency mode'}
              </Btn>
            </Card>

            <Card style={{ marginTop: 16 }} data-testid="signage-emergency-scheduled">
              <h3 style={cardTitle}>Scheduled emergencies</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 640 }}>
                Auto-activate during configured windows. Manual mode above always wins immediately.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                {emergencyEntries.map((entry, idx) => {
                  const sched = entry.schedule ?? {};
                  const days = Array.isArray(sched.days) ? sched.days.map(Number) : [];
                  const window = sched.windows?.[0] ?? { start: '', end: '' };
                  return (
                    <div
                      key={entry.id}
                      data-testid={`signage-emergency-entry-${entry.id}`}
                      style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--color-text)' }}>Entry {idx + 1}</strong>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, cursor: 'pointer', fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={entry.is_active}
                              onChange={(e) => patchEmergencyEntry(entry.id, { is_active: e.target.checked })}
                              style={{ width: 18, height: 18 }}
                            />
                            Active
                          </label>
                          <Btn
                            type="button"
                            variant="secondary"
                            onClick={() => setEmergencyEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                            style={{ minHeight: 40 }}
                            data-testid={`signage-emergency-remove-${entry.id}`}
                          >
                            <Trash2 size={14} /> Remove
                          </Btn>
                        </div>
                      </div>
                      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <Select
                          label="Mode"
                          value={entry.mode}
                          onChange={(val) => patchEmergencyEntry(entry.id, { mode: val })}
                          options={EMERGENCY_MODES.filter((m) => m.value !== 'none').map((m) => ({
                            value: m.value,
                            label: m.label,
                          }))}
                        />
                        <Select
                          label="Layout"
                          value={entry.layout || 'notice'}
                          onChange={(val) => patchEmergencyEntry(entry.id, { layout: val })}
                          options={EMERGENCY_LAYOUTS.map((l) => ({ value: l.value, label: l.label }))}
                        />
                        <Input
                          label="Priority"
                          type="number"
                          min={0}
                          max={100}
                          value={String(entry.priority ?? 10)}
                          onChange={(val) => patchEmergencyEntry(entry.id, { priority: Number.parseInt(val, 10) || 0 })}
                        />
                      </div>
                      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <Input
                          label="Title (English)"
                          value={entry.title}
                          onChange={(val) => patchEmergencyEntry(entry.id, { title: val })}
                        />
                        <Input
                          label="Title (Dhivehi)"
                          value={entry.title_dv ?? ''}
                          onChange={(val) => patchEmergencyEntry(entry.id, { title_dv: val })}
                        />
                      </div>
                      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <Input
                          label="Body (English)"
                          value={entry.body}
                          onChange={(val) => patchEmergencyEntry(entry.id, { body: val })}
                        />
                        <Input
                          label="Body (Dhivehi)"
                          value={entry.body_dv ?? ''}
                          onChange={(val) => patchEmergencyEntry(entry.id, { body_dv: val })}
                        />
                      </div>
                      {entry.mode === 'reopening_soon' && (
                        <Input
                          label="Reopen at"
                          type="datetime-local"
                          value={entry.reopen_at ? entry.reopen_at.slice(0, 16) : ''}
                          onChange={(val) => patchEmergencyEntry(entry.id, {
                            reopen_at: val ? new Date(val).toISOString() : null,
                          })}
                          data-testid={`signage-emergency-reopen-${entry.id}`}
                        />
                      )}
                      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <Select
                          label="Media"
                          value={entry.media_type || 'none'}
                          onChange={(val) => {
                            const mediaType = val as SignageEmergencyEntry['media_type'];
                            if (entry.mode === 'fire_alarm' && (mediaType === 'image' || mediaType === 'video')) {
                              toast.error('Fire alarm may only use none or icon media.');
                              return;
                            }
                            patchEmergencyEntry(entry.id, {
                              media_type: mediaType,
                              media_url: mediaType === 'image' || mediaType === 'video' ? (entry.media_url || '') : '',
                            });
                          }}
                          options={EMERGENCY_MEDIA_TYPES
                            .filter((m) => entry.mode !== 'fire_alarm' || m.value === 'none' || m.value === 'icon')
                            .map((m) => ({ value: m.value, label: m.label }))}
                          data-testid={`signage-emergency-media-type-${entry.id}`}
                        />
                        {(entry.media_type || 'none') === 'icon' && (
                          <Select
                            label="Icon"
                            value={entry.icon || 'megaphone'}
                            onChange={(val) => patchEmergencyEntry(entry.id, { icon: val })}
                            options={EMERGENCY_ICON_OPTS}
                            data-testid={`signage-emergency-icon-${entry.id}`}
                          />
                        )}
                      </div>
                      {((entry.media_type || 'none') === 'image' || (entry.media_type || 'none') === 'video') && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                          <Btn
                            type="button"
                            variant="secondary"
                            style={{ minHeight: 44 }}
                            data-testid={`signage-emergency-media-pick-${entry.id}`}
                            onClick={() => setEmergencyMediaPick({
                              id: entry.id,
                              mediaType: entry.media_type === 'video' ? 'video' : 'image',
                            })}
                          >
                            Choose from library
                          </Btn>
                          {entry.media_url ? (
                            <span
                              style={{ fontSize: 12, color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}
                              data-testid={`signage-emergency-media-url-${entry.id}`}
                            >
                              {entry.media_url}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>No media selected</span>
                          )}
                        </div>
                      )}
                      <div>
                        <span style={labelStyle}>Days (empty = every day)</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {SCHEDULE_DAY_OPTS.map((d) => (
                            <label key={d.value} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, cursor: 'pointer', fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={days.includes(d.value)}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...new Set([...days, d.value])]
                                    : days.filter((x) => x !== d.value);
                                  patchEmergencyEntry(entry.id, {
                                    schedule: {
                                      ...sched,
                                      days: next.length > 0 ? next : null,
                                    },
                                  });
                                }}
                                style={{ width: 16, height: 16 }}
                              />
                              {d.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                        <Input
                          label="Window start (optional)"
                          type="time"
                          value={window.start || ''}
                          onChange={(val) => patchEmergencyEntry(entry.id, {
                            schedule: {
                              ...sched,
                              days: sched.days ?? null,
                              windows: val || sched.windows?.[0]?.end
                                ? [{ start: val || '00:00', end: sched.windows?.[0]?.end || '23:59' }]
                                : null,
                            },
                          })}
                        />
                        <Input
                          label="Window end (optional)"
                          type="time"
                          value={window.end || ''}
                          onChange={(val) => patchEmergencyEntry(entry.id, {
                            schedule: {
                              ...sched,
                              days: sched.days ?? null,
                              windows: val || sched.windows?.[0]?.start
                                ? [{ start: sched.windows?.[0]?.start || '00:00', end: val || '23:59' }]
                                : null,
                            },
                          })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Btn
                  type="button"
                  variant="secondary"
                  onClick={() => setEmergencyEntries((prev) => [...prev, newEmergencyEntry()])}
                  style={{ minHeight: 44 }}
                  data-testid="signage-emergency-add"
                >
                  Add scheduled emergency
                </Btn>
                <Btn
                  onClick={() => void onSaveEmergencyConfig()}
                  disabled={emergencyConfigSaving}
                  style={{ minHeight: 44 }}
                  data-testid="signage-emergency-config-save"
                >
                  <Save size={16} /> {emergencyConfigSaving ? 'Saving…' : 'Save scheduled emergencies'}
                </Btn>
              </div>
            </Card>
            <MediaPicker
              open={Boolean(emergencyMediaPick)}
              onClose={() => setEmergencyMediaPick(null)}
              mediaType={emergencyMediaPick?.mediaType}
              title="Emergency media"
              onPick={(asset) => {
                if (!emergencyMediaPick) return;
                patchEmergencyEntry(emergencyMediaPick.id, {
                  media_type: emergencyMediaPick.mediaType,
                  media_url: asset.url,
                });
                setEmergencyMediaPick(null);
              }}
            />
            </div>
          )}

          {tab === 'prayer' && (
            <Card data-testid="signage-prayer-panel">
              <h3 style={cardTitle}>Prayer break</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 560 }}>
                During configured prayer times, TVs show a prayer-break slide for the break duration.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: 16, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={prayerEnabled}
                  onChange={(e) => setPrayerEnabled(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Enable prayer break slides</span>
              </label>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Input
                  label="Break minutes"
                  type="number"
                  min={1}
                  max={60}
                  value={prayerBreak}
                  onChange={(val) => setPrayerBreak(val)}
                />
                <Select
                  label="Prayer location"
                  value={prayerIslandId}
                  onChange={(val) => setPrayerIslandId(val)}
                  options={
                    prayerIslandOptions.length > 0
                      ? prayerIslandOptions
                      : [{ value: '', label: 'Malé (default)' }]
                  }
                  data-testid="signage-prayer-island"
                />
              </div>
              <p style={{ margin: '-4px 0 16px', fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 560 }}>
                Banner countdown and automatic prayer-break slides use this island’s times.
              </p>
              <div style={{ marginBottom: 16 }}>
                <span style={labelStyle}>Prayers</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {PRAYER_OPTIONS.map((p) => (
                    <label key={p.value} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={prayerSelected.includes(p.value)}
                        onChange={(e) => {
                          setPrayerSelected((prev) => (
                            e.target.checked ? [...prev, p.value] : prev.filter((x) => x !== p.value)
                          ));
                        }}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
              <Btn onClick={() => void onSavePrayer()} disabled={prayerSaving} style={{ minHeight: 44 }}>
                <Save size={16} /> {prayerSaving ? 'Saving…' : 'Save prayer settings'}
              </Btn>
            </Card>
          )}

          {tab === 'banner' && (
            <Card data-testid="signage-banner-panel">
              <h3 style={cardTitle}>Info banners</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 640 }}>
                Rotating scrolling strips on every slide. Use field chips (date, time, prayer) or custom text with
                {' '}{'{{variables}}'} (e.g. Wi‑Fi). Hidden during emergency and prayer-break modes.
              </p>
              <BannerLivePreview
                enabled={bannerEnabled}
                banners={bannerItems}
                boardBackground={boardTheme.background}
                logoUrl={bannerLogoUrl}
                showLogoBetween={bannerShowLogoBetween}
              />
              <div
                data-testid="signage-banner-prayer-island-summary"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 16,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--color-surface-2, var(--color-surface))',
                  border: '1px solid var(--color-border)',
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span>
                  Prayer times: <strong style={{ color: 'var(--color-text)' }}>{prayerIslandLabel}</strong>
                  {' — change in the Prayer tab'}
                </span>
                <button
                  type="button"
                  onClick={() => setTab('prayer')}
                  data-testid="signage-banner-goto-prayer"
                  style={{
                    minHeight: 36,
                    padding: '0 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Open Prayer tab
                </button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: 16, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={bannerEnabled}
                  onChange={(e) => setBannerEnabled(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                  data-testid="signage-banner-enabled"
                />
                <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Enable info banners</span>
              </label>

              {bannerItems.filter((x) => x.enabled).length >= 2 && (
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: 16, cursor: 'pointer' }}
                  data-testid="signage-banner-show-logo-between"
                >
                  <input
                    type="checkbox"
                    checked={bannerShowLogoBetween}
                    onChange={(e) => setBannerShowLogoBetween(e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>Show logo between banners</span>
                </label>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                {bannerItems.map((b, idx) => {
                  const usingCustom = Boolean((b.custom_text || '').trim());
                  const enabledCount = bannerItems.filter((x) => x.enabled).length;
                  const speedNearest = nearestPresetValue(b.speed_seconds ?? 40, BANNER_SPEED_PRESETS);
                  const speedIndex = Math.max(0, BANNER_SPEED_PRESETS.findIndex((p) => p.value === speedNearest));
                  const speedPreset = BANNER_SPEED_PRESETS[speedIndex] ?? BANNER_SPEED_PRESETS[1];
                  const repeatDisplay = Math.max(
                    BANNER_REPEAT_SLIDER.min,
                    Math.min(BANNER_REPEAT_SLIDER.max, Number(b.repeat_count ?? 1)),
                  );
                  const scrollMode = resolveBannerScrollMode(b);
                  return (
                    <div
                      key={b.id}
                      data-testid={`signage-banner-item-${b.id}`}
                      style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--color-text)' }}>Banner {idx + 1}</strong>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, cursor: 'pointer', fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={b.enabled}
                              onChange={(e) => patchBannerItem(b.id, { enabled: e.target.checked })}
                              style={{ width: 18, height: 18 }}
                            />
                            On
                          </label>
                          {bannerItems.length > 1 && (
                            <>
                              <Btn
                                type="button"
                                variant="secondary"
                                onClick={() => moveBanner(idx, -1)}
                                disabled={idx === 0}
                                style={{ minHeight: 40 }}
                                data-testid={`signage-banner-up-${idx}`}
                                aria-label={`Move banner ${idx + 1} up`}
                              >
                                ↑
                              </Btn>
                              <Btn
                                type="button"
                                variant="secondary"
                                onClick={() => moveBanner(idx, 1)}
                                disabled={idx === bannerItems.length - 1}
                                style={{ minHeight: 40 }}
                                data-testid={`signage-banner-down-${idx}`}
                                aria-label={`Move banner ${idx + 1} down`}
                              >
                                ↓
                              </Btn>
                              <Btn
                                type="button"
                                variant="secondary"
                                onClick={() => setBannerItems((prev) => prev.filter((x) => x.id !== b.id))}
                                style={{ minHeight: 40 }}
                                data-testid={`signage-banner-remove-${b.id}`}
                              >
                                <Trash2 size={14} /> Remove
                              </Btn>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <Input
                          label="Label"
                          value={b.label}
                          onChange={(val) => patchBannerItem(b.id, { label: val })}
                        />
                        <Select
                          label="Position"
                          value={b.position === 'top' ? 'top' : 'bottom'}
                          onChange={(val) => patchBannerItem(b.id, { position: val === 'top' ? 'top' : 'bottom' })}
                          options={[
                            { value: 'bottom', label: 'Bottom' },
                            { value: 'top', label: 'Top' },
                          ]}
                        />
                        <Select
                          label="Motion"
                          value={scrollMode}
                          onChange={(val) => patchBannerItem(b.id, { scroll_mode: val })}
                          options={[
                            { value: 'ticker', label: 'Ticker — scrolls off, then returns' },
                            { value: 'seamless', label: 'Seamless — continuous loop' },
                            { value: 'static', label: 'Static — no motion' },
                          ]}
                          data-testid={`signage-banner-scroll-mode-${b.id}`}
                        />
                        <Select
                          label="Direction"
                          value={b.direction === 'rtl' ? 'rtl' : 'ltr'}
                          onChange={(val) => patchBannerItem(b.id, { direction: val === 'rtl' ? 'rtl' : 'ltr' })}
                          options={[
                            { value: 'ltr', label: 'English (LTR)' },
                            { value: 'rtl', label: 'Dhivehi (RTL)' },
                          ]}
                          data-testid={`signage-banner-direction-${b.id}`}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={`signage-banner-speed-${b.id}`}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                            Speed · {speedPreset.label}
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={BANNER_SPEED_PRESETS.length - 1}
                            step={1}
                            value={speedIndex}
                            onChange={(e) => {
                              const preset = BANNER_SPEED_PRESETS[Number.parseInt(e.target.value, 10)] ?? BANNER_SPEED_PRESETS[1];
                              patchBannerItem(b.id, { speed_seconds: preset.value });
                            }}
                            style={{ width: '100%', maxWidth: 360, minHeight: 36 }}
                            data-testid={`signage-banner-speed-slider-${b.id}`}
                          />
                          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            {speedPreset.label} ({speedPreset.value}s)
                          </span>
                        </label>

                        {enabledCount >= 2 && (
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid={`signage-banner-repeat-${b.id}`}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                              Passes before next banner · {repeatDisplay}
                            </span>
                            <input
                              type="range"
                              min={BANNER_REPEAT_SLIDER.min}
                              max={BANNER_REPEAT_SLIDER.max}
                              step={1}
                              value={repeatDisplay}
                              onChange={(e) => patchBannerItem(b.id, {
                                repeat_count: Number.parseInt(e.target.value, 10) || 1,
                              })}
                              style={{ width: '100%', maxWidth: 360, minHeight: 36 }}
                              data-testid={`signage-banner-repeat-slider-${b.id}`}
                            />
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              How many full scroll passes before rotating to the next banner.
                            </span>
                          </label>
                        )}
                      </div>

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                          Fields {usingCustom ? '(ignored while custom text is set)' : ''}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {BANNER_FIELD_OPTS.map((f) => {
                            const checked = (b.fields ?? []).includes(f.value);
                            return (
                              <label key={f.value} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, cursor: 'pointer', fontSize: 13 }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={usingCustom}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...new Set([...(b.fields ?? []), f.value])]
                                      : (b.fields ?? []).filter((x) => x !== f.value);
                                    patchBannerItem(b.id, { fields: next.length ? next : ['date', 'time'] });
                                  }}
                                  style={{ width: 16, height: 16 }}
                                />
                                {f.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <Input
                        label="Custom text (optional)"
                        value={b.custom_text ?? ''}
                        onChange={(val) => patchBannerItem(b.id, { custom_text: val })}
                        placeholder="Wi-Fi: {{wifi_name}} · {{wifi_password}}"
                      />

                      <BannerAppearanceEditor
                        banner={b}
                        theme={boardTheme}
                        onPatch={(patch) => patchBannerItem(b.id, patch)}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Btn
                  type="button"
                  variant="secondary"
                  onClick={() => setBannerItems((prev) => [...prev, newBannerItem({ label: `Banner ${prev.length + 1}` })])}
                  style={{ minHeight: 44 }}
                  data-testid="signage-banner-add"
                >
                  Add banner
                </Btn>
                <Btn onClick={() => void onSaveBanner()} disabled={bannerSaving} style={{ minHeight: 44 }} data-testid="signage-banner-save">
                  <Save size={16} /> {bannerSaving ? 'Saving…' : 'Save banner settings'}
                </Btn>
              </div>
            </Card>
          )}

          {tab === 'devices' && (
            <div data-testid="signage-devices-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <h3 style={cardTitle}>Pending pairings</h3>
                  <Btn variant="secondary" onClick={() => void loadDevices()} disabled={devicesLoading} style={{ minHeight: 44 }}>
                    {devicesLoading ? 'Refreshing…' : 'Refresh'}
                  </Btn>
                </div>
                {pendingDevices.length === 0 ? (
                  <EmptyState message="No pending TVs. Open /order/tv on a new display to get a 6-character pairing code." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {pendingDevices.map((d) => (
                      <div
                        key={d.id}
                        data-testid={`signage-pending-${d.id}`}
                        className="form-grid-3"
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, alignItems: 'end', padding: 12, border: '1px solid var(--color-border)', borderRadius: 12 }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '0.12em' }}>{d.pairing_code || '······'}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                            {d.online ? 'Online now' : 'Seen'} · {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'never'}
                          </div>
                          <div style={{ fontSize: 11, color: '#9A8B7A', marginTop: 2, wordBreak: 'break-all' }}>{d.device_id}</div>
                        </div>
                        <div>
                          <Select
                            label="Assign screen"
                            value={approveScreen[d.id] ?? String(screens[0]?.id ?? '')}
                            onChange={(val) => setApproveScreen((prev) => ({ ...prev, [d.id]: val }))}
                            options={screens.map((s) => ({ value: String(s.id), label: `${s.name} (${s.slug})` }))}
                            style={fieldStyle}
                          />
                        </div>
                        <Btn
                          onClick={() => void (async () => {
                            setDeviceBusy(d.id);
                            try {
                              const screenId = Number(approveScreen[d.id] || screens[0]?.id);
                              await approveSignageDevice(d.id, { screen_id: screenId || null });
                              toast.success('TV approved.');
                              await loadDevices();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Approve failed');
                            } finally {
                              setDeviceBusy(null);
                            }
                          })()}
                          disabled={deviceBusy === d.id}
                          style={{ minHeight: 44 }}
                        >
                          {deviceBusy === d.id ? 'Approving…' : 'Approve'}
                        </Btn>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h3 style={cardTitle}>Health</h3>
                {approvedDevices.length === 0 ? (
                  <EmptyState message="No approved devices. Approve a pairing code to monitor heartbeat health and send remote commands." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {approvedDevices.map((d) => {
                      const meta = d.meta || {};
                      return (
                        <div
                          key={d.id}
                          data-testid={`signage-device-${d.id}`}
                          style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14 }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                                {d.screen?.name || 'Unassigned screen'}
                                <span
                                  style={{
                                    marginLeft: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: d.online ? 'var(--color-success-strong)' : '#9A3412',
                                    background: d.online ? 'var(--color-success-bg)' : '#FFEDD5',
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                  }}
                                >
                                  {d.online ? 'Online' : 'Offline'}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                                Playlist {String(meta.playlist_version || '—')} · Slide {String(meta.current_slide || '—')} · Build {String(meta.build_version || '—')}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                {String(meta.resolution || '—')} · Last sync {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'never'} · Cache {String(meta.cache_status || '—')}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {(['refresh', 'skip', 'pause', 'resume', 'black_screen', 'maintenance', 'restart', 'fullscreen'] as const).map((cmd) => (
                                <Btn
                                  key={cmd}
                                  variant="secondary"
                                  disabled={deviceBusy === d.id}
                                  onClick={() => void (async () => {
                                    setDeviceBusy(d.id);
                                    try {
                                      await commandSignageDevice(d.id, cmd);
                                      toast.success(`Queued ${cmd}`);
                                      await loadDevices();
                                    } catch (e) {
                                      toast.error(e instanceof Error ? e.message : 'Command failed');
                                    } finally {
                                      setDeviceBusy(null);
                                    }
                                  })()}
                                  style={{ minHeight: 44, textTransform: 'capitalize' }}
                                >
                                  {cmd.replace('_', ' ')}
                                </Btn>
                              ))}
                            </div>
                          </div>
                          {d.queued_command?.type && (
                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-warning-strong)' }}>
                              Queued: {d.queued_command.type}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </PageShell>
    </div>
  );
}
