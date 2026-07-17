import type { CSSProperties, ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';

export type SaleFilter = 'all' | 'discount' | 'special';

type DietaryOpt = { id: string; label: string };

type Props = {
  sortBy: string;
  onSortChange: (v: string) => void;
  saleFilter: SaleFilter;
  onSaleFilterChange: (v: SaleFilter) => void;
  dietaryFilter: string | null;
  onDietaryFilterChange: (v: string | null) => void;
  dietaryOptions: DietaryOpt[];
  discountCount: number;
  specialCount: number;
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
  danger,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...chipBase,
        border: active
          ? `2px solid ${danger ? '#dc2626' : 'var(--color-primary)'}`
          : chipBase.border,
        background: active
          ? (danger ? 'linear-gradient(135deg, #dc2626, #ea580c)' : 'var(--color-primary-light)')
          : chipBase.background,
        color: active
          ? (danger ? '#fff' : 'var(--color-primary)')
          : chipBase.color,
      }}
    >
      {children}
    </button>
  );
}

/** Horizontal filter/sort chips under the menu sticky header. */
export function FilterChipsRow({
  sortBy,
  onSortChange,
  saleFilter,
  onSaleFilterChange,
  dietaryFilter,
  onDietaryFilterChange,
  dietaryOptions,
  discountCount,
  specialCount,
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

      {(discountCount > 0 || specialCount > 0) && (
        <>
          <Chip active={saleFilter === 'all'} onClick={() => onSaleFilterChange('all')}>{t('menu.filter_all')}</Chip>
          {discountCount > 0 && (
            <Chip danger active={saleFilter === 'discount'} onClick={() => onSaleFilterChange('discount')}>
              % Off ({discountCount})
            </Chip>
          )}
          {specialCount > 0 && (
            <Chip danger active={saleFilter === 'special'} onClick={() => onSaleFilterChange('special')}>
              {t('menu.filter_specials')} ({specialCount})
            </Chip>
          )}
        </>
      )}

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
