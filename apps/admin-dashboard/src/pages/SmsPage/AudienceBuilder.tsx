import type { MenuCategory, SmsAudience, SmsAudienceCriteria } from '../../api';

/*
 * SMS audit, 2026-09-24: the owner asked for "advanced promotions based on
 * customer purchases". This is the audience builder behind a campaign:
 * what people bought (item, category, or what usually goes with an item),
 * how they ordered, what they spent, how long they have been away, and
 * when their birthday is. Every filter intersects. A saved audience can be
 * the base, with anything set here on top of it.
 */

export type PickOption = { id: number; name: string; group?: string };

export const TIERS = ['bronze', 'silver', 'gold', 'platinum'];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 };
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'var(--color-border-light)', fontSize: 12, marginRight: 6, marginTop: 6 };

/** Items from the admin categories payload, grouped by category name. */
export function itemOptions(categories: MenuCategory[]): PickOption[] {
  const out: PickOption[] = [];
  for (const c of categories) {
    for (const it of c.items ?? []) out.push({ id: it.id, name: it.name, group: c.name });
  }
  return out.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name));
}

export function categoryOptions(categories: MenuCategory[]): PickOption[] {
  return categories.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** True when nothing but the defaults is set. */
export function criteriaIsEmpty(c: SmsAudienceCriteria): boolean {
  return Object.entries(c).every(([k, v]) => k === 'window_days' || v == null || v === '' || (Array.isArray(v) && v.length === 0) || (k === 'opted_in' && v === true));
}

function IdPicker({ title, options, values, onChange, single, addLabel }: {
  title: string; options: PickOption[]; values: number[]; onChange: (next: number[]) => void; single?: boolean; addLabel: string;
}) {
  const nameOf = (id: number) => options.find((o) => o.id === id)?.name ?? `#${id}`;
  const remaining = options.filter((o) => !values.includes(o.id));
  const groups = Array.from(new Set(remaining.map((o) => o.group ?? '')));
  return (
    <div>
      <label style={label}>{title}</label>
      {(!single || values.length === 0) && (
        <select
          aria-label={title}
          value=""
          onChange={(e) => {
            const id = Number(e.target.value);
            if (!id) return;
            onChange(single ? [id] : [...values, id]);
          }}
          style={field}
        >
          <option value="">{addLabel}</option>
          {groups.map((g) => (
            g ? (
              <optgroup key={g} label={g}>
                {remaining.filter((o) => (o.group ?? '') === g).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </optgroup>
            ) : remaining.filter((o) => !o.group).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)
          ))}
        </select>
      )}
      <div>
        {values.map((id) => (
          <span key={id} style={chip} data-testid={`pick-${id}`}>
            {nameOf(id)}
            <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => onChange(values.filter((v) => v !== id))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function AudienceBuilder({ value, onChange, categories, segments, orderTypes, audiences }: {
  value: SmsAudienceCriteria;
  onChange: (next: SmsAudienceCriteria) => void;
  categories: MenuCategory[];
  segments: Array<{ slug: string; label: string }>;
  orderTypes: Record<string, string>;
  audiences: SmsAudience[];
}) {
  const items = itemOptions(categories);
  const cats = categoryOptions(categories);
  const set = (patch: Partial<SmsAudienceCriteria>) => {
    const next: SmsAudienceCriteria = { ...value, ...patch };
    for (const k of Object.keys(next) as Array<keyof SmsAudienceCriteria>) {
      const v = next[k];
      if (v == null || (v as unknown) === '' || (Array.isArray(v) && v.length === 0)) delete next[k];
    }
    onChange(next);
  };
  const num = (k: keyof SmsAudienceCriteria) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<SmsAudienceCriteria>);
  const toggleIn = (k: 'tier' | 'order_types', v: string) => {
    const cur = value[k] ?? [];
    set({ [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<SmsAudienceCriteria>);
  };
  const base = audiences.find((a) => a.id === value.audience_id);

  return (
    <div data-testid="audience-builder" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      {audiences.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Start from a saved audience</label>
          <select aria-label="Saved audience" value={value.audience_id ?? ''} onChange={(e) => set({ audience_id: e.target.value ? Number(e.target.value) : undefined })} style={field}>
            <option value="">None — build from scratch</option>
            {audiences.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.count})</option>)}
          </select>
          {base && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{base.summary}. Anything set below narrows it further; the campaign follows the audience if it is edited later.</p>}
        </div>
      )}

      <div>
        <label style={label}>Customer group</label>
        <select aria-label="Customer group" value={value.segment ?? ''} onChange={(e) => set({ segment: e.target.value || undefined })} style={field}>
          <option value="">Any customer</option>
          {segments.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
        </select>
      </div>

      <div>
        <label style={label}>Loyalty tier</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 6 }}>
          {TIERS.map((t) => (
            <label key={t} style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" aria-label={`Tier ${t}`} checked={(value.tier ?? []).includes(t)} onChange={() => toggleIn('tier', t)} />
              {t[0].toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
      </div>

      <IdPicker title="Bought any of these items" options={items} values={value.bought_item_ids ?? []} onChange={(v) => set({ bought_item_ids: v })} addLabel="Add an item…" />
      <IdPicker title="Bought from these categories" options={cats} values={value.bought_category_ids ?? []} onChange={(v) => set({ bought_category_ids: v })} addLabel="Add a category…" />
      <IdPicker title="Likes this item (bought it, or what goes with it)" options={items} values={value.likes_item_id ? [value.likes_item_id] : []} onChange={(v) => set({ likes_item_id: v[0] })} single addLabel="Pick an item…" />
      <IdPicker title="Never bought any of these" options={items} values={value.not_bought_item_ids ?? []} onChange={(v) => set({ not_bought_item_ids: v })} addLabel="Add an item…" />

      <div>
        <label style={label}>Ordered this way</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 6 }}>
          {Object.entries(orderTypes).map(([k, l]) => (
            <label key={k} style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" aria-label={`Order type ${l}`} checked={(value.order_types ?? []).includes(k)} onChange={() => toggleIn('order_types', k)} />
              {l}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label style={label}>Purchase window (days)</label>
        <input type="number" aria-label="Purchase window days" min={1} max={3650} value={value.window_days ?? 90} onChange={num('window_days')} style={field} />
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Applies to bought, likes and ordered-this-way. Spend and order counts are all time.</p>
      </div>

      <div>
        <label style={label}>Spent at least (MVR, all time)</label>
        <input type="number" aria-label="Minimum spend MVR" min={0} value={value.min_spend_mvr ?? ''} onChange={num('min_spend_mvr')} style={field} placeholder="e.g. 500" />
      </div>
      <div>
        <label style={label}>Paid orders at least</label>
        <input type="number" aria-label="Minimum paid orders" min={1} value={value.min_orders ?? ''} onChange={num('min_orders')} style={field} placeholder="e.g. 3" />
      </div>
      <div>
        <label style={label}>Ordered in the last N days</label>
        <input type="number" aria-label="Ordered in the last days" min={1} value={value.last_order_days ?? ''} onChange={num('last_order_days')} style={field} placeholder="e.g. 30" />
      </div>
      <div>
        <label style={label}>No order for N+ days (dormant)</label>
        <input type="number" aria-label="Dormant days" min={1} value={value.dormant_days ?? ''} onChange={num('dormant_days')} style={field} placeholder="e.g. 60" />
      </div>
      <div>
        <label style={label}>Birthday in</label>
        <select aria-label="Birthday month" value={value.birthday_month ?? ''} onChange={(e) => set({ birthday_month: e.target.value ? Number(e.target.value) : undefined })} style={field}>
          <option value="">Any month</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', gridColumn: '1 / -1' }}>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" aria-label="Loyalty members only" checked={!!value.has_loyalty} onChange={(e) => set({ has_loyalty: e.target.checked || undefined })} />
          Loyalty members only
        </label>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Opted-out numbers are always left out. Each number gets at most the daily marketing cap set in the Control Center.</span>
      </div>
    </div>
  );
}
