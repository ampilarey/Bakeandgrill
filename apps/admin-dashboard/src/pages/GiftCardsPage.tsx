import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  PageHeader, StatCard, TableCard, TH, TD, Badge, Modal, ModalActions, Btn, Input, Pagination, EmptyState,
} from '../components/SharedUI';
import { CustomerSearch } from '../components/CustomerSearch';
import {
  fetchGiftCards,
  issueGiftCard,
  sendGiftCardSms,
  sendGiftCardEmail,
  checkGiftCardBalance,
  cancelGiftCard,
  fetchGiftCardTransactions,
  type GiftCard,
  type GiftCardTransaction,
  type GiftCardSmsResult,
  type GiftCardEmailResult,
} from '../api';
import { Gift, Search, Copy, Check } from 'lucide-react';
import { PrintCardModal, type PrintCardData } from '../components/PrintCardModal';

const STATUS_COLOR: Record<string, string> = {
  active: 'green',
  depleted: 'orange',
  expired: 'red',
  cancelled: 'gray',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  depleted: 'Depleted',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export default function GiftCardsPage() {
  usePageTitle('Gift Cards');

  const [cards, setCards] = useState<GiftCard[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, active_count: 0, active_balance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [issueOpen, setIssueOpen] = useState(false);
  const [printCard, setPrintCard] = useState<PrintCardData | null>(null);
  const [amount, setAmount] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [sendSms, setSendSms] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [issuedCard, setIssuedCard] = useState<GiftCard | null>(null);
  const [issueSms, setIssueSms] = useState<GiftCardSmsResult | null>(null);
  const [issueEmail, setIssueEmail] = useState<GiftCardEmailResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [smsResendPhone, setSmsResendPhone] = useState('');
  const [emailResendTo, setEmailResendTo] = useState('');
  const [deliveryResendNote, setDeliveryResendNote] = useState('');
  const [smsResendMsg, setSmsResendMsg] = useState('');
  const [emailResendMsg, setEmailResendMsg] = useState('');

  const [balanceCode, setBalanceCode] = useState('');
  const [balanceResult, setBalanceResult] = useState<{ masked_code: string; current_balance: number; expires_at: string | null } | null>(null);
  const [balanceError, setBalanceError] = useState('');
  const [checkingBalance, setCheckingBalance] = useState(false);

  const [ledgerCard, setLedgerCard] = useState<GiftCard | null>(null);
  const [ledgerRows, setLedgerRows] = useState<GiftCardTransaction[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchGiftCards({
        page,
        status: statusFilter || undefined,
        q: searchQ || undefined,
      });
      setCards(res.data ?? []);
      setMeta({
        current_page: res.meta?.current_page ?? 1,
        last_page: res.meta?.last_page ?? 1,
        total: res.meta?.total ?? 0,
        active_count: res.meta?.active_count ?? 0,
        active_balance: res.meta?.active_balance ?? 0,
      });
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [page, statusFilter, searchQ]);

  const resetIssueForm = () => {
    setAmount('');
    setCustomerId(null);
    setExpiresAt('');
    setSendSms(false);
    setRecipientPhone('');
    setSendEmail(false);
    setRecipientEmail('');
    setDeliveryNote('');
  };

  const handleIssue = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setIssueError('Enter a valid amount.'); return; }
    if (sendSms && !customerId && !recipientPhone.trim()) {
      setIssueError('Enter a recipient phone, or pick a customer with a phone on file.');
      return;
    }
    if (sendEmail && !customerId && !recipientEmail.trim()) {
      setIssueError('Enter a recipient email, or pick a customer with an email on file.');
      return;
    }
    setIssuing(true); setIssueError(''); setIssueSms(null); setIssueEmail(null);
    const phoneForSms = recipientPhone.trim();
    const emailForSend = recipientEmail.trim();
    const note = deliveryNote.trim();
    try {
      const res = await issueGiftCard({
        amount: amt,
        customer_id: customerId,
        expires_at: expiresAt || null,
        send_sms: sendSms,
        recipient_phone: sendSms ? (phoneForSms || null) : null,
        sms_note: sendSms ? (note.slice(0, 160) || null) : null,
        send_email: sendEmail,
        recipient_email: sendEmail ? (emailForSend || null) : null,
        email_note: sendEmail ? (note || null) : null,
      });
      setIssuedCard(res.gift_card);
      setIssueSms(res.sms ?? null);
      setIssueEmail(res.email ?? null);
      setSmsResendPhone(phoneForSms || res.sms?.phone || '');
      setEmailResendTo(emailForSend || res.email?.email || '');
      setDeliveryResendNote(note);
      setCopied(false);
      resetIssueForm();
      void load();
    } catch (e) { setIssueError((e as Error).message); }
    finally { setIssuing(false); }
  };

  const handleResendSms = async () => {
    if (!issuedCard?.code || !smsResendPhone.trim()) {
      setSmsResendMsg('Enter a phone number to SMS the code.');
      return;
    }
    setSmsSending(true); setSmsResendMsg('');
    try {
      const res = await sendGiftCardSms({
        code: issuedCard.code,
        recipient_phone: smsResendPhone.trim(),
        sms_note: deliveryResendNote.slice(0, 160) || null,
      });
      setIssueSms(res.sms);
      if (res.sms?.phone) setSmsResendPhone(res.sms.phone);
      setSmsResendMsg(res.message);
    } catch (e) { setSmsResendMsg((e as Error).message); }
    finally { setSmsSending(false); }
  };

  const handleResendEmail = async () => {
    if (!issuedCard?.code || !emailResendTo.trim()) {
      setEmailResendMsg('Enter an email address to send the code.');
      return;
    }
    setEmailSending(true); setEmailResendMsg('');
    try {
      const res = await sendGiftCardEmail({
        code: issuedCard.code,
        recipient_email: emailResendTo.trim(),
        email_note: deliveryResendNote || null,
      });
      setIssueEmail(res.email);
      if (res.email?.email) setEmailResendTo(res.email.email);
      setEmailResendMsg(res.message);
    } catch (e) { setEmailResendMsg((e as Error).message); }
    finally { setEmailSending(false); }
  };

  const handleCheckBalance = async () => {
    if (!balanceCode.trim()) return;
    setCheckingBalance(true); setBalanceError(''); setBalanceResult(null);
    try {
      const res = await checkGiftCardBalance(balanceCode.trim());
      setBalanceResult(res);
    } catch (e) { setBalanceError((e as Error).message); }
    finally { setCheckingBalance(false); }
  };

  const handleCopyCode = (code: string) => {
    void navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const openLedger = async (card: GiftCard) => {
    setLedgerCard(card);
    setLedgerRows([]);
    setLedgerLoading(true);
    setActionError('');
    try {
      const res = await fetchGiftCardTransactions(card.id);
      setLedgerCard(res.gift_card);
      setLedgerRows(res.transactions);
    } catch (e) { setActionError((e as Error).message); }
    finally { setLedgerLoading(false); }
  };

  const handleCancel = async (card: GiftCard) => {
    if (!window.confirm(`Cancel gift card ${card.masked_code}? It can no longer be redeemed.`)) return;
    setActionError('');
    try {
      await cancelGiftCard(card.id);
      void load();
      if (ledgerCard?.id === card.id) setLedgerCard(null);
    } catch (e) { setActionError((e as Error).message); }
  };

  const printDataFor = (card: GiftCard, fullCode?: string): PrintCardData => ({
    type: 'gift_card',
    code: fullCode ?? card.masked_code,
    title: 'Gift Card',
    subtitle: `MVR ${Number(card.initial_balance).toFixed(2)}`,
    expiry: card.expires_at ?? null,
    note: fullCode ? 'Redeem online or in-store' : 'Masked code — print full code only at issue time',
    logoText: 'Bake & Grill',
  });

  return (
    <div>
      {printCard && <PrintCardModal data={printCard} onClose={() => setPrintCard(null)} />}
      <PageHeader
        title="Gift Cards"
        action={<Btn onClick={() => {
          setIssueOpen(true);
          setIssuedCard(null);
          setIssueError('');
          setIssueSms(null);
          setSmsResendMsg('');
          resetIssueForm();
        }}>+ Issue Gift Card</Btn>}
      />
      {error && <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>}
      {actionError && <p style={{ color: '#ef4444', marginBottom: 16 }}>{actionError}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="depleted">Depleted</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          placeholder="Search last4 / customer…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { setSearchQ(searchInput.trim()); setPage(1); }
          }}
          style={{ padding: '8px 12px', border: '1px solid #E8E0D8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 200 }}
        />
        <Btn variant="secondary" onClick={() => { setSearchQ(searchInput.trim()); setPage(1); }}>Search</Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Issued" value={String(meta.total)} accent="#D4813A" />
        <StatCard label="Active Cards" value={String(meta.active_count ?? 0)} accent="#22c55e" />
        <StatCard label="Active Balance" value={`MVR ${Number(meta.active_balance ?? 0).toFixed(2)}`} accent="#8b5cf6" />
      </div>

      <div style={{ background: '#fff', border: '1px solid #E8E0D8', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <p style={{ fontWeight: 700, color: '#1C1408', margin: '0 0 12px', fontSize: 14 }}>Check Balance</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={balanceCode}
            onChange={e => { setBalanceCode(e.target.value.toUpperCase()); setBalanceResult(null); setBalanceError(''); }}
            onKeyDown={e => e.key === 'Enter' && void handleCheckBalance()}
            style={{ fontFamily: 'monospace', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, maxWidth: 260, textTransform: 'uppercase' }}
          />
          <Btn variant="secondary" onClick={() => void handleCheckBalance()} disabled={checkingBalance}>
            <Search size={14} style={{ marginRight: 6 }} />{checkingBalance ? 'Checking…' : 'Check'}
          </Btn>
        </div>
        {balanceResult && (
          <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <p style={{ margin: 0, color: '#166534', fontWeight: 700 }}>
              {balanceResult.masked_code} — Balance: MVR {balanceResult.current_balance.toFixed(2)}
            </p>
            {balanceResult.expires_at && <p style={{ margin: '4px 0 0', color: '#166534', fontSize: 12 }}>Expires: {balanceResult.expires_at}</p>}
          </div>
        )}
        {balanceError && <p style={{ color: '#ef4444', margin: '8px 0 0', fontSize: 13 }}>{balanceError}</p>}
      </div>

      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Code', 'Issued To', 'Initial', 'Balance', 'Status', 'Expires', 'Issued', ''].map(h => (
                <th key={h || 'actions'} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#9C8E7E' }}>Loading…</td></tr>
            ) : cards.length === 0 ? (
              <tr><td colSpan={8}><EmptyState message="No gift cards yet." /></td></tr>
            ) : cards.map(card => (
              <tr key={card.id}>
                <td style={TD}><code style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.05em', color: '#1C1408' }}>{card.masked_code}</code></td>
                <td style={TD}>
                  {card.issued_to ? (
                    <Link to={`/customers?customer=${card.issued_to.id}`} style={{ color: '#D4813A', fontWeight: 600, textDecoration: 'none' }}>
                      {card.issued_to.name}
                    </Link>
                  ) : (
                    <span style={{ color: '#9C8E7E' }}>—</span>
                  )}
                </td>
                <td style={TD}>MVR {card.initial_balance.toFixed(2)}</td>
                <td style={{ ...TD, fontWeight: 700, color: card.current_balance > 0 ? '#166534' : '#9C8E7E' }}>MVR {Number(card.current_balance).toFixed(2)}</td>
                <td style={TD}><Badge color={STATUS_COLOR[card.status] ?? 'gray'}>{STATUS_LABEL[card.status] ?? card.status}</Badge></td>
                <td style={TD}>{card.expires_at ?? '—'}</td>
                <td style={{ ...TD, color: '#9C8E7E', fontSize: 12 }}>{card.created_at ? new Date(card.created_at).toLocaleDateString() : '—'}</td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                  <Btn small variant="secondary" onClick={() => void openLedger(card)}>Ledger</Btn>
                  {' '}
                  {(card.status === 'active' || card.status === 'expired') && (
                    <Btn small variant="secondary" onClick={() => void handleCancel(card)}>Cancel</Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />

      {ledgerCard && (
        <Modal title={`Ledger · ${ledgerCard.masked_code}`} onClose={() => setLedgerCard(null)}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B5D4F' }}>
            Status: <strong>{STATUS_LABEL[ledgerCard.status] ?? ledgerCard.status}</strong>
            {' · '}Balance: MVR {Number(ledgerCard.current_balance).toFixed(2)}
          </p>
          {ledgerLoading ? (
            <p style={{ color: '#9C8E7E' }}>Loading…</p>
          ) : ledgerRows.length === 0 ? (
            <EmptyState message="No transactions yet." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['When', 'Type', 'Amount', 'Balance', 'Order'].map(h => (
                    <th key={h} style={{ ...TH, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map(row => (
                  <tr key={row.id}>
                    <td style={TD}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                    <td style={TD}>{row.type}</td>
                    <td style={{ ...TD, color: row.amount < 0 ? '#b91c1c' : '#166534', fontWeight: 600 }}>
                      {row.amount < 0 ? '−' : '+'}MVR {Math.abs(row.amount).toFixed(2)}
                    </td>
                    <td style={TD}>MVR {row.balance_after.toFixed(2)}</td>
                    <td style={TD}>{row.order_id ? `#${row.order_id}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ModalActions>
            <Btn variant="secondary" onClick={() => setLedgerCard(null)}>Close</Btn>
          </ModalActions>
        </Modal>
      )}

      {issueOpen && (
        <Modal title="Issue Gift Card" onClose={() => setIssueOpen(false)}>
          {issuedCard ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Gift size={40} style={{ color: '#D4813A', marginBottom: 16 }} />
              <p style={{ fontWeight: 700, color: '#1C1408', marginBottom: 8 }}>Gift card issued!</p>
              <p style={{ color: '#b45309', fontSize: 12, marginBottom: 10 }}>
                Full code is shown once — copy, print, or SMS it now.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                <p style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: '0.08em', color: '#D4813A', fontWeight: 700, margin: 0 }}>
                  {issuedCard.code ?? issuedCard.masked_code}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyCode(issuedCard.code ?? issuedCard.masked_code)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#22c55e' : '#9C8E7E', padding: 4 }}
                  title="Copy code"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <p style={{ color: '#6B5D4F', fontSize: 14 }}>Balance: MVR {issuedCard.current_balance.toFixed(2)}</p>
              {issuedCard.expires_at && <p style={{ color: '#9C8E7E', fontSize: 13 }}>Expires: {issuedCard.expires_at}</p>}

              {issueSms && (
                <p style={{
                  margin: '12px 0 0',
                  fontSize: 13,
                  color: issueSms.ok ? '#166534' : '#b91c1c',
                  fontWeight: 600,
                }}>
                  {issueSms.ok
                    ? `SMS sent to ${issueSms.phone ?? 'recipient'}`
                    : `SMS not sent: ${issueSms.error ?? 'unknown error'}`}
                </p>
              )}
              {issueEmail && (
                <p style={{
                  margin: '8px 0 0',
                  fontSize: 13,
                  color: issueEmail.ok ? '#166534' : '#b91c1c',
                  fontWeight: 600,
                }}>
                  {issueEmail.ok
                    ? `Email sent to ${issueEmail.email ?? 'recipient'}`
                    : `Email not sent: ${issueEmail.error ?? 'unknown error'}`}
                </p>
              )}

              {issuedCard.code && (
                <div style={{
                  marginTop: 16,
                  padding: 12,
                  background: '#FEF3E8',
                  borderRadius: 10,
                  textAlign: 'left',
                }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#1C1408' }}>Send / resend</p>
                  <input
                    placeholder="Phone — 7XXXXXX or +9607XXXXXX"
                    value={smsResendPhone}
                    onChange={e => setSmsResendPhone(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }}
                  />
                  <Btn variant="secondary" onClick={() => void handleResendSms()} disabled={smsSending}>
                    {smsSending ? 'Sending…' : 'SMS code now'}
                  </Btn>
                  {smsResendMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6B5D4F' }}>{smsResendMsg}</p>}

                  <input
                    placeholder="Email — name@example.com"
                    value={emailResendTo}
                    onChange={e => setEmailResendTo(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', margin: '12px 0 8px', boxSizing: 'border-box' }}
                  />
                  <Btn variant="secondary" onClick={() => void handleResendEmail()} disabled={emailSending}>
                    {emailSending ? 'Sending…' : 'Email code now'}
                  </Btn>
                  {emailResendMsg && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6B5D4F' }}>{emailResendMsg}</p>}
                </div>
              )}

              <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {issuedCard.code && (
                  <Btn variant="secondary" onClick={() => setPrintCard(printDataFor(issuedCard, issuedCard.code))}>
                    Print card
                  </Btn>
                )}
                <Btn onClick={() => {
                  setIssuedCard(null);
                  setIssueOpen(false);
                  setIssueSms(null);
                  setIssueEmail(null);
                  setSmsResendPhone('');
                  setEmailResendTo('');
                  setDeliveryResendNote('');
                  setSmsResendMsg('');
                  setEmailResendMsg('');
                }}>Done</Btn>
              </div>
            </div>
          ) : (
            <>
              {issueError && <p style={{ color: '#ef4444', marginBottom: 12 }}>{issueError}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Amount (MVR) *</span>
                  <Input type="number" min="1" step="0.01" placeholder="50.00" value={amount} onChange={setAmount} />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Customer (optional)</span>
                  <CustomerSearch
                    value={customerId}
                    onChange={(id) => setCustomerId(id)}
                    placeholder="Search by name or phone… (leave empty for anonymous)"
                  />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Expiry date (optional)</span>
                  <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }} />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1408' }}>Send code by SMS</span>
                </label>
                {sendSms && (
                  <label>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>
                      Recipient phone {!customerId ? '*' : '(optional if customer has phone)'}
                    </span>
                    <Input
                      type="tel"
                      placeholder="7XXXXXX or +9607XXXXXX"
                      value={recipientPhone}
                      onChange={setRecipientPhone}
                    />
                  </label>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1408' }}>Send code by email</span>
                </label>
                {sendEmail && (
                  <label>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>
                      Recipient email {!customerId ? '*' : '(optional if customer has email)'}
                    </span>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      value={recipientEmail}
                      onChange={setRecipientEmail}
                    />
                  </label>
                )}

                {(sendSms || sendEmail) && (
                  <label>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B5D4F', marginBottom: 4 }}>Personal note (optional)</span>
                    <input
                      value={deliveryNote}
                      onChange={e => setDeliveryNote(e.target.value)}
                      maxLength={sendSms ? 160 : 500}
                      placeholder="Happy birthday from…"
                      style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E8E0D8', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </label>
                )}
              </div>
              <ModalActions>
                <Btn variant="secondary" onClick={() => setIssueOpen(false)}>Cancel</Btn>
                <Btn onClick={() => void handleIssue()} disabled={issuing}>{issuing ? 'Issuing…' : 'Issue Gift Card'}</Btn>
              </ModalActions>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
