import { useEffect, useState } from 'react';
import {
  TableCard, TH, TD, Badge, Btn, Modal, ModalActions, EmptyState,
} from '../components/SharedUI';
import {
  fetchOrderBoards, createOrderBoard, revokeOrderBoard, type OrderBoard,
} from '../api';

/**
 * The wall screens at /board — kitchen and cash register.
 *
 * These live on the Devices page but are not Devices. A Device is a till or a
 * KDS somebody signs in to; a board is an unattended screen with its own
 * read-only credential that can do nothing but display orders. Keeping them
 * visually separate matters: revoking a board must never feel like the same
 * action as disabling a till.
 *
 * The key is shown once, on creation, and never again — the server stores
 * only a hash. So the reveal below is the single moment it exists in a
 * readable form, and the copy affordance has to be obvious.
 */

const S = {
  input: {
    width: '100%', padding: '8px 12px', border: '1.5px solid var(--color-border)',
    borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const,
  },
  label: {
    display: 'block' as const, fontSize: 13, fontWeight: 600 as const,
    color: 'var(--color-text-secondary)', marginBottom: 4,
  },
  code: {
    flex: 1, display: 'block', padding: '10px 12px', borderRadius: 8,
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    fontSize: 13, color: 'var(--color-text)', wordBreak: 'break-all' as const,
  },
};

const when = (value: string | null): string =>
  value ? new Date(value).toLocaleString() : '—';

export default function OrderBoardsCard({ canManage }: { canManage: boolean }) {
  const [boards, setBoards] = useState<OrderBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setBoards((await fetchOrderBoards()).boards ?? []);
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const boardUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/board`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(`${label} copied!`); setTimeout(() => setCopied(''), 2000); })
      .catch(() => setCopied('Copy failed — select and copy manually.'));
  };

  const handleCreate = async () => {
    if (!name.trim()) { setFormError('Give the screen a name so you know which one to revoke.'); return; }
    setSaving(true); setFormError('');
    try {
      const res = await createOrderBoard(name.trim());
      setIssued({ name: res.name, token: res.token });
      setName('');
      void load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleRevoke = async (board: OrderBoard) => {
    if (!window.confirm(
      `Revoke "${board.name}"? That screen stops showing orders within a few seconds `
      + 'and will ask to be paired again.',
    )) return;
    setBusyId(board.id);
    try {
      await revokeOrderBoard(board.id);
      setBoards(prev => prev.filter(b => b.id !== board.id));
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  };

  const closeModal = () => { setModal(false); setIssued(null); setFormError(''); };

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 8,
      }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--color-text)' }}>
          Order boards
        </h2>
        {canManage && (
          <Btn onClick={() => { setModal(true); setIssued(null); setFormError(''); }}>
            + Add a board
          </Btn>
        )}
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 720 }}>
        Wall screens that show live orders at <code>{boardUrl}</code> — the kitchen and the
        cash register. They update on their own and never need anybody to sign in. A board
        can only read the order list: it cannot ring a sale, take a payment or see money,
        so a key copied off a screen is worth nothing beyond looking at that screen.
      </p>

      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>}

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Screen', 'Last seen', 'Key expires', ...(canManage ? ['Actions'] : [])].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canManage ? 4 : 3} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>Loading…</td></tr>
            ) : boards.length === 0 ? (
              <tr><td colSpan={canManage ? 4 : 3}><EmptyState message="No order boards yet." /></td></tr>
            ) : boards.map(b => (
              <tr key={b.id}>
                <td style={{ ...TD, fontWeight: 600 }}>
                  {/* The server prefixes every board token with board-; showing
                      the raw name would put that prefix on every row. */}
                  {b.name.replace(/^board-/, '')}
                </td>
                <td style={TD}>
                  {b.last_used_at
                    ? <Badge color="green">{when(b.last_used_at)}</Badge>
                    : <Badge color="gray">Never paired</Badge>}
                </td>
                <td style={{ ...TD, fontSize: 12, color: 'var(--color-text-muted)' }}>{when(b.expires_at)}</td>
                {canManage && (
                  <td style={TD}>
                    <Btn small variant="secondary" onClick={() => handleRevoke(b)} disabled={busyId === b.id}>
                      {busyId === b.id ? '…' : 'Revoke'}
                    </Btn>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {modal && (
        <Modal title={issued ? 'Board key' : 'Add an order board'} onClose={closeModal} maxWidth={480}>
          {issued ? (
            <>
              <div style={{
                background: 'var(--color-warning-bg)',
                border: '1px solid var(--color-warning)',
                borderRadius: 10, padding: 14, marginBottom: 16,
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-warning-strong)' }}>
                  Copy this key now — it is not shown again.
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-warning-strong)' }}>
                  If you lose it, revoke this board and add another. Nothing else breaks.
                </p>
              </div>

              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={S.label}>Key for {issued.name.replace(/^board-/, '')}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <code style={S.code}>{issued.token}</code>
                  <Btn variant="secondary" onClick={() => copy(issued.token, 'Key')}>Copy</Btn>
                </div>
              </label>

              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={S.label}>Open this on the screen</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <code style={{ ...S.code, fontSize: 12 }}>{boardUrl}</code>
                  <Btn variant="secondary" onClick={() => copy(boardUrl, 'Link')}>Copy</Btn>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, display: 'block' }}>
                  Open the link on the screen, paste the key once, and tap <strong>Start the board</strong>.
                  It stays paired through reboots. Tapping the bell on the screen turns on the
                  chime for new online orders — browsers will not play a sound until somebody
                  taps once.
                </span>
              </label>

              {copied && <p style={{ color: 'var(--color-success-strong)', fontSize: 13, margin: '8px 0 0' }}>{copied}</p>}

              <ModalActions>
                <Btn onClick={closeModal}>Done</Btn>
              </ModalActions>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                One board per screen, so you can revoke a single screen without darkening
                the others.
              </p>
              {formError && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{formError}</p>}
              <label>
                <span style={S.label}>Where is the screen? *</span>
                <input
                  type="text"
                  placeholder="e.g. Kitchen, Cash register"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
                  autoFocus
                  style={S.input}
                />
              </label>
              <ModalActions>
                <Btn variant="secondary" onClick={closeModal}>Cancel</Btn>
                <Btn onClick={handleCreate} disabled={saving}>
                  {saving ? 'Creating…' : 'Create board key'}
                </Btn>
              </ModalActions>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
