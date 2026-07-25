import type { CSSProperties, ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';

export type SaleFilter = 'all' | 'discount' | 'special' | 'bestseller';

type DietaryOpt = { id: string; label: string };

type Props = {
  sortBy: string;
  onSortChange: (v: string) => void;
  dietaryFilter: string | null;
  onDietaryFilterChange: (v: string | null) => void;
  dietaryOptions: DietaryOpt[];
  filtersActive: boolean;
  onClear: () => void;
};

const chipBase: CSSProperties = {
  height: 36,
  padding: '0 0.85rem',
  borderRadius: 999,
  fontSize: '0.8125rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border: '1.5px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
};

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...chipBase,
        border: active
          ? '2px solid var(--color-primary)'
          : chipBase.border,
        background: active
          ? 'var(--color-primary-light)'
          : chipBase.background,
        color: active
          ? 'var(--color-primary)'
          : chipBase.color,
      }}
    >
      {children}
    </button>
  );
}

/** Sort + dietary chips under the menu sticky header (deals live beside Grid/List). */
export function FilterChipsRow({
  sortBy,
  onSortChange,
  dietaryFilter,
  onDietaryFilterChange,
  dietaryOptions,
  filtersActive,
  onClear,
}: Props) {
  const { t } = useLanguage();

  return (
    <div
      className="filter-chips-row"
      style={{
        display: 'flex',
        gap: '0.5rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '0.15rem 0',
        marginTop: '0.65rem',
      }}
    >
      <Chip active={sortBy === 'name'} onClick={() => onSortChange('name')}>A–Z</Chip>
      <Chip active={sortBy === 'price-low'} onClick={() => onSortChange('price-low')}>{t('menu.sort_price_low')}</Chip>
      <Chip active={sortBy === 'price-high'} onClick={() => onSortChange('price-high')}>{t('menu.sort_price_high')}</Chip>

      {dietaryOptions.length > 0 && (
        <>
          <Chip active={dietaryFilter === null} onClick={() => onDietaryFilterChange(null)}>
            {t('menu.filter_all_diets')}
          </Chip>
          {dietaryOptions.map((opt) => (
            <Chip
              key={opt.id}
              active={dietaryFilter === opt.id}
              onClick={() => onDietaryFilterChange(dietaryFilter === opt.id ? null : opt.id)}
            >
              {opt.label}
            </Chip>
          ))}
        </>
      )}

      {filtersActive && (
        <Chip active onClick={onClear}>{t('menu.clear_filters')}</Chip>
      )}
    </div>
  );
}
