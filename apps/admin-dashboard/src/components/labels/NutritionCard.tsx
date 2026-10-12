import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleAlert } from 'lucide-react';
import { fetchLabelNutrition, saveIngredientNutrition, NUTRITION_KEYS, type NutritionIngredient, type NutritionKey, type NutritionProduct } from '../../api';
import { Button, Card, useToast } from '../ui';

/*
 * Nutrition per 100 g (round C, 2026-10-12). Each ingredient the
 * label-enabled recipes use carries its values per 100 g; the recipe's
 * grams of each give the product's panel, printed on the full sticker when
 * the item asks (Menu → item → Label). The ingredients still without values
 * come first; the rest behind Show all. Each product's standing is listed
 * so the owner sees why a panel does not print yet.
 */

type Draft = Record<NutritionKey, string>;
const SHORT: Record<NutritionKey, string> = { kcal: 'kcal', fat: 'Fat g', sat_fat: 'Sat. g', carbs: 'Carbs g', sugars: 'Sugars g', protein: 'Protein g', salt: 'Salt g' };
const blank = (): Draft => ({ kcal: '', fat: '', sat_fat: '', carbs: '', sugars: '', protein: '', salt: '' });
const fromValues = (n: NutritionIngredient['nutrition']): Draft => (n ? (Object.fromEntries(NUTRITION_KEYS.map((k) => [k, n[k] != null ? String(n[k]) : ''])) as Draft) : blank());
const same = (a: Draft, b: Draft) => NUTRITION_KEYS.every((k) => (a[k] || '') === (b[k] || ''));

/** One line for a product's panel as it stands. */
export function panelWords(p: NutritionProduct): string {
  if (p.complete) {
    const v = p.per100;
    return `${v.kcal ?? 0} kcal · fat ${v.fat ?? 0} g · carbs ${v.carbs ?? 0} g · protein ${v.protein ?? 0} g · salt ${v.salt ?? 0} g per 100 g${p.show ? '' : ' · not switched on for the sticker'}`;
  }
  const parts: string[] = [];
  if (p.missing.length) parts.push(`needs values for ${p.missing.join(', ')}`);
  if (p.unweighed.length) parts.push(`${p.unweighed.join(', ')} not in grams`);
  return parts.join('; ');
}

const input = 'h-10 min-h-[44px] w-full px-2 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)]';

export function NutritionCard({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<NutritionIngredient[]>([]);
  const [products, setProducts] = useState<NutritionProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showProducts, setShowProducts] = useState(false);

  const load = () => fetchLabelNutrition()
    .then((r) => {
      setRows(r.data);
      setProducts(r.products);
      setDrafts(Object.fromEntries(r.data.map((i) => [i.id, fromValues(i.nutrition)])));
    })
    .catch(() => undefined)
    .finally(() => setLoaded(true));
  useEffect(() => { void load(); }, []);

  const missing = rows.filter((r) => r.nutrition === null);
  const shown = showAll ? rows : missing;
  const set = (id: number, key: NutritionKey, value: string) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? blank()), [key]: value } }));

  const save = async (row: NutritionIngredient) => {
    const d = drafts[row.id] ?? blank();
    setSaving(row.id);
    try {
      const r = await saveIngredientNutrition(row.id, Object.fromEntries(NUTRITION_KEYS.map((k) => [k, d[k].trim() === '' ? null : Number(d[k])])));
      setRows((rs) => rs.map((x) => (x.id === row.id ? { ...x, nutrition: r.data.nutrition } : x)));
      setDrafts((ds) => ({ ...ds, [row.id]: fromValues(r.data.nutrition) }));
      toast('success', r.data.nutrition ? `${row.name}: values per 100 g saved.` : `${row.name}: values cleared.`);
      // The products' standing changes with it.
      const again = await fetchLabelNutrition();
      setProducts(again.products);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card padding="md">
    <div data-testid="nutrition-card">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)]">Nutrition per 100 g</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Type each ingredient's values per 100 g (from its packet or a food table). A product's panel is worked out from its recipe and prints on the full-size sticker once the item switches it on (Menu → the item → Label).</p>
        </div>
        {missing.length > 0 && <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold bg-[var(--color-tone-gold-bg)] text-[var(--color-tone-gold-text)] border border-[var(--color-tone-gold-border)]"><CircleAlert size={13} aria-hidden /> Needs values ({missing.length})</span>}
      </div>

      {loaded && rows.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)] py-2">No product on labels has a recipe yet. Give a product a recipe and its food ingredients appear here.</p>
      )}

      {products.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowProducts((s) => !s)} aria-expanded={showProducts} className="inline-flex items-center gap-1 min-h-[32px] text-sm font-semibold text-[var(--color-text)]" data-testid="nutrition-products-toggle">
            {showProducts ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            {products.filter((p) => p.complete).length} of {products.length} {products.length === 1 ? 'product has' : 'products have'} a panel
          </button>
          {showProducts && (
            <ul className="mt-1 divide-y divide-[var(--color-border-light)] border border-[var(--color-border)] rounded-xl overflow-hidden" data-testid="nutrition-products">
              {products.map((p) => (
                <li key={p.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                  {p.complete ? <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--color-success)]" /> : <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--color-warning)]" />}
                  <span className="min-w-0"><span className="font-semibold text-[var(--color-text)]">{p.name}</span> <span className="text-[var(--color-text-secondary)]">· {panelWords(p)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <ul className="mt-3 space-y-3" data-testid="nutrition-ingredients">
          {shown.map((row) => {
            const d = drafts[row.id] ?? blank();
            const dirty = !same(d, fromValues(row.nutrition));
            return (
              <li key={row.id} className="rounded-xl border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-[var(--color-text)]">{row.name}</span>
                    <span className="text-xs text-[var(--color-text-muted)] ml-2">used by {row.used_by.join(', ')}</span>
                  </div>
                  {row.nutrition === null && <span className="text-xs font-semibold text-[var(--color-warning)]">No values yet</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {NUTRITION_KEYS.map((k) => (
                    <div key={k}>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-0.5" htmlFor={`nutrition-${row.id}-${k}`}>{SHORT[k]}</label>
                      <input id={`nutrition-${row.id}-${k}`} type="number" inputMode="decimal" min={0} max={k === 'kcal' ? 900 : 100} step="0.1" value={d[k]} disabled={!canManage} onChange={(e) => set(row.id, k, e.target.value)} className={input} aria-label={`${row.name}: ${SHORT[k]} per 100 g`} />
                    </div>
                  ))}
                </div>
                {canManage && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" onClick={() => void save(row)} loading={saving === row.id} disabled={!dirty || d.kcal.trim() === '' && NUTRITION_KEYS.some((k) => d[k].trim() !== '')} aria-label={`Save values for ${row.name}`}>Save</Button>
                    {d.kcal.trim() === '' && NUTRITION_KEYS.some((k) => d[k].trim() !== '') && <span className="text-xs text-[var(--color-danger)]">Type the kcal too.</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {loaded && rows.length > 0 && missing.length === 0 && !showAll && <p className="text-sm text-[var(--color-success)] font-semibold mt-2">Every ingredient has its values.</p>}
      {rows.length > missing.length && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 inline-flex items-center gap-1 min-h-[32px] text-sm font-semibold text-[var(--color-primary)]" data-testid="nutrition-show-all">
          {showAll ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          {showAll ? 'Show only the ones needing values' : `Show all ${rows.length} ingredients`}
        </button>
      )}
    </div>
    </Card>
  );
}
