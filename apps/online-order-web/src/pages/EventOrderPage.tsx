import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchItems } from '../api';
import type { Item } from '../api';
import { createEventOrder, type EventOrderPayload } from '../api/eventOrders';
import { AuthBlock } from '../components/AuthBlock';
import { getCustomerMe } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageHeader } from '../components/shell/PageHeader';
import {
  DEFAULT_ITEM_TAB,
  activePackagingOptions,
  activeVariants,
  addCustomLine,
  buildCatalogDraftLine,
  defaultPackagingOptionId,
  filterItemsForTab,
  minEventDateInput,
  needsSelection,
  nextStep,
  parseAddItemId,
  prevStep,
  removeLine,
  resolvePreselectLine,
  showPackagingPicker,
  upsertCatalogLine,
  variantUnitPrice,
  type EventDraftLine,
  type ItemPickerTab,
  type WizardStep,
} from './eventOrderHelpers';
import type { CSSProperties } from 'react';

export function EventOrderPage() {
  usePageTitle('Plan your event');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, customerName, setAuth } = useAuth();

  const [step, setStep] = useState<WizardStep>('items');
  const [tab, setTab] = useState<ItemPickerTab>(DEFAULT_ITEM_TAB);
  const [cateringItems, setCateringItems] = useState<Item[]>([]);
  const [regularItems, setRegularItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<EventDraftLine[]>([]);
  const [preselectDone, setPreselectDone] = useState(false);
  const [leadHours, setLeadHours] = useState(24);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [pendingVariantId, setPendingVariantId] = useState<number | null>(null);
  const [pendingPackagingId, setPendingPackagingId] = useState<number | null>(null);

  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [eventDate, setEventDate] = useState('');
  const [fulfillmentTime, setFulfillmentTime] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryIsland, setDeliveryIsland] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customNotes, setCustomNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    Promise.all([
      fetchItems('catering'),
      fetchItems(),
    ])
      .then(([catering, regular]) => {
        setCateringItems(catering.data ?? []);
        setRegularItems(regular.data ?? []);
      })
      .catch((e: Error) => setError(e.message || 'Could not load menu'));
    setLeadHours(24);
  }, []);

  useEffect(() => {
    if (!eventDate) setEventDate(minEventDateInput(leadHours));
  }, [leadHours, eventDate]);

  const prefillFromAccount = () => {
    getCustomerMe()
      .then(({ customer: c }) => {
        if (c.name) setContactName((prev) => prev || c.name || '');
        if (c.phone) {
          const local = c.phone.replace(/^\+?960/, '').replace(/\D/g, '');
          setContactPhone((prev) => prev || local);
        }
      })
      .catch(() => { /* ignore */ });
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    prefillFromAccount();
  }, [isAuthenticated]);

  useEffect(() => {
    if (preselectDone || cateringItems.length === 0) return;
    const id = parseAddItemId(searchParams);
    const line = resolvePreselectLine(id, cateringItems);
    if (line) {
      setLines((prev) => (prev.some((l) => l.key === line.key) ? prev : [...prev, line]));
      setTab('catering');
    }
    setPreselectDone(true);
  }, [cateringItems, searchParams, preselectDone]);

  const tabItems = tab === 'catering' ? cateringItems : regularItems;
  const filtered = filterItemsForTab(tabItems, tab, search);
  const minDate = minEventDateInput(leadHours);
  const pendingItem = pendingItemId != null
    ? tabItems.find((i) => i.id === pendingItemId) ?? cateringItems.find((i) => i.id === pendingItemId) ?? null
    : null;

  const commitCatalogLine = (item: Item, variantId: number | null, packagingId: number | null) => {
    const line = buildCatalogDraftLine(item, variantId, packagingId);
    if (!line) return;
    setLines((prev) => upsertCatalogLine(prev, line, 1));
    setPendingItemId(null);
    setPendingVariantId(null);
    setPendingPackagingId(null);
  };

  const addCatalogItem = (item: Item) => {
    if (needsSelection(item)) {
      setPendingItemId(item.id);
      setPendingVariantId(null);
      setPendingPackagingId(defaultPackagingOptionId(item));
      return;
    }
    commitCatalogLine(item, null, defaultPackagingOptionId(item));
  };

  const confirmPendingSelection = () => {
    if (!pendingItem) return;
    if (pendingItem.has_variants && pendingVariantId == null) return;
    commitCatalogLine(pendingItem, pendingVariantId, pendingPackagingId);
  };

  const handleAddCustom = () => {
    setLines((prev) => addCustomLine(prev, { name: customName, quantity: customQty, notes: customNotes }));
    setCustomName('');
    setCustomQty(1);
    setCustomNotes('');
  };

  const validateDetails = (): string | null => {
    if (!eventDate || eventDate < minDate) return `Event date must be on or after ${minDate}`;
    if (!fulfillmentTime) return 'Event time is required';
    const phoneDigits = contactPhone.replace(/\D/g, '').replace(/^960/, '');
    if (!phoneDigits || phoneDigits.length !== 7) {
      return 'Enter a valid 7-digit mobile number';
    }
    if (fulfillmentMethod === 'delivery') {
      if (!deliveryAddress.trim()) return 'Delivery address is required';
      if (!deliveryIsland.trim()) return 'Island is required';
      if (!contactName.trim()) return 'Contact name is required';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validateDetails();
    if (err) {
      setError(err);
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one item');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: EventOrderPayload = {
        event_date: eventDate,
        fulfillment_method: fulfillmentMethod,
        fulfillment_time: fulfillmentTime,
        phone: contactPhone.trim(),
        contact_name: contactName.trim() || undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l) =>
          l.kind === 'custom'
            ? { custom_name: l.custom_name, quantity: l.quantity, notes: l.notes }
            : {
                item_id: l.item_id,
                variant_id: l.variant_id ?? undefined,
                packaging_option_id: l.packaging_option_id ?? undefined,
                quantity: l.quantity,
                notes: l.notes,
              },
        ),
      };
      if (fulfillmentMethod === 'delivery') {
        payload.delivery_address = deliveryAddress.trim();
        payload.delivery_island = deliveryIsland.trim();
        payload.onsite_contact_name = contactName.trim() || undefined;
        payload.onsite_contact_phone = contactPhone.trim();
      }
      const res = await createEventOrder(payload);
      setReference(res.request.reference);
      setStep('done');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    setError('');
    if (step === 'items' && lines.length === 0) {
      setError('Add at least one item or custom line');
      return;
    }
    const n = nextStep(step);
    if (n) setStep(n);
  };

  const goBack = () => {
    const p = prevStep(step);
    if (p) setStep(p);
  };

  return (
    <>
      <PageHeader
        title="Plan your event"
        onBack={() => (step === 'items' ? navigate(-1) : goBack())}
        right={(
          <Link
            to="/events/mine"
            data-testid="my-events-nav"
            style={{
              color: 'var(--color-primary)',
              fontWeight: 700,
              fontSize: 14,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              paddingRight: 4,
            }}
          >
            My events
          </Link>
        )}
      />
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 var(--page-gutter) 8px', fontSize: 13, color: 'var(--color-text-muted)' }} data-testid="events-nav">
        Event quotes &amp; deposits — separate from today&apos;s menu cart
      </div>
      <div style={S.page}>
        <div style={S.container}>
          <p style={S.lede}>
            Same pickup/delivery details as online ordering, plus your event date. Sign in with OTP to submit.
          </p>
          <p style={{ margin: '0 0 1rem', fontSize: 13 }}>
            <Link to="/menu" style={S.link}>Need it today instead? Order from the menu →</Link>
            {' · '}
            <Link to="/catering" style={S.link}>Just want a callback?</Link>
          </p>

          <div style={S.steps} aria-label="Progress">
            {(['items', 'details', 'done'] as WizardStep[]).map((s) => (
              <span key={s} style={{ ...S.stepDot, ...(step === s ? S.stepDotActive : {}) }}>{s}</span>
            ))}
          </div>

          {error && <p style={S.error} role="alert">{error}</p>}

          {step === 'items' && (
            <section>
              <div style={S.tabs} role="tablist">
                {([
                  ['catering', 'Catering menu'],
                  ['regular', 'Regular menu'],
                  ['custom', '+ Custom item'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    data-testid={`event-tab-${id}`}
                    onClick={() => setTab(id)}
                    style={{ ...S.tab, ...(tab === id ? S.tabActive : {}) }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab !== 'custom' && (
                <>
                  <input
                    style={S.input}
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search menu"
                  />
                  <div style={S.list}>
                    {filtered.map((item) => {
                      const isPending = pendingItemId === item.id;
                      const variants = activeVariants(item);
                      const packagingOpts = activePackagingOptions(item);
                      const showPkg = showPackagingPicker(item);
                      return (
                        <div key={item.id} style={{ ...S.row, flexDirection: 'column', alignItems: 'stretch' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700 }}>{item.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                MVR {Number(item.base_price).toFixed(2)}
                                {item.is_catering ? ' · Catering' : ''}
                                {item.has_variants ? ' · Options' : ''}
                              </div>
                            </div>
                            {!isPending && (
                              <button type="button" style={S.btnSm} onClick={() => addCatalogItem(item)} data-testid={`add-item-${item.id}`}>
                                + Add
                              </button>
                            )}
                          </div>
                          {isPending && (
                            <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 10 }} data-testid={`select-item-${item.id}`}>
                              {item.has_variants && variants.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Choose size / option</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {variants.map((v) => (
                                      <button
                                        key={v.id}
                                        type="button"
                                        data-testid={`variant-${v.id}`}
                                        onClick={() => setPendingVariantId(v.id)}
                                        style={{
                                          ...S.btnSm,
                                          ...(pendingVariantId === v.id ? S.tabActive : {}),
                                        }}
                                      >
                                        {v.name} · MVR {variantUnitPrice(v).toFixed(2)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {showPkg && (
                                <div style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Packaging</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {packagingOpts.map((o) => (
                                      <button
                                        key={o.id}
                                        type="button"
                                        data-testid={`packaging-${o.id}`}
                                        onClick={() => setPendingPackagingId(o.id)}
                                        style={{
                                          ...S.btnSm,
                                          ...(pendingPackagingId === o.id ? S.tabActive : {}),
                                        }}
                                      >
                                        {o.name}{Number(o.fee ?? 0) > 0 ? ` · +MVR ${Number(o.fee).toFixed(2)}` : ''}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  style={S.btnSm}
                                  onClick={() => {
                                    setPendingItemId(null);
                                    setPendingVariantId(null);
                                    setPendingPackagingId(null);
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  style={{ ...S.btnSm, ...S.tabActive }}
                                  data-testid="confirm-item-selection"
                                  disabled={Boolean(item.has_variants) && pendingVariantId == null}
                                  onClick={confirmPendingSelection}
                                >
                                  Add to draft
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filtered.length === 0 && (
                      <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No items in this tab.</p>
                    )}
                  </div>
                </>
              )}

              {tab === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={S.label}>
                    Custom item name
                    <input style={S.input} value={customName} onChange={(e) => setCustomName(e.target.value)} data-testid="custom-name" />
                  </label>
                  <label style={S.label}>
                    Quantity
                    <input
                      style={S.input}
                      type="number"
                      min={1}
                      value={customQty}
                      onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value) || 1))}
                      data-testid="custom-qty"
                    />
                  </label>
                  <label style={S.label}>
                    Note (optional)
                    <input style={S.input} value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} />
                  </label>
                  <button type="button" style={S.btn} onClick={handleAddCustom} data-testid="custom-add">
                    Add custom line
                  </button>
                </div>
              )}

              {lines.length > 0 && (
                <div style={{ marginTop: 16 }} data-testid="draft-lines">
                  <h3 style={S.h3}>Your draft ({lines.length})</h3>
                  {lines.map((l) => (
                    <div key={l.key} style={S.row}>
                      <div style={{ flex: 1 }}>
                        <strong>{l.name}</strong> × {l.quantity}
                        {l.kind === 'custom' ? (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}> · to be quoted</span>
                        ) : (
                          <span style={{ fontSize: 12 }}>
                            {' '}· MVR {((l.unit_price ?? 0) * l.quantity).toFixed(2)}
                            {l.packaging_option_name ? ` · ${l.packaging_option_name}` : ''}
                          </span>
                        )}
                      </div>
                      <button type="button" style={S.btnSm} onClick={() => setLines((p) => removeLine(p, l.key))} data-testid={`remove-${l.key}`}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" style={{ ...S.btn, marginTop: 16 }} onClick={goNext} disabled={lines.length === 0}>
                Continue →
              </button>
            </section>
          )}

          {step === 'details' && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={S.toggleRow} role="group" aria-label="Fulfillment">
                <button
                  type="button"
                  data-testid="fulfillment-pickup"
                  style={{ ...S.tab, ...(fulfillmentMethod === 'pickup' ? S.tabActive : {}) }}
                  onClick={() => setFulfillmentMethod('pickup')}
                >
                  Pickup
                </button>
                <button
                  type="button"
                  data-testid="fulfillment-delivery"
                  style={{ ...S.tab, ...(fulfillmentMethod === 'delivery' ? S.tabActive : {}) }}
                  onClick={() => setFulfillmentMethod('delivery')}
                >
                  Delivery
                </button>
              </div>

              <label style={S.label}>
                Event date
                <input
                  style={S.input}
                  type="date"
                  min={minDate}
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                  data-testid="event-date"
                />
              </label>
              <label style={S.label}>
                Event time
                <input
                  style={S.input}
                  type="time"
                  value={fulfillmentTime}
                  onChange={(e) => setFulfillmentTime(e.target.value)}
                  required
                  data-testid="event-time"
                />
              </label>

              {fulfillmentMethod === 'delivery' && (
                <>
                  <label style={S.label}>
                    Delivery address
                    <input
                      style={S.input}
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Street / building"
                      required
                      data-testid="delivery-address"
                    />
                  </label>
                  <label style={S.label}>
                    Island
                    <input
                      style={S.input}
                      value={deliveryIsland}
                      onChange={(e) => setDeliveryIsland(e.target.value)}
                      placeholder="Malé / Hulhumalé / …"
                      required
                      data-testid="delivery-island"
                    />
                  </label>
                  <label style={S.label}>
                    Contact name
                    <input
                      style={S.input}
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      required
                      data-testid="contact-name"
                    />
                  </label>
                </>
              )}

              <label style={S.label}>
                Mobile number
                <div style={S.phoneRow}>
                  <span style={S.prefix} aria-hidden="true">+960</span>
                  <input
                    style={S.phoneField}
                    type="tel"
                    inputMode="numeric"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value.replace(/\D/g, '').replace(/^960/, '').slice(0, 7))}
                    placeholder="7XXXXXX"
                    required
                    data-testid="contact-phone"
                  />
                </div>
                <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {isAuthenticated
                    ? 'Pre-filled from your login. Change only if this event uses a different number.'
                    : 'After OTP, your number is filled in. Change it only if the event contact is different.'}
                </span>
              </label>

              <label style={S.label}>
                Order notes (optional)
                <textarea
                  style={{ ...S.input, minHeight: 72, paddingTop: 10 }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  data-testid="event-notes"
                />
              </label>

              <div data-testid="details-summary">
                <h3 style={S.h3}>Your draft</h3>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                  {fulfillmentMethod === 'delivery' ? 'Delivery' : 'Pickup'}
                  {eventDate ? ` · ${eventDate}` : ''}
                  {fulfillmentTime ? ` · ${fulfillmentTime}` : ''}
                </p>
                <ul style={{ paddingLeft: 18, margin: '0 0 12px' }}>
                  {lines.map((l) => (
                    <li key={l.key} style={{ marginBottom: 6, fontSize: 14 }}>
                      {l.name} × {l.quantity}
                      {l.kind === 'custom'
                        ? ' — to be quoted'
                        : ` — MVR ${((l.unit_price ?? 0) * l.quantity).toFixed(2)}`}
                    </li>
                  ))}
                </ul>
              </div>

              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
                Staff will confirm the final quote before payment.
              </p>

              {!isAuthenticated && (
                <>
                  <p style={{ fontSize: 14, margin: 0 }}>Verify your phone with OTP first.</p>
                  <AuthBlock
                    onSuccess={(name) => {
                      setAuth(name);
                      prefillFromAccount();
                    }}
                    skipProfileSetup
                  />
                </>
              )}

              {isAuthenticated && (
                <>
                  <p style={{ fontSize: 14, margin: 0 }}>Signed in as {customerName || 'customer'}.</p>
                  <button type="button" style={S.btn} disabled={loading} onClick={() => void handleSubmit()} data-testid="submit-event">
                    {loading ? 'Submitting…' : 'Submit event request'}
                  </button>
                </>
              )}
            </section>
          )}

          {step === 'done' && (
            <section style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <h2 style={{ margin: '0 0 8px' }}>Request received</h2>
              <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-primary)' }} data-testid="event-reference">
                {reference}
              </p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', maxWidth: 360, margin: '12px auto' }}>
                We&apos;ll SMS you when the quote is ready.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <Link to="/events/mine" data-testid="view-my-events" style={S.btn}>View my events</Link>
                <Link to="/menu" style={{ ...S.link, fontSize: 14 }}>Back to menu</Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

const S: Record<string, CSSProperties> = {
  page: { padding: '0 var(--page-gutter) 3rem' },
  container: { maxWidth: 560, margin: '0 auto' },
  lede: { fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.5, margin: '0 0 8px' },
  link: { color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' },
  steps: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  stepDot: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.04, color: 'var(--color-text-muted)', padding: '4px 8px', borderRadius: 6, background: 'var(--color-surface-alt)' },
  stepDotActive: { background: 'var(--color-primary)', color: '#fff', fontWeight: 700 },
  error: { color: '#b91c1c', fontSize: 13, marginBottom: 12 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  toggleRow: { display: 'flex', gap: 8 },
  tab: { minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  tabActive: { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' },
  input: { display: 'block', width: '100%', minHeight: 44, marginTop: 4, borderRadius: 10, border: '1px solid var(--color-border)', padding: '0 12px', fontFamily: 'inherit', fontSize: 15, boxSizing: 'border-box' },
  label: { fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 },
  list: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxHeight: 360, overflow: 'auto' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-surface)' },
  btn: { display: 'inline-block', width: '100%', minHeight: 48, borderRadius: 12, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', lineHeight: '48px' },
  btnSm: { minHeight: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' },
  h3: { fontSize: 15, fontWeight: 800, margin: '0 0 8px' },
  phoneRow: { display: 'flex', alignItems: 'stretch', marginTop: 4, borderRadius: 10, border: '1px solid var(--color-border)', overflow: 'hidden', background: 'var(--color-surface)' },
  prefix: { display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--color-surface-alt)', fontWeight: 700, fontSize: 14, color: 'var(--color-text-muted)' },
  phoneField: { flex: 1, minHeight: 44, border: 'none', padding: '0 12px', fontFamily: 'inherit', fontSize: 15, background: 'transparent' },
};
