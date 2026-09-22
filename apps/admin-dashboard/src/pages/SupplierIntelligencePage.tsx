import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getSupplierPerformance, rateSupplier, getPriceComparison,
  fetchSuppliers, createSupplier, updateSupplier, deleteSupplier, fetchPayables,
  fetchLegacyPayables, settleLegacyPayables,
  type SupplierPerf, type Supplier, type PayableRow, type LegacyPayables,
} from '../api';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  Badge, Btn, Card, EmptyState, ErrorMsg, Modal, ModalActions, PageHeader, PageShell, Spinner, TableCard, TD, TH,
} from '../components/SharedUI';
import { SortFilterHead, SortFilterPanel, useSortFilter } from '../components/TableControls';
import { ItemSearch, type InventoryItemSelection } from '../components/ItemSearch';
import { usePageTitle } from '../hooks/usePageTitle';
import { useIsMobile } from '../hooks/useIsMobile';
import { RecordCard, RecordCardList } from '../components/RecordCard';

function Stars({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null) return <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Not rated</span>;
  return (
    <span style={{ fontSize: 13 }}>
      <span style={{ color: 'var(--color-warning)' }}>{'★'.repeat(Math.round(rating))}</span>
      <span style={{ color: 'var(--color-border)' }}>{'★'.repeat(max - Math.round(rating))}</span>
      <span style={{ color: 'var(--color-text-muted)', marginLeft: 6, fontSize: 12 }}>{parseFloat(String(rating ?? 0)).toFixed(1)}</span>
    </span>
  );
}

type ScoreField = 'quality_score' | 'delivery_score' | 'accuracy_score' | 'price_score';

export function SupplierIntelligencePage({ embedded = false }: { embedded?: boolean } = {}) {
  usePageTitle(embedded ? 'Purchasing · Suppliers' : 'Supplier Intelligence');
  const isMobile = useIsMobile();
  const { can } = useCurrentUserPermissions();
  // What is owed to whom (owner, 2026-09-21): the one question the list
  // could not answer.
  const canSeeOwed = can('suppliers.purchases') || can('reports.financial');
  const [payables, setPayables] = useState<{ suppliers: PayableRow[]; total_owed: number; orders: number } | null>(null);
  /*
   * Owner, 2026-09-21, looking at 103 unpaid orders: "still same". Payment
   * tracking started after every one of them, so none could ever have been
   * marked paid. The card now says so, and offers to clear them.
   */
  const canSettleLegacy = can('suppliers.purchases');
  const [legacy, setLegacy] = useState<LegacyPayables | null>(null);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleMsg, setSettleMsg] = useState('');
  const loadPayables = async () => {
    await Promise.all([
      fetchPayables().then(setPayables).catch(() => setPayables(null)),
      fetchLegacyPayables().then(setLegacy).catch(() => setLegacy(null)),
    ]);
  };
  useEffect(() => {
    if (!canSeeOwed) return;
    void loadPayables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeOwed]);

  const confirmSettleLegacy = async () => {
    setSettling(true);
    try {
      const res = await settleLegacyPayables();
      setSettleMsg(res.message);
      void loadPayables();
    } catch (e) {
      setSettleMsg(e instanceof Error ? e.message : 'Could not settle those orders.');
    } finally {
      setSettling(false);
    }
  };
  const [perfs, setPerfs]       = useState<SupplierPerf[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [rating, setRating]     = useState<{ supplierId: number; supplierName: string } | null>(null);
  const [rateForm, setRateForm] = useState({ quality_score: 3, delivery_score: 3, accuracy_score: 3, price_score: 3, notes: '' });
  const [saving, setSaving]     = useState(false);

  // Global price comparison (not per-supplier)
  const [showCompare, setShowCompare]   = useState(false);
  const [compareItem, setCompareItem]   = useState<InventoryItemSelection | null>(null);
  const [compareData, setCompareData]   = useState<{ inventory_item_id: number; prices: { supplier_id: number; supplier_name: string; unit_price: number; unit: string; recorded_at: string }[]; cheapest: { supplier_id: number; supplier_name: string; unit_price: number } | null } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);


  // Suppliers CRUD
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  // Owner, 2026-09-15: "In some places there is no sort and filter option.
  // For example suppliers in purchase."
  const supplierCtl = useSortFilter(suppliers, [
    { key: 'name', label: 'Name', get: (s) => s.name },
    { key: 'contact', label: 'Contact', get: (s) => s.contact_name },
    { key: 'phone', label: 'Phone', get: (s) => [s.phone, ...(s.extra_phones ?? [])].filter(Boolean).join(' ') },
    { key: 'email', label: 'Email', get: (s) => s.email },
    { key: 'bank', label: 'Bank account', get: (s) => [s.bank_account_number, s.bank_name, s.bank_account_name].filter(Boolean).join(' ') },
    { key: 'status', label: 'Status', kind: 'select', get: (s) => (s.is_active ? 'Active' : 'Inactive') },
    { key: 'actions', label: 'Actions' },
  ], 'suppliers');
  const [supplierFiltersOpen, setSupplierFiltersOpen] = useState(false);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierModal, setSupplierModal] = useState<Supplier | 'new' | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_name: '', phone: '', extra_phones: [] as string[], email: '',
    bank_name: '', bank_account_name: '', bank_account_number: '',
  });
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierFormError, setSupplierFormError] = useState('');

  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      const res = await fetchSuppliers({ active_only: false });
      setSuppliers(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setSuppliersLoading(false); }
  };

  const openSupplierModal = (sup?: Supplier) => {
    setSupplierModal(sup ?? 'new');
    setSupplierForm({
      name: sup?.name ?? '',
      contact_name: sup?.contact_name ?? '',
      phone: sup?.phone ?? '',
      extra_phones: sup?.extra_phones ?? [],
      email: sup?.email ?? '',
      bank_name: sup?.bank_name ?? '',
      bank_account_name: sup?.bank_account_name ?? '',
      bank_account_number: sup?.bank_account_number ?? '',
    });
    setSupplierFormError('');
  };

  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) { setSupplierFormError('Name is required.'); return; }
    setSupplierSaving(true); setSupplierFormError('');
    try {
      const payload = {
        name: supplierForm.name.trim(),
        contact_name: supplierForm.contact_name.trim() || undefined,
        phone: supplierForm.phone.trim() || undefined,
        // Sent even when empty so numbers can be taken away again; the
        // server drops blanks and repeats.
        extra_phones: supplierForm.extra_phones.map((n) => n.trim()).filter(Boolean),
        email: supplierForm.email.trim() || undefined,
        // Sent even when blank on an edit, so clearing an account that has
        // changed hands actually clears it rather than leaving the old one.
        bank_name: supplierForm.bank_name.trim(),
        bank_account_name: supplierForm.bank_account_name.trim(),
        bank_account_number: supplierForm.bank_account_number.trim(),
      };
      if (supplierModal && supplierModal !== 'new') {
        await updateSupplier(supplierModal.id, payload);
      } else {
        await createSupplier(payload);
      }
      setSupplierModal(null);
      void loadSuppliers();
      void load();
    } catch (e) { setSupplierFormError((e as Error).message); }
    finally { setSupplierSaving(false); }
  };

  const handleDeleteSupplier = async (id: number) => {
    if (!window.confirm('Delete this supplier? This cannot be undone.')) return;
    try {
      await deleteSupplier(id);
      void loadSuppliers();
      void load();
    } catch (e) { setError((e as Error).message); }
  };

  const load = async () => {
    setLoading(true); setError('');
    try { setPerfs((await getSupplierPerformance()).suppliers); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  /*
   * Owner, 2026-09-22: "Refresh doesn't work." It reloaded the performance
   * figures only — not the supplier list, and not the "Owed to suppliers"
   * card, which are the two things actually on the screen. Pressing it
   * after settling a supplier's orders left the old total sitting there,
   * so the button looked broken because for anything you could see, it was.
   */
  const refreshAll = async () => {
    await Promise.all([
      load(),
      loadSuppliers(),
      canSeeOwed ? loadPayables() : Promise.resolve(),
    ]);
  };

  useEffect(() => { void load(); void loadSuppliers(); }, []);

  // The supplier page's Edit button lands here with ?edit=ID.
  const [searchParams, setSearchParams] = useSearchParams();
  const editParam = searchParams.get('edit');
  useEffect(() => {
    if (!editParam || suppliers.length === 0) return;
    const sup = suppliers.find((x) => String(x.id) === editParam);
    if (sup) openSupplierModal(sup);
    const next = new URLSearchParams(searchParams);
    next.delete('edit');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, suppliers]);

  const openCompare = async (item: InventoryItemSelection | null) => {
    setCompareItem(item);
    setCompareData(null);
    if (!item) return;
    setCompareLoading(true);
    try {
      const res = await getPriceComparison(item.id);
      setCompareData(res);
    } catch (e) { setError((e as Error).message); }
    finally { setCompareLoading(false); }
  };

  const handleRate = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      await rateSupplier(rating.supplierId, rateForm);
      setRating(null);
      setRateForm({ quality_score: 3, delivery_score: 3, accuracy_score: 3, price_score: 3, notes: '' });
      void load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const ScoreInput = ({ label, field }: { label: string; field: ScoreField }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRateForm((f) => ({ ...f, [field]: n }))}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: `2px solid ${rateForm[field] === n ? 'var(--color-warning)' : 'var(--color-border)'}`,
              cursor: 'pointer', fontWeight: 700, fontSize: 14,
              background: rateForm[field] === n ? 'var(--color-warning)' : 'var(--color-surface)',
              color: rateForm[field] === n ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  const Shell = embedded ? Fragment : PageShell;
  const headerActions = (
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn variant="secondary" onClick={() => { setShowCompare(true); setCompareItem(null); setCompareData(null); }}>
        ⚖ Price Compare
      </Btn>
      <Btn onClick={() => void refreshAll()} variant="secondary" data-testid="suppliers-refresh">↻ Refresh</Btn>
    </div>
  );

  return (
    <Shell>
    <>
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{headerActions}</div>
      ) : (
        <PageHeader section="Manage"
          title="Supplier Intelligence"
          subtitle="Ratings, performance and price comparison"
          action={headerActions}
        />
      )}
      {error && <ErrorMsg message={error} />}

      {/* ── Owed to suppliers ── */}
      {canSeeOwed && payables && (
        <Card style={{ marginBottom: 20, borderColor: payables.total_owed > 0 ? 'var(--color-warning)' : undefined }} data-testid="payables-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: payables.suppliers.length ? 10 : 0 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', margin: 0 }}>Owed to suppliers</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {payables.total_owed > 0
                ? <><strong style={{ color: 'var(--color-text)' }}>MVR {payables.total_owed.toFixed(2)}</strong> across {payables.orders} order{payables.orders === 1 ? '' : 's'}</>
                : 'Nothing owed. Every placed order is paid.'}
            </p>
          </div>
          {canSettleLegacy && legacy && legacy.orders > 0 && (
            <div
              data-testid="legacy-payables-note"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 12px', padding: '8px 10px', borderRadius: 8, background: 'var(--color-bg)', fontSize: 12.5, color: 'var(--color-text-secondary)' }}
            >
              <span>
                <strong style={{ color: 'var(--color-text)' }}>{legacy.orders}</strong> of these
                {' '}(MVR {legacy.total.toFixed(2)}) were placed before payment tracking started on {legacy.before},
                so they could never be marked paid. They may not be money you still owe.
              </span>
              <Btn small variant="secondary" onClick={() => { setSettleMsg(''); setLegacyOpen(true); }} data-testid="legacy-payables-review">
                Review and settle
              </Btn>
            </div>
          )}
          {payables.suppliers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {payables.suppliers.map((r) => (
                <div key={`${r.supplier_id ?? 't'}-${r.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>
                    {r.supplier_id
                      ? <Link to={`/purchasing/suppliers/${r.supplier_id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>{r.name}</Link>
                      : <span style={{ fontWeight: 600 }}>{r.name}</span>}
                    <span style={{ color: 'var(--color-text-muted)' }}> · {r.orders} order{r.orders === 1 ? '' : 's'}{r.oldest_date ? `, oldest ${r.oldest_number} on ${r.oldest_date}` : ''}</span>
                  </span>
                  {/* marginLeft auto, not just space-between: on a phone the
                      row wraps and the amount lands on its own line, where
                      space-between puts it at the left margin under the name
                      (owner's screenshot, 2026-09-22). */}
                  <strong style={{ fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>MVR {r.owed.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {legacyOpen && legacy && (
        <Modal title="Settle orders from before payment tracking" onClose={() => setLegacyOpen(false)} maxWidth={560}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            Payment tracking started on {legacy.before}. Every order placed before then began at nothing paid,
            because there was no record of payments to read, so each one still shows as owing however long ago
            it was actually settled.
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
            Settling marks them paid on their own order date, noted as “{'Settled before payment tracking'}”, so
            anyone opening one later can see where the figure came from. Anything still genuinely owed can be put
            back by opening that order and undoing its payment.
          </p>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
            {legacy.suppliers.map((r) => (
              <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '3px 0' }}>
                <span>{r.name}<span style={{ color: 'var(--color-text-muted)' }}> · {r.orders} order{r.orders === 1 ? '' : 's'}</span></span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>MVR {r.owed.toFixed(2)}</strong>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 6px' }}>
            Total to settle: MVR {legacy.total.toFixed(2)} across {legacy.orders} order{legacy.orders === 1 ? '' : 's'}.
          </p>
          {settleMsg && <p data-testid="legacy-payables-result" style={{ fontSize: 13, color: 'var(--color-primary)', margin: '0 0 6px' }}>{settleMsg}</p>}
          <ModalActions>
            <Btn variant="secondary" onClick={() => setLegacyOpen(false)}>Cancel</Btn>
            <Btn onClick={() => void confirmSettleLegacy()} disabled={settling || legacy.orders === 0} data-testid="legacy-payables-confirm">
              {settling ? 'Settling…' : `Settle ${legacy.orders} order${legacy.orders === 1 ? '' : 's'}`}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {/* ── Suppliers directory ── */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', margin: 0 }}>Suppliers</p>
          <Btn small onClick={() => openSupplierModal()}>+ Add Supplier</Btn>
        </div>
        {suppliersLoading ? <Spinner /> : suppliers.length === 0 ? (
          <EmptyState message="No suppliers yet. Add one to use in purchase orders." />
        ) : isMobile ? (
          /* Layout audit L-01: seven columns, and the one somebody wants
             — the bank account, at the moment they are making a transfer —
             was the furthest right. */
          <>
          <SortFilterPanel controls={supplierCtl} allRows={suppliers} open={supplierFiltersOpen} onToggle={() => setSupplierFiltersOpen((v) => !v)} />
          <RecordCardList testId="supplier-cards">
            {supplierCtl.rows.map((s) => (
              <RecordCard
                key={s.id}
                testId={`supplier-card-${s.id}`}
                accent={s.is_active ? 'var(--color-border)' : 'var(--color-danger)'}
                title={<Link to={`/purchasing/suppliers/${s.id}`} data-testid={`supplier-link-${s.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>{s.name}</Link>}
                subtitle={[s.contact_name, s.phone, ...(s.extra_phones ?? [])].filter(Boolean).join(' · ')}
                badge={s.is_active ? undefined : <Badge color="red">Inactive</Badge>}
                fields={[
                  s.bank_account_number ? {
                    label: 'Bank account',
                    value: <>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.bank_account_number}</span>
                      {(s.bank_name || s.bank_account_name) && (
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {[s.bank_name, s.bank_account_name].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </>,
                  } : null,
                  s.email ? { label: 'Email', value: s.email } : null,
                ]}
                actions={<>
                  <Link to={`/purchasing/suppliers/${s.id}`} style={{ textDecoration: 'none' }}><Btn small variant="secondary">Open</Btn></Link>
                  <Btn small variant="secondary" onClick={() => openSupplierModal(s)}>Edit</Btn>
                  <Btn small variant="danger" onClick={() => void handleDeleteSupplier(s.id)}>Delete</Btn>
                </>}
              />
            ))}
          </RecordCardList>
          </>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <SortFilterHead controls={supplierCtl} allRows={suppliers} />
            <tbody>
              {supplierCtl.rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...TD, fontWeight: 600 }}>
                    <Link to={`/purchasing/suppliers/${s.id}`} data-testid={`supplier-link-${s.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>{s.name}</Link>
                  </td>
                  <td style={TD}>{s.contact_name ?? '—'}</td>
                  <td style={TD} data-testid={`supplier-phones-${s.id}`}>
                    {s.phone ?? '—'}
                    {(s.extra_phones ?? []).length > 0 && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {(s.extra_phones ?? []).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td style={TD}>{s.email ?? '—'}</td>
                  {/* Read at the moment somebody is making the transfer, so
                      the number is the line that stands out and the bank and
                      account name sit under it. */}
                  <td style={TD} data-testid={`supplier-bank-${s.id}`}>
                    {s.bank_account_number ? (
                      <>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.bank_account_number}</span>
                        {(s.bank_name || s.bank_account_name) && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-muted)' }}>
                            {[s.bank_name, s.bank_account_name].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={TD}>{s.is_active ? 'Active' : 'Inactive'}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="secondary" onClick={() => openSupplierModal(s)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => void handleDeleteSupplier(s.id)}>Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {loading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {perfs.length === 0 && (
            <Card><EmptyState message="No suppliers found. Add suppliers and create purchases to see performance data." /></Card>
          )}
          {perfs.map((sup) => (
            <Card key={sup.supplier_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>{sup.supplier_name}</div>
                  <div style={{ fontSize: 12, color: sup.is_active ? 'var(--color-success-strong)' : 'var(--color-text-muted)', marginTop: 3 }}>
                    {sup.is_active ? '● Active' : '○ Inactive'}
                  </div>
                </div>

                <div className="stat-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, minWidth: 0 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Purchases</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{sup.purchase_count}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Spend</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>MVR {parseFloat(String(sup.total_spend ?? 0)).toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Overall</div>
                    <Stars rating={sup.overall_rating} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Scores</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <span title="Quality">Q:{sup.avg_quality != null ? parseFloat(String(sup.avg_quality)).toFixed(1) : '—'}</span>
                      {' · '}
                      <span title="Delivery">D:{sup.avg_delivery != null ? parseFloat(String(sup.avg_delivery)).toFixed(1) : '—'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                  <Btn
                    variant="secondary"
                    onClick={() => setRating({ supplierId: sup.supplier_id, supplierName: sup.supplier_name })}
                  >
                    Rate Supplier
                  </Btn>
                  <Link to={`/purchasing/suppliers/${sup.supplier_id}`} style={{ textDecoration: 'none' }}>
                    <Btn variant="secondary" style={{ width: '100%' }}>Open supplier</Btn>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Price Comparison Modal */}
      {showCompare && (
        <Modal title="Price Comparison by Item" onClose={() => { setShowCompare(false); setCompareItem(null); setCompareData(null); }} maxWidth={580}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
            Search an inventory item to compare prices across all suppliers.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>Inventory Item</label>
            <ItemSearch
              kind="inventory"
              value={compareItem}
              onChange={(v) => void openCompare(v)}
              placeholder="Search inventory by name or SKU…"
            />
          </div>

          {compareLoading ? <Spinner /> : compareData ? (
            <>
              {compareData.cheapest && (
                <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
                  ✓ Cheapest: {compareData.cheapest.supplier_name} — MVR {parseFloat(String(compareData.cheapest.unit_price ?? 0)).toFixed(2)}
                </div>
              )}
              {(compareData.prices ?? []).length === 0 ? (
                <EmptyState message="No price history found for this item from any supplier." />
              ) : (
                <TableCard>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Supplier', 'Unit Price (MVR)', 'Unit', 'Last Recorded'].map((h) => (
                          <th key={h} style={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...(compareData.prices ?? [])]
                        .sort((a, b) => a.unit_price - b.unit_price)
                        .map((p, i) => (
                          <tr key={p.supplier_id} style={{ background: i === 0 ? '#F0FDF4' : undefined }}>
                            <td style={{ ...TD, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--color-success-strong)' : 'var(--color-text)' }}>
                              {i === 0 && '🏆 '}{p.supplier_name}
                            </td>
                            <td style={{ ...TD, fontWeight: 700, color: i === 0 ? 'var(--color-success-strong)' : 'var(--color-primary)' }}>
                              {parseFloat(String(p.unit_price ?? 0)).toFixed(2)}
                            </td>
                            <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>{p.unit}</td>
                            <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>
                              {new Date(p.recorded_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </TableCard>
              )}
            </>
          ) : !compareItem ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Search and select an item above to see price comparison.</p>
          ) : null}

          <ModalActions>
            <Btn variant="secondary" onClick={() => { setShowCompare(false); setCompareItem(null); setCompareData(null); }}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Rate Supplier Modal */}
      {rating && (
        <Modal title={`Rate — ${rating.supplierName}`} onClose={() => setRating(null)}>
          <ScoreInput label="Quality (product quality received)" field="quality_score" />
          <ScoreInput label="Delivery (on-time, packaging)"      field="delivery_score" />
          <ScoreInput label="Accuracy (correct items, quantities)" field="accuracy_score" />
          <ScoreInput label="Price (value for money)"            field="price_score" />
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginTop: 4 }}>
            Notes (optional)
            <textarea
              value={rateForm.notes}
              onChange={(e) => setRateForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ display: 'block', width: '100%', marginTop: 6, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </label>
          <ModalActions>
            <Btn variant="ghost" onClick={() => setRating(null)}>Cancel</Btn>
            <Btn onClick={handleRate} disabled={saving}>{saving ? 'Saving…' : 'Submit Rating'}</Btn>
          </ModalActions>
        </Modal>
      )}

      {/* Supplier create/edit modal */}
      {supplierModal && (
        <Modal title={supplierModal === 'new' ? 'Add Supplier' : 'Edit Supplier'} onClose={() => setSupplierModal(null)}>
          {supplierFormError && <ErrorMsg message={supplierFormError} />}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Name *</label>
          <input value={supplierForm.name} onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Contact name</label>
          <input value={supplierForm.contact_name} onChange={(e) => setSupplierForm((f) => ({ ...f, contact_name: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <label htmlFor="supplier-phone" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Phone</label>
          <input id="supplier-phone" value={supplierForm.phone} onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />

          {/* Owner, 2026-09-08: "add option to add more than one contact
              number." A shop is a mobile, a landline and whoever is on the
              counter. The first stays the one an invoice is sent to. */}
          {supplierForm.extra_phones.map((num, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                aria-label={`Another number ${i + 1}`}
                value={num}
                inputMode="tel"
                placeholder="Another number"
                onChange={(e) => setSupplierForm((f) => ({
                  ...f,
                  extra_phones: f.extra_phones.map((n, j) => (j === i ? e.target.value : n)),
                }))}
                style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
              <Btn
                small
                variant="ghost"
                aria-label={`Remove number ${i + 1}`}
                onClick={() => setSupplierForm((f) => ({ ...f, extra_phones: f.extra_phones.filter((_, j) => j !== i) }))}
              >
                Remove
              </Btn>
            </div>
          ))}
          <div style={{ marginBottom: 12 }}>
            <Btn
              small
              variant="secondary"
              disabled={supplierForm.extra_phones.length >= 10}
              onClick={() => setSupplierForm((f) => ({ ...f, extra_phones: [...f.extra_phones, ''] }))}
            >
              ＋ Add another number
            </Btn>
          </div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Email</label>
          <input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }} />

          {/* Owner, 2026-09-08: "add supplier acc number option". The number
              on its own does not pay anybody — two banks issue them, and the
              account is often in the shopkeeper's name, not the shop's — so
              all three sit together and all three are optional. */}
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>Bank transfer details</p>
          <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--color-text-muted)' }}>
            Optional — for suppliers you pay by transfer rather than cash.
          </p>
          <label htmlFor="supplier-bank-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Bank</label>
          <input
            id="supplier-bank-name"
            value={supplierForm.bank_name}
            placeholder="BML, MIB…"
            onChange={(e) => setSupplierForm((f) => ({ ...f, bank_name: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <label htmlFor="supplier-bank-account-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Account name</label>
          <input
            id="supplier-bank-account-name"
            value={supplierForm.bank_account_name}
            placeholder="Whose name the account is in"
            onChange={(e) => setSupplierForm((f) => ({ ...f, bank_account_name: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 12, boxSizing: 'border-box' }} />
          <label htmlFor="supplier-bank-account-number" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Account number</label>
          <input
            id="supplier-bank-account-number"
            value={supplierForm.bank_account_number}
            inputMode="numeric"
            autoComplete="off"
            placeholder="7730000123456"
            onChange={(e) => setSupplierForm((f) => ({ ...f, bank_account_number: e.target.value }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
          <ModalActions>
            <Btn variant="ghost" onClick={() => setSupplierModal(null)}>Cancel</Btn>
            <Btn onClick={() => void handleSaveSupplier()} disabled={supplierSaving}>{supplierSaving ? 'Saving…' : 'Save'}</Btn>
          </ModalActions>
        </Modal>
      )}
    </>

    </Shell>
  );
}
