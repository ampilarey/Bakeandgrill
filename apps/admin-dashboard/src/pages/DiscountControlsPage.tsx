import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import {
  getDiscountControls,
  updateDiscountControls,
  type DiscountApprover,
  type DiscountControls,
  type DiscountRoleCap,
} from '../api';
import { usePageTitle } from '../hooks/usePageTitle';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { PageHeader, PageShell, Btn, Input } from '../components/SharedUI';
import { Toggle } from '../components/ui';

type RoleCapRow = {
  role: string;
  percent: string;
  fixed_mvr: string;
};

type ApproverRow = {
  phone: string;
  label: string;
  user_id: string;
};

const sectionStyle: CSSProperties = {
  background: '#FDFAF7',
  border: '1px solid #E8E0D8',
  borderRadius: 16,
  padding: '1.25rem 1.5rem',
  marginBottom: '1.25rem',
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 4px',
  fontSize: 15,
  fontWeight: 700,
  color: '#3D2B1F',
};

const sectionHintStyle: CSSProperties = {
  margin: '0 0 14px',
  fontSize: 13,
  color: '#9C8E7E',
  lineHeight: 1.45,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  marginBottom: 8,
};

function roleCapsToRows(caps: Record<string, DiscountRoleCap>): RoleCapRow[] {
  return Object.entries(caps).map(([role, cap]) => ({
    role,
    percent: cap.percent != null ? String(cap.percent) : '',
    fixed_mvr: cap.fixed_mvr != null && Number(cap.fixed_mvr) > 0 ? String(cap.fixed_mvr) : '',
  }));
}

function rowsToRoleCaps(rows: RoleCapRow[]): Record<string, DiscountRoleCap> {
  const out: Record<string, DiscountRoleCap> = {};
  for (const row of rows) {
    const role = row.role.trim();
    if (!role) continue;
    const cap: DiscountRoleCap = {};
    if (row.percent.trim() !== '') {
      const p = Number(row.percent);
      if (!Number.isNaN(p)) cap.percent = Math.max(0, Math.min(100, Math.round(p)));
    }
    if (row.fixed_mvr.trim() !== '') {
      const f = Number(row.fixed_mvr);
      if (!Number.isNaN(f) && f > 0) cap.fixed_mvr = f;
    }
    if (cap.percent != null || cap.fixed_mvr != null) {
      out[role] = cap;
    }
  }
  return out;
}

function approversToRows(approvers: DiscountApprover[]): ApproverRow[] {
  return approvers.map((a) => ({
    phone: a.phone ?? '',
    label: a.label ?? '',
    user_id: a.user_id != null ? String(a.user_id) : '',
  }));
}

function rowsToApprovers(rows: ApproverRow[]): DiscountApprover[] {
  const out: DiscountApprover[] = [];
  for (const r of rows) {
    const phone = r.phone.trim();
    if (!phone) continue;
    const uid = r.user_id.trim();
    out.push({
      phone,
      label: r.label.trim(),
      user_id: uid !== '' && !Number.isNaN(Number(uid)) ? Number(uid) : null,
    });
  }
  return out;
}

function applyControls(
  data: DiscountControls,
  setters: {
    setEnabled: (v: boolean) => void;
    setMaxPercent: (v: number) => void;
    setMaxFixed: (v: string) => void;
    setRoleRows: (v: RoleCapRow[]) => void;
    setReasonRequired: (v: boolean) => void;
    setReasons: (v: string[]) => void;
    setApprovalRequired: (v: boolean) => void;
    setApproverRows: (v: ApproverRow[]) => void;
    setTtl: (v: number) => void;
    setMaxAttempts: (v: number) => void;
    setRolesWithDiscounts: (v: string[]) => void;
    setRolesWithOverride: (v: string[]) => void;
  },
) {
  setters.setEnabled(data.discount_manual_enabled);
  setters.setMaxPercent(data.discount_max_percent);
  setters.setMaxFixed(
    data.discount_max_fixed_mvr > 0 ? String(data.discount_max_fixed_mvr) : '',
  );
  setters.setRoleRows(roleCapsToRows(data.discount_role_caps ?? {}));
  setters.setReasonRequired(data.discount_reason_required);
  setters.setReasons([...(data.discount_reasons ?? [])]);
  setters.setApprovalRequired(data.discount_approval_required);
  setters.setApproverRows(approversToRows(data.discount_approval_approvers ?? []));
  setters.setTtl(data.discount_approval_code_ttl_minutes);
  setters.setMaxAttempts(data.discount_approval_max_attempts);
  setters.setRolesWithDiscounts(data.roles_with_discounts ?? []);
  setters.setRolesWithOverride(data.roles_with_override ?? []);
}

export function DiscountControlsPage() {
  usePageTitle('Discount Controls');
  const { can } = useCurrentUserPermissions();
  const canManage = can('discounts.settings.manage');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const [enabled, setEnabled] = useState(true);
  const [maxPercent, setMaxPercent] = useState(100);
  const [maxFixed, setMaxFixed] = useState('');
  const [roleRows, setRoleRows] = useState<RoleCapRow[]>([]);
  const [reasonRequired, setReasonRequired] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [newReason, setNewReason] = useState('');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approverRows, setApproverRows] = useState<ApproverRow[]>([]);
  const [ttl, setTtl] = useState(10);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [rolesWithDiscounts, setRolesWithDiscounts] = useState<string[]>([]);
  const [rolesWithOverride, setRolesWithOverride] = useState<string[]>([]);

  const setters = {
    setEnabled,
    setMaxPercent,
    setMaxFixed,
    setRoleRows,
    setReasonRequired,
    setReasons,
    setApprovalRequired,
    setApproverRows,
    setTtl,
    setMaxAttempts,
    setRolesWithDiscounts,
    setRolesWithOverride,
  };

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getDiscountControls();
      applyControls(data, setters);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load discount controls');
    } finally {
      setLoading(false);
    }
    // setters are stable state setters — omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!canManage) return;
    const cleanedReasons = reasons.map((r) => r.trim()).filter(Boolean);
    if (cleanedReasons.length === 0) {
      setError('At least one discount reason is required.');
      return;
    }
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      const fixed = maxFixed.trim() === '' ? 0 : Number(maxFixed);
      const data = await updateDiscountControls({
        discount_manual_enabled: enabled,
        discount_max_percent: Math.max(0, Math.min(100, Math.round(maxPercent))),
        discount_max_fixed_mvr: Number.isNaN(fixed) ? 0 : Math.max(0, fixed),
        discount_role_caps: rowsToRoleCaps(roleRows),
        discount_reason_required: reasonRequired,
        discount_reasons: cleanedReasons,
        discount_approval_required: approvalRequired,
        discount_approval_approvers: rowsToApprovers(approverRows),
        discount_approval_code_ttl_minutes: Math.max(1, Math.min(60, Math.round(ttl))),
        discount_approval_max_attempts: Math.max(1, Math.min(20, Math.round(maxAttempts))),
      });
      applyControls(data, setters);
      setSavedMsg('Saved.');
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const moveReason = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= reasons.length) return;
    setReasons((prev) => {
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  };

  if (!canManage) {
    return (
      <PageShell>
        <PageHeader title="Discount Controls" section="Customers & Marketing" />
        <p style={{ color: '#9C8E7E' }}>
          You need the <code>discounts.settings.manage</code> permission to view this page.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Discount Controls"
        section="Customers & Marketing"
        subtitle="Caps, reasons, and SMS approval for manual POS discounts"
        action={
          <Btn onClick={() => void handleSave()} disabled={saving || loading}>
            <Save size={14} />
            {saving ? 'Saving…' : 'Save changes'}
          </Btn>
        }
      />

      {error && <p style={{ color: '#B91C1C', marginBottom: 12 }}>{error}</p>}
      {savedMsg && <p style={{ color: '#166534', marginBottom: 12 }}>{savedMsg}</p>}

      {loading ? (
        <p style={{ color: '#9C8E7E' }}>Loading…</p>
      ) : (
        <>
          {/* Global switch */}
          <section style={sectionStyle} aria-labelledby="dc-global">
            <h2 id="dc-global" style={sectionTitleStyle}>Manual discounts</h2>
            <p style={sectionHintStyle}>
              When off, cashiers cannot apply any manual POS discount — regardless of role.
            </p>
            <Toggle
              checked={enabled}
              onChange={setEnabled}
              label={enabled ? 'Manual discounts enabled' : 'Manual discounts disabled'}
            />
          </section>

          {/* Max caps */}
          <section style={sectionStyle} aria-labelledby="dc-max">
            <h2 id="dc-max" style={sectionTitleStyle}>Maximum discount</h2>
            <p style={sectionHintStyle}>
              Global ceiling as a percent of subtotal. Optional fixed MVR cap (leave blank or 0 to disable).
              Caps always apply — approval never raises them.
            </p>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label htmlFor="dc-max-percent" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Max percent ({maxPercent}%)
                </label>
                <input
                  id="dc-max-percent"
                  type="range"
                  min={0}
                  max={100}
                  value={maxPercent}
                  onChange={(e) => setMaxPercent(Number(e.target.value))}
                  aria-label="Max discount percent"
                  style={{ width: '100%', accentColor: '#D4813A' }}
                />
                <Input
                  label="Or type percent"
                  type="number"
                  min={0}
                  max={100}
                  value={String(maxPercent)}
                  onChange={(v) => setMaxPercent(Math.max(0, Math.min(100, Number(v) || 0)))}
                />
              </div>
              <Input
                label="Max fixed MVR (optional)"
                type="number"
                min={0}
                step="0.01"
                placeholder="0 = off"
                value={maxFixed}
                onChange={setMaxFixed}
              />
            </div>
          </section>

          {/* Per-role caps */}
          <section style={sectionStyle} aria-labelledby="dc-roles">
            <h2 id="dc-roles" style={sectionTitleStyle}>Per-role caps</h2>
            <p style={sectionHintStyle}>
              Optional tighter ceilings by role slug (e.g. <code>staff</code>, <code>manager</code>).
              Empty list = global max applies to everyone.
            </p>
            {roleRows.length === 0 && (
              <p style={{ fontSize: 13, color: '#9C8E7E', marginBottom: 10 }}>No per-role overrides.</p>
            )}
            {roleRows.map((row, i) => (
              <div key={i} style={rowStyle}>
                <Input
                  label="Role slug"
                  value={row.role}
                  onChange={(v) => setRoleRows((prev) => prev.map((r, j) => (j === i ? { ...r, role: v } : r)))}
                  placeholder="staff"
                  style={{ minWidth: 120 }}
                />
                <Input
                  label="Percent"
                  type="number"
                  min={0}
                  max={100}
                  value={row.percent}
                  onChange={(v) => setRoleRows((prev) => prev.map((r, j) => (j === i ? { ...r, percent: v } : r)))}
                  placeholder="global"
                  style={{ width: 100 }}
                />
                <Input
                  label="Fixed MVR"
                  type="number"
                  min={0}
                  value={row.fixed_mvr}
                  onChange={(v) => setRoleRows((prev) => prev.map((r, j) => (j === i ? { ...r, fixed_mvr: v } : r)))}
                  placeholder="optional"
                  style={{ width: 120 }}
                />
                <Btn
                  variant="ghost"
                  small
                  aria-label={`Remove role cap ${row.role || i + 1}`}
                  onClick={() => setRoleRows((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Btn>
              </div>
            ))}
            <Btn
              variant="secondary"
              small
              onClick={() => setRoleRows((prev) => [...prev, { role: '', percent: '', fixed_mvr: '' }])}
            >
              <Plus size={14} />
              Add role cap
            </Btn>
          </section>

          {/* Reasons */}
          <section style={sectionStyle} aria-labelledby="dc-reasons">
            <h2 id="dc-reasons" style={sectionTitleStyle}>Discount reasons</h2>
            <p style={sectionHintStyle}>
              Preset reasons cashiers pick on POS. Optional free-text note is always allowed when a reason is chosen.
            </p>
            <div style={{ marginBottom: 14 }}>
              <Toggle
                checked={reasonRequired}
                onChange={setReasonRequired}
                label={reasonRequired ? 'Reason required' : 'Reason optional'}
              />
            </div>
            {reasons.map((reason, i) => (
              <div key={i} style={rowStyle}>
                <Input
                  label={i === 0 ? 'Reason' : undefined}
                  value={reason}
                  onChange={(v) => setReasons((prev) => prev.map((r, j) => (j === i ? v : r)))}
                  style={{ flex: 1, minWidth: 180 }}
                />
                <Btn variant="ghost" small aria-label={`Move reason up ${i + 1}`} disabled={i === 0} onClick={() => moveReason(i, -1)}>
                  <ArrowUp size={14} />
                </Btn>
                <Btn variant="ghost" small aria-label={`Move reason down ${i + 1}`} disabled={i === reasons.length - 1} onClick={() => moveReason(i, 1)}>
                  <ArrowDown size={14} />
                </Btn>
                <Btn
                  variant="ghost"
                  small
                  aria-label={`Remove reason ${reason || i + 1}`}
                  disabled={reasons.length <= 1}
                  onClick={() => setReasons((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Btn>
              </div>
            ))}
            <div style={{ ...rowStyle, marginTop: 8 }}>
              <Input
                label="New reason"
                value={newReason}
                onChange={setNewReason}
                placeholder="e.g. Loyal customer"
                style={{ flex: 1, minWidth: 180 }}
              />
              <Btn
                variant="secondary"
                small
                onClick={() => {
                  const t = newReason.trim();
                  if (!t) return;
                  setReasons((prev) => [...prev, t]);
                  setNewReason('');
                }}
              >
                <Plus size={14} />
                Add
              </Btn>
            </div>
          </section>

          {/* SMS approval */}
          <section style={sectionStyle} aria-labelledby="dc-approval">
            <h2 id="dc-approval" style={sectionTitleStyle}>SMS approval</h2>
            <p style={sectionHintStyle}>
              When on, every manual discount requires a one-time code sent by SMS to the approvers below.
              Codes expire and are attempt-limited. Approval never exceeds the configured caps.
            </p>
            <div style={{ marginBottom: 14 }}>
              <Toggle
                checked={approvalRequired}
                onChange={setApprovalRequired}
                label={approvalRequired ? 'SMS approval required' : 'SMS approval off'}
              />
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <Input
                label="Code TTL (minutes)"
                type="number"
                min={1}
                max={60}
                value={String(ttl)}
                onChange={(v) => setTtl(Number(v) || 1)}
              />
              <Input
                label="Max wrong attempts"
                type="number"
                min={1}
                max={20}
                value={String(maxAttempts)}
                onChange={(v) => setMaxAttempts(Number(v) || 1)}
              />
            </div>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#6B5D4F' }}>Approvers</h3>
            {approverRows.length === 0 && (
              <p style={{ fontSize: 13, color: '#9C8E7E', marginBottom: 10 }}>
                No approvers yet. Add at least one phone before turning approval on.
              </p>
            )}
            {approverRows.map((row, i) => (
              <div key={i} style={rowStyle}>
                <Input
                  label="Phone"
                  value={row.phone}
                  onChange={(v) => setApproverRows((prev) => prev.map((r, j) => (j === i ? { ...r, phone: v } : r)))}
                  placeholder="7XXXXXX"
                  style={{ minWidth: 140 }}
                />
                <Input
                  label="Label"
                  value={row.label}
                  onChange={(v) => setApproverRows((prev) => prev.map((r, j) => (j === i ? { ...r, label: v } : r)))}
                  placeholder="Owner"
                  style={{ minWidth: 120 }}
                />
                <Input
                  label="User ID (optional)"
                  type="number"
                  value={row.user_id}
                  onChange={(v) => setApproverRows((prev) => prev.map((r, j) => (j === i ? { ...r, user_id: v } : r)))}
                  placeholder="—"
                  style={{ width: 120 }}
                />
                <Btn
                  variant="ghost"
                  small
                  aria-label={`Remove approver ${row.label || row.phone || i + 1}`}
                  onClick={() => setApproverRows((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </Btn>
              </div>
            ))}
            <Btn
              variant="secondary"
              small
              onClick={() => setApproverRows((prev) => [...prev, { phone: '', label: '', user_id: '' }])}
            >
              <Plus size={14} />
              Add approver
            </Btn>
          </section>

          {/* Roles note */}
          <section style={sectionStyle} aria-labelledby="dc-perm-note">
            <h2 id="dc-perm-note" style={sectionTitleStyle}>Who can discount</h2>
            <p style={sectionHintStyle}>
              Read-only from Roles & Permissions. Change grants under{' '}
              <Link to="/settings?tab=permissions" style={{ color: '#D4813A' }}>Roles & Permissions</Link>.
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#3D2B1F' }}>
              <strong>promotions.discounts:</strong>{' '}
              {rolesWithDiscounts.length ? rolesWithDiscounts.join(', ') : 'None'}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#3D2B1F' }}>
              <strong>promotions.discount_override:</strong>{' '}
              {rolesWithOverride.length ? rolesWithOverride.join(', ') : 'None'}
            </p>
          </section>
        </>
      )}
    </PageShell>
  );
}

export default DiscountControlsPage;
