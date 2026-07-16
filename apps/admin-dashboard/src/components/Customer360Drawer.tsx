import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchCustomerGrowthSummary, fetchCustomerActivity,
  attachCustomerTag, detachCustomerTag, addCustomerFollowUpNote, sendCustomerSms,
  updateAdminCustomer,
  type CustomerGrowthSummary, type CustomerActivityEvent,
} from '../api';
import { Badge, Btn, ErrorMsg, Input, Spinner } from './SharedUI';
import { CustomerCreditSection } from './CustomerCreditSection';
import { CustomerDepositSection } from './CustomerDepositSection';
import { useCurrentUserPermissions } from '../hooks/usePermissions';
import { smsCharCount } from '../utils/smsCharCount';

function timelineEventPath(ev: CustomerActivityEvent): string | null {
  if (!ev.source_id) return null;
  if (ev.type.startsWith('order_')) return `/orders?order=${ev.source_id}`;
  if (ev.type.startsWith('invoice_') || ev.type === 'invoice') return `/invoices?invoice=${ev.source_id}`;
  if (ev.type === 'review' || ev.type.startsWith('review_')) return `/reviews`;
  return null;
}

const BADGE_MAP: Record<string, { label: string; color: string }> = {
  vip: { label: 'VIP', color: 'yellow' },
  new: { label: 'New', color: 'green' },
  returning: { label: 'Returning', color: 'blue' },
  dormant: { label: 'Dormant', color: 'gray' },
  credit: { label: 'Credit', color: 'orange' },
  sms_off: { label: 'SMS off', color: 'red' },
  incomplete: { label: 'Incomplete', color: 'gray' },
};

type Props = {
  customerId: number;
  onClose: () => void;
};

export function Customer360Drawer({ customerId, onClose }: Props) {
  const { can } = useCurrentUserPermissions();
  const [summary, setSummary] = useState<CustomerGrowthSummary | null>(null);
  const [timeline, setTimeline] = useState<CustomerActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tagName, setTagName] = useState('');
  const [followNote, setFollowNote] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, a] = await Promise.all([
        fetchCustomerGrowthSummary(customerId),
        fetchCustomerActivity(customerId),
      ]);
      setSummary(s.summary);
      setTimeline(a.timeline ?? []);
      const dob = (s.summary.profile as { date_of_birth?: string | null }).date_of_birth;
      setDateOfBirth(dob ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [customerId]);

  const profile = summary?.profile as {
    name?: string;
    phone?: string;
    email?: string;
    internal_notes?: string;
    date_of_birth?: string | null;
  } | undefined;

  const handleSaveDob = async () => {
    setSaving(true);
    setActionError('');
    try {
      await updateAdminCustomer(customerId, { date_of_birth: dateOfBirth || null });
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = async () => {
    if (!tagName.trim()) return;
    setSaving(true);
    setActionError('');
    try {
      await attachCustomerTag(customerId, { name: tagName.trim() });
      setTagName('');
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followNote.trim()) return;
    setSaving(true);
    setActionError('');
    try {
      await addCustomerFollowUpNote(customerId, { note: followNote.trim() });
      setFollowNote('');
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const smsInfo = useMemo(() => smsCharCount(smsMessage), [smsMessage]);

  const handleSendSms = async () => {
    if (!smsMessage.trim()) return;
    setSaving(true);
    setActionError('');
    try {
      await sendCustomerSms(customerId, smsMessage.trim());
      setSmsMessage('');
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,20,8,0.35)', zIndex: 55 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 56,
        width: 'min(520px, 100vw)', background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F0EAE3', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 17, color: '#1C1408' }}>Customer 360</p>
            <p style={{ margin: 0, fontSize: 12, color: '#9C8E7E' }}>{profile?.name ?? profile?.phone ?? `#${customerId}`}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9C8E7E' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
        ) : error ? (
          <div style={{ padding: 20 }}><ErrorMsg message={error} /></div>
        ) : summary ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(summary.badges ?? []).map((b) => (
                <Badge key={b} color={BADGE_MAP[b]?.color ?? 'gray'}>{BADGE_MAP[b]?.label ?? b}</Badge>
              ))}
            </div>

            <div className="stat-grid" data-responsive-grid style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {[
                { label: 'Paid orders', value: String(summary.lifetime.paid_orders_count) },
                { label: 'Lifetime spend', value: `MVR ${summary.lifetime.total_paid_spend.toFixed(2)}` },
                { label: 'Avg order', value: `MVR ${summary.lifetime.average_order_value.toFixed(2)}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#FAF7F3', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: 800, color: '#D4813A', fontSize: 14 }}>{value}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9C8E7E' }}>{label}</p>
                </div>
              ))}
            </div>

            <div data-responsive-grid style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              <div><strong>Loyalty:</strong> {(summary.loyalty as { points_balance?: number }).points_balance ?? 0} pts</div>
              <div><strong>Reviews:</strong> {summary.reviews.count} ({summary.reviews.average_rating}★)</div>
              <div><strong>Referrals:</strong> {summary.referral.redemptions_as_referee} used</div>
              <div><strong>SMS sent:</strong> {summary.sms.messages_sent}</div>
              {summary.most_used_order_type && <div><strong>Pref. type:</strong> {summary.most_used_order_type}</div>}
              {summary.lifetime.days_since_last_order != null && (
                <div><strong>Last order:</strong> {summary.lifetime.days_since_last_order}d ago</div>
              )}
            </div>

            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Date of birth</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  type="date"
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  style={{ flex: 1 }}
                />
                <Btn small onClick={() => void handleSaveDob()} disabled={saving}>Save</Btn>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9C8E7E' }}>
                Used for birthday loyalty SMS when enabled in Customer Growth → Marketing.
              </p>
            </div>

            {summary.favourite_items.length > 0 && (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Favourite items</p>
                {summary.favourite_items.map((i) => (
                  <p key={i.item_id} style={{ margin: '2px 0', fontSize: 13 }}>{i.name} × {i.quantity}</p>
                ))}
              </div>
            )}

            {(can('customers.credit.manage') || can('customers.credit.repay')) && (
              <CustomerCreditSection customerId={customerId} />
            )}

            {(can('customers.deposit.view') || can('customers.deposit.manage') || can('customers.deposit.receive')
              || can('customers.deposit.adjust') || can('customers.deposit.refund') || can('customers.deposit.freeze')
              || can('customers.deposit.transfer_credit')) && (
              <CustomerDepositSection customerId={customerId} />
            )}

            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Tags</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {summary.tags.map((t) => (
                  <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FAF7F3', borderRadius: 999, padding: '4px 10px', fontSize: 12 }}>
                    {t.name}
                    <button type="button" onClick={() => void detachCustomerTag(customerId, t.id).then(reload)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9C8E7E' }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={tagName} onChange={setTagName} placeholder="New tag name" />
                <Btn small onClick={handleAddTag} disabled={saving}>Add</Btn>
              </div>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Follow-up note</p>
              <textarea
                value={followNote}
                onChange={(e) => setFollowNote(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13 }}
                placeholder="Call back about…"
              />
              <Btn small onClick={handleFollowUp} disabled={saving} style={{ marginTop: 8 }}>Save note</Btn>
            </div>

            {can('integrations.sms') && (
              <div>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Send SMS</p>
                {summary.sms.opt_out && (
                  <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 8px' }}>
                    Customer has opted out of SMS — sending is blocked.
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: smsInfo.segments > 1 || smsInfo.isUnicode ? '#ef4444' : '#9C8E7E' }}>
                    {smsInfo.chars} chars · {smsInfo.segments} segment{smsInfo.segments !== 1 ? 's' : ''} · {smsInfo.encoding}
                  </span>
                </div>
                <textarea
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  rows={3}
                  disabled={summary.sms.opt_out}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #E8E0D8', fontFamily: 'inherit', fontSize: 13 }}
                  placeholder="Message to customer…"
                />
                <Btn small onClick={handleSendSms} disabled={saving || summary.sms.opt_out} style={{ marginTop: 8 }}>Send SMS</Btn>
              </div>
            )}

            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6B5D4F' }}>Activity timeline</p>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {timeline.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9C8E7E' }}>No activity yet.</p>
                ) : timeline.map((ev, idx) => {
                  const path = timelineEventPath(ev);
                  return (
                  <div key={`${ev.type}-${ev.source_id ?? idx}`} style={{ padding: '8px 0', borderBottom: '1px solid #F0EBE5' }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
                      {path ? (
                        <Link to={path} style={{ color: '#D4813A', textDecoration: 'none' }}>{ev.title}</Link>
                      ) : ev.title}
                    </p>
                    <p style={{ margin: '2px 0', fontSize: 12, color: '#6B5D4F' }}>{ev.description}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#9C8E7E' }}>{new Date(ev.created_at).toLocaleString()}</p>
                  </div>
                  );
                })}
              </div>
            </div>

            {actionError && <ErrorMsg message={actionError} />}
          </div>
        ) : null}
      </div>
    </>
  );
}

export { BADGE_MAP };
