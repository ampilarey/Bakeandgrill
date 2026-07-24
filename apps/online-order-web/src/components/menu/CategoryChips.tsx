import { useEffect, useRef } from 'react';
import type { Category } from '../../api';
import { useLanguage } from '../../context/LanguageContext';

type Props = {
  categories: Category[];
  activeCategoryId: number | null;
  onSelect: (id: number) => void;
  dimmed?: boolean;
  showOffersPill?: boolean;
  onOffersClick?: () => void;
};

/**
 * Sticky horizontal category chips — scrollable, active highlighted, tap scrolls to section.
 */
export function CategoryChips({
  categories,
  activeCategoryId,
  onSelect,
  dimmed = false,
  showOffersPill = false,
  onOffersClick,
}: Props) {
  const { t } = useLanguage();
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeCategoryId]);

  if (categories.length === 0) return null;

  return (
    <nav
      className={`menu-cat-chips${dimmed ? ' is-dimmed' : ''}`}
      aria-label={t('menu.categories')}
      data-testid="menu-cat-chips"
    >
      <div className="menu-cat-chips__scroller" role="tablist" aria-orientation="horizontal">
        {showOffersPill && onOffersClick && (
          <button
            type="button"
            role="tab"
            className="menu-cat-chip menu-cat-chip--offers"
            onClick={onOffersClick}
          >
            Offers
          </button>
        )}
        {categories.map((cat) => {
          const active = activeCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              className={`menu-cat-chip${active ? ' is-active' : ''}`}
              onClick={() => onSelect(cat.id)}
              data-active={active ? 'true' : undefined}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
