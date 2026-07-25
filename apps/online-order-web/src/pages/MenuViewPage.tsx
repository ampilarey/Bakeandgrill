/**
 * Standalone dine-in digital menu — view only (no cart, login, or AppShell).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cardDescriptionPreview } from '@shared/utils';
import { API_ORIGIN, fetchCategories, fetchItems, fetchOffers } from '../api';
import type { Category, Item, Offer } from '../api';
import { CategoryRail } from '../components/menu/CategoryRail';
import { MenuSectionHeader } from '../components/menu/MenuSectionHeader';
import { ProductCard } from '../components/menu/ProductCard';
import { OfferCard } from '../components/home/OfferCard';
import { ItemSheet } from '../components/ItemSheet';
import { useLanguage } from '../context/LanguageContext';
import { useSiteSettingsContext } from '../context/SiteSettingsContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { pickActiveSectionId } from '../utils/scrollSpy';
import { categoryScrollTop } from '../utils/menuScroll';
import { formatCardPrice } from '../utils/money';
import './MenuViewPage.css';

const NEW_ITEMS_CAP = 12;

function isItemNew(item: Item, newDays: number, nowMs = Date.now()): boolean {
  if (!item.created_at || !(newDays > 0)) return false;
  const created = new Date(item.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return nowMs - created <= newDays * 24 * 60 * 60 * 1000;
}

function itemDisplayName(item: Item, isDv: boolean): string {
  if (isDv) {
    return (item.card_name_dv || item.name_dv || item.card_name || item.name || '').trim();
  }
  return (item.card_name || item.name || '').trim();
}

function itemDetailLine(item: Item, isDv: boolean): string {
  if (isDv) {
    const dv = (item.short_description_dv || '').trim();
    if (dv) return dv;
  }
  const en = (item.short_description || '').trim();
  if (en) return en;
  return cardDescriptionPreview(item.description).text;
}

function itemListPrice(item: Item): number {
  const activeVariants = (item.variants ?? []).filter((v) => v.is_active);
  if (item.has_variants && activeVariants.length > 0) {
    return Math.min(...activeVariants.map((v) => Number(v.effective_price ?? v.price)));
  }
  return Number(item.special?.effective_price ?? item.base_price);
}

export function MenuViewPage() {
  const { lang, setLang } = useLanguage();
  const { settings: s } = useSiteSettingsContext();
  usePageTitle('Dine-in menu');

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [stickyOffset, setStickyOffset] = useState(72);

  const headerRef = useRef<HTMLElement | null>(null);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimerRef = useRef<number | null>(null);
  const sectionVisibilityRef = useRef<Map<number, { id: number; ratio: number; top: number }>>(new Map());

  const isDv = lang === 'dv';
  const siteName = (s.site_name || 'Bake & Grill').trim();
  const logoSrc = s.logo || '/logo.png';
  const newDays = Math.max(1, Math.min(365, Number.parseInt(s.menu_new_days || '30', 10) || 30));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchCategories(),
      fetchItems('online_pickup'),
      fetchOffers(),
    ])
      .then(([cats, itemsRes, offersRes]) => {
        if (cancelled) return;
        setCategories(cats.data ?? []);
        setItems(itemsRes.data ?? []);
        setOffers(offersRes.offers ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load menu');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (!Number.isFinite(h) || h <= 0) return;
      setStickyOffset(h);
      document.documentElement.style.setProperty('--menu-view-sticky-offset', `${h}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--menu-view-sticky-offset');
    };
  }, [loading]);

  const newItemIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      items
        .filter((item) => isItemNew(item, newDays, now))
        .sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return tb - ta;
        })
        .slice(0, NEW_ITEMS_CAP)
        .map((item) => item.id),
    );
  }, [items, newDays]);

  const newItems = useMemo(
    () => items.filter((item) => newItemIds.has(item.id)),
    [items, newItemIds],
  );

  const catItemCounts = useMemo(() => {
    const direct: Record<number, number> = {};
    for (const item of items) {
      if (item.category_id !== null) direct[item.category_id] = (direct[item.category_id] ?? 0) + 1;
    }
    const total: Record<number, number> = {};
    for (const cat of categories.filter((c) => !c.parent_id)) {
      const subs = categories.filter((c) => c.parent_id === cat.id).map((c) => c.id);
      total[cat.id] = (direct[cat.id] ?? 0) + subs.reduce((sum, id) => sum + (direct[id] ?? 0), 0);
    }
    for (const cat of categories.filter((c) => c.parent_id)) {
      total[cat.id] = direct[cat.id] ?? 0;
    }
    return total;
  }, [items, categories]);

  const parentCategories = useMemo(
    () => categories
      .filter((cat) => !cat.parent_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [categories],
  );

  const railCategories = useMemo(
    () => parentCategories.filter((cat) => (catItemCounts[cat.id] ?? 0) > 0),
    [parentCategories, catItemCounts],
  );

  const sectionedMenu = useMemo(() => {
    const usedItemIds = new Set<number>();
    const sections = parentCategories
      .map((category) => {
        const childCats = categories
          .filter((c) => c.parent_id === category.id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));

        const directItems = items
          .filter((item) => item.category_id === category.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        const subcategories = childCats
          .map((sub) => ({
            category: sub,
            items: items
              .filter((item) => item.category_id === sub.id)
              .sort((a, b) => a.name.localeCompare(b.name)),
          }))
          .filter((block) => block.items.length > 0);

        for (const item of directItems) usedItemIds.add(item.id);
        for (const block of subcategories) {
          for (const item of block.items) usedItemIds.add(item.id);
        }

        return { category, directItems, subcategories };
      })
      .filter((section) => section.directItems.length > 0 || section.subcategories.length > 0);

    const other = items
      .filter((item) => !usedItemIds.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { sections, other };
  }, [categories, parentCategories, items]);

  const scrollToCategorySection = (categoryId: number, behavior: ScrollBehavior = 'smooth') => {
    const section = document.getElementById(`menu-view-section-${categoryId}`);
    if (!section) return;
    const reduced =
      typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stickyH = headerRef.current?.getBoundingClientRect().height ?? stickyOffset;
    const top = categoryScrollTop(
      section.getBoundingClientRect().top,
      window.scrollY,
      stickyH,
      4,
    );
    window.scrollTo({ top, behavior: reduced ? 'auto' : behavior });
  };

  const handleSelectCategory = (categoryId: number) => {
    setActiveCategoryId(categoryId);
    isProgrammaticScroll.current = true;
    scrollToCategorySection(categoryId);
    if (programmaticScrollTimerRef.current !== null) window.clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = window.setTimeout(() => {
      isProgrammaticScroll.current = false;
      programmaticScrollTimerRef.current = null;
    }, 500);
  };

  useEffect(() => {
    if (loading || sectionedMenu.sections.length === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const headers = Array.from(document.querySelectorAll<HTMLElement>(
      '.menu-view-page .menu-section-header[data-category-id], .menu-view-page .menu-subcategory[data-category-id]',
    ));
    if (headers.length === 0) return;

    sectionVisibilityRef.current = new Map();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const id = Number(el.dataset.parentCategoryId || el.dataset.categoryId);
        if (!Number.isFinite(id)) continue;
        sectionVisibilityRef.current.set(id, {
          id,
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
        });
      }
      if (isProgrammaticScroll.current) return;
      const next = pickActiveSectionId(Array.from(sectionVisibilityRef.current.values()), activeCategoryId);
      if (next !== activeCategoryId) setActiveCategoryId(next);
    }, {
      rootMargin: `-${Math.max(stickyOffset, 1)}px 0px -55% 0px`,
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1],
    });

    headers.forEach((header) => observer.observe(header));
    return () => observer.disconnect();
  }, [activeCategoryId, loading, sectionedMenu.sections, stickyOffset]);

  useEffect(() => () => {
    if (programmaticScrollTimerRef.current !== null) window.clearTimeout(programmaticScrollTimerRef.current);
  }, []);

  const renderProductCard = (item: Item) => (
    <ProductCard
      key={item.id}
      item={item}
      layout="grid"
      isNew={newItemIds.has(item.id)}
      onSelectItem={(it) => setSelectedItem(it)}
      onAddToCart={() => {}}
    />
  );

  return (
    <div className="menu-view-page" data-testid="menu-view-page">
      <header className="menu-view-header no-print" ref={headerRef}>
        <div className="menu-view-header__brand">
          <img src={logoSrc} alt="" className="menu-view-header__logo" width={40} height={40} />
          <div>
            <p className="menu-view-header__name">{siteName}</p>
            <p className="menu-view-header__label">Dine-in menu</p>
          </div>
        </div>
        <div className="menu-view-header__actions">
          <div className="menu-view-lang" role="group" aria-label="Language">
            <button
              type="button"
              className={`menu-view-lang__btn${lang === 'en' ? ' is-active' : ''}`}
              aria-pressed={lang === 'en'}
              data-testid="menu-view-lang-en"
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`menu-view-lang__btn${lang === 'dv' ? ' is-active' : ''}`}
              aria-pressed={lang === 'dv'}
              data-testid="menu-view-lang-dv"
              onClick={() => setLang('dv')}
            >
              DV
            </button>
          </div>
          <button
            type="button"
            className="menu-view-print-btn"
            data-testid="menu-view-print"
            onClick={() => window.print()}
          >
            Print menu
          </button>
        </div>
      </header>

      {/* Print-only brand strip */}
      <div className="menu-view-print-brand print-only" aria-hidden="true">
        <strong>{siteName}</strong>
        <span>Dine-in menu</span>
      </div>

      {error && (
        <p className="menu-view-error no-print" role="alert">{error}</p>
      )}

      {loading && (
        <div className="menu-grid no-print" style={{ padding: '1rem' }} data-testid="menu-view-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ borderRadius: 16, height: 260 }} />
          ))}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="menu-view-body no-print">
            <CategoryRail
              categories={railCategories}
              activeCategoryId={activeCategoryId}
              onSelect={handleSelectCategory}
              counts={catItemCounts}
              showOffersPill={offers.length > 0}
              onOffersClick={() => document.getElementById('menu-view-offers')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />

            <main className="menu-view-main">
              {offers.length > 0 && (
                <section id="menu-view-offers" className="menu-view-offers" data-testid="menu-view-offers">
                  <h2 className="menu-view-section-title">Offers &amp; Discounts</h2>
                  <div className="menu-grid">
                    {offers.map((offer) => (
                      <OfferCard
                        key={offer.id}
                        offer={offer}
                        apiOrigin={API_ORIGIN}
                        logoSrc={logoSrc}
                        defaultImageUrl={s.default_item_image || null}
                        viewOnly
                      />
                    ))}
                  </div>
                </section>
              )}

              {newItems.length > 0 && (
                <section id="menu-view-new" className="menu-view-new" data-testid="menu-view-new">
                  <h2 className="menu-view-section-title">New items</h2>
                  <div className="menu-grid">
                    {newItems.map(renderProductCard)}
                  </div>
                </section>
              )}

              {sectionedMenu.sections.map((section, sectionIndex) => (
                <section
                  key={section.category.id}
                  id={`menu-view-section-${section.category.id}`}
                  data-category-id={section.category.id}
                  className={sectionIndex === 0 ? 'menu-section menu-section--first' : 'menu-section'}
                  style={{ scrollMarginTop: 'calc(var(--menu-view-sticky-offset, 72px) + 4px)' }}
                >
                  <MenuSectionHeader
                    category={section.category}
                    active={activeCategoryId === section.category.id}
                  />
                  {section.directItems.length > 0 && (
                    <div className="menu-grid" style={{ paddingBottom: '1rem' }}>
                      {section.directItems.map(renderProductCard)}
                    </div>
                  )}
                  {section.subcategories.map((sub) => (
                    <div
                      key={sub.category.id}
                      className="menu-subcategory"
                      data-testid="menu-subcategory"
                      data-category-id={sub.category.id}
                      data-parent-category-id={section.category.id}
                      style={{
                        scrollMarginTop: 'calc(var(--menu-view-sticky-offset, 72px) + 4px)',
                        paddingBottom: '0.85rem',
                      }}
                    >
                      <h3 className="menu-subcat-title" data-testid="menu-subcat-title">
                        {sub.category.name}
                      </h3>
                      <div className="menu-grid">
                        {sub.items.map(renderProductCard)}
                      </div>
                    </div>
                  ))}
                </section>
              ))}

              {sectionedMenu.other.length > 0 && (
                <section className="menu-section" data-testid="menu-view-other">
                  <h2 className="menu-view-section-title">More</h2>
                  <div className="menu-grid">
                    {sectionedMenu.other.map(renderProductCard)}
                  </div>
                </section>
              )}
            </main>
          </div>

          {/* Print layout: ink-friendly lists by category */}
          <div className="menu-view-print print-only" data-testid="menu-view-print-list">
            {sectionedMenu.sections.map((section) => {
              const allItems = [
                ...section.directItems,
                ...section.subcategories.flatMap((sub) => sub.items),
              ];
              return (
                <section key={section.category.id} className="menu-view-print__category">
                  <h2>{section.category.name}</h2>
                  {section.directItems.length > 0 && (
                    <ul>
                      {section.directItems.map((item) => (
                        <li key={item.id}>
                          <span className="menu-view-print__name">{itemDisplayName(item, isDv)}</span>
                          {itemDetailLine(item, isDv) ? (
                            <span className="menu-view-print__detail">{itemDetailLine(item, isDv)}</span>
                          ) : null}
                          <span className="menu-view-print__price">{formatCardPrice(itemListPrice(item))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.subcategories.map((sub) => (
                    <div key={sub.category.id}>
                      <h3>{sub.category.name}</h3>
                      <ul>
                        {sub.items.map((item) => (
                          <li key={item.id}>
                            <span className="menu-view-print__name">{itemDisplayName(item, isDv)}</span>
                            {itemDetailLine(item, isDv) ? (
                              <span className="menu-view-print__detail">{itemDetailLine(item, isDv)}</span>
                            ) : null}
                            <span className="menu-view-print__price">{formatCardPrice(itemListPrice(item))}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {allItems.length === 0 ? null : null}
                </section>
              );
            })}
          </div>
        </>
      )}

      {selectedItem && (
        <ItemSheet
          open
          viewOnly
          item={selectedItem}
          qty={1}
          selectedModifiers={[]}
          onToggleModifier={() => {}}
          onAddToCart={() => {}}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}

export default MenuViewPage;
