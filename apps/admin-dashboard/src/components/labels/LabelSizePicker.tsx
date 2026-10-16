import { ArrowLeftRight, ChevronDown, Circle, RectangleVertical } from 'lucide-react';
import type { LabelLimits, LabelPreset, LabelRoll } from '../../api';
import { TabScrollRow } from '../SharedUI';
import {
  DESIGN_NAMES, designFor, pickRoll, rollChoice, rollName, rollStock, rollStockWords, sizeCm, sizeName, sizeOf, sizeProblem, stockOf, stocksFor, switchShape, withPreset,
  type LabelShape, type SizeChoice,
} from './labelSize';

/*
 * Label size (owner, 2026-10-11: "Add label size. For example rectangular 4 cm
 * by 6 cm, circle 6 cm diameter ect."): the shape, a size in one tap or typed
 * in, and where it prints, with how many fit a sheet. The live preview beside
 * the form shows the result. With rolls registered under Settings (round 6,
 * 2026-10-13: "only the sizes you own") they come first, one chip each, and
 * the shape, every size and the stock fold away under More sizes, open only
 * while the choice is none of the rolls.
 */

type Props = {
  presets: LabelPreset[];
  limits: LabelLimits | null;
  choice: SizeChoice;
  onChange: (choice: SizeChoice) => void;
  rounded: boolean;
  onRounded: (rounded: boolean) => void;
  /** The rolls and sheets the business owns; none shows every size plainly. */
  rolls?: LabelRoll[];
  /** The roll picked by name (label audit, Batch C): two rolls of one size are told apart by it; told when a roll is tapped. */
  rollId?: string | null;
  onRoll?: (id: string) => void;
};

const labelClass = 'block text-xs font-semibold text-[var(--color-text-secondary)] mb-1';
const fieldClass = 'h-10 min-h-[44px] px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm text-[var(--color-text)] w-full';

function chipClass(on: boolean) {
  return [
    'h-8 px-3 rounded-full border text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5',
    on
      ? 'bg-[var(--color-tone-rust-bg)] border-[var(--color-tone-rust-border)] text-[var(--color-tone-rust-text)]'
      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
  ].join(' ');
}

export function LabelSizePicker({ presets, limits, choice, onChange, rounded, onRounded, rolls = [], rollId = null, onRoll: onRollPicked }: Props) {
  const ofShape = presets.filter((p) => p.shape === choice.shape);
  const custom = choice.preset === 'custom';
  const stocks = stocksFor(choice, presets);
  const stock = stockOf(choice, presets);
  const { w, h } = sizeOf(choice, presets);
  const problem = sizeProblem(choice, limits);
  const design = designFor(choice.shape, w, h);
  const where = stock.on === 'printer'
    ? 'one per label on a label printer'
    : stock.on === 'precut'
      ? `${stock.perPage} on a ready-cut A4 sheet`
      : `${stock.perPage} on ${stock.landscape ? 'a landscape' : 'an'} A4 sheet, cut on the dashed lines`;
  const setNum = (key: 'w' | 'h', value: string) => onChange({ ...choice, [key]: Number(value), ...(choice.shape === 'circle' && key === 'w' ? { h: Number(value) } : {}) });
  const onRoll = pickRoll(rolls, choice, presets, rollId).roll;

  const everySize = (
    <>
      <div>
        <span className={labelClass}>Shape</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Shape">
          {([['rect', 'Rectangle', RectangleVertical], ['circle', 'Round', Circle]] as const).map(([shape, name, Icon]) => (
            <button key={shape} type="button" aria-pressed={choice.shape === shape} onClick={() => onChange(switchShape(choice, shape as LabelShape, presets))} className={chipClass(choice.shape === shape)}>
              <Icon size={15} aria-hidden /> {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Size (mm)</span>
        <TabScrollRow role="group" aria-label="Label size" style={{ gap: 8 }}>
          {ofShape.map((p) => (
            <button key={p.id} type="button" aria-pressed={choice.preset === p.id} onClick={() => onChange(withPreset(choice, p.id, presets))} className={chipClass(choice.preset === p.id)} title={`${p.name} (${p.cm})`}>
              {p.shape === 'circle' ? `Ø ${p.w}` : `${p.w} × ${p.h}`}
            </button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => onChange(withPreset(choice, 'custom', presets))} className={chipClass(custom)}>Custom</button>
        </TabScrollRow>
      </div>

      {custom && (choice.shape === 'circle' ? (
        <div className="max-w-[200px]">
          <label className={labelClass} htmlFor="label-d">Across (mm)</label>
          <input id="label-d" type="number" inputMode="decimal" min={limits?.min_round ?? 30} max={limits?.max_round ?? 200} value={Number.isFinite(choice.w) ? choice.w : ''} onChange={(e) => setNum('w', e.target.value)} className={fieldClass} />
        </div>
      ) : (
        <div className="flex items-end gap-2 max-w-[360px]">
          <div className="flex-1"><label className={labelClass} htmlFor="label-w">Width (mm)</label><input id="label-w" type="number" inputMode="decimal" min={20} max={210} value={Number.isFinite(choice.w) ? choice.w : ''} onChange={(e) => setNum('w', e.target.value)} className={fieldClass} /></div>
          <div className="flex-1"><label className={labelClass} htmlFor="label-h">Height (mm)</label><input id="label-h" type="number" inputMode="decimal" min={20} max={297} value={Number.isFinite(choice.h) ? choice.h : ''} onChange={(e) => setNum('h', e.target.value)} className={fieldClass} /></div>
          <button type="button" onClick={() => onChange({ ...choice, w: choice.h, h: choice.w })} className="h-10 min-h-[44px] w-11 shrink-0 inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]" aria-label="Swap width and height" title="Swap width and height">
            <ArrowLeftRight size={16} aria-hidden />
          </button>
        </div>
      ))}

      <div>
        <span className={labelClass}>Print on</span>
        <TabScrollRow role="group" aria-label="Print on" style={{ gap: 8 }}>
          {stocks.map((s) => (
            <button key={s.on} type="button" aria-pressed={stock.on === s.on} onClick={() => onChange({ ...choice, on: s.on })} className={chipClass(stock.on === s.on)}>
              {s.label}{s.on !== 'printer' && s.perPage > 0 && !problem ? <span className="font-normal opacity-80">· {s.perPage}</span> : null}
            </button>
          ))}
        </TabScrollRow>
      </div>
    </>
  );

  return (
    <div className="space-y-3" data-testid="label-size-picker">
      {rolls.length > 0 && (
        <div>
          <span className={labelClass}>My label rolls</span>
          <TabScrollRow role="group" aria-label="My label rolls" style={{ gap: 8 }}>
            {rolls.map((r) => {
              const on = onRoll?.id === r.id;
              const rs = stockOf(rollChoice(r), presets);
              const stockOfRoll = rollStock(r);
              return (
                <button key={r.id} type="button" aria-pressed={on} onClick={() => { onRollPicked?.(r.id); onChange(rollChoice(r)); }} className={chipClass(on)} title={`${sizeName(r.shape, r.w, r.h)} · ${rs.label}${rollStockWords(r) ? ` · ${rollStockWords(r)}` : ''}`} data-low={stockOfRoll.lowNow ? 'true' : undefined}>
                  {rollName(r)}{r.name.trim() ? <span className="font-normal opacity-80">· {r.shape === 'circle' ? `Ø ${r.w}` : `${r.w} × ${r.h}`}</span> : null}
                  {stockOfRoll.left !== null && <span className={['font-normal', stockOfRoll.lowNow ? 'text-[var(--color-danger)] font-semibold' : 'opacity-80'].join(' ')}> · {stockOfRoll.left} left</span>}
                </button>
              );
            })}
          </TabScrollRow>
        </div>
      )}

      {rolls.length > 0 ? (
        <details className="rounded-xl border border-[var(--color-border)]" open={onRoll === null} data-testid="label-size-more">
          <summary className="cursor-pointer list-none px-3 min-h-[40px] flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] select-none">
            <ChevronDown size={16} className="shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            <span>More sizes</span>
            <span className="ml-auto text-xs font-normal text-[var(--color-text-muted)]">{onRoll ? 'Any shape, size or stock' : sizeName(choice.shape, w, h)}</span>
          </summary>
          <div className="px-3 pb-3 space-y-3">{everySize}</div>
        </details>
      ) : everySize}

      {problem ? (
        <p role="alert" className="text-xs text-[var(--color-danger-strong)]">{problem}</p>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]" data-testid="label-size-hint">
          {onRoll ? `${rollName(onRoll)} · ` : ''}{sizeName(choice.shape, w, h)} ({sizeCm(choice.shape, w, h)}) · {DESIGN_NAMES[design]} · {where}.
          {stock.on === 'precut' ? ' Nudge the position in Settings if it prints off the cut.' : ''}
        </p>
      )}

      {choice.shape === 'rect' && (
        <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={rounded} onChange={(e) => onRounded(e.target.checked)} className="w-5 h-5 accent-[var(--color-primary)]" />
          <span className="text-sm text-[var(--color-text)]">Rounded corners</span>
          <span className="text-xs text-[var(--color-text-muted)]">on the cut line</span>
        </label>
      )}
    </div>
  );
}
