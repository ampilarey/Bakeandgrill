import { useCallback, useEffect, useState } from 'react';
import {
  fetchSocialComments, markAllSocialCommentsRead, markSocialCommentRead, replySocialComment, syncSocialComments,
  type SocialCommentRow,
} from '../../api';
import { Badge, Btn, Card, ErrorMsg, Pagination, Spinner } from '../../components/SharedUI';
import { PLATFORM_SHORT } from './composer';

/**
 * The comment inbox (owner's shortlist, 2026-09-24). Comments on recent
 * Facebook and Instagram posts, pulled hourly (or now), newest first;
 * the ones that read like somebody wanting to order are flagged. Reply
 * as the page from here, mark read, and nothing in admin needs to open
 * Facebook.
 */
export function CommentsTab({ canReply }: { canReply: boolean }) {
  const [comments, setComments] = useState<SocialCommentRow[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replying, setReplying] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSocialComments({ page, unread: onlyUnread, flagged: onlyFlagged });
      setComments(res.comments);
      setMeta(res.meta);
      setUnread(res.unread);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, onlyUnread, onlyFlagged]);

  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (c: SocialCommentRow) => {
    const message = replyText.trim();
    if (message === '') return;
    await act(async () => {
      await replySocialComment(c.id, message);
      setReplying(null);
      setReplyText('');
    }, 'Reply posted.');
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error && <ErrorMsg message={error} />}
      {notice && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>{notice}</p>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }} data-testid="comments-unread">
          {unread === 0 ? 'Nothing unread' : `${unread} unread`}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyUnread} onChange={(e) => { setOnlyUnread(e.target.checked); setPage(1); }} />
          Unread only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => { setOnlyFlagged(e.target.checked); setPage(1); }} />
          Wants to order
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Btn small variant="secondary" disabled={busy} onClick={() => { void act(async () => { const r = await syncSocialComments(); setNotice(r.new === 0 ? 'No new comments.' : `${r.new} new comment${r.new === 1 ? '' : 's'}.`); }); }}>
            Check for new comments
          </Btn>
          {unread > 0 && (
            <Btn small variant="secondary" disabled={busy} onClick={() => { void act(() => markAllSocialCommentsRead(), 'All read.'); }}>Mark all read</Btn>
          )}
        </div>
      </div>

      {loading ? <Spinner /> : comments.length === 0 ? (
        <Card style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          {onlyUnread || onlyFlagged ? 'No comments match.' : 'No comments yet. Comments on Facebook and Instagram posts from the last two weeks appear here; Telegram and Viber do not expose theirs.'}
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {comments.map((c) => (
            <Card
              key={c.id}
              data-testid={`comment-${c.id}`}
              style={{ padding: '12px 14px', borderLeft: c.read_at ? undefined : '4px solid var(--color-primary)' }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{c.author ?? 'Someone'}</strong>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {PLATFORM_SHORT[c.platform ?? ''] ?? c.platform} · {c.posted_at ? new Date(c.posted_at).toLocaleString() : ''}
                </span>
                {c.flagged && <Badge label="Wants to order?" color="orange" />}
                {c.replied_at && <Badge label="Replied" color="green" />}
                {c.permalink && (
                  <a href={c.permalink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-primary)' }}>open post</a>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.text}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>On: {c.post_caption}</p>
              {c.reply_text && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', paddingLeft: 10, borderLeft: '2px solid var(--color-border)' }}>
                  You: {c.reply_text}
                </p>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {canReply && c.can_reply && replying !== c.id && (
                  <Btn small variant="secondary" disabled={busy} onClick={() => { setReplying(c.id); setReplyText(''); }}>{c.replied_at ? 'Reply again' : 'Reply'}</Btn>
                )}
                {!c.read_at ? (
                  <Btn small variant="secondary" disabled={busy} onClick={() => { void act(() => markSocialCommentRead(c.id)); }}>Mark read</Btn>
                ) : (
                  <Btn small variant="ghost" disabled={busy} onClick={() => { void act(() => markSocialCommentRead(c.id, true)); }}>Mark unread</Btn>
                )}
              </div>
              {replying === c.id && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'flex-start' }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    aria-label={`Reply to ${c.author ?? 'comment'}`}
                    style={{ flex: 1, padding: 8, borderRadius: 10, fontFamily: 'inherit', fontSize: 13, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  />
                  <Btn small disabled={busy || replyText.trim() === ''} onClick={() => { void sendReply(c); }}>Send</Btn>
                  <Btn small variant="secondary" disabled={busy} onClick={() => setReplying(null)}>Cancel</Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Pagination page={meta.current_page} totalPages={meta.last_page} onChange={setPage} />
    </div>
  );
}
