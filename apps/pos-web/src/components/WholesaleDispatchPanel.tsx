import { useEffect, useMemo, useState } from 'react';
import {
  posDispatchTradeDelivery,
  posFetchTradeAccounts,
  posFetchTradeExposure,
  posPreviewTradePrice,
  type PosTradeAccount,
  type PosTradeExposure,
} from '../api/trade';
import { fetchItems } from '../api/menu';

type LineDraft = {
  item_id: number;
  name: string;
  qty: number;
  price_laar: number | null;
  source: string;
};

type Props = {
  onClose: () => void;
  canOverrideCredit: boolean;
};

function mvr(laar: number): string {
  return `MVR ${(laar / 100).toFixed(2)}`;
}

export function WholesaleDispatchPanel({ onClose, canOverrideCredit }: Props) {
  const [accounts, setAccounts] = useState<PosTradeAccount[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [exposure, setExposure] = useState<PosTradeExposure | null>(null);
  const [menuItems, setMenuItems] = useState<Array<{ id: number; name: string }>>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [driverName, setDriverName] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneMsg, setDoneMsg] = useState('');

  useEffect(() => {
    void posFetchTradeAccounts().then((r) => setAccounts(r.data ?? [])).catch((e) => setError(e.message));
    void fetchItems().then((items) => {
      setMenuItems((items ?? []).map((i) => ({ id: i.id, name: i.name })));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!accountId) { setExposure(null); return; }
    void posFetchTradeExposure(accountId).then((r) => setExposure(r.exposure)).catch((e) => setError(e.message));
  }, [accountId]);

  const totalLaar = useMemo(
    () => lines.reduce((s, l) => s + (l.price_laar ?? 0) * l.qty, 0),
    [lines],
  );

  const filtered = menuItems.filter((i) =>
    i.name.toLowerCase().includes(itemSearch.trim().toLowerCase()),
  ).slice(0, 8);

  const addItem = async (item: { id: number; name: string }) => {
    if (!accountId) { setError('Pick a shop first.'); return; }
    setError('');
    try {
      const preview = await posPreviewTradePrice(accountId, item.id);
      setLines((prev) => {
        const existing = prev.find((l) => l.item_id === item.id);
        if (existing) {
          return prev.map((l) => l.item_id === item.id ? { ...l, qty: l.qty + 1 } : l);
        }
        return [...prev, {
          item_id: item.id,
          name: item.name,
          qty: 1,
          price_laar: preview.found ? preview.price_laar : null,
          source: preview.source,
        }];
      });
      setItemSearch('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const confirm = async () => {
    if (!accountId || lines.length === 0) {
      setError('Pick a shop and add items.');
      return;
    }
    if (lines.some((l) => l.price_laar == null)) {
      setError('Every line needs a wholesale price before sending.');
      return;
    }
    setBusy(true);
    setError('');
    setDoneMsg('');
    try {
      const res = await posDispatchTradeDelivery({
        trade_account_id: accountId,
        idempotency_key: `pos-dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        driver_name: driverName.trim() || undefined,
        credit_override_reason: overrideReason.trim() || undefined,
        lines: lines.map((l) => ({ item_id: l.item_id, qty: l.qty })),
      });
      setDoneMsg(`Sent ${res.delivery.delivery_number}`);
      setLines([]);
      if (accountId) {
        const exp = await posFetchTradeExposure(accountId);
        setExposure(exp.exposure);
      }
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
        <h1 style={title}>Send to a shop</h1>
      </header>

      {error && <div style={errBox}>{error}</div>}
      {doneMsg && <div style={okBox}>{doneMsg}</div>}

      <label style={label}>Shop</label>
      <select
        value={accountId ?? ''}
        onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
        style={control}
      >
        <option value="">Select shop…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.shop_name}</option>
        ))}
      </select>

      {exposure && (
        <div style={exposureBox}>
          <div>Owes {exposure.balance_owed_mvr}</div>
          <div>Holding {exposure.holding_unbilled_mvr} of our stock</div>
          <div style={{ fontWeight: 700 }}>Limit {exposure.credit_limit_mvr}</div>
        </div>
      )}

      <label style={label}>Add items</label>
      <input
        value={itemSearch}
        onChange={(e) => setItemSearch(e.target.value)}
        placeholder="Search menu…"
        style={control}
      />
      {itemSearch.trim() && filtered.map((item) => (
        <button key={item.id} type="button" onClick={() => void addItem(item)} style={itemBtn}>
          {item.name}
        </button>
      ))}

      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {lines.map((line) => (
          <div key={line.item_id} style={lineRow}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{line.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {line.price_laar == null ? 'No price' : mvr(line.price_laar)}
                {line.source === 'account_list' ? ' · shop price' : line.source === 'item_wholesale' ? ' · standard' : ' · from retail'}
              </div>
            </div>
            <button type="button" style={qtyBtn} onClick={() => setLines((p) => p.map((l) => l.item_id === line.item_id ? { ...l, qty: Math.max(1, l.qty - 1) } : l))}>−</button>
            <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{line.qty}</span>
            <button type="button" style={qtyBtn} onClick={() => setLines((p) => p.map((l) => l.item_id === line.item_id ? { ...l, qty: l.qty + 1 } : l))}>+</button>
            <button type="button" style={{ ...qtyBtn, color: 'var(--color-danger, #b91c1c)' }} onClick={() => setLines((p) => p.filter((l) => l.item_id !== line.item_id))}>×</button>
          </div>
        ))}
      </div>

      <label style={label}>Driver name (optional)</label>
      <input value={driverName} onChange={(e) => setDriverName(e.target.value)} style={control} />

      {canOverrideCredit && (
        <>
          <label style={label}>Credit override reason (owner only, if over limit)</label>
          <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} style={control} placeholder="Leave blank unless needed" />
        </>
      )}

      <div style={footer}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Total {mvr(totalLaar)}</div>
        <button type="button" disabled={busy} onClick={() => void confirm()} style={primaryBtn}>
          {busy ? 'Sending…' : 'Confirm send'}
        </button>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  padding: 16, maxWidth: 720, margin: '0 auto', minHeight: '100%',
  background: 'var(--pos-bg, #f7f3ee)', color: 'var(--pos-text, #1c1408)',
};
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 };
const backBtn: React.CSSProperties = {
  minHeight: 44, minWidth: 44, borderRadius: 10, border: '1px solid #d6cfc4',
  background: '#fff', fontWeight: 600, cursor: 'pointer',
};
const title: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 700 };
const label: React.CSSProperties = { display: 'block', marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: 700, opacity: 0.7 };
const control: React.CSSProperties = {
  width: '100%', minHeight: 44, borderRadius: 10, border: '1px solid #d6cfc4',
  padding: '0 12px', fontSize: 15, background: '#fff', boxSizing: 'border-box',
};
const exposureBox: React.CSSProperties = {
  marginTop: 12, padding: 12, borderRadius: 12, background: '#fff',
  border: '1px solid #e8e0d8', display: 'grid', gap: 4, fontSize: 13,
};
const itemBtn: React.CSSProperties = {
  width: '100%', minHeight: 44, textAlign: 'left', marginTop: 6,
  borderRadius: 10, border: '1px solid #e8e0d8', background: '#fff',
  padding: '0 12px', cursor: 'pointer', fontSize: 14,
};
const lineRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: 10,
  background: '#fff', borderRadius: 12, border: '1px solid #e8e0d8',
};
const qtyBtn: React.CSSProperties = {
  minHeight: 44, minWidth: 44, borderRadius: 10, border: '1px solid #d6cfc4',
  background: '#faf7f2', fontSize: 18, fontWeight: 700, cursor: 'pointer',
};
const footer: React.CSSProperties = {
  marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
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
