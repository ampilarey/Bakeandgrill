import { useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Category, Item } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useShellNavOptional } from '../context/ShellNavContext';
import { ProductCard } from './menu/ProductCard';
import type { Variant } from '@shared/types';

type Props = {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  items: Item[];
  categories: Category[];
  onSelectItem: (item: Item, qty: number) => void;
  onAddToCart: (
    item: Item,
    quantity: number,
    variant?: Variant | null,
    packagingOptionId?: number | null,
  ) => void;
  onSelectCategory: (categoryId: number) => void;
  favouriteIds: Set<number>;
  onToggleFavourite?: (itemId: number) => void;
};

/**
 * Full-screen menu search. Sets hideNav while open (covers bottom nav).
 */
export function SearchOverlay({
  open,
  onClose,
  query,
  onQueryChange,
  items,
  categories,
  onSelectItem,
  onAddToCart,
  onSelectCategory,
  favouriteIds,
  onToggleFavourite,
}: Props) {
  const { t } = useLanguage();
  const shellNav = useShellNavOptional();
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open || !shellNav) return;
    shellNav.setHideNav(true);
    return () => shellNav.setHideNav(false);
  }, [open, shellNav]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q),
    );
  }, [items, q]);

  const popular = useMemo(
    () => items.filter((i) => (i.dietary_tags ?? []).length > 0 || !!i.special).slice(0, 6),
    [items],
  );

  const matchingCats = useMemo(() => {
    if (!q) return [];
    return categories.filter((c) => !c.parent_id && c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [categories, q]);

  if (!open) return null;

  return createPortal(
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={t('menu.search_aria')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)' as unknown as number,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 'var(--shell-max)',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem var(--page-gutter)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h2 id={titleId} className="sr-only">{t('menu.search_aria')}</h2>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('menu.search')}
          aria-label={t('menu.search_aria')}
          style={{
            flex: 1,
            minHeight: 44,
            padding: '0.65rem 0.85rem',
            border: '1.5px solid var(--color-border)',
            borderRadius: 12,
            fontFamily: 'inherit',
            fontSize: '1rem',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label={t('common.clear')}
            style={{
              minWidth: 44,
              minHeight: 44,
              border: 'none',
              borderRadius: 999,
              background: 'var(--color-surface-alt)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 700,
            }}
          >
            ×
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            minHeight: 44,
            padding: '0 0.85rem',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-primary)',
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {t('common.cancel')}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem var(--page-gutter)' }}>
        <p aria-live="polite" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
          {q ? t('menu.search_results_count').replace('{n}', String(results.length)) : ''}
        </p>

        {!q && (
          <>
            {popular.length > 0 && (
              <section style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800 }}>{t('menu.popular')}</h3>
                <div className="menu-grid">
                  {popular.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      onSelectItem={(it, qty) => { onSelectItem(it, qty); onClose(); }}
                      onAddToCart={onAddToCart}
                      isFavourite={favouriteIds.has(item.id)}
                      onToggleFavourite={onToggleFavourite}
                    />
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800 }}>{t('menu.categories')}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {categories.filter((c) => !c.parent_id).slice(0, 12).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { onSelectCategory(cat.id); onClose(); }}
                    style={{
                      padding: '0.55rem 0.9rem',
                      borderRadius: 999,
                      border: '1.5px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      fontFamily: 'inherit',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {q && results.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-title">{t('menu.no_results').replace('{q}', query)}</p>
            <button
              type="button"
              onClick={() => onQueryChange('')}
              style={{
                marginTop: '0.75rem',
                border: 'none',
                background: 'none',
                color: 'var(--color-primary)',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t('common.clear')}
            </button>
          </div>
        )}

        {q && matchingCats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {matchingCats.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { onSelectCategory(cat.id); onClose(); }}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: 999,
                  border: '1.5px solid var(--color-primary)',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {q && results.length > 0 && (
          <div className="menu-grid">
            {results.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onSelectItem={(it, qty) => { onSelectItem(it, qty); onClose(); }}
                onAddToCart={onAddToCart}
                isFavourite={favouriteIds.has(item.id)}
                onToggleFavourite={onToggleFavourite}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
