import { useCallback, useEffect, useState } from 'react';
import {
  cancelSocialPost, createSocialChannel, createSocialPost, deleteSocialChannel,
  deleteSocialVideo, fetchSocialAutomation, fetchSocialChannelOptions, fetchSocialChannels,
  fetchSocialPosts, fetchSocialVideos, generateSocialVideo,
  publishSocialPostNow, retrySocialDelivery, testSocialChannel,
  updateSocialAutomation, updateSocialChannel,
  type SocialAutomationConfig, type SocialChannelOption, type SocialChannelRow,
  type SocialPlatformCaps, type SocialPostRow, type SocialVideoRenditionRow,
} from '../api';
import {
  Badge, Btn, Card, ErrorMsg, Input, Modal, ModalActions, PageHeader, PageShell, Spinner,
} from '../components/SharedUI';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { usePageTitle } from '../hooks/usePageTitle';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook Page',
  instagram: 'Instagram',
  telegram: 'Telegram',
  viber: 'Viber Channel',
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const [editingChannel, setEditingChannel] = useState<SocialChannelRow | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const postsRes = await fetchSocialPosts();
      setPosts(postsRes.posts);
      if (canChannels) {
        const chRes = await fetchSocialChannels();
        setChannels(chRes.channels);
        setPlatforms(chRes.platforms);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canChannels]);

  useEffect(() => { void load(); }, [load]);

  return (
    <PageShell>
      <PageHeader
        section="Customers & Marketing"
        title="Social Hub"
        subtitle="Post to the business's Facebook, Instagram and Telegram"
        action={canCompose ? <Btn onClick={() => setComposing(true)}>+ New post</Btn> : undefined}
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
      {loading ? <Spinner /> : tab === 'posts' ? (
        <PostList posts={posts} onChanged={load} />
      ) : tab === 'automation' ? (
        <AutomationSettings canEdit={can('social.publish')} />
      ) : tab === 'videos' ? (
        <VideoStudio canGenerate={can('social.compose')} />
      ) : (
        <ChannelList
          channels={channels}
          onEdit={setEditingChannel}
          onChanged={load}
        />
      )}

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); void load(); }}
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
        <div style={{ marginTop: 12 }}>
          <Btn variant="secondary" onClick={() => setEditingChannel('new')}>+ Connect channel</Btn>
        </div>
      )}
    </PageShell>
  );
}

function PostList({ posts, onChanged }: { posts: SocialPostRow[]; onChanged: () => void }) {
  const { can } = useCurrentUserPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); onChanged(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (posts.length === 0) {
    return (
      <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
        No posts yet. Compose one to get started.
      </Card>
    );
  }

  return (
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
            {can('social.publish') && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {['draft', 'scheduled', 'awaiting_approval'].includes(post.status) && (
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
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function AutomationSettings({ canEdit }: { canEdit: boolean }) {
  const [config, setConfig] = useState<SocialAutomationConfig | null>(null);
  const [options, setOptions] = useState<SocialChannelOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchSocialAutomation(), fetchSocialChannelOptions()])
      .then(([auto, ch]) => {
        setConfig(auto.automation);
        setOptions(ch.channels);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <ErrorMsg message={error} />;
  if (config === null) return <Spinner />;

  const save = async () => {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const res = await updateSocialAutomation(config);
      setConfig(res.automation);
      setNotice('Saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<SocialAutomationConfig>) =>
    setConfig((c) => (c ? { ...c, ...patch } : c));

  return (
    <Card style={{ padding: '16px 18px', maxWidth: 620 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Daily-special auto post</div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Each day at the chosen time, one post advertising an active special is drafted
        for the selected channels. Nothing is posted when no special is active. Items
        without a real photo skip Instagram and post caption-only elsewhere.
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: canEdit ? 'pointer' : 'default' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            disabled={!canEdit}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Enabled
        </label>

        <Input
          label="Post time (Maldives local)"
          type="time"
          value={config.time}
          disabled={!canEdit}
          onChange={(v: string) => set({ time: v })}
          style={{ maxWidth: 160 }}
        />

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
              {' '}— variables: {'{item} {name_dv} {price} {badge} {description} {link}'}
            </span>
          </div>
          <textarea
            value={config.template}
            disabled={!canEdit}
            onChange={(e) => set({ template: e.target.value })}
            rows={4}
            maxLength={2200}
            style={{
              width: '100%', padding: 10, borderRadius: 10, fontFamily: 'inherit', fontSize: 13,
              border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text)', resize: 'vertical',
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
              Off = each day's post waits in the Posts tab for someone to approve. Turn on
              only after approved posts have run cleanly for a while.
            </span>
          </span>
        </label>

        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Btn onClick={() => { void save(); }} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Btn>
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
  const [itemId, setItemId] = useState('');
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Input
            label="Menu item id"
            value={itemId}
            onChange={(v: string) => setItemId(v.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 12"
            style={{ maxWidth: 140 }}
          />
          <Btn disabled={busy || itemId === ''} onClick={() => { void load(Number(itemId)); }}>Load</Btn>
        </div>
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

function ChannelList({ channels, onEdit, onChanged }: {
  channels: SocialChannelRow[];
  onEdit: (c: SocialChannelRow) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const act = async (fn: () => Promise<unknown>, doneMsg: string) => {
    setBusy(true);
    setNotice('');
    try { await fn(); setNotice(doneMsg); onChanged(); } catch (e) { setNotice((e as Error).message); }
    finally { setBusy(false); }
  };

  if (channels.length === 0) {
    return (
      <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
        No channels connected yet.
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
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
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn small variant="secondary" disabled={busy} onClick={() => onEdit(c)}>Edit</Btn>
              <Btn
                small
                variant="secondary"
                disabled={busy || !c.is_enabled}
                onClick={() => { void act(() => testSocialChannel(c.id), 'Test post queued — check the Posts tab.'); }}
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

function ComposeModal({ onClose, onSaved, canPublish, canSchedule }: {
  onClose: () => void;
  onSaved: () => void;
  canPublish: boolean;
  canSchedule: boolean;
}) {
  const [channels, setChannels] = useState<SocialChannelOption[] | null>(null);
  const [platforms, setPlatforms] = useState<Record<string, SocialPlatformCaps>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [itemId, setItemId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { can } = useCurrentUserPermissions();

  useEffect(() => {
    // The picker endpoint needs only social.view (no credential data), so
    // managers can compose without channel-management rights.
    fetchSocialChannelOptions()
      .then((res) => {
        setChannels(res.channels);
        setPlatforms(res.platforms);
      })
      .catch(() => setChannels([]));
  }, []);

  const needsImage = selected.some((id) => {
    const ch = (channels ?? []).find((c) => c.id === id);
    return ch ? platforms[ch.platform]?.requires_photo : false;
  });

  const submit = async (action: 'draft' | 'schedule' | 'now') => {
    setSaving(true);
    setError('');
    try {
      await createSocialPost({
        caption,
        image_url: imageUrl || null,
        item_id: itemId ? Number(itemId) : null,
        channel_ids: selected,
        action,
        scheduled_at: action === 'schedule' ? scheduledAt : null,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || caption.trim() === '' || selected.length === 0
    || (needsImage && imageUrl.trim() === '');

  return (
    <Modal
      title="New social post"
      onClose={onClose}
      maxWidth={560}
      footer={(
        <ModalActions>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Close</Btn>
          {can('social.compose') && (
            <Btn variant="secondary" disabled={disabled} onClick={() => { void submit('draft'); }}>Save draft</Btn>
          )}
          {canSchedule && (
            <Btn variant="secondary" disabled={disabled || !scheduledAt} onClick={() => { void submit('schedule'); }}>
              Schedule
            </Btn>
          )}
          {canPublish && (
            <Btn disabled={disabled} onClick={() => { void submit('now'); }}>Post now</Btn>
          )}
        </ModalActions>
      )}
    >
      {channels === null ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {error && <ErrorMsg message={error} />}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Channels</div>
            {channels.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                No enabled channels. An owner can connect one under the Channels tab.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {channels.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(e) => setSelected((s) => (
                        e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)
                      ))}
                    />
                    {PLATFORM_LABELS[c.platform] ?? c.platform} — {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Caption</div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              maxLength={2200}
              style={{
                width: '100%', padding: 10, borderRadius: 10, fontFamily: 'inherit', fontSize: 13,
                border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
                color: 'var(--color-text)', resize: 'vertical',
              }}
            />
          </div>

          <Input
            label={needsImage ? 'Image URL (required for Instagram)' : 'Image URL (optional)'}
            value={imageUrl}
            onChange={(v: string) => setImageUrl(v)}
            placeholder="https://bakeandgrill.mv/storage/…"
          />
          <Input
            label="Link to menu item id (optional — freezes price + adds the item photo)"
            value={itemId}
            onChange={(v: string) => setItemId(v.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 12"
          />
          {canSchedule && (
            <Input
              label="Schedule for (local time)"
              type="datetime-local"
              value={scheduledAt}
              onChange={(v: string) => setScheduledAt(v)}
            />
          )}
        </div>
      )}
    </Modal>
  );
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
