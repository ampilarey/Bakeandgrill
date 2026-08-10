import { useEffect, useState } from 'react';
import {
  posFetchDispatchedDeliveries,
  posFetchTradeDelivery,
  posReconcileTradeDelivery,
  type PosTradeDelivery,
} from '../api/trade';

type LineForm = {
  line_id: number;
  item_name: string;
  qty_sent: number;
  reported_sold_qty: string;
  counted_return_qty: string;
  qty_missing: string;
  return_action: 'accept_to_stock' | 'reject_to_waste' | '';
};

type Props = { onClose: () => void };

export function WholesaleReconcilePanel({ onClose }: Props) {
  const [list, setList] = useState<PosTradeDelivery[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lines, setLines] = useState<LineForm[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  useEffect(() => {
    void posFetchDispatchedDeliveries()
      .then((r) => setList(r.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, []);

  const openDelivery = async (id: number) => {
    setError('');
    setDoneMsg('');
    setSelectedId(id);
    try {
      const res = await posFetchTradeDelivery(id);
      setLines((res.delivery.lines ?? []).map((l) => ({
        line_id: l.id,
        item_name: l.item_name ?? `Item ${l.item_id}`,
        qty_sent: l.qty_sent,
        reported_sold_qty: String(l.qty_sent),
        counted_return_qty: '0',
        qty_missing: '0',
        return_action: '',
      })));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const balanceHint = (line: LineForm): string => {
    const sold = Number(line.reported_sold_qty) || 0;
    const ret = Number(line.counted_return_qty) || 0;
    const miss = Number(line.qty_missing) || 0;
    const physicalSold = line.qty_sent - ret - miss;
    if (physicalSold < 0) return 'Does not balance — too many returned/missing';
    if (sold !== physicalSold) return `Mismatch: shop said ${sold}, count implies ${physicalSold}`;
    return `Balances: sold ${physicalSold} + back ${ret} + missing ${miss} = ${line.qty_sent}`;
  };

  const confirm = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      const payload = lines.map((l) => {
        const counted = Number(l.counted_return_qty) || 0;
        return {
          line_id: l.line_id,
          reported_sold_qty: Number(l.reported_sold_qty) || 0,
          counted_return_qty: counted,
          qty_missing: Number(l.qty_missing) || 0,
          return_action: counted > 0 ? (l.return_action || null) : null,
          return_condition: counted > 0
            ? (l.return_action === 'reject_to_waste' ? 'damaged' : 'good')
            : null,
          return_idempotency_key: `pos-rec-${selectedId}-${l.line_id}-${Date.now()}`,
        };
      });
      const res = await posReconcileTradeDelivery(selectedId, payload);
      setDoneMsg(
        res.delivery.has_mismatch
          ? `${res.delivery.delivery_number} saved with a mismatch flag`
          : `${res.delivery.delivery_number} reconciled`,
      );
      setSelectedId(null);
      setLines([]);
      const refreshed = await posFetchDispatchedDeliveries();
      setList(refreshed.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={shell}>
      <header style={header}>
        <button type="button" onClick={onClose} style={backBtn}>← Back</button>
        <h1 style={title}>{selectedId ? 'Reconcile delivery' : 'What came back'}</h1>
      </header>

      {error && <div style={errBox}>{error}</div>}
      {doneMsg && <div style={okBox}>{doneMsg}</div>}

      {!selectedId && (
        <div style={{ display: 'grid', gap: 8 }}>
          {list.length === 0 ? (
            <div style={{ opacity: 0.7, padding: 20 }}>No deliveries waiting to reconcile.</div>
          ) : list.map((d) => (
            <button key={d.id} type="button" style={itemBtn} onClick={() => void openDelivery(d.id)}>
              <div style={{ fontWeight: 700 }}>{d.delivery_number}</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>{d.shop_name}</div>
            </button>
          ))}
        </div>
      )}

      {selectedId && lines.map((line) => (
        <div key={line.line_id} style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {line.item_name} · sent {line.qty_sent}
          </div>
          <label style={label}>How many did they sell?</label>
          <input
            type="number"
            min={0}
            value={line.reported_sold_qty}
            onChange={(e) => setLines((p) => p.map((l) => l.line_id === line.line_id ? { ...l, reported_sold_qty: e.target.value } : l))}
            style={control}
          />
          <label style={label}>How many came back?</label>
          <input
            type="number"
            min={0}
            value={line.counted_return_qty}
            onChange={(e) => setLines((p) => p.map((l) => l.line_id === line.line_id ? { ...l, counted_return_qty: e.target.value } : l))}
            style={control}
          />
          <label style={label}>Not returned</label>
          <input
            type="number"
            min={0}
            value={line.qty_missing}
            onChange={(e) => setLines((p) => p.map((l) => l.line_id === line.line_id ? { ...l, qty_missing: e.target.value } : l))}
            style={control}
          />
          {(Number(line.counted_return_qty) || 0) > 0 && (
            <>
              <label style={label}>Returned goods</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  style={{
                    ...choiceBtn,
                    borderColor: line.return_action === 'accept_to_stock' ? '#d4813a' : '#d6cfc4',
                    background: line.return_action === 'accept_to_stock' ? '#fff7ed' : '#fff',
                  }}
                  onClick={() => setLines((p) => p.map((l) => l.line_id === line.line_id ? { ...l, return_action: 'accept_to_stock' } : l))}
                >
                  Still good — put back in stock
                </button>
                <button
                  type="button"
                  style={{
                    ...choiceBtn,
                    borderColor: line.return_action === 'reject_to_waste' ? '#d4813a' : '#d6cfc4',
                    background: line.return_action === 'reject_to_waste' ? '#fff7ed' : '#fff',
                  }}
                  onClick={() => setLines((p) => p.map((l) => l.line_id === line.line_id ? { ...l, return_action: 'reject_to_waste' } : l))}
                >
                  Spoiled — throw away
                </button>
              </div>
            </>
          )}
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>{balanceHint(line)}</div>
        </div>
      ))}

      {selectedId && (
        <div style={footer}>
          <button type="button" style={backBtn} onClick={() => { setSelectedId(null); setLines([]); }}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => void confirm()} style={primaryBtn}>
            {busy ? 'Saving…' : 'Confirm reconcile'}
          </button>
        </div>
      )}
    </div>
  );
}

const shell: React.CSSProperties = {
  padding: 16, maxWidth: 720, margin: '0 auto', minHeight: '100%',
  background: '#f7f3ee', color: '#1c1408',
};
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 };
const backBtn: React.CSSProperties = {
  minHeight: 44, minWidth: 44, borderRadius: 10, border: '1px solid #d6cfc4',
  background: '#fff', fontWeight: 600, cursor: 'pointer', padding: '0 12px',
};
const title: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 700 };
const label: React.CSSProperties = { display: 'block', marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: 700, opacity: 0.7 };
const control: React.CSSProperties = {
  width: '100%', minHeight: 44, borderRadius: 10, border: '1px solid #d6cfc4',
  padding: '0 12px', fontSize: 15, background: '#fff', boxSizing: 'border-box',
};
const itemBtn: React.CSSProperties = {
  width: '100%', minHeight: 56, textAlign: 'left',
  borderRadius: 12, border: '1px solid #e8e0d8', background: '#fff',
  padding: '10px 14px', cursor: 'pointer',
};
const card: React.CSSProperties = {
  marginBottom: 12, padding: 14, borderRadius: 14, background: '#fff', border: '1px solid #e8e0d8',
};
const choiceBtn: React.CSSProperties = {
  minHeight: 52, borderRadius: 12, border: '1px solid #d6cfc4',
  padding: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
};
const footer: React.CSSProperties = {
  marginTop: 16, display: 'flex', justifyContent: 'space-between', gap: 12,
};
const primaryBtn: React.CSSProperties = {
  minHeight: 48, padding: '0 20px', borderRadius: 12, border: 'none',
  background: '#d4813a', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
};
const errBox: React.CSSProperties = {
  padding: 12, borderRadius: 10, background: '#fef2f2', color: '#991b1b', marginBottom: 10, fontSize: 13,
};
const okBox: React.CSSProperties = {
  padding: 12, borderRadius: 10, background: '#ecfdf5', color: '#065f46', marginBottom: 10, fontSize: 13,
};
