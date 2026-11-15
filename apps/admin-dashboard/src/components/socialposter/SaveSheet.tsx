import { useEffect, useMemo, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { Btn, ErrorMsg, Modal, ModalActions, Spinner } from '../SharedUI';
import type { PostAssets } from './draw';
import { canShareFiles, fileName, pictureOf, saveFile } from './picture';
import { SIZES, type PostSize, type PostSpec } from './types';

/**
 * Save or share a post (owner, 2026-11-15: "When download is clicked, it opens
 * each pic separately. Make it iPhone compatible and make it easier to share,
 * save, each size and video"). A phone has no downloads folder to speak of:
 * a link with `download` opens the picture in a viewer, one after another.
 * What a phone has is its share sheet, which saves to Photos and sends to
 * WhatsApp, Instagram and the rest. So every size is made first and shown,
 * each with one button that opens that sheet (Download where there is none),
 * one button for all four, and the video beside them with the same.
 *
 * The files are ready before any button shows: an iPhone only opens its share
 * sheet straight from a tap, never after a wait.
 */

interface Made { size: PostSize; file: File; url: string }

export function SaveSheet({ spec, layout, palette, assets, name, caption, videoUrl, onClose }: {
  spec: PostSpec; layout: string; palette: string; assets: PostAssets; name: string;
  /** Sent with a shared picture, for apps that take words with it. */
  caption: string;
  /** The post's video, when one has been made. */
  videoUrl: string | null;
  onClose: () => void;
}) {
  const [made, setMade] = useState<Made[] | null>(null);
  const [video, setVideo] = useState<{ file: File; url: string } | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [error, setError] = useState('');
  const [told, setTold] = useState('');

  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    void (async () => {
      const out: Made[] = [];
      for (const size of SIZES) {
        const blob = await pictureOf(spec, layout, palette, size, assets, 'image/png');
        if (!live) return;
        if (!blob) { setError('The pictures could not be made. If the photo is from another website, pick one from the library.'); return; }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        out.push({ size, file: new File([blob], fileName(spec, name, size), { type: 'image/png' }), url });
      }
      setMade(out);
    })();
    return () => { live = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
    // The post does not change while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!videoUrl) return;
    let live = true;
    let url = '';
    void fetch(videoUrl, { credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setVideo({ file: new File([blob], fileName(spec, name, SIZES[0], 'mp4').replace(/-[a-z]+\.mp4$/, '.mp4'), { type: 'video/mp4' }), url });
      })
      .catch(() => { if (live) setVideoFailed(true); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  const shares = useMemo(() => (made ? canShareFiles([made[0].file]) : false), [made]);
  const sharesAll = useMemo(() => (made ? canShareFiles(made.map((m) => m.file)) : false), [made]);
  const sharesVideo = useMemo(() => (video ? canShareFiles([video.file]) : false), [video]);

  const share = (files: File[], withWords: boolean) => {
    setError('');
    setTold('');
    // Straight from the tap: nothing is awaited before the sheet opens.
    navigator.share(withWords && caption ? { files, text: caption } : { files })
      .catch((e) => {
        // Closing the sheet is not an error.
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError('The share sheet did not open. Press and hold the picture and choose Save to Photos.');
      });
  };
  const downloadAll = async () => {
    if (!made) return;
    for (const m of made) {
      saveFile(m.file, m.file.name);
      // A browser drops downloads that start in the same instant.
      await new Promise((r) => setTimeout(r, 350));
    }
    setTold('Four pictures are in your downloads.');
  };

  return (
    <Modal title="Save or share" onClose={onClose} maxWidth={560}>
      {error && <ErrorMsg message={error} />}
      {told && <p role="status" className="sp-notice">{told}</p>}
      {!made && !error && <Spinner />}
      {made && (
        <>
          <p className="sp-hint" style={{ marginTop: 0 }}>
            {shares
              ? 'Tap Share or save, then Save Image to keep it in Photos, or pick WhatsApp, Instagram, Viber or another app.'
              : 'Download saves the picture to this computer.'}
          </p>
          <div className="sp-row" style={{ marginTop: 8 }}>
            {sharesAll
              ? <Btn small onClick={() => share(made.map((m) => m.file), false)}><Share2 size={14} aria-hidden /> Share or save all 4</Btn>
              : !shares && <Btn small onClick={() => void downloadAll()}><Download size={14} aria-hidden /> Download all 4</Btn>}
          </div>
          <div className="sp-save-grid">
            {made.map((m) => (
              <div key={m.size.key} className="sp-save">
                <img src={m.url} alt={`The post as a ${m.size.name.toLowerCase()}`} className="sp-save-pic" style={{ aspectRatio: `${m.size.w} / ${m.size.h}` }} />
                <div className="sp-saved-name">{m.size.name}</div>
                <div className="sp-hint" style={{ marginTop: 0 }}>{m.size.hint}</div>
                {shares
                  ? <Btn small variant="secondary" onClick={() => share([m.file], true)} aria-label={`Share or save the ${m.size.name} picture`}><Share2 size={14} aria-hidden /> Share or save</Btn>
                  : <Btn small variant="secondary" onClick={() => saveFile(m.file, m.file.name)} aria-label={`Download the ${m.size.name} picture`}><Download size={14} aria-hidden /> Download</Btn>}
              </div>
            ))}
          </div>
        </>
      )}

      {videoUrl && (
        <div className="sp-save-video">
          <div className="sp-h4" style={{ marginTop: 0 }}>Video</div>
          <video src={video?.url ?? videoUrl} controls autoPlay loop muted playsInline className="sp-save-vid" />
          <div className="sp-row">
            {video && sharesVideo && <Btn small onClick={() => share([video.file], true)}><Share2 size={14} aria-hidden /> Share or save the video</Btn>}
            {video && !sharesVideo && <Btn small onClick={() => saveFile(video.file, video.file.name)}><Download size={14} aria-hidden /> Download the video</Btn>}
            {!video && !videoFailed && <span className="sp-hint" style={{ marginTop: 0 }}>Getting the video ready…</span>}
            {videoFailed && <a href={videoUrl} download className="social-video-link"><Download size={14} aria-hidden /> Download the video</a>}
          </div>
          {video && sharesVideo && <p className="sp-hint">Save Video keeps it in Photos. For a story or a reel, pick Instagram, WhatsApp or TikTok in the same list.</p>}
        </div>
      )}

      <ModalActions>
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
      </ModalActions>
    </Modal>
  );
}
