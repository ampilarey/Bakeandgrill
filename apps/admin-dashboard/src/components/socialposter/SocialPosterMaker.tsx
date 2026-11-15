import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clapperboard, Play, ImagePlus, Save, Send, Share2, Shuffle, Trash2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  createSocialPoster, deleteSocialPoster, fetchSocialItemPreview, fetchSocialPosters, updateSocialPoster, uploadSocialPosterPicture, uploadSocialPosterVideo,
  type MediaAsset, type SavedSocialPoster, type SocialPosterBrand,
} from '../../api';
import { ItemSearch, type MenuItemSelection } from '../ItemSearch';
import { MediaPicker } from '../MediaPicker';
import { Btn, Card, ConfirmDialog, ErrorMsg, Input, Spinner, Switch, TabScrollRow, useConfirmDialog } from '../SharedUI';
import { usePostAssets } from './assets';
import { renderPost, type PostAssets } from './draw';
import { pictureOf } from './picture';
import { canRecord, recordPost } from './record';
import { SaveSheet } from './SaveSheet';
import {
  BADGE_PRESETS, BUTTON_STYLES, CTA2_PRESETS, CTA_PRESETS, LAYOUTS, MOTIONS, MOTION_SECONDS, PALETTES, PART_NAMES, PART_ORDER, SIZES, TEMPLATES,
  blankSpec, captionOf, fullSpec, paletteOf, sizeOf, withTemplate, type PartKey, type PostSize, type PostSpec, type PostTemplate,
} from './types';

/**
 * Social Hub → Make a post (owner, 2026-11-14: "It should be easy. One click…
 * From 1 poster automatically makes poster for different platforms"; "many
 * different designs… saved for later… change the design and layout but
 * information remains same"). Pick a dish (or type the words), tap a design
 * and a colour; the same words are drawn in every platform's shape. Nothing
 * is typed twice and nothing is posted until it is sent to the composer.
 */

/** One post drawn on a canvas `px` wide in the shape of `size`. */
export function PostCanvas({ spec, layout, palette, size, assets, px, version = 0, label, play }: {
  spec: PostSpec; layout: string; palette: string; size: PostSize; assets: PostAssets; px: number; version?: number;
  /** What the picture is, for a screen reader; without it the canvas is decoration beside its own caption. */
  label?: string;
  /** Play the post's motion once, each time `key` changes; without it the canvas shows the still picture. */
  play?: { key: number; seconds: number };
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const h = Math.round((px * size.h) / size.w);
  const playKey = play?.key ?? 0;
  const seconds = play?.seconds ?? 6;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const P = paletteOf(palette);
    if (playKey === 0 || !spec.motion || typeof requestAnimationFrame !== 'function') {
      renderPost(ctx, px, h, spec, layout, P, assets);
      return;
    }
    let live = true;
    const began = performance.now();
    const tick = () => {
      if (!live) return;
      const t = (performance.now() - began) / 1000;
      if (t >= seconds) { renderPost(ctx, px, h, spec, layout, P, assets); return; }
      renderPost(ctx, px, h, spec, layout, P, assets, { motion: spec.motion, t, dur: seconds });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { live = false; };
  }, [spec, layout, palette, assets.photo, assets.logoLight, assets.logoDark, assets.flame, assets.qr, px, h, version, playKey, seconds]); // eslint-disable-line react-hooks/exhaustive-deps
  return label
    ? <canvas ref={ref} width={px} height={h} role="img" aria-label={label} className="sp-canvas" />
    : <canvas ref={ref} width={px} height={h} aria-hidden className="sp-canvas" />;
}

function SavedCard({ row, brand, onOpen, onRemove, canCompose }: {
  row: SavedSocialPoster; brand: SocialPosterBrand | null; onOpen: () => void; onRemove: () => void; canCompose: boolean;
}) {
  const spec = useMemo(() => fullSpec(row.spec, brand ?? undefined), [row.spec, brand]);
  const { assets } = usePostAssets(spec.photo, null);
  return (
    <div className="sp-saved">
      <button type="button" className="sp-thumb" onClick={onOpen} aria-label={`Open ${row.name}`}>
        <PostCanvas spec={spec} layout={row.layout} palette={row.palette} size={SIZES[1]} assets={assets} px={240} />
      </button>
      <div className="sp-saved-name">{row.name}</div>
      <div className="sp-saved-actions">
        <Btn small variant="secondary" onClick={onOpen}>Open</Btn>
        {canCompose && <Btn small variant="danger-outline" onClick={onRemove}><Trash2 size={14} aria-hidden /> Delete</Btn>}
      </div>
    </div>
  );
}

export function SocialPosterMaker({ canCompose, onSend }: {
  canCompose: boolean;
  /** Hand the finished picture and a caption to the composer. */
  onSend: (post: { imageUrl: string; caption: string }) => void;
}) {
  const [brand, setBrand] = useState<SocialPosterBrand | null>(null);
  const [saved, setSaved] = useState<SavedSocialPoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const [spec, setSpec] = useState<PostSpec>(() => blankSpec());
  const [layout, setLayout] = useState(LAYOUTS[0].key);
  const [palette, setPalette] = useState(PALETTES[0].key);
  const [sizeKey, setSizeKey] = useState(SIZES[0].key);
  const [name, setName] = useState('');
  const [savedId, setSavedId] = useState<number | null>(null);
  const [item, setItem] = useState<MenuItemSelection | null>(null);
  const [picking, setPicking] = useState(false);
  const [qr, setQr] = useState<HTMLCanvasElement | null>(null);
  const [qrVersion, setQrVersion] = useState(0);
  const [pinOpen, setPinOpen] = useState(true);
  // The motion plays once on the picture each time this changes.
  const [playKey, setPlayKey] = useState(0);
  const [seconds, setSeconds] = useState(6);
  const [recorded, setRecorded] = useState(0);
  const [video, setVideo] = useState<string | null>(null);
  // The Save or share sheet: every size, and the video once one is made.
  const [saving, setSaving] = useState(false);
  const dialog = useConfirmDialog();

  const size = sizeOf(sizeKey);
  const { assets, ready } = usePostAssets(spec.photo, spec.show.qr ? qr : null);
  const link = spec.link.trim() || brand?.order_url || '';

  // The QR code paints after React commits; draw the post again once it has.
  useEffect(() => {
    const t = setTimeout(() => setQrVersion((v) => v + 1), 60);
    return () => clearTimeout(t);
  }, [link, qr, spec.show.qr]);

  const load = useCallback(async () => {
    try {
      const res = await fetchSocialPosters();
      setSaved(res.data);
      setBrand(res.brand);
      // A new post starts with the business's own phone, website and order link.
      setSpec((s) => (s.headline === '' && s.itemId === null && s.phone === '' ? blankSpec(res.brand) : s));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The saved posts could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // A video is of the post as it was: any change to the words, the design or the colour forgets it.
  useEffect(() => { setVideo(null); }, [spec, layout, palette, sizeKey, seconds]);

  const patch = (over: Partial<PostSpec>) => { setSpec((s) => ({ ...s, ...over })); setNotice(''); };
  const show = (part: PartKey, on: boolean) => { setSpec((s) => ({ ...s, show: { ...s.show, [part]: on } })); setNotice(''); };

  const pickItem = async (sel: MenuItemSelection | null) => {
    setItem(sel);
    if (!sel) return;
    setBusy('item');
    try {
      const { item: it } = await fetchSocialItemPreview(sel.id);
      const offer = it.base_price > it.price;
      setSpec((s) => ({
        ...s,
        headline: it.name,
        price: it.price.toFixed(2),
        was: offer ? it.base_price.toFixed(2) : '',
        kicker: it.special?.badge_label ?? s.kicker,
        photo: it.cutout_url ?? it.photo_url ?? it.image_url ?? '',
        cutout: Boolean(it.cutout_url),
        itemId: it.id,
        show: { ...s.show, price: true, was: offer, kicker: Boolean(it.special?.badge_label) || s.show.kicker },
      }));
      setName((n) => n || it.name);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That dish could not be loaded.');
    } finally {
      setBusy('');
    }
  };

  const pickPhoto = (asset: MediaAsset) => {
    const url = asset.original_url ?? asset.url;
    patch({ photo: url, cutout: /\.png(\?|$)/i.test(url) });
    setPicking(false);
  };

  const step = (by: number) => {
    const i = LAYOUTS.findIndex((l) => l.key === layout);
    setLayout(LAYOUTS[(i + by + LAYOUTS.length) % LAYOUTS.length].key);
  };
  const surprise = () => {
    const pick = <T,>(list: T[], not: T): T => {
      const rest = list.filter((x) => x !== not);
      return rest[Math.floor(Math.random() * rest.length)] ?? not;
    };
    setLayout(pick(LAYOUTS.map((l) => l.key), layout));
    setPalette(pick(PALETTES.map((p) => p.key), palette));
  };

  const pickMotion = (key: string) => {
    patch({ motion: key });
    if (key) { setPinOpen(true); setPlayKey((k) => k + 1); }
  };

  const makeVideo = async () => {
    setBusy('video');
    setRecorded(0);
    try {
      const blob = await recordPost(spec, layout, palette, size, assets, spec.motion, seconds, setRecorded);
      setBusy('convert');
      const { url } = await uploadSocialPosterVideo(blob);
      setVideo(url);
      setSaving(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The video could not be made.');
    } finally {
      setBusy('');
    }
  };

  const useTemplate = (t: PostTemplate) => {
    setSpec((s) => withTemplate(s, t));
    setLayout(t.layout);
    setPalette(t.palette);
    setNotice('');
  };

  const startNew = () => {
    setSpec(blankSpec(brand ?? undefined));
    setName('');
    setSavedId(null);
    setItem(null);
    setNotice('');
  };

  const open = (row: SavedSocialPoster) => {
    setSpec(fullSpec(row.spec, brand ?? undefined));
    setLayout(row.layout);
    setPalette(row.palette);
    setName(row.name);
    setSavedId(row.id);
    setItem(null);
    setNotice('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const keep = async (asNew: boolean) => {
    const title = name.trim() || spec.headline.trim();
    if (!title) { setError('Give the post a name, or type what it says first.'); return; }
    setBusy('save');
    try {
      const payload = { name: title, layout, palette, spec };
      const res = savedId && !asNew ? await updateSocialPoster(savedId, payload) : await createSocialPoster(payload);
      setSavedId(res.data.id);
      setName(res.data.name);
      setNotice('Saved. It is under Saved posts below.');
      setError('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The post could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const remove = (row: SavedSocialPoster) => dialog.ask({
    title: 'Delete this saved post?',
    message: `"${row.name}" will be removed from Saved posts. Pictures already downloaded or posted stay as they are.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => {
      void deleteSocialPoster(row.id).then(() => {
        if (savedId === row.id) setSavedId(null);
        return load();
      }).catch((e) => setError(e instanceof Error ? e.message : 'The post could not be deleted.'));
    },
  });

  const send = async () => {
    setBusy('send');
    try {
      // The feed shape: it is what Facebook, Instagram, Telegram and Viber all take.
      const blob = await pictureOf(spec, layout, palette, SIZES[0], assets, 'image/jpeg');
      if (!blob) throw new Error('The picture could not be made.');
      const { url } = await uploadSocialPosterPicture(blob);
      onSend({ imageUrl: url, caption: captionOf({ ...spec, link }) });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The picture could not be sent to the composer.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <Spinner />;

  const empty = spec.headline.trim() === '';

  return (
    <div className="sp-maker">
      {error && <ErrorMsg message={error} />}
      {notice && <p role="status" className="sp-notice">{notice}</p>}
      <div className="sp-layout">
        <div className="sp-preview">
          {/* On a phone the picture stays pinned under the top bar while the steps scroll beneath it
              (owner, 2026-11-15: "When I change the content, I have to scroll up to see the change"). */}
          <div className={`sp-pin${pinOpen ? '' : ' is-shut'}`} data-testid="sp-pin">
            <div className="sp-stage" style={{ '--sp-ratio': `${size.w} / ${size.h}` } as React.CSSProperties}>
              {empty
                ? <p className="sp-empty">Pick a dish or type a headline, and the post appears here.</p>
                : <PostCanvas spec={spec} layout={layout} palette={palette} size={size} assets={assets} px={size.w >= 1200 ? 900 : 720} version={qrVersion + (ready ? 1000 : 0)} label={`${spec.headline}, ${size.name}`} play={{ key: playKey, seconds }} />}
            </div>
            <button type="button" className="sp-pin-toggle" aria-expanded={pinOpen} onClick={() => setPinOpen((o) => !o)}>
              {pinOpen ? <><ChevronUp size={14} aria-hidden /> Hide the picture</> : <><ChevronDown size={14} aria-hidden /> Show the picture</>}
            </button>
          </div>
          <Card>
            <TabScrollRow fit style={{ display: 'flex', gap: 6 }}>
              {SIZES.map((s) => (
                <Btn key={s.key} small variant={s.key === sizeKey ? 'primary' : 'secondary'} aria-pressed={s.key === sizeKey} onClick={() => setSizeKey(s.key)} title={s.hint}>{s.name}</Btn>
              ))}
            </TabScrollRow>
            <p className="sp-hint">{size.name}: {size.hint} · {size.w} × {size.h}</p>
            <div className="sp-row">
              <Btn small variant="secondary" onClick={() => step(-1)} aria-label="Previous design"><ChevronLeft size={16} aria-hidden /></Btn>
              <Btn small variant="secondary" onClick={surprise}><Shuffle size={14} aria-hidden /> Surprise me</Btn>
              <Btn small variant="secondary" onClick={() => step(1)} aria-label="Next design"><ChevronRight size={16} aria-hidden /></Btn>
            </div>
            <div className="sp-row">
              <Btn small onClick={() => setSaving(true)} disabled={empty || busy !== ''}><Share2 size={14} aria-hidden /> Save or share</Btn>
              {canCompose && <Btn small variant="secondary" onClick={() => void send()} disabled={empty || busy !== ''}><Send size={14} aria-hidden /> {busy === 'send' ? 'Sending…' : 'Post it'}</Btn>}
            </div>
          </Card>
        </div>

        <div className="sp-form">
          <Card>
            <h3 className="sp-h">1. What is it for?</h3>
            <ItemSearch kind="menu" value={item} onChange={(v) => void pickItem(v)} placeholder="Search the menu: the name, price and photo fill in" />
            <p className="sp-hint">Or type the words yourself below. {busy === 'item' ? 'Loading the dish…' : ''}</p>
            <div className="sp-fields">
              <Input label="Headline" value={spec.headline} maxLength={80} onChange={(v) => patch({ headline: v })} placeholder="Frozen Momo" />
              <Input label="Price (MVR)" value={spec.price} maxLength={12} inputMode="decimal" onChange={(v) => patch({ price: v })} placeholder="45.00" />
            </div>
            <div className="sp-row">
              <Btn small variant="secondary" onClick={() => setPicking(true)}><ImagePlus size={14} aria-hidden /> {spec.photo ? 'Change the photo' : 'Pick a photo'}</Btn>
              {spec.photo && <Btn small variant="secondary" onClick={() => patch({ photo: '', cutout: false })}>No photo</Btn>}
              {spec.photo && (
                <label className="sp-switch">
                  <Switch checked={spec.cutout} onChange={(on) => patch({ cutout: on })} aria-label="The photo is a cut-out" />
                  <span>The photo is a cut-out (no background)</span>
                </label>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="sp-h">2. Pick a design</h3>
            <h4 className="sp-h4" style={{ marginTop: 0 }}>Ready-made posts</h4>
            <div className="sp-presets">
              {TEMPLATES.map((t) => <Btn key={t.key} small variant="secondary" onClick={() => useTemplate(t)}>{t.name}</Btn>)}
            </div>
            <p className="sp-hint">One tap sets the design, the colour, the parts and the usual words. Your headline, price and photo stay.</p>
            <h4 className="sp-h4">Designs</h4>
            <div className="sp-thumbs">
              {LAYOUTS.map((l) => (
                <button key={l.key} type="button" className={`sp-thumb${l.key === layout ? ' is-on' : ''}`} aria-pressed={l.key === layout} onClick={() => setLayout(l.key)} title={l.name}>
                  <PostCanvas spec={empty ? { ...spec, headline: 'Your dish', price: spec.price || '45' } : spec} layout={l.key} palette={palette} size={SIZES[1]} assets={assets} px={200} version={qrVersion + (ready ? 1000 : 0)} />
                  <span>{l.name}</span>
                </button>
              ))}
            </div>
            <h4 className="sp-h4">Colours</h4>
            <div className="sp-swatches">
              {PALETTES.map((p) => (
                <button key={p.key} type="button" className={`sp-swatch${p.key === palette ? ' is-on' : ''}`} aria-pressed={p.key === palette} onClick={() => setPalette(p.key)} title={p.name}>
                  <span className="sp-swatch-chip" aria-hidden style={{ background: `linear-gradient(135deg, ${p.bg} 0 50%, ${p.alt} 50% 78%, ${p.pop} 78%)` }} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <p className="sp-hint">{LAYOUTS.length} designs in {PALETTES.length} colours: {LAYOUTS.length * PALETTES.length} looks. The words stay the same whichever you tap.</p>
          </Card>

          <Card>
            <h3 className="sp-h">3. Add or remove parts</h3>
            <div className="sp-parts">
              {PART_ORDER.map((part) => (
                <label key={part} className="sp-switch">
                  <Switch checked={spec.show[part]} onChange={(on) => show(part, on)} aria-label={PART_NAMES[part]} />
                  <span>{PART_NAMES[part]}</span>
                </label>
              ))}
            </div>
            <div className="sp-fields">
              {spec.show.was && <Input label="Old price (MVR)" value={spec.was} maxLength={12} inputMode="decimal" onChange={(v) => patch({ was: v })} placeholder="60.00" />}
              {spec.show.badge && (
                <div>
                  <Input label="Sticker words" value={spec.badge} maxLength={40} onChange={(v) => patch({ badge: v })} placeholder="New" />
                  <div className="sp-presets">
                    {BADGE_PRESETS.map((b) => <Btn key={b} small variant="secondary" onClick={() => patch({ badge: b })}>{b}</Btn>)}
                  </div>
                </div>
              )}
              {spec.show.cta && (
                <div>
                  <Input label="Button words" value={spec.cta} maxLength={30} onChange={(v) => patch({ cta: v })} placeholder="Order now" />
                  <div className="sp-presets">
                    {CTA_PRESETS.map((c) => <Btn key={c} small variant="secondary" onClick={() => patch({ cta: c })}>{c}</Btn>)}
                  </div>
                </div>
              )}
              {spec.show.cta2 && (
                <div>
                  <Input label="Second button words" value={spec.cta2} maxLength={30} onChange={(v) => patch({ cta2: v })} placeholder="Call us" />
                  <div className="sp-presets">
                    {CTA2_PRESETS.map((c) => <Btn key={c} small variant="secondary" onClick={() => patch({ cta2: c })}>{c}</Btn>)}
                  </div>
                </div>
              )}
              {(spec.show.cta || spec.show.cta2) && (
                <div>
                  <div className="sp-label">Button style</div>
                  <div className="sp-presets" role="group" aria-label="Button style">
                    {BUTTON_STYLES.map((b) => (
                      <Btn key={b.key} small variant={spec.ctaStyle === b.key ? 'primary' : 'secondary'} aria-pressed={spec.ctaStyle === b.key} onClick={() => patch({ ctaStyle: b.key })}>{b.name}</Btn>
                    ))}
                  </div>
                </div>
              )}
              {spec.show.kicker && <Input label="Small line above" value={spec.kicker} maxLength={40} onChange={(v) => patch({ kicker: v })} placeholder="New" />}
              {spec.show.tagline && <Input label="Line below" value={spec.tagline} maxLength={120} onChange={(v) => patch({ tagline: v })} placeholder="Steamed, frozen, handmade" />}
              {spec.show.phone && <Input label="Phone number" value={spec.phone} maxLength={30} inputMode="tel" onChange={(v) => patch({ phone: v })} />}
              {spec.show.website && <Input label="Website" value={spec.website} maxLength={80} onChange={(v) => patch({ website: v })} />}
              {spec.show.qr && <Input label="The QR code opens" value={spec.link} maxLength={500} onChange={(v) => patch({ link: v })} placeholder={brand?.order_url ?? ''} />}
            </div>
          </Card>

          <Card>
            <h3 className="sp-h">4. Make it move</h3>
            <p className="sp-hint" style={{ marginTop: 0 }}>Pick a motion and the post plays on the picture. Still picture leaves it as it is.</p>
            <div className="sp-presets" role="group" aria-label="Motion">
              <Btn small variant={spec.motion === '' ? 'primary' : 'secondary'} aria-pressed={spec.motion === ''} onClick={() => pickMotion('')}>Still picture</Btn>
              {MOTIONS.map((m) => (
                <Btn key={m.key} small variant={spec.motion === m.key ? 'primary' : 'secondary'} aria-pressed={spec.motion === m.key} onClick={() => pickMotion(m.key)}>{m.name}</Btn>
              ))}
            </div>
            {spec.motion !== '' && (
              <>
                <div className="sp-label" style={{ marginTop: 12 }}>How long</div>
                <div className="sp-presets" role="group" aria-label="How long">
                  {MOTION_SECONDS.map((n) => (
                    <Btn key={n} small variant={seconds === n ? 'primary' : 'secondary'} aria-pressed={seconds === n} onClick={() => { setSeconds(n); setPlayKey((k) => k + 1); }}>{n} seconds</Btn>
                  ))}
                </div>
                <div className="sp-row">
                  <Btn small variant="secondary" onClick={() => { setPinOpen(true); setPlayKey((k) => k + 1); }} disabled={empty}><Play size={14} aria-hidden /> Play again</Btn>
                  {canCompose && (
                    <Btn small onClick={() => void makeVideo()} disabled={empty || busy !== '' || !canRecord()}>
                      <Clapperboard size={14} aria-hidden /> {busy === 'video' ? `Recording… ${Math.round(recorded * 100)}%` : busy === 'convert' ? 'Finishing the video…' : `Make the video (${size.name})`}
                    </Btn>
                  )}
                </div>
                <p className="sp-hint">
                  {canRecord()
                    ? `The video is made in the shape on screen (${size.name}) and takes about ${seconds + 10} seconds. Keep this page open while it records. It has no sound.`
                    : 'This browser cannot record a video. Open this page in Chrome or Safari.'}
                </p>
              </>
            )}
          </Card>

          {canCompose && (
            <Card>
              <h3 className="sp-h">5. Save it for later</h3>
              <div className="sp-fields">
                <Input label="Name" value={name} maxLength={120} onChange={setName} placeholder={spec.headline || 'Frozen Momo offer'} />
              </div>
              <div className="sp-row">
                <Btn small onClick={() => void keep(false)} disabled={empty || busy !== ''}><Save size={14} aria-hidden /> {busy === 'save' ? 'Saving…' : savedId ? 'Save changes' : 'Save'}</Btn>
                {savedId && <Btn small variant="secondary" onClick={() => void keep(true)} disabled={empty || busy !== ''}>Save as a new post</Btn>}
                <Btn small variant="secondary" onClick={startNew}>Start a new post</Btn>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Card style={{ marginTop: 16 }}>
        <h3 className="sp-h">Saved posts</h3>
        {saved.length === 0
          ? <p className="sp-hint">Nothing saved yet. A saved post keeps its words, photo and design, so next week you open it, change the price and download again.</p>
          : (
            <div className="sp-saved-grid">
              {saved.map((row) => <SavedCard key={row.id} row={row} brand={brand} canCompose={canCompose} onOpen={() => open(row)} onRemove={() => remove(row)} />)}
            </div>
          )}
      </Card>

      {/* Drawn off screen: the post's QR code is copied from this canvas. */}
      <div aria-hidden className="sp-offscreen">
        <QRCodeCanvas ref={setQr} value={link || 'https://'} size={480} marginSize={0} />
      </div>
      {saving && (
        <SaveSheet
          spec={spec} layout={layout} palette={palette} assets={assets} name={name}
          caption={captionOf({ ...spec, link })} videoUrl={spec.motion ? video : null}
          onClose={() => setSaving(false)}
        />
      )}
      <MediaPicker open={picking} onClose={() => setPicking(false)} onPick={pickPhoto} mediaType="image" title="Pick a photo for the post" />
      <ConfirmDialog state={dialog.state} close={dialog.close} />
    </div>
  );
}
