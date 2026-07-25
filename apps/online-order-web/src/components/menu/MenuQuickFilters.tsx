import type { SaleFilter } from './FilterChipsRow';

type Props = {
  saleFilter: SaleFilter;
  onChange: (v: SaleFilter) => void;
  discountCount: number;
  specialCount: number;
  bestsellerCount: number;
};

function QuickChip({
  active,
  disabled,
  danger,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`menu-quick-filter__chip${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
    >
      {children}
    </button>
  );
}

/**
 * Compact deal / popularity filters beside Grid/List on the menu sticky bar.
 */
export function MenuQuickFilters({
  saleFilter,
  onChange,
  discountCount,
  specialCount,
  bestsellerCount,
}: Props) {
  const toggle = (value: SaleFilter) => {
    onChange(saleFilter === value ? 'all' : value);
  };

  const hasAny = discountCount > 0 || specialCount > 0 || bestsellerCount > 0;
  if (!hasAny) return null;

  return (
    <div
      className="menu-quick-filters"
      role="group"
      aria-label="Deal and popularity filters"
      data-testid="menu-quick-filters"
    >
      {discountCount > 0 && (
        <QuickChip
          danger
          active={saleFilter === 'discount'}
          onClick={() => toggle('discount')}
        >
          {`% Off (${discountCount})`}
        </QuickChip>
      )}
      {specialCount > 0 && (
        <QuickChip
          danger
          active={saleFilter === 'special'}
          onClick={() => toggle('special')}
        >
          {`Promos (${specialCount})`}
        </QuickChip>
      )}
      {bestsellerCount > 0 && (
        <QuickChip
          active={saleFilter === 'bestseller'}
          onClick={() => toggle('bestseller')}
        >
          {`Top sellers (${bestsellerCount})`}
        </QuickChip>
      )}
    </div>
  );
}
