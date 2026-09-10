import { useCallback, useEffect, useState } from 'react';
import { fetchMenuGroups, setMenuGroupKitchenRouting, type MenuGroupRow } from '../api';
import { Btn, Card, EmptyState, ErrorMsg, PageHeader, Spinner } from '../components/SharedUI';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

/**
 * Which menu groups the kitchen actually makes.
 *
 * Owner, 2026-09-09, on a kitchen board showing 77 tickets: "the items that
 * are shown in this is already prepared items, sold and paid via pos", then
 * "this page should show only the items that are active orders".
 *
 * One default caused it. An order is fired to the kitchen unless the caller
 * says otherwise, and the POS never does — so a customer pointing at a bun,
 * paying and walking out printed a chit and left a ticket nobody would ever
 * bump. Turning a group off here stops both, for that group.
 */
export function KitchenRoutingTab() {
  // Its own permission rather than the hub's: this is a menu decision, and
  // the hub's `canManage` is about kitchen production.
  const { can } = useCurrentUserPermissions();
  const canManage = can('menu.manage');
  const [groups, setGroups] = useState<MenuGroupRow[] | null>(null);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchMenuGroups();
      setGroups(res.data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the menu groups.');
      setGroups([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (group: MenuGroupRow) => {
    const next = !(group.goes_to_kitchen ?? true);
    setSavingId(group.id);
    // Moved straight away; the list is re-read after, so a failed save snaps
    // back rather than leaving a switch that lies.
    setGroups((gs) => (gs ?? []).map((g) => (g.id === group.id ? { ...g, goes_to_kitchen: next } : g)));
    try {
      await setMenuGroupKitchenRouting(group.id, next);
      await load();
    } catch (e) {
      // Re-read first so the switch shows what is actually stored, then say
      // why — the other order clears the message as soon as it is set.
      await load();
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setSavingId(null);
    }
  };

  const off = (groups ?? []).filter((g) => g.goes_to_kitchen === false).length;

  return (
    <>
      <PageHeader
        title="What the kitchen makes"
        subtitle="Groups the kitchen cooks to order. The rest are sold off the counter."
      />

      <Card>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px', lineHeight: 1.6 }}>
          A group that goes to the kitchen prints a chit when it is ordered and appears on the
          kitchen board until somebody bumps it. Turn a group off when it is sold ready-made off
          the counter — no chit, and nothing to bump later.
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          An order with a mix still goes to the kitchen, for the part that is cooked. Everything
          starts switched on, which is how it behaved before this screen existed.
        </p>

        {error && <ErrorMsg message={error} />}

        {groups === null ? <Spinner /> : groups.length === 0 ? (
          <EmptyState message="No menu groups yet." />
        ) : (
          <div style={{ display: 'grid', gap: 8 }} data-testid="kitchen-routing-list">
            {groups.map((g) => {
              const on = g.goes_to_kitchen ?? true;
              return (
                <div
                  key={g.id}
                  data-testid={`kitchen-routing-${g.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, flexWrap: 'wrap',
                    border: '1px solid var(--color-border)',
                    borderLeft: `4px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 10, padding: '10px 14px', background: 'var(--color-surface)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {on ? 'Cooked to order — prints a chit, shows on the kitchen board' : 'Sold off the counter — no chit, never reaches the board'}
                    </div>
                  </div>
                  {canManage && (
                    <Btn
                      small
                      variant={on ? 'secondary' : 'primary'}
                      disabled={savingId === g.id}
                      aria-label={`${on ? 'Stop sending' : 'Send'} ${g.name} to the kitchen`}
                      onClick={() => void toggle(g)}
                    >
                      {savingId === g.id ? 'Saving…' : on ? 'Sold off the counter' : 'Send to the kitchen'}
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {off > 0 && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '14px 0 0' }}>
            {off} {off === 1 ? 'group is' : 'groups are'} off the kitchen board. Tickets already on
            the board for those groups disappear from it as soon as this is saved.
          </p>
        )}
      </Card>
    </>
  );
}

export default KitchenRoutingTab;
