import { useEffect, useMemo, useState } from 'react';
import {
  createSocialPost, fetchSocialChannelOptions, fetchSocialItemPreview, publishSocialPostNow, updateSocialPost,
  type SocialChannelOption, type SocialItemPreview, type SocialItemVideo, type SocialPlatformCaps, type SocialPostMedia, type SocialPostRow,
} from '../../api';
import { ItemSearch } from '../../components/ItemSearch';
import { MediaPicker } from '../../components/MediaPicker';
import { Btn, ErrorMsg, Input, Modal, ModalActions, Spinner } from '../../components/SharedUI';
import { ApiRequestError } from '@shared/api';
import { PostPreview } from './PostPreview';
import {
  PLATFORM_LABELS, PLATFORM_SHORT, captionForLanguage, fromLocalDateTimeInput, platformsNeedingImage,
  suggestCaption, tightestForChannels, toLocalDateTimeInput,
} from './composer';

type Action = 'draft' | 'schedule' | 'now' | 'save';

/**
 * The composer (Social Hub audit, 2026-09-24). Before: a hand-typed image
 * URL and a numeric item id. Now: search the menu, the item's photo,
 * price and link come along; pick a photo from the media library; see the
 * post as each platform will show it; the caption counter knows the
 * tightest limit among the chosen channels. The same modal edits a post
 * that has not gone out yet.
 */
export function ComposeModal({ post, initial, onClose, onSaved, canCompose, canPublish, canSchedule }: {
  post?: SocialPostRow | null;
  /** "Share" from the menu or a special: open on this item, caption suggested. */
  initial?: { itemId?: number; specialId?: number } | null;
  onClose: () => void;
  onSaved: () => void;
  canCompose: boolean;
  canPublish: boolean;
  canSchedule: boolean;
}) {
  const editing = post ?? null;
  const automated = editing !== null && editing.source !== 'manual';
  const awaitingApproval = editing?.status === 'awaiting_approval';

  const [channels, setChannels] = useState<SocialChannelOption[] | null>(null);
  const [platforms, setPlatforms] = useState<Record<string, SocialPlatformCaps>>({});
  const [selected, setSelected] = useState<number[]>(
    () => (editing?.deliveries ?? []).map((d) => d.channel?.id).filter((id): id is number => typeof id === 'number'),
  );
  const [caption, setCaption] = useState(editing?.snapshot.caption ?? '');
  const [captionDv, setCaptionDv] = useState(editing?.snapshot.caption_dv ?? '');
  const [imageUrl, setImageUrl] = useState(editing?.snapshot.image_url ?? '');
  const [item, setItem] = useState<SocialItemPreview | null>(null);
  const [itemLoading, setItemLoading] = useState(Boolean(editing?.snapshot.item_id || initial?.itemId || initial?.specialId));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  /** Photo (one), Photos (a carousel of two to ten) or Video (a rendered clip, or a pasted URL). */
  const [mediaMode, setMediaMode] = useState<'photo' | 'carousel' | 'video'>(
    editing?.snapshot.video_url ? 'video' : (editing?.snapshot.images?.length ?? 0) > 1 ? 'carousel' : 'photo',
  );
  const [carouselImages, setCarouselImages] = useState<string[]>(editing?.snapshot.images ?? []);
  const [video, setVideo] = useState<{ url: string; poster_url: string | null; bytes: number; format?: string } | null>(
    editing?.snapshot.video_url
      ? { url: editing.snapshot.video_url, poster_url: editing.snapshot.video_poster_url ?? null, bytes: editing.snapshot.video_bytes ?? 0 }
      : null,
  );
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTimeInput(editing?.scheduled_at));
  const [previewPlatform, setPreviewPlatform] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** The spacing rules objected to "Post now": the reason and the next free slot. */
  const [slotOffer, setSlotOffer] = useState<{ message: string; nextFreeAt: string | null } | null>(null);

  useEffect(() => {
    // The picker endpoint needs only social.view (no credential data), so
    // managers can compose without channel-management rights.
    fetchSocialChannelOptions()
      .then((res) => { setChannels(res.channels); setPlatforms(res.platforms); })
      .catch(() => setChannels([]));
  }, []);

  useEffect(() => {
    if (editing || !(initial?.itemId || initial?.specialId)) return;
    let cancelled = false;
    fetchSocialItemPreview(initial.specialId ? { special_id: initial.specialId } : { item_id: initial.itemId })
      .then(({ item: loaded }) => {
        if (cancelled) return;
        setItem(loaded);
        setCaption((c) => (c.trim() === '' ? suggestCaption(loaded) : c));
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setItemLoading(false); });
    return () => { cancelled = true; };
  }, [editing, initial]);

  useEffect(() => {
    const id = editing?.snapshot.item_id;
    if (!id) return;
    let cancelled = false;
    fetchSocialItemPreview(id)
      .then(({ item: loaded }) => {
        if (cancelled) return;
        setItem(loaded);
        // The snapshot's image was the item's own photo: keep it linked
        // rather than pinned, so a re-photographed item follows.
        if (loaded.image_url && editing?.snapshot.image_url === loaded.image_url) setImageUrl('');
      })
      .catch(() => { /* the item may be gone; the snapshot still has the words */ })
      .finally(() => { if (!cancelled) setItemLoading(false); });
    return () => { cancelled = true; };
  }, [editing]);

  const selectedPlatforms = useMemo(() => {
    const out: string[] = [];
    for (const id of selected) {
      const p = (channels ?? []).find((c) => c.id === id)?.platform;
      if (p && !out.includes(p)) out.push(p);
    }
    return out;
  }, [selected, channels]);

  useEffect(() => {
    if (previewPlatform === null || !selectedPlatforms.includes(previewPlatform)) {
      setPreviewPlatform(selectedPlatforms[0] ?? null);
    }
  }, [selectedPlatforms, previewPlatform]);

  const effectiveImage = mediaMode === 'video'
    ? (video?.poster_url ?? item?.image_url ?? null)
    : mediaMode === 'carousel'
      ? (carouselImages[0] ?? null)
      : (imageUrl.trim() !== '' ? imageUrl.trim() : (item?.image_url ?? null));
  const hasMedia = mediaMode === 'video' ? video !== null : effectiveImage !== null;
  const needImage = platformsNeedingImage(selectedPlatforms, platforms);
  const noVideo = mediaMode === 'video' ? selectedPlatforms.filter((p) => platforms[p] && !platforms[p].video) : [];
  const media = (): SocialPostMedia | null => {
    if (mediaMode === 'carousel' && carouselImages.length > 0) return { type: 'carousel', images: carouselImages };
    if (mediaMode === 'video' && video) return { type: 'video', video_url: video.url, video_poster_url: video.poster_url, video_bytes: video.bytes };
    return null;
  };
  const addCarousel = (urls: string[]) => setCarouselImages((cur) => [...cur, ...urls.filter((u) => u && !cur.includes(u))].slice(0, 10));
  const selectedChannels = (channels ?? []).filter((c) => selected.includes(c.id));
  // Measured as each channel will receive it: its language setting decides
  // whether the Dhivehi rides along under the English.
  const limit = tightestForChannels(selectedChannels, platforms, hasMedia, caption, captionDv);
  const length = limit?.length ?? captionForLanguage(caption, captionDv, 'both').length;
  const over = limit !== null && length > limit.limit;
  const linkUrl = item?.link_url ?? editing?.snapshot.link_url ?? null;

  const loadItem = async (id: number) => {
    setItemLoading(true);
    setError('');
    try {
      const { item: loaded } = await fetchSocialItemPreview(id);
      setItem(loaded);
      if (caption.trim() === '') setCaption(suggestCaption(loaded));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setItemLoading(false);
    }
  };

  const insert = (text: string) => setCaption((c) => (c.trim() === '' ? text : `${c.replace(/\s+$/, '')} ${text}`));

  const submit = async (action: Action, opts: { force?: boolean; scheduleIso?: string } = {}) => {
    setSaving(true);
    setError('');
    setSlotOffer(null);
    try {
      const scheduleIso = opts.scheduleIso ?? fromLocalDateTimeInput(scheduledAt);
      if (editing) {
        const patchAction = awaitingApproval || action === 'now' || action === 'save'
          ? (editing.status === 'scheduled' && !awaitingApproval ? 'schedule' : undefined)
          : action;
        await updateSocialPost(editing.id, {
          caption,
          caption_dv: captionDv.trim() || null,
          image_url: mediaMode === 'photo' ? (imageUrl.trim() || null) : null,
          media: media(),
          ...(automated ? {} : { item_id: item?.id ?? null, channel_ids: selected }),
          ...(patchAction ? { action: patchAction } : {}),
          ...(patchAction === 'schedule' && scheduleIso ? { scheduled_at: scheduleIso } : {}),
        });
        if (action === 'now') await publishSocialPostNow(editing.id);
      } else {
        await createSocialPost({
          caption,
          caption_dv: captionDv.trim() || null,
          image_url: mediaMode === 'photo' ? (imageUrl.trim() || null) : null,
          media: media(),
          item_id: item?.id ?? null,
          channel_ids: selected,
          action: action === 'save' ? 'draft' : action,
          scheduled_at: action === 'schedule' ? scheduleIso : null,
          ...(opts.force ? { force: true } : {}),
        });
      }
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 409) {
        const body = (e.body ?? {}) as { message?: string; next_free_at?: string | null };
        setSlotOffer({ message: body.message ?? e.message, nextFreeAt: body.next_free_at ?? null });
      } else {
        setError((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || caption.trim() === '' || selected.length === 0
    || (needImage.length > 0 && !hasMedia) || over
    || (mediaMode === 'carousel' && carouselImages.length < 2)
    || (mediaMode === 'video' && (video === null || noVideo.length > 0));
  const scheduleReady = !disabled && scheduledAt !== '' && fromLocalDateTimeInput(scheduledAt) !== null;

  const previewChannel = (channels ?? []).find((c) => c.platform === previewPlatform && selected.includes(c.id));

  return (
    <Modal
      title={editing ? (awaitingApproval ? 'Edit automation draft' : `Edit post #${editing.id}`) : 'New social post'}
      onClose={onClose}
      maxWidth={940}
      footer={(
        <ModalActions>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Close</Btn>
          {editing ? (
            <>
              <Btn variant="secondary" disabled={disabled} onClick={() => { void submit('save'); }}>Save changes</Btn>
              {!awaitingApproval && canSchedule && (
                <Btn variant="secondary" disabled={!scheduleReady} onClick={() => { void submit('schedule'); }}>
                  {editing.status === 'scheduled' ? 'Save & reschedule' : 'Schedule'}
                </Btn>
              )}
              {canPublish && (
                <Btn disabled={disabled} onClick={() => { void submit('now'); }}>
                  {awaitingApproval ? 'Save & approve' : 'Save & post now'}
                </Btn>
              )}
            </>
          ) : (
            <>
              {canCompose && (
                <Btn variant="secondary" disabled={disabled} onClick={() => { void submit('draft'); }}>Save draft</Btn>
              )}
              {canSchedule && (
                <Btn variant="secondary" disabled={!scheduleReady} onClick={() => { void submit('schedule'); }}>Schedule</Btn>
              )}
              {canPublish && (
                <Btn disabled={disabled} onClick={() => { void submit('now'); }}>Post now</Btn>
              )}
            </>
          )}
        </ModalActions>
      )}
    >
      {channels === null ? <Spinner /> : (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 340px', minWidth: 0, display: 'grid', gap: 14 }}>
            {error && <ErrorMsg message={error} />}
            {slotOffer && (
              <div role="alert" style={{ border: '1px solid var(--color-warning)', background: 'var(--color-warning-bg)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{slotOffer.message}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {slotOffer.nextFreeAt && canSchedule && (
                    <Btn small onClick={() => { void submit('schedule', { scheduleIso: slotOffer.nextFreeAt ?? undefined }); }}>
                      Schedule for {new Date(slotOffer.nextFreeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Btn>
                  )}
                  <Btn small variant="secondary" onClick={() => { void submit('now', { force: true }); }}>Post anyway</Btn>
                </div>
              </div>
            )}
            {automated && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                An automation drafted this post. Its item and channels stay as the automation
                chose them; the words and photo are yours to change.
              </p>
            )}

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Channels</div>
              {channels.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                  No enabled channels. An owner can connect one under the Channels tab.
                </p>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {channels.map((c) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: automated ? 'default' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(c.id)}
                        disabled={automated}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                      />
                      {PLATFORM_LABELS[c.platform] ?? c.platform} — {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Menu item <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional — brings its photo, today's price and a link)</span>
              </div>
              {itemLoading ? <Spinner /> : item ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                  {item.image_url && <img src={item.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{item.name}{item.name_dv ? ` · ${item.name_dv}` : ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      MVR {item.price.toFixed(2)}{item.price !== item.base_price ? ` (was ${item.base_price.toFixed(2)})` : ''}
                      {item.category ? ` · ${item.category}` : ''}
                      {!item.is_sellable && ' · not on sale'}
                      {!item.image_url && ' · no photo'}
                    </div>
                  </div>
                  {!automated && (
                    <button
                      type="button"
                      onClick={() => setItem(null)}
                      aria-label="Unlink item"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-danger-strong)', minWidth: 36, minHeight: 36 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ) : (
                <ItemSearch
                  kind="menu"
                  value={null}
                  onChange={(sel) => { if (sel) void loadItem(sel.id); }}
                  resultsPlacement="inline"
                  browseByCategory
                  placeholder="Search the menu…"
                />
              )}
              {item && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <Btn small variant="secondary" onClick={() => insert(item.name)}>+ name</Btn>
                  {item.name_dv && <Btn small variant="secondary" onClick={() => insert(item.name_dv ?? '')}>+ ދިވެހި</Btn>}
                  <Btn small variant="secondary" onClick={() => insert(`MVR ${item.price.toFixed(2)}`)}>+ price</Btn>
                  <Btn small variant="secondary" onClick={() => insert(item.link_url)}>+ link</Btn>
                  <Btn small variant="secondary" onClick={() => setCaption(suggestCaption(item))}>Suggested caption</Btn>
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Caption</span>
                <span
                  data-testid="caption-counter"
                  style={{ fontSize: 12, color: over ? 'var(--color-danger)' : 'var(--color-text-muted)', fontWeight: over ? 700 : 400 }}
                >
                  {limit ? `${length} / ${limit.limit} (${PLATFORM_SHORT[limit.platform] ?? limit.platform}${effectiveImage && platforms[limit.platform]?.caption_max_photo !== platforms[limit.platform]?.caption_max ? ' with photo' : ''}${limit.language === 'both' && captionDv.trim() !== '' ? ', both languages' : ''})` : `${length} characters`}
                </span>
              </div>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                aria-label="Caption"
                style={{
                  width: '100%', padding: 10, borderRadius: 10, fontFamily: 'inherit', fontSize: 13,
                  border: `1.5px solid ${over ? 'var(--color-danger)' : 'var(--color-border)'}`, background: 'var(--color-surface)',
                  color: 'var(--color-text)', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
              {over && limit && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>
                  {PLATFORM_SHORT[limit.platform] ?? limit.platform} cuts captions at {limit.limit} characters.
                </p>
              )}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  ދިވެހި <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional; each channel's language setting decides whether it goes under the English, alone, or not at all)</span>
                </div>
                <textarea
                  value={captionDv}
                  onChange={(e) => setCaptionDv(e.target.value)}
                  rows={3}
                  dir="rtl"
                  aria-label="Caption in Dhivehi"
                  style={{
                    width: '100%', padding: 10, borderRadius: 10, fontFamily: 'inherit', fontSize: 14,
                    border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
                    color: 'var(--color-text)', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Media{needImage.length > 0 && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> (required for {needImage.map((p) => PLATFORM_SHORT[p] ?? p).join(', ')})</span>}
                </span>
                <div role="radiogroup" aria-label="Media kind" style={{ display: 'inline-flex', gap: 4 }}>
                  {([['photo', 'Photo'], ['carousel', 'Photos'], ['video', 'Video']] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={mediaMode === mode}
                      onClick={() => setMediaMode(mode)}
                      style={{
                        fontSize: 12, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                        border: mediaMode === mode ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: mediaMode === mode ? 'var(--color-warning-bg)' : 'var(--color-bg)', color: 'var(--color-text)',
                        fontWeight: mediaMode === mode ? 700 : 500,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mediaMode === 'photo' && (
                <>
                  {effectiveImage ? (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      <img src={effectiveImage} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {imageUrl.trim() !== '' ? 'Chosen photo' : `${item?.name ?? 'Item'}'s photo`}
                        <div style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{effectiveImage}</div>
                      </div>
                      {imageUrl.trim() !== '' && (
                        <Btn small variant="secondary" onClick={() => setImageUrl('')}>{item?.image_url ? 'Use item photo' : 'Remove'}</Btn>
                      )}
                    </div>
                  ) : (
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      No photo yet. {item && !item.image_url ? 'This item has no photo of its own.' : ''}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Btn small variant="secondary" onClick={() => setPickerOpen(true)}>Choose from library</Btn>
                    <Btn small variant="secondary" onClick={() => setShowUrl((v) => !v)}>{showUrl ? 'Hide URL' : 'Paste a URL'}</Btn>
                  </div>
                  {showUrl && (
                    <div style={{ marginTop: 8 }}>
                      <Input
                        label="Image URL"
                        value={imageUrl}
                        onChange={(v: string) => setImageUrl(v)}
                        placeholder="https://bakeandgrill.mv/storage/…"
                      />
                    </div>
                  )}
                </>
              )}

              {mediaMode === 'carousel' && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Two to ten photos, shown in this order. Facebook, Instagram and Telegram show them all; Viber shows the first.
                    {carouselImages.length < 2 && ' Add at least two.'}
                  </p>
                  {carouselImages.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }} data-testid="carousel-strip">
                      {carouselImages.map((url, i) => (
                        <div key={url} style={{ position: 'relative' }}>
                          <img src={url} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', display: 'block' }} />
                          <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,0.6)', color: 'var(--color-surface)', borderRadius: 6, padding: '1px 5px' }}>{i + 1}</span>
                          <button
                            type="button"
                            aria-label={`Remove photo ${i + 1}`}
                            onClick={() => setCarouselImages((cur) => cur.filter((u) => u !== url))}
                            style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'var(--color-danger)', color: 'var(--color-surface)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {item && (item.gallery?.length ?? 0) > 0 && (
                      <Btn small variant="secondary" onClick={() => addCarousel(item.gallery ?? [])}>Add {item.name}'s photos ({item.gallery?.length})</Btn>
                    )}
                    <Btn small variant="secondary" onClick={() => setPickerOpen(true)}>Add from library</Btn>
                    <Btn small variant="secondary" onClick={() => setShowUrl((v) => !v)}>{showUrl ? 'Hide URL' : 'Paste a URL'}</Btn>
                  </div>
                  {showUrl && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <Input label="Image URL" value={imageUrl} onChange={(v: string) => setImageUrl(v)} placeholder="https://bakeandgrill.mv/storage/…" />
                      </div>
                      <Btn small variant="secondary" disabled={imageUrl.trim() === ''} onClick={() => { addCarousel([imageUrl.trim()]); setImageUrl(''); }}>Add</Btn>
                    </div>
                  )}
                </>
              )}

              {mediaMode === 'video' && (
                <>
                  {video ? (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                      {video.poster_url && <img src={video.poster_url} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} />}
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {video.format ? `${item?.name ?? 'Item'} · ${video.format}` : 'Video'}{video.bytes > 0 ? ` · ${(video.bytes / 1048576).toFixed(1)} MB` : ''}
                        <div style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.url}</div>
                      </div>
                      <Btn small variant="secondary" onClick={() => setVideo(null)}>Remove</Btn>
                    </div>
                  ) : (
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {item
                        ? ((item.videos?.length ?? 0) > 0 ? 'Pick one of the clips rendered for this item:' : `No clips rendered for ${item.name} yet — the Videos tab builds them from its photos.`)
                        : 'Link a menu item to use its rendered clips, or paste a video URL.'}
                    </p>
                  )}
                  {!video && item && (item.videos?.length ?? 0) > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {(item.videos ?? []).filter((v: SocialItemVideo) => v.url).map((v: SocialItemVideo) => (
                        <button
                          key={v.format}
                          type="button"
                          onClick={() => setVideo({ url: v.url as string, poster_url: v.poster_url, bytes: v.bytes, format: v.format })}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 10, padding: 6, background: 'var(--color-bg)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--color-text)' }}
                        >
                          {v.poster_url && <img src={v.poster_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />}
                          <span>{v.format}{v.width && v.height ? ` ${v.width}×${v.height}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!video && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <Input label="Video URL (MP4)" value={videoUrlInput} onChange={(v: string) => setVideoUrlInput(v)} placeholder="https://bakeandgrill.mv/storage/…mp4" />
                      </div>
                      <Btn small variant="secondary" disabled={videoUrlInput.trim() === ''} onClick={() => { setVideo({ url: videoUrlInput.trim(), poster_url: item?.image_url ?? null, bytes: 0 }); setVideoUrlInput(''); }}>Use</Btn>
                    </div>
                  )}
                  {noVideo.length > 0 && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>
                      {noVideo.map((p) => PLATFORM_SHORT[p] ?? p).join(', ')} cannot take a video. Untick {noVideo.length === 1 ? 'it' : 'them'} or post a photo.
                    </p>
                  )}
                  {video && video.bytes === 0 && selectedPlatforms.includes('viber') && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>Viber needs the file size; a pasted URL has none, so Viber may refuse it. Rendered clips carry theirs.</p>
                  )}
                </>
              )}
            </div>

            {canSchedule && !awaitingApproval && (
              <Input
                label="Schedule for (your local time)"
                type="datetime-local"
                value={scheduledAt}
                onChange={(v: string) => setScheduledAt(v)}
                style={{ maxWidth: 260 }}
              />
            )}
          </div>

          <div style={{ flex: '1 1 260px', maxWidth: 380, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Preview</span>
              {selectedPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreviewPlatform(p)}
                  aria-pressed={previewPlatform === p}
                  style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                    border: previewPlatform === p ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: previewPlatform === p ? 'var(--color-warning-bg)' : 'var(--color-bg)', color: 'var(--color-text)',
                    fontWeight: previewPlatform === p ? 700 : 500,
                  }}
                >
                  {PLATFORM_SHORT[p] ?? p}
                </button>
              ))}
            </div>
            {previewPlatform && previewChannel ? (
              <PostPreview
                platform={previewPlatform}
                channelName={previewChannel.name}
                caption={captionForLanguage(caption, captionDv, previewChannel.language)}
                imageUrl={effectiveImage}
                linkUrl={linkUrl}
                imageCount={mediaMode === 'carousel' ? carouselImages.length : 1}
                video={mediaMode === 'video' && video !== null}
              />
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Pick a channel to see how the post will look.</p>
            )}
          </div>
        </div>
      )}

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(asset) => { if (mediaMode === 'carousel') addCarousel([asset.url]); else setImageUrl(asset.url); }}
        mediaType="image"
        title="Choose a photo"
      />
    </Modal>
  );
}
