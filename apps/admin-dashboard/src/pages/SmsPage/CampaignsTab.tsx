import { useEffect, useState } from 'react';
import {
  fetchSmsCampaigns, previewSmsCampaign, createSmsCampaign,
  sendSmsCampaign, cancelSmsCampaign, testSendSmsCampaign,
  fetchSmsCampaignRecipes, fetchSmsAudiences, createSmsAudience, deleteSmsAudience, fetchAdminCategories,
  type SmsCampaign, type SmsAudience, type SmsAudienceCriteria, type SmsCampaignRecipe, type MenuCategory,
} from '../../api';
import {
  Badge, Btn, Card, ConfirmDialog, EmptyState, ErrorMsg, Input, Spinner, TableCard, TD, statColor, useConfirmDialog,
} from '../../components/SharedUI';
import { SortFilterHead, useSortFilter } from '../../components/TableControls';
import { smsCharCount } from '../../utils/smsCharCount';
import { AudienceBuilder, criteriaIsEmpty } from './AudienceBuilder';

type PreviewResult = {
  recipient_count: number;
  audience_summary?: string;
  daily_cap?: { cap: number; used_24h: number; remaining: number | null; blocked: boolean };
  total_cost_mvr: string;
  ab_test_enabled?: boolean;
  ab_split?: { variant_a: number; variant_b: number };
  sample_recipients?: Array<{ name: string; phone: string; tier: string }>;
};

type CampaignPrefill = {
  create?: boolean;
  segment?: string;
  message?: string;
};

const DEFAULT_CRITERIA: SmsAudienceCriteria = {};

/*
 * SMS audit, 2026-09-24: a campaign is built from what customers bought
 * (AudienceBuilder), can start from a recipe or a saved audience, can be
 * saved as an audience, and can be sent to the signed-in user first.
 */
export function CampaignsTab({ prefill }: { prefill?: CampaignPrefill } = {}) {
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const campaignCtl = useSortFilter(campaigns, [
    { key: 'name', label: 'Name', get: (c) => c.name },
    { key: 'audience', label: 'Audience', get: (c) => c.audience_summary ?? '' },
    { key: 'status', label: 'Status', kind: 'select', get: (c) => c.status },
    { key: 'recipients', label: 'Recipients', kind: 'number', get: (c) => c.total_recipients },
    { key: 'sent', label: 'Sent', kind: 'number', get: (c) => c.sent_count },
    { key: 'results', label: 'A/B' },
    { key: 'cost', label: 'Cost', kind: 'number', get: (c) => (c.total_cost_mvr == null ? null : Number(c.total_cost_mvr)) },
    { key: 'created', label: 'Created', get: (c) => c.created_at },
    { key: 'actions', label: '' },
  ], 'sms-campaigns');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const { state: dlg, ask, close: closeDlg } = useConfirmDialog();

  const [recipes, setRecipes] = useState<SmsCampaignRecipe[]>([]);
  const [segments, setSegments] = useState<Array<{ slug: string; label: string }>>([]);
  const [orderTypes, setOrderTypes] = useState<Record<string, string>>({});
  const [audiences, setAudiences] = useState<SmsAudience[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [messageB, setMessageB] = useState('');
  const [abEnabled, setAbEnabled] = useState(false);
  const [abSplit, setAbSplit] = useState(50);
  const [criteria, setCriteria] = useState<SmsAudienceCriteria>(DEFAULT_CRITERIA);
  const [recipeKey, setRecipeKey] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingAudience, setSavingAudience] = useState(false);
  const [audienceName, setAudienceName] = useState('');
  const [namingAudience, setNamingAudience] = useState(false);

  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(''), 4000); };

  const resetForm = () => {
    setCreating(false);
    setName('');
    setMessage('');
    setMessageB('');
    setAbEnabled(false);
    setAbSplit(50);
    setCriteria(DEFAULT_CRITERIA);
    setRecipeKey('');
    setScheduledAt('');
    setPreview(null);
    setNamingAudience(false);
    setAudienceName('');
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchSmsCampaigns();
      setCampaigns(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadBuilder = async () => {
    try {
      const [r, a, c] = await Promise.all([fetchSmsCampaignRecipes(), fetchSmsAudiences(), fetchAdminCategories()]);
      setRecipes(r.recipes ?? []);
      setSegments(r.segments ?? []);
      setOrderTypes(r.order_types ?? {});
      setAudiences(a.audiences ?? []);
      setCategories(c.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void load(); void loadBuilder(); }, []);

  useEffect(() => {
    if (!prefill?.create && !prefill?.segment && !prefill?.message) return;
    setCreating(true);
    if (prefill.message) setMessage(prefill.message);
    const seg = prefill.segment || '';
    if (seg && seg !== 'all') {
      setCriteria({ segment: seg });
      setName((prev) => prev || `${seg.replace(/_/g, ' ')} campaign`);
    }
  }, [prefill?.create, prefill?.segment, prefill?.message]);

  const applyRecipe = (key: string) => {
    setRecipeKey(key);
    setPreview(null);
    const recipe = recipes.find((r) => r.key === key);
    if (!recipe) return;
    setCriteria({ ...recipe.criteria });
    setMessage(recipe.message);
    setName((prev) => prev || recipe.label);
  };

  const recipe = recipes.find((r) => r.key === recipeKey);
  const recipeNeeds = recipe?.needs === 'item' && !criteria.likes_item_id && !(criteria.bought_item_ids?.length)
    ? 'Pick the item this recipe is about.'
    : recipe?.needs === 'category' && !(criteria.bought_category_ids?.length)
      ? 'Pick the category this recipe is about.'
      : '';

  const buildPayload = () => ({
    message,
    ...(abEnabled ? {
      ab_test_enabled: true,
      message_variant_b: messageB,
      ab_split_percent: abSplit,
    } : {}),
    target_criteria: criteria,
  });

  const handlePreview = async () => {
    if (!message || (abEnabled && !messageB)) return;
    setPreviewing(true);
    try {
      const res = await previewSmsCampaign(buildPayload());
      setPreview(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreate = async () => {
    if (!name || !message || (abEnabled && !messageB) || recipeNeeds) return;
    setSaving(true);
    try {
      await createSmsCampaign({
        name,
        ...buildPayload(),
        ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
      });
      resetForm();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (body: string, bodyB?: string | null) => {
    if (!body) return;
    setTesting(true);
    try {
      const res = await testSendSmsCampaign({ message: body, ...(bodyB ? { message_variant_b: bodyB } : {}) });
      flash(res.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAudience = async () => {
    if (!audienceName.trim() || criteriaIsEmpty(criteria)) return;
    setSavingAudience(true);
    try {
      const { audience_id: _base, ...own } = criteria;
      void _base;
      const res = await createSmsAudience({ name: audienceName.trim(), criteria: own });
      setAudiences((prev) => [...prev, res.audience].sort((a, b) => a.name.localeCompare(b.name)));
      setNamingAudience(false);
      setAudienceName('');
      flash(`Audience "${res.audience.name}" saved (${res.audience.count} customers).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingAudience(false);
    }
  };

  const handleDeleteAudience = (a: SmsAudience) => {
    ask({
      title: 'Delete audience',
      message: `Delete the saved audience "${a.name}"? Campaigns built on it keep their own filters.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteSmsAudience(a.id);
          setAudiences((prev) => prev.filter((x) => x.id !== a.id));
          if (criteria.audience_id === a.id) setCriteria(({ audience_id: _gone, ...rest }) => { void _gone; return rest; });
        } catch (e) { setError((e as Error).message); }
      },
    });
  };

  const handleSend = (id: number) => {
    ask({
      title: 'Send Campaign',
      message: 'Send this campaign to all recipients? This cannot be undone.',
      confirmLabel: 'Send',
      onConfirm: async () => {
        setActionId(id);
        try { await sendSmsCampaign(id); await load(); }
        catch (e) { setError((e as Error).message); }
        finally { setActionId(null); }
      },
    });
  };

  const handleCancel = (id: number) => {
    ask({
      title: 'Cancel Campaign',
      message: 'Cancel this campaign? It will not be sent.',
      confirmLabel: 'Cancel Campaign',
      danger: true,
      onConfirm: async () => {
        setActionId(id);
        try { await cancelSmsCampaign(id); await load(); }
        catch (e) { setError((e as Error).message); }
        finally { setActionId(null); }
      },
    });
  };

  const segA = smsCharCount(message);
  const segB = smsCharCount(messageB);
  const textareaStyle: React.CSSProperties = { width: '100%', border: '1px solid var(--color-border)', borderRadius: 9, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 };

  return (
    <>
      <ConfirmDialog state={dlg} close={closeDlg} />
      {error && <ErrorMsg message={error} />}
      {notice && <div role="status" data-testid="campaign-notice" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-strong)', borderRadius: 9, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{notice}</div>}

      {!creating && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
          <Btn onClick={() => setCreating(true)}>+ New Campaign</Btn>
          {audiences.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Saved audiences: {audiences.map((a) => `${a.name} (${a.count})`).join(' · ')}
            </span>
          )}
        </div>
      )}

      {creating && (
        <Card style={{ marginBottom: 24 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>New SMS Campaign</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Campaign Name</label>
              <Input value={name} onChange={setName} placeholder="e.g. Eid Special Offer" />
            </div>
            <div>
              <label style={labelStyle}>Start from a recipe</label>
              <select aria-label="Recipe" value={recipeKey} onChange={(e) => applyRecipe(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' }}>
                <option value="">Blank</option>
                {recipes.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              {recipe && <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{recipe.description}</p>}
            </div>
          </div>

          <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>Audience</strong>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {namingAudience ? (
                  <>
                    <Input value={audienceName} onChange={setAudienceName} placeholder="Audience name" aria-label="Audience name" style={{ minWidth: 200 }} />
                    <Btn small onClick={handleSaveAudience} disabled={savingAudience || !audienceName.trim()}>{savingAudience ? 'Saving…' : 'Save'}</Btn>
                    <Btn small variant="ghost" onClick={() => setNamingAudience(false)}>Cancel</Btn>
                  </>
                ) : (
                  <Btn small variant="secondary" onClick={() => setNamingAudience(true)} disabled={criteriaIsEmpty(criteria)}>Save as audience</Btn>
                )}
                {criteria.audience_id && (
                  <Btn small variant="ghost" onClick={() => { const a = audiences.find((x) => x.id === criteria.audience_id); if (a) handleDeleteAudience(a); }}>Delete saved audience</Btn>
                )}
              </div>
            </div>
            <AudienceBuilder
              value={criteria}
              onChange={(next) => { setCriteria(next); setPreview(null); }}
              categories={categories}
              segments={segments}
              orderTypes={orderTypes}
              audiences={audiences}
            />
            {recipeNeeds && <p data-testid="recipe-needs" style={{ fontSize: 12, color: 'var(--color-warning)', margin: '10px 0 0', fontWeight: 600 }}>{recipeNeeds}</p>}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
            <input type="checkbox" checked={abEnabled} onChange={(e) => { setAbEnabled(e.target.checked); setPreview(null); }} />
            A/B test two message variants
          </label>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{abEnabled ? 'Variant A' : 'Message'}</label>
              <span style={{ fontSize: 11, color: segA.segments > 1 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                {segA.chars} chars · {segA.segments} segment{segA.segments > 1 ? 's' : ''}
                {segA.isUnicode && <span style={{ color: 'var(--color-warning)', fontWeight: 600, marginLeft: 6 }}>Unicode</span>}
              </span>
            </div>
            <textarea
              aria-label="Campaign message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your SMS message here… {name} becomes the customer's first name."
              rows={4}
              style={textareaStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
              {'{name}'} becomes the customer's first name. The unsubscribe line from the Control Center is added to the end automatically.
            </p>
          </div>

          {abEnabled && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Variant B</label>
                  <span style={{ fontSize: 11, color: segB.segments > 1 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                    {segB.chars} chars · {segB.segments} segment{segB.segments > 1 ? 's' : ''}
                    {segB.isUnicode && <span style={{ color: 'var(--color-warning)', fontWeight: 600, marginLeft: 6 }}>Unicode</span>}
                  </span>
                </div>
                <textarea
                  aria-label="Variant B message"
                  value={messageB}
                  onChange={(e) => setMessageB(e.target.value)}
                  placeholder="Alternative message to test…"
                  rows={4}
                  style={textareaStyle}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>
                  Split: {abSplit}% Variant A / {100 - abSplit}% Variant B
                </label>
                <input type="range" min={10} max={90} value={abSplit} onChange={(e) => setAbSplit(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
            </>
          )}

          <div style={{ marginBottom: 14, maxWidth: 320 }}>
            <label style={labelStyle}>Send at (optional)</label>
            <input type="datetime-local" aria-label="Send at" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, fontFamily: 'inherit' }} />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>Leave empty to send by hand from the list. A scheduled draft goes out on its own at that time.</p>
          </div>

          {preview && (
            <div data-testid="campaign-preview" style={{ background: 'var(--color-border-light)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                {preview.recipient_count} recipients · Est. MVR {preview.total_cost_mvr}
              </p>
              {preview.audience_summary && <p style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 4 }}>{preview.audience_summary}</p>}
              {preview.daily_cap && preview.daily_cap.cap > 0 && (
                <p data-testid="campaign-daily-cap" style={{ fontSize: 12, color: preview.daily_cap.blocked ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontWeight: preview.daily_cap.blocked ? 600 : 400, marginBottom: 4 }}>
                  {preview.daily_cap.blocked
                    ? `Over the daily bulk cap: ${preview.daily_cap.used_24h.toLocaleString()} recipients queued in the last 24 hours, ${preview.daily_cap.remaining?.toLocaleString() ?? 0} left of ${preview.daily_cap.cap.toLocaleString()}. Narrow the audience, wait, or raise the cap in the Control Center.`
                    : `Daily bulk cap: ${preview.daily_cap.used_24h.toLocaleString()} used in the last 24 hours, ${preview.daily_cap.remaining?.toLocaleString() ?? 0} left of ${preview.daily_cap.cap.toLocaleString()}.`}
                </p>
              )}
              {preview.ab_split && (
                <p style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 4 }}>
                  Split → A: {preview.ab_split.variant_a} · B: {preview.ab_split.variant_b}
                </p>
              )}
              {preview.sample_recipients && preview.sample_recipients.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
                  e.g. {preview.sample_recipients.map((s) => s.name || s.phone).join(', ')}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={handlePreview} disabled={previewing || !message || (abEnabled && !messageB) || !!recipeNeeds}>
              {previewing ? 'Checking…' : '👁 Preview Audience'}
            </Btn>
            <Btn variant="secondary" onClick={() => handleTest(message, abEnabled ? messageB : null)} disabled={testing || !message}>
              {testing ? 'Sending…' : 'Send a test to me'}
            </Btn>
            <Btn onClick={handleCreate} disabled={saving || !name || !message || (abEnabled && !messageB) || !!recipeNeeds}>
              {saving ? 'Creating…' : scheduledAt ? 'Schedule' : 'Create Draft'}
            </Btn>
            <Btn variant="ghost" onClick={resetForm}>Cancel</Btn>
          </div>
        </Card>
      )}

      {loading && campaigns.length === 0 ? <Spinner /> : campaigns.length === 0 ? (
        <TableCard><EmptyState message="No campaigns yet." /></TableCard>
      ) : (
        <TableCard>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <SortFilterHead controls={campaignCtl} allRows={campaigns} />
            <tbody>
              {campaignCtl.rows.map((c) => (
                <tr key={c.id} data-testid={`campaign-${c.id}`}>
                  <td style={{ ...TD, fontWeight: 600 }}>
                    {c.name}
                    {c.scheduled_at && c.status === 'draft' && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}>Sends {new Date(c.scheduled_at).toLocaleString()}</div>
                    )}
                  </td>
                  <td style={{ ...TD, fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 260 }}>{c.audience_summary ?? '—'}</td>
                  <td style={TD}><Badge label={c.status} color={statColor(c.status)} /></td>
                  <td style={{ ...TD, color: 'var(--color-text-secondary)' }}>{c.total_recipients}</td>
                  <td style={TD}>
                    <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{c.sent_count}</span>
                    {c.failed_count > 0 && <span style={{ color: 'var(--color-danger)', marginLeft: 4 }}>/ {c.failed_count} failed</span>}
                  </td>
                  <td style={{ ...TD, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {c.ab_test_enabled && c.ab_stats ? (
                      <div>
                        <div>A: {c.ab_stats.a.sent} sent ({c.ab_stats.a.delivery_rate}%)</div>
                        <div>B: {c.ab_stats.b.sent} sent ({c.ab_stats.b.delivery_rate}%)</div>
                      </div>
                    ) : c.ab_test_enabled ? `${c.ab_split_percent ?? 50}/${100 - (c.ab_split_percent ?? 50)}` : '—'}
                  </td>
                  <td style={{ ...TD, color: 'var(--color-primary)', fontWeight: 600 }}>MVR {c.total_cost_mvr ?? '—'}</td>
                  <td style={{ ...TD, color: 'var(--color-text-muted)', fontSize: 12 }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={TD}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {c.status === 'draft' && (
                        <>
                          <Btn small variant="secondary" onClick={() => handleTest(c.message, c.ab_test_enabled ? c.message_variant_b : null)} disabled={testing} aria-label={`Send a test of ${c.name} to me`}>
                            Test to me
                          </Btn>
                          <Btn small onClick={() => handleSend(c.id)} disabled={actionId === c.id}>
                            {actionId === c.id ? 'Sending…' : 'Send'}
                          </Btn>
                        </>
                      )}
                      {['draft', 'sending', 'running'].includes(c.status) && (
                        <Btn small variant="danger" onClick={() => handleCancel(c.id)} disabled={actionId === c.id}>
                          Cancel
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  );
}
