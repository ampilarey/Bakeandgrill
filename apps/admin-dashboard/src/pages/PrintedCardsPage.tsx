import { useCallback, useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { Btn, ConfirmDialog, Input, PageHeader, PageShell, Select, TabScrollRow, TableCard, TD, TD_NOWRAP, TH, useConfirmDialog } from '../components/SharedUI';
import { deleteCardDesign, fetchCards, saveCardDesign, type CardDesign, type CardKind, type CardPrintRow, type CardSettings } from '../api/cards';
import { CardDesignForm } from './cards/CardDesignForm';
import { CardPreview } from './cards/CardPreview';
import { CardPrintControls } from './cards/CardPrintControls';
import { CARD_KINDS } from './cards/cardSpec';

const SOURCE_NAMES: Record<string, string> = { discount_batch: 'Discount card batch', promotion: 'Promo code', gift_card: 'Gift card', none: 'No code' };

/**
 * Printed cards (owner, 2026-10-18: "design and print discount cards" on a CR80 card
 * printer, not tied to one brand). Saved designs on the left, the live preview and the
 * PDF on the right, the print log below.
 */
export default function PrintedCardsPage() {
  usePageTitle('Printed cards');
  const [designs, setDesigns] = useState<CardDesign[]>([]);
  const [prints, setPrints] = useState<CardPrintRow[]>([]);
  const [defaults, setDefaults] = useState<Partial<Record<CardKind, CardSettings>>>({});
  const [current, setCurrent] = useState<{ id?: number; name: string; settings: CardSettings } | null>(null);
  const [newKind, setNewKind] = useState<CardKind>('discount');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const { state: dlg, ask, close } = useConfirmDialog();

  const load = useCallback(async (keepId?: number) => {
    try {
      const r = await fetchCards();
      setDesigns(r.designs);
      setPrints(r.prints);
      setDefaults(r.defaults);
      setCurrent((cur) => {
        const keep = r.designs.find((d) => d.id === (keepId ?? cur?.id));
        if (keep) return { id: keep.id, name: keep.name, settings: keep.settings };
        if (cur && !cur.id) return cur;
        const first = r.designs[0];
        return first ? { id: first.id, name: first.name, settings: first.settings } : { name: 'Discount card', settings: r.defaults.discount };
      });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the cards.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startNew = () => {
    const s = defaults[newKind];
    if (s) setCurrent({ name: CARD_KINDS.find((k) => k.value === newKind)?.label ?? 'Card', settings: s });
  };

  const save = async (asNew: boolean) => {
    if (!current) return;
    try {
      const r = await saveCardDesign({ id: asNew ? undefined : current.id, name: current.name.trim() || 'Card', settings: current.settings });
      setMsg('Design saved.');
      await load(r.design.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const remove = () => {
    const target = current;
    if (!target?.id) return;
    ask({
      title: 'Delete this design?',
      message: `“${target.name}” goes; cards already printed are not affected.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        void deleteCardDesign(target.id as number).then(() => { setCurrent(null); return load(); });
      },
    });
  };

  return (
    <PageShell>
      <ConfirmDialog state={dlg} close={close} />
      <PageHeader section="Customers & Marketing" title="Printed cards"
        subtitle="Design discount, gift, promo and stamp cards and print them on any card printer or on A4." />
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <TabScrollRow>
            {designs.map((d) => (
              <Btn key={d.id} small variant={current?.id === d.id ? 'primary' : 'secondary'} onClick={() => setCurrent({ id: d.id, name: d.name, settings: d.settings })}>{d.name}</Btn>
            ))}
            {current && !current.id && <Btn small variant="primary">{current.name} (new)</Btn>}
          </TabScrollRow>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Select label="New design" value={newKind} onChange={(k) => setNewKind(k as CardKind)} options={CARD_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
          <Btn small variant="secondary" onClick={startNew}>+ New</Btn>
        </div>
      </div>

      {current && (
        <div className="cards-layout" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}><Input label="Design name" value={current.name} maxLength={120} onChange={(name) => setCurrent({ ...current, name })} /></div>
              <Btn small onClick={() => void save(false)}>{current.id ? 'Save' : 'Save design'}</Btn>
              {current.id && <Btn small variant="secondary" onClick={() => void save(true)}>Save as new</Btn>}
              {current.id && <Btn small variant="danger-outline" onClick={remove}>Delete</Btn>}
            </div>
            {msg && <p style={{ fontSize: 13, margin: 0, color: 'var(--color-text-secondary)' }}>{msg}</p>}
            <CardDesignForm value={current.settings} onChange={(settings) => setCurrent({ ...current, settings })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <CardPreview settings={current.settings} />
            <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 12, padding: 12, background: 'var(--color-surface)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Print</h3>
              <CardPrintControls settings={current.settings} designId={current.id ?? null} onPrinted={() => void load(current.id)} />
            </div>
            <details style={{ border: '1px solid var(--color-border-light)', borderRadius: 12, padding: '10px 12px', background: 'var(--color-surface)', fontSize: 13, lineHeight: 1.5 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Setting up the card printer</summary>
              <ol style={{ paddingInlineStart: 18, margin: '8px 0 0' }}>
                <li>Install the printer’s own driver (Matica, Evolis, Zebra, Fargo, Magicard… all work the same way).</li>
                <li>In the driver’s settings, set the card size to the one you picked here (CR80 for normal cards) and turn on edge to edge if it offers it.</li>
                <li>Open the PDF, print, choose the card printer, and set the scale to <strong>Actual size</strong> or 100%, never Fit.</li>
                <li>Both sides: a printer that prints both sides takes “Both sides”. A one-sided printer takes “Fronts, then backs”: print, turn the stack over, feed it again. The backs are all the same, so their order does not matter.</li>
                <li>Try one card first. A4 sheets print on any printer; cut along the marks.</li>
              </ol>
            </details>
          </div>
        </div>
      )}

      <h3 style={{ margin: '24px 0 8px', fontSize: 15 }}>Printed lately</h3>
      <TableCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>When</th><th style={TH}>Design</th><th style={TH}>Codes from</th><th style={TH}>Cards</th><th style={TH}>On</th><th style={TH}>By</th></tr></thead>
          <tbody>
            {prints.length === 0 && <tr><td style={TD} colSpan={6}>Nothing printed yet.</td></tr>}
            {prints.map((p) => (
              <tr key={p.id}>
                <td style={TD_NOWRAP}>{p.at ? new Date(p.at).toLocaleString() : ''}</td>
                <td style={TD}>{p.design ?? 'Unsaved design'}</td>
                <td style={TD}>{SOURCE_NAMES[p.source] ?? p.source}{p.source_id ? ` #${p.source_id}` : ''}</td>
                <td style={TD_NOWRAP}>{p.cards}</td>
                <td style={TD}>{p.output === 'a4' ? 'A4 sheet' : 'Card printer'} · {p.sides === 'front' ? 'front' : p.sides === 'both' ? 'both sides' : 'fronts, then backs'}</td>
                <td style={TD}>{p.by ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </PageShell>
  );
}
