import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Btn } from '../SharedUI';
import { inputFont } from '../../utils/cssVars';
import { fetchMenuPlan, readMenuPlanFile, saveMenuPlan } from '../../api/ai';

/*
 * Your plan for the menu (owner, 2026-11-24: "Is there any way to upload recommended menu
 * and category so api can rethink about that before suggestions" → "File upload" →
 * "Both"). The sections and sub-sections the owner wants, typed, pasted or read from a
 * file. Look now on New sections follows it. A file only fills the box: it is the
 * person's Save that keeps it.
 */
export function MenuPlanBox() {
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'read'>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let gone = false;
    fetchMenuPlan().then((r) => { if (!gone) { setSaved(r.plan); setText(r.plan); } }).catch(() => { /* not theirs to see */ });
    return () => { gone = true; };
  }, []);

  if (saved === null) return null;
  const changed = text.trim() !== saved.trim();

  const save = async (value: string) => {
    setBusy('save'); setError(''); setNote('');
    try {
      const r = await saveMenuPlan(value);
      setSaved(r.plan); setText(r.plan);
      setNote(r.plan === '' ? 'Plan removed. Look now decides by itself again.' : 'Plan saved. Press Look now to use it.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const read = async (file: File | undefined) => {
    if (!file) return;
    setBusy('read'); setError(''); setNote('');
    try {
      const r = await readMenuPlanFile(file);
      setText(r.plan);
      setNote('Read from the file. Check it, change what is wrong, then press Save plan.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); if (pick.current) pick.current.value = ''; }
  };

  return (
    <details className="sg-plan" data-testid="menu-plan">
      <summary>Your plan for the menu{saved !== '' ? <span className="sg-tag">in use</span> : null}</summary>
      <p className="sg-plan__help">
        Write the sections and sub-sections you want, one a line, with dishes under them if you like. Look now then follows your plan and only adds
        a section of its own for dishes that fit nowhere in it. Leave it empty to let the assistant decide.
      </p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={8000} spellCheck={false}
        aria-label="Your plan for the menu" data-testid="menu-plan-text"
        placeholder={'Snacks\n  Momo\n  Rolls\n  Short eats\nDrinks\n  Fresh juices\n  Hot drinks\nDesserts'}
        style={inputFont({ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14, lineHeight: 1.45, fontFamily: 'inherit', resize: 'vertical' })}
      />
      <input ref={pick} type="file" hidden accept="image/*,application/pdf,.txt,.csv,.xlsx,.xls,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(e) => void read(e.target.files?.[0])} data-testid="menu-plan-file" />
      <div className="sg-actions">
        <Btn small disabled={busy !== '' || !changed} onClick={() => void save(text)} data-testid="menu-plan-save">{busy === 'save' ? 'Saving…' : 'Save plan'}</Btn>
        <Btn small variant="secondary" disabled={busy !== ''} onClick={() => pick.current?.click()} data-testid="menu-plan-upload">
          <Upload size={14} aria-hidden />{busy === 'read' ? 'Reading the file…' : 'Upload a file'}
        </Btn>
        {saved !== '' && <Btn small variant="danger-outline" disabled={busy !== ''} onClick={() => void save('')}>Remove plan</Btn>}
      </div>
      <p className="sg-plan__help">A file can be an Excel sheet, a PDF, a photo, a scan or a text file. In Excel, put sections in the first column, sub-sections in the next and dishes in the one after. Reading a photo or PDF can take a minute.</p>
      {note && <p role="status" className="sg-plan__note" data-testid="menu-plan-note">{note}</p>}
      {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, margin: '6px 0 0' }}>{error}</p>}
    </details>
  );
}
