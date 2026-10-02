import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  changeCustomerPhone,
  fetchCustomerSummary,
  fetchRecentCustomers,
  getCustomerDetail,
  listCustomers,
  listCustomerSegments,
  quickCreateCustomer,
  recordCreditRepayment,
  recordDepositTopUp,
  searchCustomers,
  sendCustomerSms,
  updateCustomerDetail,
  updateCustomerFromPos,
} from "../api";
import type {
  CustomerDetail,
  CustomerDetailOrder,
  CustomerListRow,
  CustomerSegment,
  PosCustomer,
  PosCustomerSummary,
  TillMoneyMethod,
} from "../api";
import { EmptyState, PanelShell } from "./openTickets/PanelShell";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { normalizeMvPhone } from "../orderTypes";

/**
 * Customers on the till (owner, 2026-10-02: "add a customer tab in the POS
 * so he can manage all customers easily").
 *
 * Owners and managers (customers.manage) get the whole of it: every
 * customer, filters by segment, edit, phone change, notes, SMS opt-out,
 * a text message, credit repayments and deposit top-ups. A cashier with
 * customers.lookup gets search and the customer card, and can fix a
 * name or e-mail, which is what the cart chip already allowed. Every rule
 * is enforced again by the server; the flags here only hide what would
 * be refused.
 */
export type CustomersPanelPermissions = {
  canManage: boolean;
  canCreate: boolean;
  canCreditRepay: boolean;
  canDepositReceive: boolean;
  canSendSms: boolean;
};

type Props = CustomersPanelPermissions & {
  onClose: () => void;
  /** Attach the customer to the cart and go to Sales; absent when ringing a sale is not possible now. */
  onStartOrder?: (customer: PosCustomer) => void;
};

type Filter = { kind: "all" } | { kind: "active"; value: boolean } | { kind: "segment"; slug: string };

const QUICK_SEGMENTS = ["vip_customers", "repeat_customers", "new_customers", "dormant_30d", "credit_with_balance", "no_order_yet"];

export function CustomersPanel(props: Props) {
  const { canManage, canCreate, onClose } = props;
  const isNarrow = useMediaQuery("(max-width: 840px)");

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!canManage) return;
    listCustomerSegments().then((r) => setSegments(r.segments ?? [])).catch(() => setSegments([]));
  }, [canManage, reloadTick]);

  // One loader for both permission levels: owners page through every
  // customer; a cashier searches (two letters or more) or sees the recent ones.
  const load = useCallback(async (nextPage: number, append: boolean) => {
    setLoading(true);
    try {
      if (canManage) {
        const res = await listCustomers({
          search: debounced || undefined,
          page: nextPage,
          segment: filter.kind === "segment" ? filter.slug : undefined,
          is_active: filter.kind === "active" ? filter.value : undefined,
        });
        setRows((prev) => (append ? [...prev, ...res.data] : res.data));
        setPage(res.meta.current_page);
        setLastPage(res.meta.last_page);
        setTotal(res.meta.total);
      } else if (debounced.length >= 2) {
        const res = await searchCustomers(debounced);
        setRows(res.data as CustomerListRow[]);
        setPage(1); setLastPage(1); setTotal(res.data.length);
      } else {
        const res = await fetchRecentCustomers(50);
        setRows(res.data as CustomerListRow[]);
        setPage(1); setLastPage(1); setTotal(res.total);
      }
      setErr("");
    } catch (e) {
      setErr((e as Error).message || "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, [canManage, debounced, filter]);

  useEffect(() => { void load(1, false); }, [load, reloadTick]);

  const onSaved = useCallback((updated: Partial<CustomerListRow> & { id: number }) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  }, []);

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const showList = !isNarrow || selectedId == null;
  const showDetail = !isNarrow || selectedId != null;

  const segmentChips = useMemo(
    () => QUICK_SEGMENTS.map((slug) => segments.find((s) => s.slug === slug)).filter((s): s is CustomerSegment => !!s),
    [segments],
  );
  const otherSegments = segments.filter((s) => !QUICK_SEGMENTS.includes(s.slug));

  const subtitle = total == null
    ? "Loading…"
    : canManage
      ? `${total.toLocaleString()} customer${total === 1 ? "" : "s"}${filter.kind !== "all" || debounced ? " in this view" : ""}`
      : debounced.length >= 2 ? `${rows.length} found` : `Recent customers · type to search all ${total.toLocaleString()}`;

  return (
    <PanelShell
      title="Customers"
      subtitle={subtitle}
      onClose={isNarrow && selectedId != null ? () => setSelectedId(null) : onClose}
      backMode={isNarrow ? true : undefined}
    >
      <div className="pos-customers" style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "340px 1fr", gap: 12, minHeight: 0, height: "100%" }}>
        {showList && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone or e-mail"
                aria-label="Search customers"
                style={{ ...field, flex: 1 }}
              />
              {canCreate && (
                <button type="button" onClick={() => setShowCreate(true)} style={primaryBtn}>+ New</button>
              )}
            </div>

            {canManage && (
              <div data-testid="customer-filters" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                <Chip on={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>All</Chip>
                {segmentChips.map((s) => (
                  <Chip key={s.slug} on={filter.kind === "segment" && filter.slug === s.slug} onClick={() => setFilter({ kind: "segment", slug: s.slug })}>
                    {s.label} <span style={{ opacity: 0.7 }}>{s.count}</span>
                  </Chip>
                ))}
                <Chip on={filter.kind === "active" && !filter.value} onClick={() => setFilter({ kind: "active", value: false })}>Inactive</Chip>
                {otherSegments.length > 0 && (
                  <select
                    aria-label="More segments"
                    value={filter.kind === "segment" && !QUICK_SEGMENTS.includes(filter.slug) ? filter.slug : ""}
                    onChange={(e) => e.target.value && setFilter({ kind: "segment", slug: e.target.value })}
                    style={{ ...field, minHeight: 32, padding: "4px 8px", fontSize: 12, flexShrink: 0 }}
                  >
                    <option value="">More…</option>
                    {otherSegments.map((s) => <option key={s.slug} value={s.slug}>{s.label} ({s.count})</option>)}
                  </select>
                )}
              </div>
            )}

            {err && <div style={errorBox}>{err}</div>}

            <div style={{ overflow: "auto", display: "flex", flexDirection: "column", gap: 4, minHeight: 0, flex: 1 }}>
              {!loading && rows.length === 0 && !err && (
                <EmptyState
                  emoji="👥"
                  title={debounced ? "No one matches" : "No customers here"}
                  body={debounced ? "Check the spelling, or search by phone." : "Try another filter."}
                />
              )}
              {rows.map((r) => (
                <CustomerRowButton key={r.id} row={r} selected={r.id === selectedId} onClick={() => setSelectedId(r.id)} />
              ))}
              {loading && <div style={{ color: "#64748B", fontSize: 13, padding: 8 }}>Loading…</div>}
              {!loading && canManage && page < lastPage && (
                <button type="button" onClick={() => void load(page + 1, true)} style={{ ...secondaryBtn, margin: "6px 0" }}>
                  Load more
                </button>
              )}
            </div>
          </div>
        )}

        {showDetail && (
          <div style={{ background: "#F8FAFC", borderRadius: 10, padding: 14, overflow: "auto", minHeight: 0 }}>
            {selectedId != null ? (
              <CustomerCard
                key={selectedId}
                id={selectedId}
                listRow={selectedRow}
                perms={props}
                onStartOrder={props.onStartOrder}
                onSaved={onSaved}
                onMoneyRecorded={() => setReloadTick((t) => t + 1)}
              />
            ) : (
              <EmptyState emoji="🪪" title="Pick a customer" body="Their orders, points, credit and notes show here." />
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCustomerModal
          onCancel={() => setShowCreate(false)}
          onCreated={(c, created) => {
            setShowCreate(false);
            if (created) setRows((prev) => [c as CustomerListRow, ...prev.filter((r) => r.id !== c.id)]);
            setSelectedId(c.id);
          }}
        />
      )}
    </PanelShell>
  );
}

function CustomerRowButton({ row, selected, onClick }: { row: CustomerListRow; selected: boolean; onClick: () => void }) {
  const orders = row.orders_count_paid ?? row.orders_count ?? 0;
  const creditLaar = row.credit_balance_laar ?? row.credit_balance ?? 0;
  const dim = selected ? "#CBD5E1" : "#64748B";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`customer-row-${row.id}`}
      style={{
        textAlign: "left", padding: 10, borderRadius: 8, width: "100%", cursor: "pointer",
        background: selected ? "#0F172A" : "#fff",
        color: selected ? "#fff" : "#0F172A",
        border: `1px solid ${selected ? "#0F172A" : "#E2E8F0"}`,
        opacity: row.is_active === false ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700, fontSize: 13 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name?.trim() || "No name"}
        </span>
        <span style={{ flexShrink: 0, color: dim, fontWeight: 600 }}>
          {orders} order{orders === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ fontSize: 11, marginTop: 4, color: dim, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span>{row.phone ?? "no phone"}</span>
        {row.last_order_at && <span>· last {relativeDay(row.last_order_at)}</span>}
        {row.is_active === false && <span style={pill(selected, "gray")}>Inactive</span>}
        {creditLaar > 0 && <span style={pill(selected, "amber")}>Owes MVR {(creditLaar / 100).toFixed(2)}</span>}
        {(row.badges ?? []).slice(0, 2).map((b) => <span key={b} style={pill(selected, "brand")}>{b}</span>)}
      </div>
    </button>
  );
}

type CardProps = {
  id: number;
  listRow: CustomerListRow | null;
  perms: CustomersPanelPermissions;
  onStartOrder?: (customer: PosCustomer) => void;
  onSaved: (row: Partial<CustomerListRow> & { id: number }) => void;
  onMoneyRecorded: () => void;
};

function CustomerCard({ id, listRow, perms, onStartOrder, onSaved, onMoneyRecorded }: CardProps) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [orders, setOrders] = useState<CustomerDetailOrder[]>([]);
  const [summary, setSummary] = useState<PosCustomerSummary | null>(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<null | "edit" | "phone" | "sms" | "repay" | "topup">(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setErr("");
    void (async () => {
      const [detailRes, summaryRes] = await Promise.allSettled([
        perms.canManage ? getCustomerDetail(id) : Promise.reject(new Error("skip")),
        fetchCustomerSummary(id),
      ]);
      if (cancelled) return;
      if (detailRes.status === "fulfilled") { setDetail(detailRes.value.customer); setOrders(detailRes.value.orders ?? []); }
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
      if (detailRes.status === "rejected" && summaryRes.status === "rejected") {
        setErr((summaryRes.reason as Error)?.message || "Could not load this customer.");
      }
    })();
    return () => { cancelled = true; };
  }, [id, perms.canManage, tick]);

  const name = detail?.name ?? summary?.customer.name ?? listRow?.name ?? null;
  const phone = detail?.phone ?? summary?.customer.phone ?? listRow?.phone ?? null;
  const email = detail?.email ?? summary?.customer.email ?? null;
  const notes = detail?.internal_notes ?? summary?.customer.internal_notes ?? null;
  const smsOptOut = detail?.sms_opt_out ?? summary?.customer.sms_opt_out ?? false;
  const isActive = detail?.is_active ?? listRow?.is_active ?? true;
  const credit = summary?.credit;
  const deposit = summary?.deposit;
  const recent = orders.length > 0
    ? orders.map((o) => ({ id: o.id, order_number: o.order_number, status: o.status, type: o.type, total: Number(o.total), at: o.paid_at ?? o.created_at }))
    : (summary?.recent_orders ?? []).map((o) => ({ id: o.id, order_number: o.order_number, status: o.status, type: o.type, total: Number(o.total), at: o.paid_at }));

  const asPosCustomer = (): PosCustomer => ({
    id, name, phone, email,
    loyalty_points: summary?.loyalty.available_points ?? detail?.loyalty_points,
    tier: summary?.loyalty.tier ?? detail?.tier ?? null,
    sms_opt_out: smsOptOut,
  });

  const done = (message: string) => { setMode(null); setNotice(message); setTick((t) => t + 1); };

  if (err && !detail && !summary) return <div style={errorBox}>{err}</div>;
  if (!detail && !summary) return <div style={{ color: "#64748B", fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="customer-card">
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {name?.trim() || "No name"}
          {summary?.is_vip && <span style={pill(false, "brand")}>VIP</span>}
          {!isActive && <span style={pill(false, "gray")}>Inactive</span>}
          {smsOptOut && <span style={pill(false, "gray")}>No SMS</span>}
        </div>
        <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
          {phone ?? "No phone"}{email ? ` · ${email}` : ""}
        </div>
        {(summary?.customer.badges?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {summary!.customer.badges!.map((b) => <span key={b} style={pill(false, "brand")}>{b}</span>)}
          </div>
        )}
      </div>

      {notice && <div style={okBox} role="status">{notice}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onStartOrder && (
          <button type="button" onClick={() => onStartOrder(asPosCustomer())} style={primaryBtn}>Start order</button>
        )}
        {phone && <a href={`tel:${phone}`} style={{ ...secondaryBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Call</a>}
        {perms.canSendSms && phone && !smsOptOut && (
          <button type="button" onClick={() => setMode("sms")} style={secondaryBtn}>Text</button>
        )}
        <button type="button" onClick={() => setMode("edit")} style={secondaryBtn}>Edit</button>
        {perms.canManage && <button type="button" onClick={() => setMode("phone")} style={secondaryBtn}>Change phone</button>}
      </div>

      {mode === "edit" && (
        <EditForm
          canManage={perms.canManage}
          initial={{ name: name ?? "", email: email ?? "", date_of_birth: detail?.date_of_birth ?? "", internal_notes: notes ?? "", sms_opt_out: smsOptOut, is_active: isActive }}
          onCancel={() => setMode(null)}
          onSave={async (v) => {
            if (perms.canManage) {
              const res = await updateCustomerDetail(id, {
                name: v.name.trim(),
                email: v.email.trim() || null,
                date_of_birth: v.date_of_birth || null,
                internal_notes: v.internal_notes.trim() || null,
                sms_opt_out: v.sms_opt_out,
                is_active: v.is_active,
              });
              onSaved({ id, name: res.customer.name, email: res.customer.email, is_active: res.customer.is_active, sms_opt_out: res.customer.sms_opt_out });
            } else {
              const res = await updateCustomerFromPos(id, { name: v.name.trim() || null, email: v.email.trim() || null });
              onSaved({ id, name: res.customer.name, email: res.customer.email });
            }
            done("Saved.");
          }}
        />
      )}

      {mode === "phone" && (
        <PhoneForm
          current={phone ?? ""}
          onCancel={() => setMode(null)}
          onSave={async (next) => {
            const res = await changeCustomerPhone(id, next);
            onSaved({ id, phone: res.customer.phone });
            done(res.message);
          }}
        />
      )}

      {mode === "sms" && (
        <SmsForm
          to={name?.trim() || phone || "this customer"}
          onCancel={() => setMode(null)}
          onSend={async (message) => { const res = await sendCustomerSms(id, message); done(res.message || "SMS sent."); }}
        />
      )}

      <Section title="Lifetime">
        <Stat label="Paid orders" value={String(summary?.lifetime.orders_count ?? detail?.orders_count ?? 0)} />
        <Stat label="Total spent" value={summary ? `MVR ${summary.lifetime.total_spent.toFixed(2)}` : "—"} />
        <Stat label="Customer since" value={formatDate(detail?.created_at ?? summary?.customer.created_at ?? null)} />
        <Stat label="Last paid order" value={formatDate(summary?.lifetime.last_paid_at ?? detail?.last_order_at ?? null)} />
        {summary && (
          <Stat
            label="Loyalty points"
            value={`${summary.loyalty.available_points.toLocaleString()}${summary.loyalty.points_held > 0 ? ` (${summary.loyalty.points_held} on hold)` : ""}${summary.loyalty.tier ? ` · ${summary.loyalty.tier}` : ""}`}
          />
        )}
      </Section>

      {credit && (credit.enabled || credit.balance_laar > 0) && (
        <Section title="Credit">
          <Stat label="Status" value={credit.status.replace("_", " ")} />
          <Stat label="Owes" value={`MVR ${(credit.balance_laar / 100).toFixed(2)}`} strong={credit.balance_laar > 0} />
          <Stat label="Limit" value={`MVR ${(credit.limit_laar / 100).toFixed(2)}`} />
          <Stat label="Available" value={`MVR ${(credit.available_laar / 100).toFixed(2)}`} />
          {perms.canCreditRepay && credit.balance_laar > 0 && mode !== "repay" && (
            <button type="button" onClick={() => setMode("repay")} style={{ ...secondaryBtn, marginTop: 8 }}>Record repayment</button>
          )}
          {mode === "repay" && (
            <MoneyForm
              title="Credit repayment"
              max={credit.balance_laar / 100}
              onCancel={() => setMode(null)}
              onSave={async (p) => { await recordCreditRepayment(id, p); onMoneyRecorded(); done(`Repayment of MVR ${p.amount_mvr.toFixed(2)} recorded.`); }}
            />
          )}
        </Section>
      )}

      {deposit && (deposit.has_account || perms.canDepositReceive) && (
        <Section title="Deposit">
          {deposit.has_account && <Stat label="Status" value={deposit.status} />}
          <Stat label="Balance" value={`MVR ${(deposit.balance_laar / 100).toFixed(2)}`} />
          {perms.canDepositReceive && deposit.status !== "frozen" && mode !== "topup" && (
            <button type="button" onClick={() => setMode("topup")} style={{ ...secondaryBtn, marginTop: 8 }}>Add deposit</button>
          )}
          {mode === "topup" && (
            <MoneyForm
              title="Deposit top-up"
              onCancel={() => setMode(null)}
              onSave={async (p) => { await recordDepositTopUp(id, p); done(`Deposit of MVR ${p.amount_mvr.toFixed(2)} added.`); }}
            />
          )}
        </Section>
      )}

      {notes && mode !== "edit" && (
        <Section title="Notes">
          <div style={{ fontSize: 13, color: "#475569", whiteSpace: "pre-wrap" }}>{notes}</div>
        </Section>
      )}

      <Section title="Recent orders">
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: "#64748B" }}>No orders yet.</div>
        ) : recent.map((o) => (
          <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", fontSize: 13, color: "#475569", borderTop: "1px solid #F1F5F9" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              #{o.order_number} · {o.type.replace("_", " ")} · <span style={{ color: statusColour(o.status) }}>{o.status.replace("_", " ")}</span>
            </span>
            <span style={{ flexShrink: 0 }}>{formatDate(o.at)} · MVR {o.total.toFixed(2)}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

type EditValues = { name: string; email: string; date_of_birth: string; internal_notes: string; sms_opt_out: boolean; is_active: boolean };

function EditForm({ canManage, initial, onCancel, onSave }: {
  canManage: boolean;
  initial: EditValues;
  onCancel: () => void;
  onSave: (v: EditValues) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof EditValues>(k: K, val: EditValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const save = async () => {
    if (canManage && v.name.trim() === "") { setErr("A name is required."); return; }
    setBusy(true); setErr("");
    try { await onSave(v); } catch (e) { setErr((e as Error).message || "Could not save."); } finally { setBusy(false); }
  };
  return (
    <Section title="Edit customer">
      <div style={{ display: "grid", gap: 8 }}>
        <label style={label}>Name<input value={v.name} onChange={(e) => set("name", e.target.value)} style={field} /></label>
        <label style={label}>E-mail<input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} style={field} /></label>
        {canManage && (
          <>
            <label style={label}>Birthday<input type="date" value={v.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} style={field} /></label>
            <label style={label}>Notes (staff only)<textarea value={v.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} rows={3} maxLength={2000} style={{ ...field, resize: "vertical" }} /></label>
            <label style={checkRow}><input type="checkbox" checked={v.sms_opt_out} onChange={(e) => set("sms_opt_out", e.target.checked)} /> Does not want SMS</label>
            <label style={checkRow}><input type="checkbox" checked={!v.is_active} onChange={(e) => set("is_active", !e.target.checked)} /> Inactive (cannot log in to order online)</label>
          </>
        )}
        {err && <div style={errorBox}>{err}</div>}
        <FormButtons busy={busy} onCancel={onCancel} onSave={() => void save()} saveLabel="Save" />
      </div>
    </Section>
  );
}

function PhoneForm({ current, onCancel, onSave }: { current: string; onCancel: () => void; onSave: (phone: string) => Promise<void> }) {
  const [phone, setPhone] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    const next = normalizeMvPhone(phone);
    if (next === current) { onCancel(); return; }
    setBusy(true); setErr("");
    try { await onSave(next); } catch (e) { setErr((e as Error).message || "Could not change the phone."); } finally { setBusy(false); }
  };
  return (
    <Section title="Change phone">
      <div style={{ fontSize: 12, color: "#92400E", marginBottom: 8, lineHeight: 1.4 }}>
        The phone is how they log in and how the till finds them. They will need to log in again with the new number.
      </div>
      <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="New phone" style={field} />
      {err && <div style={{ ...errorBox, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 8 }}><FormButtons busy={busy} onCancel={onCancel} onSave={() => void save()} saveLabel="Change phone" /></div>
    </Section>
  );
}

function SmsForm({ to, onCancel, onSend }: { to: string; onCancel: () => void; onSend: (message: string) => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    if (message.trim() === "") { setErr("Write a message first."); return; }
    setBusy(true); setErr("");
    try { await onSend(message.trim()); } catch (e) { setErr((e as Error).message || "Could not send."); } finally { setBusy(false); }
  };
  return (
    <Section title={`Text ${to}`}>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} aria-label="SMS message" style={{ ...field, resize: "vertical" }} />
      <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>{message.length}/500</div>
      {err && <div style={{ ...errorBox, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 8 }}><FormButtons busy={busy} onCancel={onCancel} onSave={() => void send()} saveLabel="Send" /></div>
    </Section>
  );
}

function MoneyForm({ title, max, onCancel, onSave }: {
  title: string;
  max?: number;
  onCancel: () => void;
  onSave: (p: { amount_mvr: number; method: TillMoneyMethod; reference?: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState(max != null ? max.toFixed(2) : "");
  const [method, setMethod] = useState<TillMoneyMethod>("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) { setErr("Enter an amount above zero."); return; }
    if (max != null && n > max + 0.004) { setErr(`They owe MVR ${max.toFixed(2)}; enter that or less.`); return; }
    if (method !== "cash" && reference.trim() === "") { setErr("Add the card slip or transfer reference."); return; }
    setBusy(true); setErr("");
    try { await onSave({ amount_mvr: Math.round(n * 100) / 100, method, reference: reference.trim() || undefined }); }
    catch (e) { setErr((e as Error).message || "Could not record it."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E2E8F0", display: "grid", gap: 8 }} data-testid="customer-money-form">
      <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{title}</div>
      <label style={label}>Amount (MVR)<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={field} /></label>
      <div style={{ display: "flex", gap: 6 }}>
        {(["cash", "card", "bank_transfer"] as TillMoneyMethod[]).map((m) => (
          <Chip key={m} on={method === m} onClick={() => setMethod(m)}>{m === "bank_transfer" ? "Transfer" : m === "card" ? "Card" : "Cash"}</Chip>
        ))}
      </div>
      {method === "cash" ? (
        <div style={{ fontSize: 11, color: "#64748B" }}>Cash goes into your open shift's drawer.</div>
      ) : (
        <label style={label}>Reference<input value={reference} onChange={(e) => setReference(e.target.value)} style={field} placeholder={method === "card" ? "Card slip number" : "Transfer reference"} /></label>
      )}
      {err && <div style={errorBox}>{err}</div>}
      <FormButtons busy={busy} onCancel={onCancel} onSave={() => void save()} saveLabel="Record" />
    </div>
  );
}

function CreateCustomerModal({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: PosCustomer, created: boolean) => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const phoneRef = useRef<HTMLInputElement>(null);
  useEffect(() => { phoneRef.current?.focus(); }, []);
  const save = async () => {
    if (phone.trim() === "") { setErr("A phone number is required."); return; }
    setBusy(true); setErr("");
    try {
      const res = await quickCreateCustomer({ phone: normalizeMvPhone(phone), name: name.trim() || undefined });
      onCreated(res.customer, res.created);
    } catch (e) { setErr((e as Error).message || "Could not add the customer."); }
    finally { setBusy(false); }
  };
  return (
    <div role="dialog" aria-label="New customer" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 380, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>New customer</div>
        <label style={label}>Phone<input ref={phoneRef} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={field} placeholder="7XXXXXX" /></label>
        <label style={label}>Name (optional)<input value={name} onChange={(e) => setName(e.target.value)} style={field} /></label>
        <div style={{ fontSize: 11, color: "#64748B" }}>If the phone is already a customer, that customer opens instead.</div>
        {err && <div style={errorBox}>{err}</div>}
        <FormButtons busy={busy} onCancel={onCancel} onSave={() => void save()} saveLabel="Add customer" />
      </div>
    </div>
  );
}

function FormButtons({ busy, onCancel, onSave, saveLabel }: { busy: boolean; onCancel: () => void; onSave: () => void; saveLabel: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" onClick={onCancel} disabled={busy} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
      <button type="button" onClick={onSave} disabled={busy} style={{ ...primaryBtn, flex: 1 }}>{busy ? "Saving…" : saveLabel}</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E2E8F0", padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Stat({ label: l, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", fontSize: 13, color: strong ? "#92400E" : "#475569", fontWeight: strong ? 700 : 500 }}>
      <span>{l}</span><span style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        flexShrink: 0, whiteSpace: "nowrap", minHeight: 32, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${on ? "#0F172A" : "#CBD5E1"}`, background: on ? "#0F172A" : "#fff",
        color: on ? "#fff" : "#334155", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function pill(selected: boolean, tone: "brand" | "amber" | "gray"): React.CSSProperties {
  const tones = {
    brand: selected ? { bg: "#7C2D12", fg: "#FED7AA" } : { bg: "#F9F1EC", fg: "#B74B0C" },
    amber: selected ? { bg: "#78350F", fg: "#FDE68A" } : { bg: "#FEF3C7", fg: "#92400E" },
    gray: selected ? { bg: "#334155", fg: "#CBD5E1" } : { bg: "#F1F5F9", fg: "#475569" },
  }[tone];
  return { padding: "1px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: tones.bg, color: tones.fg };
}

function statusColour(status: string): string {
  if (["completed", "paid", "delivered"].includes(status)) return "#15803D";
  if (["cancelled", "void", "voided", "refunded"].includes(status)) return "#B91C1C";
  return "#475569";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", minHeight: 40, padding: "8px 10px", borderRadius: 8,
  border: "1px solid #CBD5E1", fontSize: 14, background: "#fff", color: "#0F172A", fontFamily: "inherit",
};
const label: React.CSSProperties = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: "#64748B" };
const checkRow: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#334155" };
const primaryBtn: React.CSSProperties = {
  minHeight: 40, padding: "0 14px", borderRadius: 10, border: "none", background: "#B74B0C",
  color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const secondaryBtn: React.CSSProperties = {
  minHeight: 40, padding: "0 14px", borderRadius: 10, border: "1px solid #CBD5E1", background: "#fff",
  color: "#334155", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};
const errorBox: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, background: "#FEE2E2", color: "#B91C1C", fontSize: 13 };
const okBox: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, background: "#ECFDF5", color: "#047857", fontSize: 13, border: "1px solid #A7F3D0" };
