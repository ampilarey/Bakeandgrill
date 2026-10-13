import { useState } from 'react';
import { Bluetooth, Plug, Printer } from 'lucide-react';
import { DEFAULT_PRINTER_SETUP, readPrinterSetup, savePrinterSetup, type PrinterSetup } from '../../api';
import { Button, Card, useToast } from '../ui';
import { bluetoothSupported, bluetoothWhyNot, pairPrinter, pairedPrinter, rememberedPrinterName } from './bluetoothPrinter';

/*
 * The label printer this computer prints to (round C, 2026-10-12). Pack
 * stickers → Prepare → "Send to label printer" hands the sheet, as ZPL or
 * TSPL, to the print agent running on this computer
 * (scripts/label-print-agent.mjs), which sends it to the printer over the
 * network (port 9100). The setup is kept in this browser: each till or
 * office computer has its own printer.
 */

const input = 'h-10 min-h-[44px] w-full px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)]';
const label = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';

export function LabelPrinterCard() {
  const { toast } = useToast();
  const [setup, setSetup] = useState<PrinterSetup>(() => readPrinterSetup());
  const [checking, setChecking] = useState(false);
  const [agentWords, setAgentWords] = useState<string | null>(null);
  const set = <K extends keyof PrinterSetup>(key: K, value: PrinterSetup[K]) => setSetup((s) => ({ ...s, [key]: value }));
  // Round 16: Bluetooth from this phone or tablet, no agent and no network address.
  const viaBt = setup.via === 'bluetooth';
  const [btName, setBtName] = useState<string | null>(() => pairedPrinter()?.name ?? null);
  const [pairing, setPairing] = useState(false);
  const pair = async () => {
    setPairing(true);
    try {
      const p = await pairPrinter();
      setBtName(p.name);
      toast('success', `Paired with ${p.name}.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not pair the printer.');
    } finally {
      setPairing(false);
    }
  };

  const save = () => {
    const clean: PrinterSetup = { ...setup, agent: setup.agent.trim() || DEFAULT_PRINTER_SETUP.agent, host: setup.host.trim(), port: Number(setup.port) > 0 ? Number(setup.port) : 9100, via: setup.via === 'bluetooth' ? 'bluetooth' : 'agent' };
    savePrinterSetup(clean);
    setSetup(clean);
    toast('success', clean.via === 'bluetooth' ? 'Label printer saved for this phone.' : 'Label printer saved for this computer.');
  };

  const check = async () => {
    setChecking(true); setAgentWords(null);
    try {
      const res = await fetch(`${setup.agent.trim().replace(/\/$/, '') || DEFAULT_PRINTER_SETUP.agent}/`, { method: 'GET' });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; agent?: string; version?: string };
      setAgentWords(res.ok && body.ok ? `Print agent found${body.version ? ` (version ${body.version})` : ''}.` : 'Something answered, but it is not the print agent.');
    } catch {
      setAgentWords('No print agent at that address. Start it on this computer: node scripts/label-print-agent.mjs');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card padding="md">
    <div data-testid="label-printer-card">
      <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2"><Printer size={18} aria-hidden /> Label printer on this computer</h3>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">Stickers prepared on Print labels at a label-printer size can go straight to a thermal label printer: Prepare, then Send to label printer. The print agent (scripts/label-print-agent.mjs, a small program run on this computer) fetches the stickers in the printer's language and sends them to the printer over the network. Kept in this browser only.</p>
      <div className="mb-3">
        <span className={label}>How it reaches the printer</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="How it reaches the printer">
          {([['agent', 'Network, through the print agent'], ['bluetooth', 'Bluetooth, from this phone or tablet']] as const).map(([v, words]) => (
            <button key={v} type="button" aria-pressed={(setup.via ?? 'agent') === v} onClick={() => set('via', v)} data-testid={`printer-via-${v}`}
              className={['h-8 px-3 rounded-full border text-sm font-semibold', (setup.via ?? 'agent') === v ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'].join(' ')}>{words}</button>
          ))}
        </div>
        {viaBt && (
          <div className="mt-2 text-xs text-[var(--color-text-secondary)] space-y-2" data-testid="printer-bluetooth">
            {bluetoothSupported() ? (
              <>
                <p>Switch the printer on, keep it near the phone, and pair it here once. Print labels → Prepare → Print over Bluetooth then sends the stickers to it. Works in Chrome on Android and on a computer.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" icon={<Bluetooth size={14} />} onClick={() => void pair()} loading={pairing} data-testid="printer-pair">{btName ? 'Pair another printer' : 'Pair the printer'}</Button>
                  <span role="status">{btName ? `Paired: ${btName}.` : rememberedPrinterName() ? `Last paired: ${rememberedPrinterName()}. Pick it again when asked.` : 'Not paired yet.'}</span>
                </div>
              </>
            ) : (
              <p role="alert" className="text-[var(--color-warning)] font-semibold">{bluetoothWhyNot()}</p>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <div>
          <label className={label} htmlFor="printer-language">Printer language</label>
          <select id="printer-language" value={setup.language} onChange={(e) => set('language', e.target.value === 'zpl' ? 'zpl' : 'tspl')} className={input}>
            <option value="tspl">TSPL · TSC, Xprinter, iDPRT, most unbranded printers</option>
            <option value="zpl">ZPL · Zebra and printers that emulate it</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="printer-dpi">Dots per inch</label>
          <select id="printer-dpi" value={setup.dpi} onChange={(e) => set('dpi', e.target.value === '300' ? 300 : 203)} className={input}>
            <option value={203}>203 dpi · the usual</option>
            <option value={300}>300 dpi</option>
          </select>
        </div>
        {!viaBt && <>
        <div>
          <label className={label} htmlFor="printer-host">Printer address</label>
          <input id="printer-host" value={setup.host} onChange={(e) => set('host', e.target.value)} className={input} placeholder="192.168.1.50" />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">The printer's IP address on the shop network, from its self-test page.</p>
        </div>
        <div>
          <label className={label} htmlFor="printer-port">Port</label>
          <input id="printer-port" type="number" inputMode="numeric" min={1} max={65535} value={setup.port} onChange={(e) => set('port', Number(e.target.value))} className={input} />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">9100 on nearly every network label printer.</p>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="printer-agent">Print agent address</label>
          <input id="printer-agent" value={setup.agent} onChange={(e) => set('agent', e.target.value)} className={input} placeholder={DEFAULT_PRINTER_SETUP.agent} />
        </div>
        </>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={save} data-testid="printer-save">{viaBt ? 'Save for this phone' : 'Save for this computer'}</Button>
        {!viaBt && <Button variant="secondary" icon={<Plug size={16} />} onClick={() => void check()} loading={checking} data-testid="printer-check">Check the agent</Button>}
        {agentWords && <span className="text-sm text-[var(--color-text-secondary)]" role="status">{agentWords}</span>}
      </div>
    </div>
    </Card>
  );
}
