import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, ScanLine } from 'lucide-react';
import { Button } from '../ui';
import { ScanSheet } from '../ScanSheet';

/*
 * Scan to reprint (round 11, owner 2026-10-13: "scan a pack's QR with the
 * phone and reprint that exact label"). The QR in a sticker's header carries
 * the pack's code; scanned here with the camera, or typed from the print log
 * or the pack page, it opens Print labels on the very label that printed it
 * (?code=). A phone's own camera lands on the pack page instead, whose
 * "Staff: print this sticker again" link comes to the same place.
 */

/** The pack code in what a scanner read: the pack page's address, a reprint link, or the bare code. */
export function codeFromScan(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const page = t.match(/\/b\/([A-Za-z0-9]{4,12})(?:[/?#]|$)/);
  if (page) return page[1].toUpperCase();
  const link = t.match(/[?&]code=([A-Za-z0-9]{4,12})(?:[&#]|$)/);
  if (link) return link[1].toUpperCase();
  return /^[A-Za-z0-9]{4,12}$/.test(t) ? t.toUpperCase() : null;
}

type Props = {
  /** Where a code goes; Print labels with ?code= unless the host says otherwise. */
  onCode?: (code: string) => void;
};

export function ReprintScan({ onCode }: Props) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (text: string) => {
    const c = codeFromScan(text);
    if (!c) {
      setError('That is not a pack code. A code is eight letters and digits, none of 0, O, 1 or I.');
      return;
    }
    setError(null);
    if (onCode) onCode(c); else navigate(`/labels/stickers?code=${c}`);
  };

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5" data-testid="reprint-scan">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); go(code); }}>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--color-text)] mr-1"><QrCode size={16} className="text-[var(--color-primary)]" aria-hidden /> Print a pack's sticker again</span>
        <Button type="button" size="sm" variant="secondary" icon={<ScanLine size={14} />} onClick={() => setScanning(true)} data-testid="reprint-scan-open">Scan its QR</Button>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          maxLength={12}
          placeholder="Pack code"
          aria-label="Pack code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm font-mono uppercase tracking-wider w-[168px]"
        />
        <Button type="submit" size="sm" disabled={code.trim().length < 4} data-testid="reprint-scan-go">Open</Button>
        <span className="basis-full text-xs text-[var(--color-text-muted)]">The QR in the sticker's header, or the code the print log and the pack page show. The label it came from opens here with the same details, ready to print.</span>
      </form>
      {error && <p role="alert" className="text-xs text-[var(--color-danger)] mt-1">{error}</p>}
      {scanning && (
        <ScanSheet
          title="Scan a pack's QR"
          hint="Point the camera at the QR in the sticker's header. The label it came from opens, ready to print again."
          onScan={(t) => { setScanning(false); go(t); }}
          onClose={() => setScanning(false)}
        />
      )}
    </section>
  );
}
