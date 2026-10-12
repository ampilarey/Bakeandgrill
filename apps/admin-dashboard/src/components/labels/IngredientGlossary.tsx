import { useEffect, useMemo, useState } from 'react';
import { BookA, Check, Plus, Search, Trash2 } from 'lucide-react';
import { Button, Card, useToast } from '../ui';
import { deleteGlossaryWord, fetchLabelGlossary, saveGlossaryWord, updateGlossaryWord, type GlossaryMissing, type GlossaryWord } from '../../api';

/*
 * The ingredient glossary (2026-10-12): English → Dhivehi, so a recipe's
 * inventory names and a typed list print a Dhivehi ingredients line without
 * a Dhivehi name on every inventory item. "Needs Dhivehi" lists the words
 * on labels the glossary does not know yet; a Dhivehi typed there is a new
 * word. A Dhivehi line prints only when every word is known.
 */

const input = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm w-full';

export function IngredientGlossary({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [words, setWords] = useState<GlossaryWord[]>([]);
  const [missing, setMissing] = useState<GlossaryMissing[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newEn, setNewEn] = useState('');
  const [newDv, setNewDv] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = () => fetchLabelGlossary().then((r) => { setWords(r.data); setMissing(r.missing); }).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? words.filter((w) => w.word.includes(q) || w.dv.includes(query.trim())) : words;
  }, [words, query]);

  const fail = (e: unknown, what: string) => toast('error', e instanceof Error ? e.message : what);

  const add = async (en: string, dv: string, key: string) => {
    if (!en.trim() || !dv.trim()) return;
    setBusy(key);
    try {
      await saveGlossaryWord({ en: en.trim(), dv: dv.trim() });
      setDraft((d) => ({ ...d, [key]: '' }));
      if (key === 'new') { setNewEn(''); setNewDv(''); }
      await load();
    } catch (e) {
      fail(e, 'Could not save the word.');
    } finally {
      setBusy(null);
    }
  };
  const change = async (w: GlossaryWord, dv: string) => {
    if (dv.trim() === w.dv || !dv.trim()) return;
    try { await updateGlossaryWord(w.id, { dv: dv.trim() }); await load(); } catch (e) { fail(e, 'Could not save the word.'); }
  };
  const remove = async (w: GlossaryWord) => {
    if (!window.confirm(`Remove "${w.en}" from the glossary?`)) return;
    try { await deleteGlossaryWord(w.id); await load(); } catch (e) { fail(e, 'Could not remove the word.'); }
  };

  return (
    <Card padding="none" header={<div className="flex flex-wrap items-center gap-3"><div className="flex-1 min-w-[200px]"><h3 className="font-bold text-[var(--color-text)] flex items-center gap-2"><BookA size={18} className="text-[var(--color-primary)]" aria-hidden /> Ingredient glossary</h3><p className="text-xs text-[var(--color-text-muted)] mt-1">English → Dhivehi. A recipe's inventory names and a typed ingredients list print their Dhivehi line from here (an inventory item's own Dhivehi name wins). The line prints only when every word is known.</p></div></div>}>
      {missing.length > 0 && (
        <div className="px-4 py-3 border-b border-[var(--color-border-light)]" style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }} data-testid="glossary-missing">
          <p className="text-sm font-semibold text-[var(--color-text)]">Needs Dhivehi ({missing.length})</p>
          <p className="text-xs text-[var(--color-text-muted)] mb-2">Words on labels the glossary does not know. Type the Dhivehi and press the tick; the product's Dhivehi line prints once every word is in.</p>
          <ul className="space-y-2">
            {missing.map((m) => (
              <li key={m.word} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[140px] text-sm font-semibold text-[var(--color-text)] capitalize">{m.word}<span className="block text-[11px] font-normal text-[var(--color-text-muted)]">{m.products.join(', ')}</span></span>
                <input dir="rtl" value={draft[m.word] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [m.word]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') void add(m.word, draft[m.word] ?? '', m.word); }} disabled={!canManage} placeholder="ދިވެހި" aria-label={`Dhivehi for ${m.word}`} className={`${input} !w-auto flex-1 min-w-[160px]`} />
                <Button size="sm" icon={<Check size={14} />} loading={busy === m.word} disabled={!canManage || !(draft[m.word] ?? '').trim()} onClick={() => add(m.word, draft[m.word] ?? '', m.word)} aria-label={`Save Dhivehi for ${m.word}`}>Save</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--color-border-light)]">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a word" aria-label="Find a word" className={`${input} pl-9`} />
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-text)]">{open ? 'Hide' : 'Show'} all {words.length} words</button>
      </div>
      {canManage && (
        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-[var(--color-border-light)]" data-testid="glossary-add">
          <div className="flex-1 min-w-[140px]"><label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor="glossary-new-en">English</label><input id="glossary-new-en" value={newEn} onChange={(e) => setNewEn(e.target.value)} maxLength={80} placeholder="e.g. cashew nuts" className={input} /></div>
          <div className="flex-1 min-w-[140px]"><label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1" htmlFor="glossary-new-dv">Dhivehi</label><input id="glossary-new-dv" dir="rtl" value={newDv} onChange={(e) => setNewDv(e.target.value)} maxLength={160} onKeyDown={(e) => { if (e.key === 'Enter') void add(newEn, newDv, 'new'); }} className={input} /></div>
          <Button icon={<Plus size={16} />} loading={busy === 'new'} disabled={!newEn.trim() || !newDv.trim()} onClick={() => add(newEn, newDv, 'new')}>Add word</Button>
        </div>
      )}
      {(open || query.trim()) && (
        <ul className="divide-y divide-[var(--color-border-light)] max-h-[420px] overflow-y-auto" data-testid="glossary-words">
          {shown.map((w) => (
            <li key={w.id} className="flex items-center gap-2 px-4 py-1.5">
              <span className="w-[42%] min-w-[110px] text-sm text-[var(--color-text)] truncate" title={w.en}>{w.en}</span>
              <input dir="rtl" defaultValue={w.dv} key={w.id + ':' + w.dv} disabled={!canManage} onBlur={(e) => change(w, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label={`Dhivehi for ${w.en}`} className={`${input} !h-9 !min-h-[36px] flex-1`} />
              {canManage && <button type="button" onClick={() => remove(w)} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]" aria-label={`Remove ${w.en}`}><Trash2 size={15} /></button>}
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No word matches.</li>}
        </ul>
      )}
    </Card>
  );
}
