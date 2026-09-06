/**
 * Add-ons: "extra cheese", "no onions" — and what each one uses.
 *
 * Menu-item stock audit, 2026-09-07 (finding 11). Add-ons were seeded rows
 * with a name and a price that nothing managed and that never touched stock.
 * Each one can now point at an ingredient and say how much of it one add-on
 * uses; orders draw it the way a recipe line is drawn. Which items offer an
 * add-on is set on the item itself (Menu Items → edit → Add-ons).
 */
import { useEffect, useState } from 'react';
import {
  createModifier, deleteModifier, fetchInventoryItems, fetchModifiers, updateModifier,
  type InventoryItem, type Modifier, type ModifierPayload,
} from '../api';
import {
  Badge, Btn, ErrorMsg, Input, Modal, ModalActions, PageHeader, PageShell, TableCard, TableSkeleton, TD, TH,
  useConfirmDialog, ConfirmDialog,
} from '../components/SharedUI';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';

type Form = {
  name: string;
  name_dv: string;
  price: string;
  is_active: boolean;
  inventory_item_id: string;
  ingredient_quantity: string;
  ingredient_unit: string;
};

const empty: Form = { name: '', name_dv: '', price: '0', is_active: true, inventory_item_id: '', ingredient_quantity: '', ingredient_unit: '' };

function formFrom(m: Modifier): Form {
  return {
    name: m.name,
    name_dv: m.name_dv ?? '',
    price: String(m.price ?? 0),
    is_active: m.is_active,
    inventory_item_id: m.inventory_item_id != null ? String(m.inventory_item_id) : '',
    ingredient_quantity: m.ingredient_quantity != null ? String(m.ingredient_quantity) : '',
    ingredient_unit: m.ingredient_unit ?? '',
  };
}

function usesLabel(m: Modifier): string {
  if (!m.inventory_item_id || !m.ingredient_quantity) return '—';
  return `${m.ingredient_quantity} ${m.ingredient_unit || m.inventory_item?.unit || ''} ${m.inventory_item?.name ?? ''}`.trim();
}

export function ModifiersPage() {
  usePageTitle('Add-ons');
  const { can } = useCurrentUserPermissions();
  const canManage = can('menu.manage');
  const isMobile = useIsMobile();
  const confirm = useConfirmDialog();

  const [rows, setRows] = useState<Modifier[]>([]);
  const [ingredients, setIngredients] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<Modifier | 'new' | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchModifiers();
      setRows(res.modifiers ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  // The whole store, for the ingredient picker — same page walk the stock list uses.
  useEffect(() => {
    let alive = true;
    (async () => {
      const all: InventoryItem[] = [];
      let page = 1; let last = 1;
      try {
        do {
          const res = await fetchInventoryItems({ page, per_page: 200 });
          all.push(...(res.data ?? []));
          last = res.meta?.last_page ?? 1;
          page++;
        } while (page <= last);
        if (alive) setIngredients(all);
      } catch { /* the picker simply stays empty */ }
    })();
    return () => { alive = false; };
  }, []);

  const open = (m: Modifier | 'new') => {
    setEditing(m);
    setForm(m === 'new' ? empty : formFrom(m));
    setFormError('');
  };

  const save = async () => {
    if (!form.name.trim()) { setFormError('Give the add-on a name.'); return; }
    const qty = parseFloat(form.ingredient_quantity);
    if (form.inventory_item_id && !(qty > 0)) { setFormError('Say how much of the ingredient one add-on uses.'); return; }
    setSaving(true); setFormError('');
    const payload: ModifierPayload = {
      name: form.name.trim(),
      name_dv: form.name_dv.trim() || null,
      price: Math.max(0, parseFloat(form.price) || 0),
      is_active: form.is_active,
      inventory_item_id: form.inventory_item_id ? Number(form.inventory_item_id) : null,
      ingredient_quantity: form.inventory_item_id ? qty : null,
      ingredient_unit: form.inventory_item_id ? (form.ingredient_unit.trim() || null) : null,
    };
    try {
      if (editing === 'new') await createModifier(payload);
      else if (editing) await updateModifier(editing.id, payload);
      setEditing(null);
      await load();
    } catch (e) { setFormError((e as Error).message); }
    finally { setSaving(false); }
  };

  const remove = (m: Modifier) => {
    confirm.ask({
      title: `Remove "${m.name}"?`,
      message: 'If it has ever been on an order it is switched off instead, so old tickets still read correctly.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => {
        void (async () => {
          try { await deleteModifier(m.id); await load(); }
          catch (e) { setError((e as Error).message); }
        })();
      },
    });
  };

  const selectedIngredient = ingredients.find((i) => String(i.id) === form.inventory_item_id) ?? null;

  return (
    <PageShell>
      <PageHeader
        title="Add-ons"
        subtitle="Extras a customer can add to a dish, and the ingredient each one uses"
        action={canManage ? <Btn onClick={() => open('new')}>+ New add-on</Btn> : undefined}
      />
      {error && <ErrorMsg message={error} />}

      {loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No add-ons yet. Create one, then tick it on the items that offer it.</p>
      ) : isMobile ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((m) => (
            <article key={m.id} data-testid={`modifier-card-${m.id}`} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px', background: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</div>
                {!m.is_active && <Badge color="gray">Off</Badge>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {m.price > 0 ? `+MVR ${m.price.toFixed(2)}` : 'Free'} · uses {usesLabel(m)}
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <Btn small variant="secondary" onClick={() => open(m)}>Edit</Btn>
                  <Btn small variant="danger" onClick={() => remove(m)}>Remove</Btn>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Name', 'Price', 'Uses', 'Status', 'Actions'].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} data-testid={`modifier-row-${m.id}`}>
                  <td style={{ ...TD, fontWeight: 600 }}>{m.name}{m.name_dv ? <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> · {m.name_dv}</span> : null}</td>
                  <td style={TD}>{m.price > 0 ? `MVR ${m.price.toFixed(2)}` : 'Free'}</td>
                  <td style={TD}>{usesLabel(m)}</td>
                  <td style={TD}>{m.is_active ? <Badge color="green">On</Badge> : <Badge color="gray">Off</Badge>}</td>
                  <td style={TD}>
                    {canManage && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn small variant="secondary" onClick={() => open(m)}>Edit</Btn>
                        <Btn small variant="danger" onClick={() => remove(m)}>Remove</Btn>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing !== null && (
        <Modal title={editing === 'new' ? 'New add-on' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          {formError && <ErrorMsg message={formError} />}
          <div style={{ display: 'grid', gap: 12 }}>
            <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Extra cheese" />
            <Input label="Name (Dhivehi)" value={form.name_dv} onChange={(v) => setForm({ ...form, name_dv: v })} />
            <Input label="Price (MVR, 0 = free)" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Offered right now
            </label>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>What one add-on uses</p>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Ingredient (optional)</label>
              <select
                aria-label="Ingredient"
                data-testid="modifier-ingredient"
                value={form.inventory_item_id}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm({
                    ...form,
                    inventory_item_id: v,
                    ingredient_unit: form.ingredient_unit || (ingredients.find((i) => String(i.id) === v)?.unit ?? ''),
                  });
                }}
                style={{ width: '100%', minHeight: 44, borderRadius: 10, border: '1.5px solid var(--color-border)', padding: '0 0.75rem', background: 'var(--color-surface)', color: 'var(--color-text)' }}
              >
                <option value="">— none — this add-on uses nothing from stock</option>
                {ingredients.map((i) => <option key={i.id} value={String(i.id)}>{i.name}{i.unit ? ` (${i.unit})` : ''}</option>)}
              </select>
              {form.inventory_item_id && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <Input label="Amount per add-on" type="number" value={form.ingredient_quantity} onChange={(v) => setForm({ ...form, ingredient_quantity: v })} placeholder="e.g. 20" />
                  <Input label={`Unit${selectedIngredient?.unit ? ` (stock is in ${selectedIngredient.unit})` : ''}`} value={form.ingredient_unit} onChange={(v) => setForm({ ...form, ingredient_unit: v })} placeholder={selectedIngredient?.unit ?? 'g'} />
                </div>
              )}
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
      <ConfirmDialog state={confirm.state} close={confirm.close} />
    </PageShell>
  );
}
