import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import {
  PageHeader, TableCard, TH, TD, Badge, Btn, Modal, ModalActions, Pagination,
  TableSkeleton, TableStateBar, ConfirmDialog, useConfirmDialog,
} from '../components/SharedUI';
import { useToast } from '../components/ui';
import { fetchStaff } from '../api';
import { getExpenseCategories, type ExpenseCategory } from '../api/finance';
import {
  approvePurchaseRequest,
  assignPurchaseRequest,
  cancelPurchaseRequest,
  convertPurchaseRequestToExpense,
  convertPurchaseRequestToPurchase,
  createPurchaseRequest,
  fetchPurchaseRequests,
  getPurchaseRequest,
  getPurchaseRequestAutoExpenseSettings,
  laarToMvr,
  mergePurchaseRequests,
  promotePurchaseRequestItemToInventory,
  rejectPurchaseRequest,
  fetchPurchaseRequestReconciliation,
  updatePurchaseRequest,
  updatePurchaseRequestAutoExpenseSettings,
  verifyAllPurchaseRequestItems,
  verifyPurchaseRequestItem,
  type PurchaseRequest,
  type PurchaseRequestItem,
} from '../api/procurement';
import { Toggle } from '../components/ui';

const TABS = [
  { id: 'pending', label: 'Pending', statuses: 'requested' },
  { id: 'approved', label: 'Approved', statuses: 'approved' },
  { id: 'buying', label: 'Assigned / Buying', statuses: 'assigned,buying,partially_bought' },
  { id: 'verify', label: 'Bought — verify', statuses: 'bought_pending_verification' },
  { id: 'done', label: 'Received / Closed', statuses: 'received,closed' },
  { id: 'closed', label: 'Rejected / Cancelled', statuses: 'rejected,cancelled' },
] as const;

const STATUS_COLOR: Record<string, string> = {
  requested: 'orange',
  approved: 'blue',
  assigned: 'blue',
  buying: 'yellow',
  partially_bought: 'yellow',
  bought_pending_verification: 'purple',
  received: 'green',
  closed: 'gray',
  rejected: 'red',
  cancelled: 'gray',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: 'gray',
  normal: 'blue',
  urgent: 'red',
};

export default function PurchaseRequestsPage() {
  usePageTitle('Purchase Requests');
  const { can } = useCurrentUserPermissions();
  const toast = useToast();
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('pending');
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [detail, setDetail] = useState<PurchaseRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [assignTo, setAssignTo] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createName, setCreateName] = useState('');
  const [createQty, setCreateQty] = useState('1');
  const [createUnit, setCreateUnit] = useState('pcs');
  const [createPriority, setCreatePriority] = useState<'low' | 'normal' | 'urgent'>('normal');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [promoteItem, setPromoteItem] = useState<PurchaseRequestItem | null>(null);
  const [promoteName, setPromoteName] = useState('');
  const [promoteUnit, setPromoteUnit] = useState('pcs');
  const [promoteRop, setPromoteRop] = useState('');
  const [promoteRoq, setPromoteRoq] = useState('');
  const [autoExpense, setAutoExpense] = useState(false);
  const [autoExpenseSaving, setAutoExpenseSaving] = useState(false);
  const [defaultExpenseCategoryId, setDefaultExpenseCategoryId] = useState<number | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [autoOnLowStock, setAutoOnLowStock] = useState(false);
  const [autoApproveMvr, setAutoApproveMvr] = useState('0');
  const [showPriceHints, setShowPriceHints] = useState(true);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recon, setRecon] = useState<Awaited<ReturnType<typeof fetchPurchaseRequestReconciliation>> | null>(null);
  const [showRecon, setShowRecon] = useState(false);

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchPurchaseRequests({ status: activeTab.statuses, page });
      setRows(res.data ?? []);
      setLastPage(res.meta?.last_page ?? 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tab, page]);

  useEffect(() => {
    void fetchStaff().then((res) => {
      setStaffOptions((res.staff ?? []).map((s) => ({ id: s.id, name: s.name })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    void getPurchaseRequestAutoExpenseSettings()
      .then((res) => {
        setAutoExpense(!!res.settings?.auto_expense);
        setDefaultExpenseCategoryId(res.settings?.default_expense_category_id ?? null);
        setAutoOnLowStock(!!res.settings?.auto_on_low_stock);
        setAutoApproveMvr(String(res.settings?.auto_approve_under_mvr ?? 0));
        setShowPriceHints(res.settings?.show_price_hints !== false);
        setRecurringEnabled(!!res.settings?.recurring_lists_enabled);
      })
      .catch(() => {});
    void getExpenseCategories()
      .then((res) => setExpenseCategories(res.categories ?? []))
      .catch(() => {});
  }, []);

  const saveAutoExpenseSettings = async (next: {
    auto_expense?: boolean;
    default_expense_category_id?: number | null;
    show_price_hints?: boolean;
    auto_on_low_stock?: boolean;
    auto_approve_under_mvr?: number | null;
    recurring_lists_enabled?: boolean;
  }) => {
    if (!can('purchase_requests.convert_to_expense')) {
      toast.error('You need convert-to-expense permission to change this setting.');
      return;
    }
    setAutoExpenseSaving(true);
    try {
      const res = await updatePurchaseRequestAutoExpenseSettings(next);
      setAutoExpense(!!res.settings.auto_expense);
      setDefaultExpenseCategoryId(res.settings.default_expense_category_id ?? null);
      setAutoOnLowStock(!!res.settings.auto_on_low_stock);
      setAutoApproveMvr(String(res.settings.auto_approve_under_mvr ?? 0));
      setShowPriceHints(res.settings.show_price_hints !== false);
      setRecurringEnabled(!!res.settings.recurring_lists_enabled);
      toast.success('Expense settings saved.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAutoExpenseSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await getPurchaseRequest(id);
      setDetail(res.request);
      setAssignTo(res.request.assigned_to ? String(res.request.assigned_to) : '');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    const id = Number(openId);
    if (!Number.isFinite(id) || id <= 0) return;
    void openDetail(id);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from deep link
  }, []);

  const refreshDetail = async (id: number) => {
    const res = await getPurchaseRequest(id);
    setDetail(res.request);
    void load();
  };

  const runAction = async (fn: () => Promise<void>) => {
    setActionBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async () => {
    const qty = parseFloat(createQty);
    if (!createName.trim() || isNaN(qty) || qty <= 0) {
      toast.error('Item name and a valid quantity are required.');
      return;
    }
    await runAction(async () => {
      await createPurchaseRequest({
        title: createTitle.trim() || undefined,
        priority: createPriority,
        items: [{
          free_text_name: createName.trim(),
          requested_qty: qty,
          requested_unit: createUnit.trim() || 'pcs',
          reason: 'other',
        }],
      });
      toast.success('Purchase request created.');
      setShowCreate(false);
      setCreateTitle('');
      setCreateName('');
      setCreateQty('1');
      setTab('pending');
      setPage(1);
      await load();
    });
  };

  const handleMerge = async () => {
    if (selectedIds.length < 2) {
      toast.error('Select at least two requests to merge.');
      return;
    }
    const [targetId, ...sourceIds] = selectedIds;
    ask({
      title: 'Merge purchase requests',
      message: `Merge ${sourceIds.length} request(s) into #${targetId}? Source requests will be closed.`,
      onConfirm: () => void runAction(async () => {
        await mergePurchaseRequests(targetId, sourceIds);
        toast.success('Requests merged.');
        setSelectedIds([]);
        await load();
      }),
    });
  };

  return (
    <div>
      <PageHeader
        title="Purchase Requests"
        action={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {can('purchase_requests.create') && (
              <Btn onClick={() => setShowCreate(true)}>New request</Btn>
            )}
            {can('purchase_requests.merge') && tab === 'pending' && selectedIds.length >= 2 && (
              <Btn variant="secondary" onClick={handleMerge}>Merge selected ({selectedIds.length})</Btn>
            )}
          </div>
        )}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => (
          <Btn
            key={t.id}
            variant={tab === t.id ? 'primary' : 'secondary'}
            onClick={() => { setTab(t.id); setPage(1); setSelectedIds([]); }}
          >
            {t.label}
          </Btn>
        ))}
      </div>

      {can('purchase_requests.view_all') && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
            marginBottom: 16,
            padding: '12px 14px',
            background: '#Faf7f2',
            borderRadius: 10,
            border: '1px solid #E8E0D8',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3D2B1F' }}>Auto-expense on verify</span>
            <Toggle
              checked={autoExpense}
              disabled={autoExpenseSaving || !can('purchase_requests.convert_to_expense')}
              onChange={(checked) => void saveAutoExpenseSettings({ auto_expense: checked })}
              label={autoExpense ? 'On' : 'Off'}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', whiteSpace: 'nowrap' }}>Default category</label>
            <select
              value={defaultExpenseCategoryId ?? ''}
              disabled={autoExpenseSaving || !can('purchase_requests.convert_to_expense')}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                void saveAutoExpenseSettings({ default_expense_category_id: val });
              }}
              style={{ flex: 1, minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8' }}
            >
              <option value="">First category (fallback)</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <span style={{ fontSize: 12, color: '#6B5D4F' }}>
            Creates a pending expense only — never auto-posts to GST/ledger.
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Auto low-stock PR</span>
            <Toggle
              checked={autoOnLowStock}
              disabled={autoExpenseSaving || !can('purchase_requests.convert_to_expense')}
              onChange={(checked) => void saveAutoExpenseSettings({ auto_on_low_stock: checked })}
              label={autoOnLowStock ? 'On' : 'Off'}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Price hints</span>
            <Toggle
              checked={showPriceHints}
              disabled={autoExpenseSaving || !can('purchase_requests.convert_to_expense')}
              onChange={(checked) => void saveAutoExpenseSettings({ show_price_hints: checked })}
              label={showPriceHints ? 'On' : 'Off'}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Recurring lists</span>
            <Toggle
              checked={recurringEnabled}
              disabled={autoExpenseSaving || !can('purchase_requests.convert_to_expense')}
              onChange={(checked) => void saveAutoExpenseSettings({ recurring_lists_enabled: checked })}
              label={recurringEnabled ? 'On' : 'Off'}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Auto-approve under MVR</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={autoApproveMvr}
              disabled={autoExpenseSaving || !can('purchase_requests.convert_to_expense')}
              onBlur={() => void saveAutoExpenseSettings({ auto_approve_under_mvr: Number(autoApproveMvr) || 0 })}
              onChange={(e) => setAutoApproveMvr(e.target.value)}
              style={{ width: 96, minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8' }}
            />
          </div>
          <Btn
            variant="secondary"
            onClick={() => {
              setShowRecon(true);
              void fetchPurchaseRequestReconciliation().then(setRecon).catch((e) => toast.error((e as Error).message));
            }}
          >
            Buyer reconciliation
          </Btn>
          <Link to="/shopping-lists" style={{ fontSize: 13, fontWeight: 700, color: '#D4813A', textDecoration: 'none' }}>
            Shopping lists →
          </Link>
        </div>
      )}

      <TableStateBar error={error} onRetry={() => void load()} />

      <TableCard stickyHead>
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          <TableStateBar isEmpty emptyMessage="No purchase requests in this tab." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {can('purchase_requests.merge') && tab === 'pending' && <th style={TH} />}
                {['Request', 'Requester', 'Priority', 'Status', 'Items', 'Needed by', ''].map((h) => (
                  <th key={h || 'actions'} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {can('purchase_requests.merge') && tab === 'pending' && (
                    <td style={TD}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${r.request_no}`}
                      />
                    </td>
                  )}
                  <td style={TD}>
                    <div style={{ fontWeight: 700 }}>{r.request_no}</div>
                    {r.title && <div style={{ fontSize: 12, color: '#9C8E7E' }}>{r.title}</div>}
                  </td>
                  <td style={TD}>{r.requester?.name ?? '—'}</td>
                  <td style={TD}><Badge color={PRIORITY_COLOR[r.priority] ?? 'gray'}>{r.priority}</Badge></td>
                  <td style={TD}><Badge color={STATUS_COLOR[r.status] ?? 'gray'}>{r.status.replace(/_/g, ' ')}</Badge></td>
                  <td style={TD}>{r.items?.length ?? 0}</td>
                  <td style={{ ...TD, fontSize: 12, color: '#9C8E7E' }}>
                    {r.needed_by ? new Date(r.needed_by).toLocaleDateString() : '—'}
                  </td>
                  <td style={TD}>
                    <Btn variant="ghost" onClick={() => void openDetail(r.id)}>View</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <Pagination page={page} totalPages={lastPage} onChange={setPage} />

      {detail && (
        <Modal title={`${detail.request_no}${detail.title ? ` — ${detail.title}` : ''}`} onClose={() => setDetail(null)} maxWidth={720}>
          {detailLoading ? (
            <p>Loading…</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <Badge color={STATUS_COLOR[detail.status] ?? 'gray'}>{detail.status.replace(/_/g, ' ')}</Badge>
                <Badge color={PRIORITY_COLOR[detail.priority] ?? 'gray'}>{detail.priority}</Badge>
                <span style={{ fontSize: 13, color: '#6B5D4F' }}>
                  By {detail.requester?.name ?? '—'}
                  {detail.assignee ? ` · Buyer: ${detail.assignee.name}` : ''}
                </span>
              </div>
              {detail.notes && (
                <p style={{ fontSize: 13, color: '#6B5D4F', marginBottom: 12 }}>{detail.notes}</p>
              )}
              {detail.rejection_reason && (
                <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>Rejected: {detail.rejection_reason}</p>
              )}

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr>
                    {['Item', 'Requested', 'Approved', 'Actual', 'Status', 'Cost'].map((h) => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td style={TD}>
                        <div>{item.name}</div>
                        {item.price_hint && (
                          <div style={{ fontSize: 11, color: '#6B5D4F', marginTop: 2 }}>
                            {item.price_hint.last_paid != null && <>Last MVR {item.price_hint.last_paid.toFixed(2)} </>}
                            {item.price_hint.cheapest && (
                              <>· Cheapest {item.price_hint.cheapest.supplier_name ?? '—'} @ MVR {item.price_hint.cheapest.unit_price.toFixed(2)}</>
                            )}
                          </div>
                        )}
                        {item.free_text_name && !item.inventory_item_id && can('inventory.manage') && (
                          <Btn
                            variant="ghost"
                            onClick={() => {
                              setPromoteItem(item);
                              setPromoteName(item.free_text_name || item.name);
                              setPromoteUnit(item.requested_unit || 'pcs');
                              setPromoteRop('');
                              setPromoteRoq('');
                            }}
                            style={{ marginTop: 4, fontSize: 12, padding: '4px 8px' }}
                          >
                            Add to catalog
                          </Btn>
                        )}
                      </td>
                      <td style={TD}>{item.requested_qty} {item.requested_unit}</td>
                      <td style={TD}>{item.approved_qty != null ? `${item.approved_qty} ${item.requested_unit}` : '—'}</td>
                      <td style={TD}>{item.actual_qty != null ? `${item.actual_qty} ${item.actual_unit ?? item.requested_unit}` : '—'}</td>
                      <td style={TD}><Badge color={STATUS_COLOR[item.status] ?? 'gray'}>{item.status.replace(/_/g, ' ')}</Badge></td>
                      <td style={TD}>MVR {laarToMvr(item.actual_total_laar ?? item.actual_unit_cost_laar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {can('purchase_requests.approve') && detail.status === 'requested' && (
                  <Btn
                    disabled={actionBusy}
                    onClick={() => ask({
                      title: 'Approve request',
                      message: `Approve ${detail.request_no}?`,
                      onConfirm: () => void runAction(async () => {
                        await approvePurchaseRequest(detail.id);
                        toast.success('Request approved.');
                        await refreshDetail(detail.id);
                      }),
                    })}
                  >
                    Approve
                  </Btn>
                )}
                {can('purchase_requests.reject') && ['requested', 'approved'].includes(detail.status) && (
                  <Btn variant="danger" disabled={actionBusy} onClick={() => setShowReject(true)}>Reject</Btn>
                )}
                {can('purchase_requests.assign') && ['approved', 'assigned'].includes(detail.status) && (
                  <>
                    <select
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                      style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #E8E0D8' }}
                    >
                      <option value="">Select buyer…</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <Btn
                      disabled={actionBusy || !assignTo}
                      onClick={() => void runAction(async () => {
                        await assignPurchaseRequest(detail.id, Number(assignTo));
                        toast.success('Buyer assigned.');
                        await refreshDetail(detail.id);
                      })}
                    >
                      Assign buyer
                    </Btn>
                  </>
                )}
                {can('purchase_requests.verify') && detail.status === 'bought_pending_verification' && (
                  <Btn
                    disabled={actionBusy}
                    onClick={() => ask({
                      title: 'Verify all items',
                      message: 'Verify all bought items and update stock where linked?',
                      onConfirm: () => void runAction(async () => {
                        await verifyAllPurchaseRequestItems(detail.id);
                        toast.success('All items verified.');
                        await refreshDetail(detail.id);
                      }),
                    })}
                  >
                    Verify all
                  </Btn>
                )}
                {can('purchase_requests.verify') && detail.items.some((i) => ['bought', 'partially_bought'].includes(i.status)) && (
                  <Btn
                    variant="secondary"
                    disabled={actionBusy}
                    onClick={() => void runAction(async () => {
                      for (const item of detail.items.filter((i) => ['bought', 'partially_bought'].includes(i.status))) {
                        await verifyPurchaseRequestItem(detail.id, item.id);
                      }
                      toast.success('Eligible items verified.');
                      await refreshDetail(detail.id);
                    })}
                  >
                    Verify bought items
                  </Btn>
                )}
                {can('purchase_requests.convert_to_purchase') && detail.purchase_id == null && ['received', 'closed', 'bought_pending_verification'].includes(detail.status) && (
                  <Btn
                    variant="secondary"
                    disabled={actionBusy}
                    onClick={() => void runAction(async () => {
                      const res = await convertPurchaseRequestToPurchase(detail.id);
                      const poNo = res.purchase.purchase_number || `PO #${res.purchase.id}`;
                      toast.success(`Draft ${poNo} created.`);
                      await refreshDetail(detail.id);
                    })}
                  >
                    Convert to PO
                  </Btn>
                )}
                {can('purchase_requests.convert_to_expense') && detail.expense_id == null && ['received', 'closed', 'bought_pending_verification'].includes(detail.status) && (
                  <Btn
                    variant="secondary"
                    disabled={actionBusy}
                    onClick={() => void runAction(async () => {
                      const res = await convertPurchaseRequestToExpense(detail.id);
                      const expNo = res.expense.expense_number || `Expense #${res.expense.id}`;
                      toast.success(`${expNo} created (pending).`);
                      await refreshDetail(detail.id);
                    })}
                  >
                    Convert to expense
                  </Btn>
                )}
                {can('purchase_requests.cancel') && !['closed', 'cancelled', 'rejected', 'received'].includes(detail.status) && (
                  <Btn
                    variant="ghost"
                    disabled={actionBusy}
                    onClick={() => ask({
                      title: 'Cancel request',
                      message: `Cancel ${detail.request_no}?`,
                      danger: true,
                      onConfirm: () => void runAction(async () => {
                        await cancelPurchaseRequest(detail.id);
                        toast.success('Request cancelled.');
                        setDetail(null);
                        void load();
                      }),
                    })}
                  >
                    Cancel
                  </Btn>
                )}
              </div>

              {can('purchase_requests.approve') && detail.status === 'requested' && (
                <div style={{ borderTop: '1px solid #E8E0D8', paddingTop: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Edit approved quantities before approving</p>
                  {detail.items.map((item) => (
                    <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                      <span style={{ flex: 1 }}>{item.name}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        defaultValue={item.approved_qty ?? item.requested_qty}
                        id={`approve-qty-${item.id}`}
                        style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid #E8E0D8' }}
                      />
                      <span>{item.requested_unit}</span>
                    </label>
                  ))}
                  <Btn
                    variant="secondary"
                    disabled={actionBusy}
                    style={{ marginTop: 8 }}
                    onClick={() => void runAction(async () => {
                      const items = detail.items.map((item) => {
                        const el = document.getElementById(`approve-qty-${item.id}`) as HTMLInputElement | null;
                        const qty = el ? parseFloat(el.value) : item.requested_qty;
                        return { id: item.id, approved_qty: qty };
                      });
                      await updatePurchaseRequest(detail.id, { items });
                      await approvePurchaseRequest(detail.id);
                      toast.success('Quantities saved and request approved.');
                      await refreshDetail(detail.id);
                    })}
                  >
                    Save qty & approve
                  </Btn>
                </div>
              )}

              {(detail.purchase_id || detail.expense_id) && (
                <p style={{ fontSize: 12, color: '#9C8E7E', marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {detail.purchase_id ? (
                    <span>
                      Linked PO:{' '}
                      <Link
                        to={`/purchase-orders?search=${encodeURIComponent(detail.purchase?.purchase_number || String(detail.purchase_id))}`}
                        style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {detail.purchase?.purchase_number || `PO #${detail.purchase_id}`}
                      </Link>
                    </span>
                  ) : null}
                  {detail.purchase_id && detail.expense_id ? <span>·</span> : null}
                  {detail.expense_id ? (
                    <span>
                      Linked expense:{' '}
                      <Link
                        to={`/expenses?search=${encodeURIComponent(detail.expense?.expense_number || String(detail.expense_id))}`}
                        style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {detail.expense?.expense_number || `Expense #${detail.expense_id}`}
                      </Link>
                    </span>
                  ) : null}
                </p>
              )}
            </>
          )}
          <ModalActions>
            <Btn variant="secondary" onClick={() => setDetail(null)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {showReject && detail && (
        <Modal title="Reject request" onClose={() => setShowReject(false)}>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={3}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box' }}
          />
          <ModalActions>
            <Btn variant="secondary" onClick={() => setShowReject(false)}>Cancel</Btn>
            <Btn
              variant="danger"
              disabled={actionBusy}
              onClick={() => void runAction(async () => {
                await rejectPurchaseRequest(detail.id, rejectReason.trim() || undefined);
                toast.success('Request rejected.');
                setShowReject(false);
                setRejectReason('');
                await refreshDetail(detail.id);
              })}
            >
              Reject
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {showRecon && (
        <Modal title="Buyer reconciliation" onClose={() => setShowRecon(false)} maxWidth={640}>
          {!recon ? (
            <p style={{ color: '#6B5D4F' }}>Loading…</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#6B5D4F' }}>
                {recon.from} → {recon.to}. Cash uses category <code>buying_float</code> on cash-out movements.
              </p>
              <p style={{ fontSize: 13 }}>
                Bought MVR {(recon.totals.bought_laar / 100).toFixed(2)} · Expenses MVR {(recon.totals.expense_laar / 100).toFixed(2)} · Cash-out MVR {(recon.totals.cash_out_laar / 100).toFixed(2)}
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Buyer', 'Bought', 'Expense', 'Cash', 'Δ bought−exp', 'Receipts'].map((h) => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recon.buyers.map((b) => (
                    <tr key={b.buyer_id}>
                      <td style={TD}>{b.buyer_name}</td>
                      <td style={TD}>{laarToMvr(b.bought_laar)}</td>
                      <td style={TD}>{laarToMvr(b.expense_laar)}</td>
                      <td style={TD}>{laarToMvr(b.cash_out_laar)}</td>
                      <td style={TD}>{laarToMvr(b.bought_vs_expense_laar)}</td>
                      <td style={TD}>{b.receipt_count}</td>
                    </tr>
                  ))}
                  {recon.buyers.length === 0 && (
                    <tr><td style={TD} colSpan={6}>No buyer activity in range.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
          <ModalActions>
            <Btn variant="secondary" onClick={() => setShowRecon(false)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {promoteItem && detail && (
        <Modal title="Add to inventory catalog" onClose={() => setPromoteItem(null)} maxWidth={420}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Name</label>
          <input
            value={promoteName}
            onChange={(e) => setPromoteName(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box', minHeight: 44 }}
          />
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Unit</label>
          <input
            value={promoteUnit}
            onChange={(e) => setPromoteUnit(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box', minHeight: 44 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Reorder point (optional)</label>
              <input
                value={promoteRop}
                onChange={(e) => setPromoteRop(e.target.value)}
                type="number"
                min="0"
                step="any"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box', minHeight: 44 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Reorder qty (optional)</label>
              <input
                value={promoteRoq}
                onChange={(e) => setPromoteRoq(e.target.value)}
                type="number"
                min="0"
                step="any"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box', minHeight: 44 }}
              />
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setPromoteItem(null)}>Cancel</Btn>
            <Btn
              disabled={actionBusy || !promoteName.trim() || !promoteUnit.trim()}
              onClick={() => void runAction(async () => {
                const res = await promotePurchaseRequestItemToInventory(detail.id, promoteItem.id, {
                  name: promoteName.trim(),
                  unit: promoteUnit.trim(),
                  reorder_point: promoteRop.trim() ? Number(promoteRop) : null,
                  reorder_quantity: promoteRoq.trim() ? Number(promoteRoq) : null,
                });
                toast.success(res.created ? 'Added to catalog.' : 'Linked to existing catalog item.');
                setPromoteItem(null);
                setDetail(res.request);
                await load();
              })}
            >
              {actionBusy ? '…' : 'Add to catalog'}
            </Btn>
          </ModalActions>
        </Modal>
      )}

      {showCreate && (
        <Modal title="New purchase request" onClose={() => setShowCreate(false)} maxWidth={480}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Title (optional)</label>
          <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box' }} />
          <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Item name</label>
          <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Cooking oil 5L" style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Qty</label>
              <input value={createQty} onChange={(e) => setCreateQty(e.target.value)} type="number" min="0.001" step="any" style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Unit</label>
              <input value={createUnit} onChange={(e) => setCreateUnit(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#6B5D4F', display: 'block', marginBottom: 6 }}>Priority</label>
              <select value={createPriority} onChange={(e) => setCreatePriority(e.target.value as 'low' | 'normal' | 'urgent')} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8' }}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <ModalActions>
            <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
            <Btn disabled={actionBusy} onClick={() => void handleCreate()}>{actionBusy ? '…' : 'Create'}</Btn>
          </ModalActions>
        </Modal>
      )}

      <ConfirmDialog state={dlg} close={closeDlg} />
    </div>
  );
}
