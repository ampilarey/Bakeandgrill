import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Copy, ExternalLink, Pencil, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  approveSignageDevice,
  buildSignageTemplate,
  commandSignageDevice,
  createSignageCampaign,
  fetchSignageDevices,
  getSignageOverview,
  setSignageEmergency,
  setSignagePrayer,
  updateSignageGroup,
  updateSignagePlaylist,
  type SignageCampaign,
  type SignageDevice,
  type SignageGroup,
  type SignageOverview,
  type SignageScreen,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useToast } from '../components/ui';
import { Btn, Card, EmptyState, Input, PageHeader, PageShell, Select, Spinner } from '../components/SharedUI';
import { SignageDesigner, type DesignerSlide } from './signage/SignageDesigner';

type Tab = 'screens' | 'playlists' | 'campaigns' | 'emergency' | 'prayer' | 'devices';

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
] as const;

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
  background: active ? '#FFF7ED' : '#fff',
  color: active ? '#9A3412' : 'var(--color-text-secondary)',
});

function tvUrl(slug: string): string {
  const path = `/order/tv/${encodeURIComponent(slug || 'default')}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
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
  const [emergencySaving, setEmergencySaving] = useState(false);

  const [prayerEnabled, setPrayerEnabled] = useState(true);
  const [prayerBreak, setPrayerBreak] = useState('15');
  const [prayerSelected, setPrayerSelected] = useState<string[]>([]);
  const [prayerSaving, setPrayerSaving] = useState(false);

  const [campaignForm, setCampaignForm] = useState({
    name: '',
    playlist_id: '',
    priority: '10',
    date_start: '',
    date_end: '',
  });
  const [campaignSaving, setCampaignSaving] = useState(false);

  const [devices, setDevices] = useState<SignageDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState<number | null>(null);
  const [approveScreen, setApproveScreen] = useState<Record<number, string>>({});

  const applyOverview = useCallback((data: SignageOverview) => {
    setOverview(data);
    setEmergencyMode(data.emergency || 'none');
    setPrayerEnabled(data.prayer?.enabled ?? true);
    setPrayerBreak(String(data.prayer?.break_minutes ?? 15));
    setPrayerSelected(data.prayer?.prayers ?? []);
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
      setEmergencyMode(res.mode);
      setOverview((prev) => (prev ? { ...prev, emergency: res.mode } : prev));
      toast.success('Emergency mode updated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Emergency update failed');
    } finally {
      setEmergencySaving(false);
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
      const res = await setSignagePrayer({
        enabled: prayerEnabled,
        prayers: prayerSelected,
        break_minutes: breakMinutes,
      });
      setOverview((prev) => (prev ? { ...prev, prayer: res.prayer } : prev));
      toast.success('Prayer break settings saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Prayer settings failed');
    } finally {
      setPrayerSaving(false);
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
        <div style={{ marginTop: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)', background: '#111' }}>
          <iframe title={`Preview ${screen.name}`} src={url} style={{ width: '100%', height: 240, border: 'none', display: 'block' }} />
        </div>
      </Card>
      </div>
    );
  };

  return (
    <div data-testid="signage-studio">
    <PageShell>
      <PageHeader
        title="TV Signage"
        subtitle="Digital menu boards, playlists, campaigns & emergency overrides"
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
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
              <h2 style={{ ...cardTitle, fontSize: 17, marginBottom: 16 }}>Screens</h2>
              {screens.length === 0 ? (
                <EmptyState message="No screens yet. Add a screen from the API or database seed." />
              ) : (
                screens.map(renderScreenCard)
              )}

              <h2 style={{ ...cardTitle, fontSize: 17, margin: '24px 0 16px' }}>Groups</h2>
              {groups.length === 0 ? (
                <EmptyState message="No groups yet. Groups bundle screens with a shared playlist." />
              ) : (
                groups.map((group) => (
                  <Card key={group.id} style={{ marginBottom: 12 }}>
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
                      >
                        <Save size={16} /> {groupSaving === group.id ? 'Saving…' : 'Save'}
                      </Btn>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {tab === 'playlists' && (
            <div>
              {designIndex != null && slides[designIndex] && (
                <Card style={{ marginBottom: 16 }} data-testid="signage-designer-host">
                  <SignageDesigner
                    slide={slides[designIndex] as DesignerSlide}
                    onClose={() => setDesignIndex(null)}
                    onChange={(next) => {
                      setSlides((prev) => prev.map((s, i) => (i === designIndex ? { ...s, ...next } : s)));
                      setDesignIndex(null);
                    }}
                  />
                </Card>
              )}

              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 220px' }}>
                    <Select
                      label="Playlist"
                      value={selectedPlaylistId ? String(selectedPlaylistId) : ''}
                      onChange={(val) => onSelectPlaylist(Number(val))}
                      options={playlistOptions}
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
                  <Card key={slide.id} style={{ marginBottom: 10 }} data-testid={`signage-slide-${index}`}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{slideLabel(slide)}</strong>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>ID: {slide.id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Btn variant="secondary" onClick={() => setDesignIndex(index)} style={{ minHeight: 44 }} data-testid={`signage-design-${index}`}>
                          <Pencil size={14} /> Design
                        </Btn>
                        <Btn variant="secondary" onClick={() => moveSlide(index, -1)} disabled={index === 0} style={{ minHeight: 44 }}>↑</Btn>
                        <Btn variant="secondary" onClick={() => moveSlide(index, 1)} disabled={index === slides.length - 1} style={{ minHeight: 44 }}>↓</Btn>
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
              <div style={{ maxWidth: 200, marginBottom: 16 }}>
                <Input
                  label="Break minutes"
                  type="number"
                  min={1}
                  max={60}
                  value={prayerBreak}
                  onChange={(val) => setPrayerBreak(val)}
                />
              </div>
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
                        style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: 12, alignItems: 'end', padding: 12, border: '1px solid var(--color-border)', borderRadius: 12 }}
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
                                    color: d.online ? '#166534' : '#9A3412',
                                    background: d.online ? '#DCFCE7' : '#FFEDD5',
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
                              {(['refresh', 'skip', 'pause', 'resume', 'black_screen', 'maintenance', 'restart'] as const).map((cmd) => (
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
                            <div style={{ marginTop: 8, fontSize: 12, color: '#9A3412' }}>
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
