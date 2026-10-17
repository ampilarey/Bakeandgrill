import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Btn } from './SharedUI';
import { fetchOrderMessages, orderMessageToComplaint, replyToOrderMessage, type OrderMessage } from '../api';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

/*
 * The order's messages with the customer ("Please add extra sauce", "running
 * late"), iruali import plan, feature 9. A reply is texted to the customer
 * with a link back to the order. Complaints stay separate: a message that is
 * really one becomes a complaint here.
 */
export function OrderMessagesPanel({ orderId }: { orderId: number }) {
  const { can } = useCurrentUserPermissions();
  const [messages, setMessages] = useState<OrderMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = () => fetchOrderMessages(orderId).then((r) => setMessages(r.messages)).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [orderId]);

  const send = async () => {
    setBusy(true); setError('');
    try { await replyToOrderMessage(orderId, text.trim()); setText(''); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const toComplaint = async (m: OrderMessage) => {
    setBusy(true); setError('');
    try {
      const r = await orderMessageToComplaint(m.id);
      setNote(`Complaint ${r.reference ?? `#${r.complaint_id}`} opened.`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (messages === null && !error) return null;
  const list = messages ?? [];

  return (
    <div data-testid="order-messages" style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <MessageSquare size={14} aria-hidden /> Messages with the customer
      </p>
      {list.length === 0 && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>No messages yet. The customer can write from their order page.</p>}
      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
        {list.map((m) => (
          <div key={m.id} style={{
            justifySelf: m.from === 'staff' ? 'end' : 'start', maxWidth: '85%', padding: '8px 10px', borderRadius: 10, fontSize: 13,
            background: m.from === 'staff' ? 'var(--color-tone-rust-bg)' : 'var(--color-bg)',
            border: `1px solid ${m.from === 'staff' ? 'var(--color-tone-rust-border)' : 'var(--color-border-light)'}`,
          }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>
              {m.from === 'staff' ? (m.staff_name ?? 'Staff') : 'Customer'} · {new Date(m.created_at).toLocaleString()}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</div>
            {m.photo_url && (
              <a href={m.photo_url} target="_blank" rel="noopener noreferrer">
                <img src={m.photo_url} alt="Sent by the customer" style={{ marginTop: 6, maxWidth: 160, borderRadius: 8, display: 'block' }} />
              </a>
            )}
            {m.from === 'customer' && can('complaints.manage') && (
              m.complaint_id
                ? <Link to="/customers/complaints" style={{ fontSize: 12, color: 'var(--color-primary)' }}>Complaint opened</Link>
                : <button type="button" onClick={() => void toComplaint(m)} disabled={busy} style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, color: 'var(--color-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Turn into a complaint</button>
            )}
          </div>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={1000}
        aria-label="Reply to the customer"
        placeholder="Reply to the customer (sent by SMS with a link to the order)"
        style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14, fontFamily: 'inherit' }}
      />
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>}
      {note && <p role="status" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-success)' }}>{note}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <Btn small onClick={() => void send()} disabled={busy || text.trim() === ''}>Send reply</Btn>
      </div>
    </div>
  );
}
