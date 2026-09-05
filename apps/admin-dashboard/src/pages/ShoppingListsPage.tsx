import { Fragment, useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { PageHeader, PageShell, TableCard, TH, TD, Btn, Modal, ModalActions, TableSkeleton } from '../components/SharedUI';
import { useToast } from '../components/ui';
import {
  createRecurringShoppingList,
  deleteRecurringShoppingList,
  fetchRecurringShoppingLists,
  type RecurringShoppingList,
} from '../api/procurement';

export default function ShoppingListsPage({ embedded = false }: { embedded?: boolean } = {}) {
  usePageTitle(embedded ? 'Purchasing · Shopping lists' : 'Shopping Lists');
  const { can } = useCurrentUserPermissions();
  const toast = useToast();
  const [lists, setLists] = useState<RecurringShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [itemName, setItemName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchRecurringShoppingLists();
      setLists(res.lists ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!can('purchase_requests.create')) {
    return <div style={{ padding: 24 }}>You need purchase request create permission to manage shopping lists.</div>;
  }

  const Shell = embedded ? Fragment : PageShell;

  return (
    <Shell>
    <div>
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Btn onClick={() => setShowCreate(true)}>New list</Btn>
        </div>
      ) : (
        <PageHeader section="Manage"
          title="Recurring shopping lists"
          action={<Btn onClick={() => setShowCreate(true)}>New list</Btn>}
        />
      )}
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: -8, marginBottom: 16 }}>
        Turn on “Recurring shopping lists” under Purchasing → Settings, then the daily scheduler raises a request when a list is due.
      </p>
      <TableCard stickyHead>
        {loading ? <TableSkeleton rows={4} cols={5} /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Interval', 'Next run', 'Items', ''].map((h) => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lists.map((list) => (
                <tr key={list.id}>
                  <td style={TD}>{list.name}{!list.is_active ? ' (inactive)' : ''}</td>
                  <td style={TD}>{list.recurrence_interval}</td>
                  <td style={TD}>{list.next_run_date ?? '—'}</td>
                  <td style={TD}>{list.items.length}</td>
                  <td style={TD}>
                    <Btn
                      variant="danger"
                      onClick={() => void (async () => {
                        await deleteRecurringShoppingList(list.id);
                        toast.success('Deleted.');
                        await load();
                      })()}
                    >
                      Delete
                    </Btn>
                  </td>
                </tr>
              ))}
              {lists.length === 0 && (
                <tr><td style={TD} colSpan={5}>No lists yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </TableCard>

      {showCreate && (
        <Modal title="New shopping list" onClose={() => setShowCreate(false)} maxWidth={420}>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>List name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box', minHeight: 44 }} />
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>First item</label>
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Cooking oil" style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid var(--color-border)', boxSizing: 'border-box', minHeight: 44 }} />
          <div data-responsive-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="0.001" step="any" style={{ padding: 8, borderRadius: 8, border: '1px solid var(--color-border)', minHeight: 44 }} />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--color-border)', minHeight: 44 }} />
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
            <Btn
              disabled={busy || !name.trim() || !itemName.trim()}
              onClick={() => void (async () => {
                setBusy(true);
                try {
                  await createRecurringShoppingList({
                    name: name.trim(),
                    recurrence_interval: 'weekly',
                    next_run_date: new Date().toISOString().slice(0, 10),
                    items: [{ free_text_name: itemName.trim(), inventory_item_id: null, qty: Number(qty) || 1, unit: unit || 'pcs', estimated_unit_cost_laar: null }],
                  });
                  toast.success('List created.');
                  setShowCreate(false);
                  setName('');
                  setItemName('');
                  await load();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              })}
            >
              Create
            </Btn>
          </ModalActions>
        </Modal>
      )}
    </div>

    </Shell>
  );
}
