import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  cancelSocialPost, checkSocialChannel, createSocialChannel, deleteSocialChannel,
  deleteSocialVideo, fetchMetaPending, fetchSocialAutomation, fetchSocialChannelOptions, fetchSocialChannels,
  fetchSocialPost, fetchSocialPosts, fetchSocialVideos, finishMetaConnect, generateSocialVideo,
  publishSocialPostNow, refreshSocialInsights, retrySocialDelivery, testSocialChannel,
  updateSocialAutomation, updateSocialChannel,
  startMetaConnect,
  type MetaPendingPage, type SocialAutomationConfig, type SocialAutomationKind, type SocialChannelOption, type SocialChannelRow,
  type SocialPlatformCaps, type SocialPostFilters, type SocialPostRow, type SocialVideoRenditionRow,
} from '../api';
import { ItemSearch, type MenuItemSelection } from '../components/ItemSearch';
import {
  Badge, Btn, Card, ErrorMsg, Input, Modal, ModalActions, PageHeader, PageShell, Pagination, Select, Spinner,
} from '../components/SharedUI';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { usePageTitle } from '../hooks/usePageTitle';
import { ComposeModal } from './social/ComposeModal';
import { PLATFORM_LABELS, navigateTo } from './social/composer';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Drafts' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'queued', label: 'Queued' },
  { value: 'published', label: 'Published' },
  { value: 'partial_failure', label: 'Partly failed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SOURCE_LABELS: Record<string, string> = {
  auto_special: 'Auto · daily special',
  auto_new_item: 'Auto · new on the menu',
  auto_featured: "Auto · chef's pick",
  channel_test: 'Test post',
};

const EDITABLE = ['draft', 'scheduled', 'awaiting_approval'];

const STATUS_COLORS: Record<string, 'green' | 'gray' | 'red' | 'orange' | 'blue'> = {
  published: 'green',
  draft: 'gray',
  scheduled: 'blue',
  queued: 'blue',
  processing: 'blue',
  partial_failure: 'orange',
  unknown: 'orange',
  skipped: 'orange',
  failed: 'red',
  cancelled: 'gray',
};

/**
 * Social Hub (docs/SOCIAL_SHARING_PLAN.md, phase 2): compose posts to the
 * business's own accounts, watch the queue/history, and (owner-only) manage
 * channel connections. Credentials are write-only — the UI only ever sees
 * masked summaries.
 */
export function SocialHubPage() {
  usePageTitle('Social Hub');
  const { can } = useCurrentUserPermissions();
  const canCompose = can('social.compose');
  const canChannels = can('social.channels.manage');

  const [tab, setTab] = useState<'posts' | 'automation' | 'videos' | 'channels'>('posts');
  const [channels, setChannels] = useState<SocialChannelRow[]>([]);
  const [platforms, setPlatforms] = useState<Record<string, SocialPlatformCaps>>({});
  const [posts, setPosts] = useState<SocialPostRow[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [filters, setFilters] = useState<SocialPostFilters>({ page: 1, status: '', include_tests: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState<SocialPostRow | 'new' | null>(null);
  const [editingChannel, setEditingChannel] = useState<SocialChannelRow | 'new' | null>(null);
  const [metaAvailable, setMetaAvailable] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const metaState = searchParams.get('meta_connect');
  const metaError = searchParams.get('meta_error');
  const clearMetaParams = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('meta_connect');
      next.delete('meta_error');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Back from Facebook: the Channels tab is where the result belongs.
  useEffect(() => {
    if (metaState || metaError) setTab('channels');
  }, [metaState, metaError]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const postsRes = await fetchSocialPosts(filters);
      setPosts(postsRes.posts);
      setMeta(postsRes.meta);
      if (canChannels) {
        const chRes = await fetchSocialChannels();
        setChannels(chRes.channels);
        setPlatforms(chRes.platforms);
        setMetaAvailable(Boolean(chRes.meta_connect?.available));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canChannels, filters]);

  useEffect(() => { void load(); }, [load]);

  return (
    <PageShell>
      <PageHeader
        section="Customers & Marketing"
        title="Social Hub"
        subtitle="Post to the business's Facebook, Instagram, Telegram and Viber"
        action={canCompose ? <Btn onClick={() => setComposing('new')}>+ New post</Btn> : undefined}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Btn small variant={tab === 'posts' ? 'primary' : 'secondary'} onClick={() => setTab('posts')}>Posts</Btn>
        <Btn small variant={tab === 'automation' ? 'primary' : 'secondary'} onClick={() => setTab('automation')}>
          Automation
        </Btn>
        <Btn small variant={tab === 'videos' ? 'primary' : 'secondary'} onClick={() => setTab('videos')}>
          Videos
        </Btn>
        {canChannels && (
          <Btn small variant={tab === 'channels' ? 'primary' : 'secondary'} onClick={() => setTab('channels')}>
            Channels
          </Btn>
        )}
      </div>

      {error && <ErrorMsg message={error} />}
      {tab === 'posts' ? (
        <PostList
          posts={posts}
          meta={meta}
          loading={loading}
          filters={filters}
          onFilters={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          onChanged={load}
          onEdit={canCompose ? (p) => setComposing(p) : undefined}
        />
      ) : loading ? <Spinner /> : tab === 'automation' ? (
        <AutomationSettings canEdit={can('social.publish')} />
      ) : tab === 'videos' ? (
        <VideoStudio canGenerate={can('social.compose')} />
      ) : (
        <ChannelList
          channels={channels}
          metaAvailable={metaAvailable}
          metaError={metaError}
          onDismissError={clearMetaParams}
          onEdit={setEditingChannel}
          onChanged={load}
        />
      )}

      {composing && (
        <ComposeModal
          post={composing === 'new' ? null : composing}
          onClose={() => setComposing(null)}
          onSaved={() => { setComposing(null); void load(); }}
          canCompose={canCompose}
          canPublish={can('social.publish')}
          canSchedule={can('social.schedule')}
        />
      )}
      {editingChannel && (
        <ChannelModal
          channel={editingChannel === 'new' ? null : editingChannel}
          platforms={platforms}
          onClose={() => setEditingChannel(null)}
          onSaved={() => { setEditingChannel(null); void load(); }}
        />
      )}
      {tab === 'channels' && canChannels && !loading && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {metaAvailable ? (
            <ConnectWithFacebookButton label="Connect with Facebook" />
          ) : (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              One-click Facebook/Instagram connect needs SOCIAL_META_APP_ID and SOCIAL_META_APP_SECRET on the server.
            </span>
          )}
          <Btn variant="secondary" onClick={() => setEditingChannel('new')}>+ Connect with a token</Btn>
        </div>
      )}
      {metaState && canChannels && (
        <MetaPagesModal
          state={metaState}
          onClose={clearMetaParams}
          onSaved={() => { clearMetaParams(); void load(); }}
        />
      )}
    </PageShell>
  );
}

function PostList({ posts, meta, loading, filters, onFilters, onChanged, onEdit }: {
  posts: SocialPostRow[];
  meta: { current_page: number; last_page: number; total: number };
  loading: boolean;
  filters: SocialPostFilters;
  onFilters: (patch: SocialPostFilters) => void;
  onChanged: () => void;
  onEdit?: (post: SocialPostRow) => void;
}) {
  const { can } = useCurrentUserPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); onChanged(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const filterBar = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
      <Select
        label="Status"
        options={STATUS_OPTIONS}
        value={filters.status ?? ''}
        onChange={(v) => onFilters({ status: v, page: 1 })}
        style={{ minWidth: 170 }}
        aria-label="Filter by status"
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minHeight: 44, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={Boolean(filters.include_tests)}
          onChange={(e) => onFilters({ include_tests: e.target.checked, page: 1 })}
        />
        Show test posts
      </label>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
        {meta.total} post{meta.total === 1 ? '' : 's'}
      </span>
    </div>
  );

  if (loading) {
    return <>{filterBar}<Spinner /></>;
  }

  if (posts.length === 0) {
    return (
      <>
        {filterBar}
        <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          {filters.status || filters.include_tests ? 'No posts match these filters.' : 'No posts yet. Compose one to get started.'}
        </Card>
      </>
    );
  }

  return (
    <div>
      {filterBar}
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <ErrorMsg message={error} />}
        {posts.map((post) => (
          <Card key={post.id} style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {post.snapshot.image_url && (
                <img
                  src={post.snapshot.image_url}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge label={post.status.replace('_', ' ')} color={STATUS_COLORS[post.status] ?? 'gray'} />
                  {SOURCE_LABELS[post.source] && <Badge label={SOURCE_LABELS[post.source]} color={post.source === 'channel_test' ? 'gray' : 'purple'} />}
                  {post.scheduled_at && post.status === 'scheduled' && (
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      for {new Date(post.scheduled_at).toLocaleString()}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {post.created_at ? new Date(post.created_at).toLocaleString() : ''}
                  </span>
                </div>
                <p style={{
                  margin: '6px 0 0', fontSize: 13, whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere', color: 'var(--color-text)',
                }}>
                  {post.snapshot.caption}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {post.deliveries.map((d) => (
                    <span
                      key={d.id}
                      title={d.error_message ?? undefined}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                        border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
                      }}
                    >
                      {PLATFORM_LABELS[d.channel?.platform ?? ''] ?? d.channel?.platform} · {d.status}
                      {d.insights && (
                        <span
                          data-testid="delivery-insights"
                          title={d.insights_at ? `As of ${new Date(d.insights_at).toLocaleString()}` : undefined}
                          style={{ fontWeight: 500, color: 'var(--color-text-muted)' }}
                        >
                          · ♥ {d.insights.likes ?? 0} · 💬 {d.insights.comments ?? 0}{typeof d.insights.shares === 'number' ? ` · ↗ ${d.insights.shares}` : ''}
                        </span>
                      )}
                      {d.permalink && (
                        <a href={d.permalink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
                          view
                        </a>
                      )}
                      {can('social.publish')
                        && ['failed', 'unknown', 'skipped'].includes(d.status) && (
                        <button
                          onClick={() => { void act(() => retrySocialDelivery(post.id, d.id)); }}
                          disabled={busy}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            color: 'var(--color-primary)', font: 'inherit', padding: 0,
                          }}
                        >
                          retry
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                {['published', 'partial_failure'].includes(post.status)
                  && post.deliveries.some((d) => d.status === 'published' && ['facebook', 'instagram'].includes(d.channel?.platform ?? '')) && (
                  <Btn small variant="secondary" disabled={busy} title="Fetch likes, comments and shares from the platform" onClick={() => { void act(() => refreshSocialInsights(post.id)); }}>
                    Refresh stats
                  </Btn>
                )}
                {onEdit && EDITABLE.includes(post.status) && (
                  <Btn small variant="secondary" disabled={busy} onClick={() => onEdit(post)}>Edit</Btn>
                )}
                {can('social.publish') && EDITABLE.includes(post.status) && (
                  <>
                    <Btn small disabled={busy} onClick={() => { void act(() => publishSocialPostNow(post.id)); }}>
                      {post.status === 'awaiting_approval' ? 'Approve & post' : 'Post now'}
                    </Btn>
                    <Btn small variant="secondary" disabled={busy} onClick={() => { void act(() => cancelSocialPost(post.id)); }}>
                      {post.status === 'awaiting_approval' ? 'Reject' : 'Cancel'}
                    </Btn>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Pagination page={meta.current_page} totalPages={meta.last_page} onChange={(p) => onFilters({ page: p })} />
    </div>
  );
}

const AUTOMATION_KINDS: { kind: SocialAutomationKind; title: string; blurb: string; variables: string }[] = [
  {
    kind: 'special',
    title: 'Daily special',
    blurb: 'Each day at the chosen time, one post advertising an active special. Nothing is posted when no special is active. Items without a real photo skip Instagram and post caption-only elsewhere.',
    variables: '{item} {name_dv} {price} {badge} {description} {link}',
  },
  {
    kind: 'new_item',
    title: 'New on the menu',
    blurb: 'Each day at the chosen time, one item that joined the menu recently and has a real photo, oldest first, each announced once. An item without a photo waits until it has one.',
    variables: '{item} {name_dv} {price} {description} {category} {link}',
  },
  {
    kind: 'featured',
    title: "Chef's pick",
    blurb: "On the chosen weekdays, one of the items marked as a Chef's pick (the same ones the website, order app and TV board show), rotating so the one posted longest ago goes next.",
    variables: '{item} {name_dv} {price} {description} {category} {link}',
  },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function AutomationSettings({ canEdit }: { canEdit: boolean }) {
  const [configs, setConfigs] = useState<Record<SocialAutomationKind, SocialAutomationConfig> | null>(null);
  const [options, setOptions] = useState<SocialChannelOption[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchSocialAutomation(), fetchSocialChannelOptions()])
      .then(([auto, ch]) => {
        setConfigs(auto.automations);
        setOptions(ch.channels);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <ErrorMsg message={error} />;
  if (configs === null) return <Spinner />;

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 680 }}>
      {AUTOMATION_KINDS.map((meta) => (
        <AutomationCard
          key={meta.kind}
          meta={meta}
          config={configs[meta.kind]}
          options={options}
          canEdit={canEdit}
          onSaved={(all) => setConfigs(all)}
        />
      ))}
    </div>
  );
}

function AutomationCard({ meta, config: initial, options, canEdit, onSaved }: {
  meta: typeof AUTOMATION_KINDS[number];
  config: SocialAutomationConfig;
  options: SocialChannelOption[];
  canEdit: boolean;
  onSaved: (all: Record<SocialAutomationKind, SocialAutomationConfig>) => void;
}) {
  const [config, setConfig] = useState<SocialAutomationConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const set = (patch: Partial<SocialAutomationConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const save = async () => {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const res = await updateSocialAutomation({ kind: meta.kind, ...config });
      setConfig(res.automations[meta.kind]);
      onSaved(res.automations);
      setNotice('Saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ padding: '16px 18px' }} data-testid={`automation-${meta.kind}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{meta.title}</div>
        <Badge label={config.enabled ? 'On' : 'Off'} color={config.enabled ? 'green' : 'gray'} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>{meta.blurb}</p>

      <div style={{ display: 'grid', gap: 12 }}>
        {error && <ErrorMsg message={error} />}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: canEdit ? 'pointer' : 'default' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            disabled={!canEdit}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Enabled
        </label>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Input
            label="Post time (Maldives local)"
            id={`auto-${meta.kind}-time`}
            type="time"
            value={config.time}
            disabled={!canEdit}
            onChange={(v: string) => set({ time: v })}
            style={{ maxWidth: 160 }}
          />
          {meta.kind === 'new_item' && (
            <Input
              label="Counts as new for (days)"
              id={`auto-${meta.kind}-age`}
              type="number"
              min={1}
              max={90}
              value={String(config.max_age_days)}
              disabled={!canEdit}
              onChange={(v: string) => set({ max_age_days: Math.max(1, Math.min(90, Number(v) || 1)) })}
              style={{ maxWidth: 160 }}
            />
          )}
        </div>

        {meta.kind === 'featured' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Days</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WEEKDAYS.map((label, day) => {
                const on = config.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={on}
                    onClick={() => set({ days: on ? config.days.filter((d) => d !== day) : [...config.days, day].sort() })}
                    style={{
                      minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 12,
                      fontWeight: on ? 700 : 500, border: on ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: on ? 'var(--color-warning-bg)' : 'var(--color-bg)', color: 'var(--color-text)',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Channels</div>
          {options.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>No enabled channels to choose from.</p>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {options.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: canEdit ? 'pointer' : 'default' }}>
                  <input
                    type="checkbox"
                    checked={config.channel_ids.includes(c.id)}
                    disabled={!canEdit}
                    onChange={(e) => set({
                      channel_ids: e.target.checked
                        ? [...config.channel_ids, c.id]
                        : config.channel_ids.filter((x) => x !== c.id),
                    })}
                  />
                  {PLATFORM_LABELS[c.platform] ?? c.platform} — {c.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Caption template
            <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>
              {' '}— variables: {meta.variables}
            </span>
          </div>
          <textarea
            value={config.template}
            disabled={!canEdit}
            aria-label={`${meta.title} caption template`}
            onChange={(e) => set({ template: e.target.value })}
            rows={4}
            maxLength={2200}
            style={{
              width: '100%', padding: 10, borderRadius: 10, fontFamily: 'inherit', fontSize: 13,
              border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text)', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: canEdit ? 'pointer' : 'default' }}>
          <input
            type="checkbox"
            checked={config.unattended}
            disabled={!canEdit}
            onChange={(e) => set({ unattended: e.target.checked })}
            style={{ marginTop: 2 }}
          />
          <span>
            Post without approval (unattended)
            <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)' }}>
              Off = each post waits in the Posts tab for someone to approve. Turn on
              only after approved posts have run cleanly for a while.
            </span>
          </span>
        </label>

        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Btn onClick={() => { void save(); }} disabled={saving}>{saving ? 'Saving…' : `Save ${meta.title.toLowerCase()}`}</Btn>
            {notice && <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{notice}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}

const FORMAT_LABELS: Record<string, string> = {
  vertical: 'Vertical 9:16 (Reels · Stories · TikTok)',
  square: 'Square 1:1 (feed)',
  landscape: 'Landscape 16:9 (FB · Telegram)',
};

function VideoStudio({ canGenerate }: { canGenerate: boolean }) {
  const [pick, setPick] = useState<MenuItemSelection | null>(null);
  const [loadedItemId, setLoadedItemId] = useState<number | null>(null);
  const [rendererAvailable, setRendererAvailable] = useState(true);
  const [hasPhotos, setHasPhotos] = useState(true);
  const [formats, setFormats] = useState<string[]>([]);
  const [renditions, setRenditions] = useState<SocialVideoRenditionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (id: number) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetchSocialVideos(id);
      setLoadedItemId(id);
      setRendererAvailable(res.renderer_available);
      setHasPhotos(res.has_photos);
      setFormats(res.formats);
      setRenditions(res.renditions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const generate = async (format: string) => {
    if (loadedItemId === null) return;
    setBusy(true);
    setError('');
    try {
      await generateSocialVideo(loadedItemId, format);
      await load(loadedItemId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Item videos</div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Builds a short silent clip from an item's real photos (slow zoom, crossfades,
          closing card with name and price). Renders run on their own background queue.
          Download the vertical format to upload to TikTok manually.
        </p>
        <ItemSearch
          kind="menu"
          value={pick}
          onChange={(sel) => {
            setPick(sel);
            if (sel) void load(sel.id); else setLoadedItemId(null);
          }}
          resultsPlacement="inline"
          browseByCategory
          placeholder="Search the menu for an item…"
        />
      </Card>

      {error && <ErrorMsg message={error} />}

      {loadedItemId !== null && (
        <Card style={{ padding: '16px 18px' }}>
          {!rendererAvailable && (
            <p style={{ fontSize: 13, color: 'var(--color-warning)', margin: '0 0 10px' }}>
              Video rendering is not enabled on this server — run{' '}
              <code>php artisan social:video-benchmark</code> on the host first.
            </p>
          )}
          {!hasPhotos && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
              This item has no usable photos. Videos are only built from real item photos.
            </p>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {formats.map((format) => {
              const rendition = renditions.find((r) => r.format === format) ?? null;
              return (
                <div
                  key={format}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                    padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 10,
                  }}
                >
                  {rendition?.poster_url && (
                    <img src={rendition.poster_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                  )}
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{FORMAT_LABELS[format] ?? format}</div>
                    {rendition && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                        {rendition.status}
                        {rendition.stale && ' · outdated (photos/price changed)'}
                        {rendition.bytes != null && ` · ${(rendition.bytes / 1048576).toFixed(1)} MB`}
                        {rendition.error_message && ` — ${rendition.error_message}`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {rendition?.status === 'ready' && rendition.url && (
                      <a
                        href={rendition.url}
                        download
                        style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', alignSelf: 'center' }}
                      >
                        Download
                      </a>
                    )}
                    {canGenerate && (
                      <Btn
                        small
                        variant="secondary"
                        disabled={busy || !rendererAvailable || !hasPhotos || rendition?.status === 'processing' || rendition?.status === 'queued'}
                        onClick={() => { void generate(format); }}
                      >
                        {rendition?.status === 'processing' || rendition?.status === 'queued'
                          ? 'Rendering…'
                          : rendition?.status === 'ready'
                            ? (rendition.stale ? 'Re-generate' : 'Up to date')
                            : 'Generate'}
                      </Btn>
                    )}
                    {canGenerate && rendition?.status === 'ready' && (
                      <Btn
                        small
                        variant="danger"
                        disabled={busy}
                        onClick={() => { void (async () => { await deleteSocialVideo(rendition.id); await load(loadedItemId); })(); }}
                      >
                        Delete
                      </Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn small variant="secondary" disabled={busy} onClick={() => { void load(loadedItemId); }}>Refresh status</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function ChannelList({ channels, metaAvailable, metaError, onDismissError, onEdit, onChanged }: {
  channels: SocialChannelRow[];
  metaAvailable: boolean;
  metaError: string | null;
  onDismissError: () => void;
  onEdit: (c: SocialChannelRow) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const errorBanner = metaError && (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <ErrorMsg message={`Facebook connect failed: ${metaError}`} />
      <Btn small variant="secondary" onClick={onDismissError}>Dismiss</Btn>
    </div>
  );

  const act = async (fn: () => Promise<unknown>, doneMsg: string) => {
    setBusy(true);
    setNotice('');
    try { await fn(); setNotice(doneMsg); onChanged(); } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  };

  /**
   * A test post is a real delivery on the queue. Rather than "check the
   * Posts tab" (where test posts are now hidden by default), watch it for
   * a short while and say here whether the platform took it.
   */
  const runTest = async (c: SocialChannelRow) => {
    setBusy(true);
    setNotice(`Sending a test post to ${c.name}…`);
    try {
      const { post_id } = await testSocialChannel(c.id);
      const outcome = await waitForTestOutcome(post_id);
      setNotice(outcome);
      onChanged();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (channels.length === 0) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {errorBanner}
        <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          No channels connected yet.
          {metaAvailable && ' Use "Connect with Facebook" below to add the Page and its Instagram account in one go.'}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {errorBanner}
      {notice && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{notice}</p>}
      {channels.map((c) => (
        <Card key={c.id} style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {PLATFORM_LABELS[c.platform] ?? c.platform} — {c.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {Object.entries(c.credential_summary).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'no credentials'}
                {c.last_published_at && ` · last post ${new Date(c.last_published_at).toLocaleString()}`}
              </div>
            </div>
            <Badge label={c.is_enabled ? 'Enabled' : 'Disabled'} color={c.is_enabled ? 'green' : 'gray'} />
            {c.is_test_channel && <Badge label="Test channel" color="orange" />}
            {c.recent_failures > 0 && <Badge label={`${c.recent_failures} recent failures`} color="red" />}
            <ChannelHealthBadge channel={c} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {metaAvailable && ['facebook', 'instagram'].includes(c.platform) && (
                <ConnectWithFacebookButton label="Reconnect" small />
              )}
              <Btn small variant="secondary" disabled={busy} onClick={() => onEdit(c)}>Edit</Btn>
              <Btn
                small
                variant="secondary"
                disabled={busy || !c.has_credentials}
                title="Ask the platform whether the credentials still work"
                onClick={() => { void act(() => checkSocialChannel(c.id), `Checked ${c.name}.`); }}
              >
                Check now
              </Btn>
              <Btn
                small
                variant="secondary"
                disabled={busy || !c.is_enabled}
                onClick={() => { void runTest(c); }}
              >
                Test post
              </Btn>
              <Btn
                small
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Disconnect ${c.name}? Its credentials are removed immediately.`)) {
                    void act(() => deleteSocialChannel(c.id), 'Channel disconnected.');
                  }
                }}
              >
                Disconnect
              </Btn>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * The last health check, as a badge: green "Connected", amber "Token
 * expires in N days", red with the platform's reason. Nothing until the
 * daily check (or "Check now") has run once.
 */
/** Sends the browser to Facebook's login dialog; the page comes back with ?meta_connect=STATE. */
function ConnectWithFacebookButton({ label, small }: { label: string; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      const { redirect_url } = await startMetaConnect();
      navigateTo(redirect_url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <Btn small={small} disabled={busy} onClick={() => { void go(); }} title="Log in to Facebook and pick the Page">
        {busy ? 'Opening Facebook…' : label}
      </Btn>
      {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
    </>
  );
}

/**
 * After Facebook: which Page (and its Instagram account) to connect. A
 * Page already connected is offered as a reconnect, which swaps the token
 * in place.
 */
function MetaPagesModal({ state, onClose, onSaved }: { state: string; onClose: () => void; onSaved: () => void }) {
  const [pages, setPages] = useState<MetaPendingPage[] | null>(null);
  const [pageId, setPageId] = useState('');
  const [facebook, setFacebook] = useState(true);
  const [instagram, setInstagram] = useState(true);
  const [isTest, setIsTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMetaPending(state)
      .then((res) => {
        setPages(res.pages);
        setPageId(res.pages[0]?.page_id ?? '');
      })
      .catch((e: Error) => { setError(e.message); setPages([]); });
  }, [state]);

  const page = (pages ?? []).find((p) => p.page_id === pageId) ?? null;

  const finish = async () => {
    if (!page) return;
    setSaving(true);
    setError('');
    try {
      await finishMetaConnect({ state, page_id: page.page_id, facebook, instagram: instagram && page.instagram !== null, is_test_channel: isTest });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Connect with Facebook"
      onClose={onClose}
      maxWidth={480}
      footer={(
        <ModalActions>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn disabled={saving || !page || (!facebook && !(instagram && page.instagram))} onClick={() => { void finish(); }}>
            {saving ? 'Connecting…' : 'Connect'}
          </Btn>
        </ModalActions>
      )}
    >
      {pages === null ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {error && <ErrorMsg message={error} />}
          {pages.length === 0 && !error && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>That login manages no Pages.</p>
          )}
          {pages.length > 1 && (
            <Select
              label="Page"
              aria-label="Page"
              options={pages.map((p) => ({ value: p.page_id, label: p.name }))}
              value={pageId}
              onChange={setPageId}
            />
          )}
          {page && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={facebook} onChange={(e) => setFacebook(e.target.checked)} />
                Facebook Page — {page.name}{page.already.facebook && ' (already connected: token will be refreshed)'}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: page.instagram ? 'pointer' : 'default', opacity: page.instagram ? 1 : 0.6 }}>
                <input type="checkbox" checked={instagram && page.instagram !== null} disabled={!page.instagram} onChange={(e) => setInstagram(e.target.checked)} />
                {page.instagram
                  ? <>Instagram — @{page.instagram.username || page.instagram.ig_user_id}{page.already.instagram && ' (already connected: token will be refreshed)'}</>
                  : 'Instagram — no business account is linked to this Page'}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
                Test channel (a non-production server may only post to test channels)
              </label>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function ChannelHealthBadge({ channel }: { channel: SocialChannelRow }) {
  const h = channel.health;
  if (!h) return null;
  const when = new Date(h.checked_at).toLocaleString();
  let color: 'green' | 'orange' | 'red' = 'green';
  let label: string;
  if (h.status === 'error') {
    color = 'red';
    label = `Not working: ${h.message}`;
  } else if (h.status === 'warning') {
    color = 'orange';
    const days = h.token_days_left;
    label = days === null ? h.message : days <= 0 ? 'Token expired' : `Token expires in ${days} day${days === 1 ? '' : 's'}`;
  } else {
    const expiry = h.token_days_left === null ? '' : ` · token ${h.token_days_left} days left`;
    label = `Connected${h.account_label ? ` as ${h.account_label}` : ''}${expiry}`;
  }
  const palette = {
    green: { bg: 'var(--color-success-bg)', text: 'var(--color-success-strong)' },
    orange: { bg: 'var(--color-warning-bg)', text: '#c2410c' },
    red: { bg: 'var(--color-danger-bg)', text: 'var(--color-danger-strong)' },
  }[color];
  return (
    <span
      data-testid="channel-health"
      data-status={h.status}
      title={`${h.message} Checked ${when}.`}
      style={{
        display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 9999,
        fontSize: '0.72rem', fontWeight: 700, background: palette.bg, color: palette.text,
        border: '1px solid var(--color-border)', maxWidth: 360, overflowWrap: 'anywhere',
      }}
    >
      {label}
    </span>
  );
}

/** Poll a test post for up to ~20 s and describe how its one delivery ended. */
export async function waitForTestOutcome(
  postId: number,
  opts: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<string> {
  const attempts = opts.attempts ?? 10;
  const delayMs = opts.delayMs ?? 2000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < attempts; i++) {
    const { post } = await fetchSocialPost(postId);
    const d = post.deliveries[0];
    if (d?.status === 'published') {
      return `Test post published${d.permalink ? ` — ${d.permalink}` : '.'}`;
    }
    if (d && ['failed', 'skipped', 'unknown', 'cancelled'].includes(d.status)) {
      return `Test post ${d.status}${d.error_message ? `: ${d.error_message}` : '.'}`;
    }
    if (i < attempts - 1) await sleep(delayMs);
  }
  return 'Test post is still queued — is the queue worker running? It will show under Posts (tick "Show test posts").';
}

function ChannelModal({ channel, platforms, onClose, onSaved }: {
  channel: SocialChannelRow | null;
  platforms: Record<string, SocialPlatformCaps>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const platformKeys = Object.keys(platforms);
  const [platform, setPlatform] = useState(channel?.platform ?? platformKeys[0] ?? 'facebook');
  const [name, setName] = useState(channel?.name ?? '');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [isEnabled, setIsEnabled] = useState(channel?.is_enabled ?? false);
  const [isTest, setIsTest] = useState(channel?.is_test_channel ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const credKeys = platforms[platform]?.credentials ?? [];
  const credsFilled = credKeys.every((k) => (creds[k] ?? '').trim() !== '');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (channel) {
        await updateSocialChannel(channel.id, {
          name,
          is_enabled: isEnabled,
          is_test_channel: isTest,
          // Rotation is all-or-nothing: only send credentials when every
          // key is (re-)entered, otherwise keep the stored ones.
          ...(credsFilled ? { credentials: creds } : {}),
        });
      } else {
        await createSocialChannel({
          platform, name, credentials: creds, is_enabled: isEnabled, is_test_channel: isTest,
        });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={channel ? `Edit ${channel.name}` : 'Connect channel'}
      onClose={onClose}
      maxWidth={480}
      footer={(
        <ModalActions>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn
            onClick={() => { void save(); }}
            disabled={saving || name.trim() === '' || (!channel && !credsFilled)}
          >
            {saving ? 'Saving…' : 'Save'}
          </Btn>
        </ModalActions>
      )}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <ErrorMsg message={error} />}
        {!channel && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Platform</div>
            <select
              value={platform}
              onChange={(e) => { setPlatform(e.target.value); setCreds({}); }}
              style={{
                width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 10, fontSize: 13,
                border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
                color: 'var(--color-text)', cursor: 'pointer',
              }}
            >
              {platformKeys.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
              ))}
            </select>
          </div>
        )}
        <Input label="Display name" value={name} onChange={(v: string) => setName(v)} placeholder="e.g. Main Facebook Page" />

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            Credentials {channel && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(leave blank to keep current — stored values are never shown)</span>}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {credKeys.map((key) => (
              <Input
                key={key}
                label={key}
                type="password"
                value={creds[key] ?? ''}
                onChange={(v: string) => setCreds((c) => ({ ...c, [key]: v }))}
                placeholder={channel?.credential_summary[key] ?? ''}
                autoComplete="off"
              />
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          Enabled (posts can be sent to this channel)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
          Test channel (a non-production server may only post to test channels)
        </label>
      </div>
    </Modal>
  );
}
