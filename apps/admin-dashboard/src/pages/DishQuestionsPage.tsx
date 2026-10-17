import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { Btn, EmptyState, Pagination, TabScrollRow } from '../components/SharedUI';
import { answerItemQuestion, fetchItemQuestions, hideItemQuestion, type ItemQuestion } from '../api';

/*
 * Questions customers ask about a dish ("Is it spicy?", "Does it have nuts?"),
 * iruali import plan, feature 7. They wait here; only answered ones show on
 * the menu. The asker is texted on the first answer.
 */
const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'answered', label: 'Answered' },
  { id: 'hidden', label: 'Hidden' },
] as const;

const chip = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
  color: active ? 'var(--color-on-primary)' : 'var(--color-text-secondary)',
  whiteSpace: 'nowrap',
});

function QuestionCard({ q, onChanged }: { q: ItemQuestion; onChanged: () => void }) {
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [addToDetails, setAddToDetails] = useState(false);
  const [editing, setEditing] = useState(q.status !== 'answered');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); onChanged(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid={`question-${q.id}`} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, background: 'var(--color-surface)' }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
        <strong style={{ color: 'var(--color-text)' }}>{q.item?.name ?? 'A dish'}</strong>
        {' · '}{q.customer?.name || 'A customer'}{' · '}{new Date(q.created_at).toLocaleString()}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--color-text)', overflowWrap: 'anywhere' }}>{q.question}</p>

      {!editing && q.answer && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderLeft: '3px solid var(--color-primary)', background: 'var(--color-bg)', fontSize: 13 }}>
          {q.answer}
          {q.allergy_note && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>{q.allergy_note}</p>}
        </div>
      )}

      {editing && (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            maxLength={1000}
            aria-label="Answer"
            placeholder="Your answer, as the customer will read it"
            style={{ marginTop: 10, width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 14, fontFamily: 'inherit' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={addToDetails} onChange={(e) => setAddToDetails(e.target.checked)} />
            Also add the answer to the dish's description on the menu
          </label>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            An answer that mentions an allergen shows "Please tell staff about any allergy when you order." under it.
          </p>
        </>
      )}

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, margin: '6px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {editing ? (
          <Btn small onClick={() => void run(() => answerItemQuestion(q.id, answer.trim(), addToDetails))} disabled={busy || answer.trim() === ''}>
            {q.status === 'answered' ? 'Save answer' : 'Answer'}
          </Btn>
        ) : (
          <Btn small variant="secondary" onClick={() => setEditing(true)}>Edit answer</Btn>
        )}
        {q.status !== 'hidden' && (
          <Btn small variant="danger-outline" onClick={() => void run(() => hideItemQuestion(q.id))} disabled={busy}>Hide</Btn>
        )}
      </div>
    </div>
  );
}

export default function DishQuestionsPage() {
  usePageTitle('Dish questions');
  const [status, setStatus] = useState<'pending' | 'answered' | 'hidden'>('pending');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ItemQuestion[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchItemQuestions({ status, page });
      setRows(res.data); setMeta(res.meta); setPending(res.pending);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [status, page]);

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
        Questions customers ask about a dish. Only answered ones show on the menu, and the customer is texted when you answer.
      </p>
      <TabScrollRow fit style={{ gap: 6, marginBottom: 14 }} role="tablist" aria-label="Questions">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={status === f.id} style={chip(status === f.id)} onClick={() => { setStatus(f.id); setPage(1); }}>
            {f.label}{f.id === 'pending' && pending > 0 ? ` ${pending}` : ''}
          </button>
        ))}
      </TabScrollRow>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message={status === 'pending' ? 'No questions waiting.' : 'Nothing here.'} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((q) => <QuestionCard key={`${q.id}-${q.status}-${q.answer ?? ''}`} q={q} onChanged={() => void load()} />)}
        </div>
      )}
      <Pagination page={page} totalPages={meta.last_page} onChange={setPage} />
    </div>
  );
}
