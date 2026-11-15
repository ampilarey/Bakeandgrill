import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Eye, RefreshCw, Trash2 } from 'lucide-react';
import {
  downloadPurchaseBill, fetchPurchaseBills, readPurchaseBill, removePurchaseBill, sendPurchaseBill,
  type PurchaseBill,
} from '../../api/purchasing';
import { Btn, ConfirmDialog, Spinner, useConfirmDialog } from '../SharedUI';
import { mvr } from '../../utils/fmt';

/**
 * Supplier bills sent in to be read (owner, 2026-11-15: "I have a pile of bills to
 * enter. But I have no time… so admin just needs to check and approve").
 *
 * Pick photos or PDFs, as many as there are. Each is kept on the server and read
 * there into a shop, a date and lines matched to inventory; this list shows them as
 * they come back. Check opens the manual purchase order with the bill filled in.
 * Nothing becomes a purchase until that form is saved.
 */

/** Open a bill's own file in a new tab, to hold beside the form. */
export async function viewBill(bill: Pick<PurchaseBill, 'id'>): Promise<void> {
  // Opened in the tap itself: a tab opened after the download is blocked on a phone.
  const tab = window.open('', '_blank');
  try {
    const blob = await downloadPurchaseBill(bill.id);
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/** One line under a bill's name: what was read, in a glance. */
export function billSummary(bill: PurchaseBill): string {
  if (bill.status === 'queued' || bill.status === 'reading') return 'Reading…';
  if (bill.status === 'failed') return bill.error ?? 'Could not be read.';
  const d = bill.data;
  if (!d) return '';
  const unmatched = d.lines.filter((l) => !l.item).length;
  return [
    d.date ?? 'no date read',
    `${d.lines.length} ${d.lines.length === 1 ? 'item' : 'items'}`,
    mvr(d.total > 0 ? d.total : d.lines_total),
    unmatched > 0 ? `${unmatched} not in inventory` : null,
  ].filter(Boolean).join(' · ');
}

export function BillsToCheck({ onCheck, reloadKey, startOpen }: {
  onCheck: (bill: PurchaseBill) => void;
  /** Changes when a bill was saved as a purchase, so the list is asked for again. */
  reloadKey: number;
  /** Came here from Needs attention: bring the list into view. */
  startOpen?: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [sending, setSending] = useState<{ done: number; of: number } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { state: confirm, ask, close } = useConfirmDialog();

  const load = useCallback(async () => {
    try {
      const res = await fetchPurchaseBills();
      setEnabled(res.enabled);
      setBills(res.bills);
    } catch {
      // The orders list has its own error line; this card just stays as it was.
    }
  }, []);

  useEffect(() => { void load(); }, [load, reloadKey]);

  useEffect(() => {
    if (startOpen && bills.length > 0) boxRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [startOpen, bills.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // A bill the server is reading on its own (sent from another device, or the
  // scheduler picked it up): look again until it is back.
  const waiting = sending === null && bills.some((b) => b.status === 'queued' || b.status === 'reading');
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(t);
  }, [waiting, load]);

  const put = (bill: PurchaseBill) => setBills((list) => (
    list.some((b) => b.id === bill.id) ? list.map((b) => (b.id === bill.id ? bill : b)) : [...list, bill]
  ));

  /** One after another: each is a few seconds, and the list fills as they come back. */
  const sendAll = async (files: File[]) => {
    setProblems([]);
    setSending({ done: 0, of: files.length });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const { bill } = await sendPurchaseBill(file);
        put({ ...bill, status: 'reading' });
        const read = await readPurchaseBill(bill.id);
        put(read.bill);
      } catch (e) {
        setProblems((p) => [...p, `${file.name}: ${(e as Error).message}`]);
      }
      setSending({ done: i + 1, of: files.length });
    }
    setSending(null);
    void load();
  };

  const tryAgain = async (bill: PurchaseBill) => {
    setBusyId(bill.id);
    put({ ...bill, status: 'reading', error: null });
    try {
      put((await readPurchaseBill(bill.id)).bill);
    } catch (e) {
      put({ ...bill, status: 'failed', error: (e as Error).message });
    } finally { setBusyId(null); }
  };

  const remove = (bill: PurchaseBill) => ask({
    title: 'Remove this bill?',
    message: `${bill.data?.shop || bill.file_name} comes off the list and its file is deleted. Nothing was entered from it.`,
    confirmLabel: 'Remove',
    danger: true,
    onConfirm: () => {
      void removePurchaseBill(bill.id)
        .then(() => setBills((list) => list.filter((b) => b.id !== bill.id)))
        .catch((e: Error) => setProblems((p) => [...p, e.message]));
    },
  });

  if (enabled === null) return null;

  return (
    <div className="pb-card" data-testid="bills-to-check" ref={boxRef}>
      <div className="pb-head">
        <div className="pb-head__words">
          <strong>Bills to check{bills.length > 0 ? ` (${bills.length})` : ''}</strong>
          <span>
            {enabled
              ? 'Send photos or PDFs of supplier bills. Each is read into a purchase order for you to check and save.'
              : <>Reading bills is not set up yet. It needs a key: <Link to="/purchasing/settings" className="pb-link">Purchasing → Settings → Reading bills</Link>.</>}
          </span>
        </div>
        <Btn onClick={() => fileRef.current?.click()} disabled={!enabled || sending !== null} data-testid="bills-send">
          <Camera size={16} aria-hidden />{sending ? `Reading ${Math.min(sending.done + 1, sending.of)} of ${sending.of}…` : 'Read bills'}
        </Btn>
        <input
          ref={fileRef} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,application/pdf"
          data-testid="bills-file"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length > 0) void sendAll(files);
          }}
        />
      </div>

      {problems.map((p) => <p key={p} className="po-note po-note--warn" data-testid="bills-problem">{p}</p>)}

      {bills.length > 0 && (
        <ul className="pb-list">
          {bills.map((bill) => {
            const reading = bill.status === 'queued' || bill.status === 'reading';
            return (
              <li key={bill.id} className={`pb-row pb-row--${bill.status}`} data-testid={`bill-${bill.id}`}>
                <div className="pb-row__words">
                  <strong>{bill.data?.shop || bill.file_name}</strong>
                  <span data-testid={`bill-summary-${bill.id}`}>
                    {reading && <Spinner size={12} />} {billSummary(bill)}
                  </span>
                </div>
                <div className="pb-row__acts">
                  {bill.status === 'ready' && (
                    <Btn small onClick={() => onCheck(bill)} data-testid={`bill-check-${bill.id}`}>Check</Btn>
                  )}
                  {bill.status === 'failed' && (
                    <Btn small variant="secondary" disabled={busyId === bill.id} onClick={() => void tryAgain(bill)}>
                      <RefreshCw size={14} aria-hidden />Try again
                    </Btn>
                  )}
                  <Btn small variant="secondary" onClick={() => void viewBill(bill).catch((e: Error) => setProblems((p) => [...p, e.message]))}>
                    <Eye size={14} aria-hidden />View
                  </Btn>
                  {!reading && (
                    <Btn small variant="danger-outline" onClick={() => remove(bill)} data-testid={`bill-remove-${bill.id}`}>
                      <Trash2 size={14} aria-hidden />Remove
                    </Btn>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog state={confirm} close={close} />
    </div>
  );
}
