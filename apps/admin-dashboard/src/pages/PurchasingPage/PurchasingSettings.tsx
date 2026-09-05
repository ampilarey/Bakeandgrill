import { useEffect, useState, type ReactNode } from 'react';
import { Toggle } from '../../components/ui';
import {
  getPurchasingSettings,
  updatePurchasingSettings,
  type PurchasingSettings as Settings,
  type PurchasingSettingsPatch,
} from '../../api';

/*
 * Purchasing → Settings: every switch that governs buying, in the order the
 * work happens. A request is raised, somebody approves it, somebody buys it,
 * the box arrives, the money is booked, and the shelf is topped up again.
 * Thirteen switches, one screen, each one saved the moment it is changed.
 *
 * The wording is deliberately the owner's, not the database's. "Auto-create
 * restock PR on low stock" became "Ask for more automatically when stock runs
 * low", because the person reading this runs a bakery, not a ticket queue.
 */

const S = {
  section: { marginBottom: 28 } as const,
  h: { margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--color-text)' } as const,
  lead: { margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 } as const,
  row: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
    padding: '12px 14px', border: '1px solid var(--color-border)', borderRadius: 12,
    background: 'var(--color-surface)', marginBottom: 8, flexWrap: 'wrap' as const,
  },
  label: { fontSize: 13, fontWeight: 700, color: 'var(--color-text)' } as const,
  help: { fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.45, maxWidth: 560 } as const,
  input: {
    width: 120, minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)',
  } as const,
  select: {
    minWidth: 200, minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
    border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)',
  } as const,
};

function Row({ label, help, control }: { label: string; help: string; control: ReactNode }) {
  return (
    <div style={S.row}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={S.label}>{label}</div>
        <div style={S.help}>{help}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section style={S.section}>
      <h3 style={S.h}>{title}</h3>
      <p style={S.lead}>{lead}</p>
      {children}
    </section>
  );
}

/** A number field that saves on blur and shows the unit next to it. */
function NumberField({
  value, unit, min, max, step, disabled, onCommit, ariaLabel,
}: {
  value: number; unit: string; min: number; max: number; step: number; disabled: boolean;
  onCommit: (n: number) => void; ariaLabel: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < min || n > max) { setDraft(String(value)); return; }
    if (n !== value) onCommit(n);
  };

  return (
    <>
      <input
        type="number"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={S.input}
      />
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{unit}</span>
    </>
  );
}

export function PurchasingSettings({ canEdit }: { canEdit: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPurchasingSettings()
      .then((res) => { if (!cancelled) setS(res.settings); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });

    return () => { cancelled = true; };
  }, []);

  const save = async (patch: PurchasingSettingsPatch) => {
    if (!s) return;
    const before = s;
    // Optimistic: a switch should feel like a switch. The server's answer
    // replaces it; a failure puts it back and says why.
    setS({ ...s, ...patch });
    setSaving(true);
    setError('');
    try {
      const res = await updatePurchasingSettings(patch);
      setS(res.settings);
      setSavedAt(Date.now());
    } catch (e) {
      setS(before);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error && !s) return <p style={{ color: 'var(--color-danger)' }}>{error}</p>;
  if (!s) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>;

  const off = !canEdit || saving;
  const toggle = (key: keyof PurchasingSettingsPatch) => (
    <Toggle
      checked={Boolean(s[key])}
      disabled={off}
      onChange={(checked) => void save({ [key]: checked } as PurchasingSettingsPatch)}
      label={s[key] ? 'On' : 'Off'}
    />
  );

  return (
    <div data-testid="purchasing-settings">
      {!canEdit && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          You can see these but not change them — that needs the settings permission.
        </p>
      )}
      {error && <p style={{ color: 'var(--color-danger)', marginBottom: 12 }}>{error}</p>}
      {savedAt !== null && !error && (
        <p role="status" style={{ fontSize: 12, color: 'var(--color-success-strong)', marginBottom: 12 }}>Saved.</p>
      )}

      <Section
        title="1 · Requesting"
        lead="How items get asked for. Staff pick from the inventory list on the POS and KDS; the switches below add requests the system raises on its own."
      >
        <Row
          label="Ask for more automatically when stock runs low"
          help="When an item drops under its reorder point, a purchase request is created for it without anyone typing. It still needs approving. Leave off if you would rather staff raise every request themselves."
          control={toggle('auto_request_on_low_stock')}
        />
        <Row
          label="Recurring shopping lists"
          help="Turns on the daily scheduler that raises a request for each recurring list when it falls due (Purchasing → Shopping lists). Off means the lists exist but nothing is raised from them."
          control={toggle('recurring_lists_enabled')}
        />
      </Section>

      <Section
        title="2 · Approving"
        lead="Every request waits for a manager unless it is small enough to wave through."
      >
        <Row
          label="Approve automatically under"
          help="A request whose estimated total is at or under this amount is approved the moment it is raised. 0 means every request waits for a person. The estimate uses last-paid prices, so an item nobody has bought before never auto-approves."
          control={(
            <NumberField
              ariaLabel="Auto-approve under (MVR)"
              value={s.auto_approve_under_mvr}
              unit="MVR"
              min={0}
              max={1000000}
              step={1}
              disabled={off}
              onCommit={(n) => void save({ auto_approve_under_mvr: n })}
            />
          )}
        />
      </Section>

      <Section
        title="3 · Buying"
        lead="What the person doing the shopping sees, and how far back a purchase may be dated."
      >
        <Row
          label="Show price hints to buyers"
          help="On the buying screen, each line shows what was last paid and the cheapest shop on record. Off hides prices from whoever is buying."
          control={toggle('show_price_hints')}
        />
        <Row
          label="Purchases may be backdated up to"
          help="How many days in the past a purchase may be entered under. Backdating files the stock and the cost under the day it actually arrived. 0 allows today only. Forward-dating is never allowed."
          control={(
            <NumberField
              ariaLabel="Backdate window (days)"
              value={s.backdate_max_days}
              unit="days"
              min={0}
              max={3650}
              step={1}
              disabled={off}
              onCommit={(n) => void save({ backdate_max_days: n })}
            />
          )}
        />
      </Section>

      <Section
        title="4 · Receiving and counting"
        lead="Accepting a delivery is what puts stock on the shelf. Counting is how you check the shelf against the books."
      >
        <Row
          label="A stock difference must give a reason above"
          help="A stock-count line or manual correction worth this much or more has to say why before it can be posted. 0 asks every time. This is the same threshold the POS stock count uses."
          control={(
            <NumberField
              ariaLabel="Stock variance reason threshold (MVR)"
              value={s.stock_variance_reason_mvr}
              unit="MVR"
              min={0}
              max={1000000}
              step={1}
              disabled={off}
              onCommit={(n) => void save({ stock_variance_reason_mvr: n })}
            />
          )}
        />
      </Section>

      <Section
        title="5 · Costing"
        lead="How a purchase turns into an expense in your books. Everything here creates a pending expense only — nothing posts to GST or the ledger by itself."
      >
        <Row
          label="Book an expense when a request is verified"
          help="When a bought request is verified as received, an expense is created for what it cost, in the category chosen below. Off means somebody books it by hand from the request."
          control={toggle('auto_expense_on_verify')}
        />
        <Row
          label="Expense category for verified requests"
          help="Where those expenses land. Leave empty to use the first category."
          control={(
            <select
              aria-label="Default expense category"
              value={s.default_expense_category_id ?? ''}
              disabled={off}
              onChange={(e) => void save({ default_expense_category_id: e.target.value ? Number(e.target.value) : null })}
              style={S.select}
            >
              <option value="">First category</option>
              {s.expense_categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        />
        <Row
          label="Book an expense for non-stock lines on a purchase order"
          help="A purchase-order line with no inventory item — a repair, a gas refill — becomes a pending expense when the order is received. Stock lines never do: they become inventory value."
          control={toggle('auto_expense_non_stock_purchases')}
        />
        <Row
          label="Enforce monthly category budgets"
          help="When a category has a monthly budget (Expenses → categories), going over it is a warning. Turn this on and an expense that would break the budget is refused instead."
          control={toggle('enforce_expense_budgets')}
        />
      </Section>

      <Section
        title="6 · Restocking"
        lead="How the restock plan (Analyze → Forecasts) decides what to suggest, and who hears about it."
      >
        <Row
          label="Count waste as usage"
          help="Restock suggestions are based on what you sell per day. On, they also include what you throw away — so an item you keep binning is reordered at the rate you actually go through it."
          control={toggle('restock_include_waste')}
        />
        <Row
          label="Flag high waste at"
          help="Restock rows whose waste is at or above this share of usage are flagged, so you can see what is being over-ordered."
          control={(
            <NumberField
              ariaLabel="High-waste threshold (%)"
              value={s.restock_high_waste_pct}
              unit="%"
              min={0}
              max={100}
              step={0.5}
              disabled={off}
              onCommit={(n) => void save({ restock_high_waste_pct: n })}
            />
          )}
        />
        <Row
          label="Text the owner when an item hits its reorder point"
          help="An SMS to every owner phone on file when stock drops under a reorder point. Independent of the automatic request above — you can have the message without the request, or both."
          control={toggle('reorder_alert_sms')}
        />
      </Section>
    </div>
  );
}
