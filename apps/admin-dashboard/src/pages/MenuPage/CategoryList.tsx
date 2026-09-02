import type { MenuCategory } from '../../api';
import { Badge, Btn, Card } from '../../components/Layout';

type CategoryListProps = {
  categories: MenuCategory[];
  canManage: boolean;
  onToggle: (cat: MenuCategory) => void;
  onEdit: (cat: MenuCategory) => void;
  onDelete: (id: number) => void;
  /** Jump to the Items tab filtered to this category. */
  onViewItems: (cat: MenuCategory) => void;
};

function CategoryThumb({ cat, sub }: { cat: MenuCategory; sub: boolean }) {
  const src = cat.thumb_url || cat.image_url;
  const className = `menu-cat-thumb${sub ? ' menu-cat-thumb--sub' : ''}`;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={className}
        onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
      />
    );
  }
  return (
    <div className={`${className} menu-cat-thumb-empty`} aria-hidden="true">
      {cat.name.trim().charAt(0).toUpperCase() || '·'}
    </div>
  );
}

function meta(cat: MenuCategory, subCount: number): string {
  const parts: string[] = [];
  if (cat.items) parts.push(`${cat.items.length} ${cat.items.length === 1 ? 'item' : 'items'}`);
  if (subCount > 0) parts.push(`${subCount} sub-${subCount === 1 ? 'category' : 'categories'}`);
  parts.push(`Sort ${cat.sort_order ?? 0}`);
  return parts.join(' · ');
}

type CategoryRowProps = Omit<CategoryListProps, 'categories'> & {
  cat: MenuCategory;
  sub: boolean;
  subCount: number;
};

function CategoryRow({ cat, sub, subCount, canManage, onToggle, onEdit, onDelete, onViewItems }: CategoryRowProps) {
  return (
    <div className={`menu-cat-row${sub ? ' menu-cat-row--sub' : ''}`} data-testid={`menu-cat-${cat.id}`}>
      <CategoryThumb cat={cat} sub={sub} />
      <div className="menu-cat-main">
        <div className="menu-cat-title">
          <span className="menu-cat-name">{cat.name}</span>
          {cat.name_dv && <span className="menu-cat-name-dv">{cat.name_dv}</span>}
          <Badge label={cat.is_active ? 'Visible' : 'Hidden'} color={cat.is_active ? 'green' : 'gray'} />
        </div>
        {cat.description && <p className="menu-cat-desc">{cat.description}</p>}
        <div className="menu-cat-meta">{meta(cat, subCount)}</div>
      </div>
      <div className="menu-cat-actions">
        <Btn small variant="ghost" onClick={() => onViewItems(cat)} aria-label={`Show items in ${cat.name}`}>
          Items
        </Btn>
        {canManage && (
          <>
            <Btn small variant="ghost" onClick={() => onToggle(cat)} aria-label={`${cat.is_active ? 'Hide' : 'Show'} ${cat.name}`}>
              {cat.is_active ? 'Hide' : 'Show'}
            </Btn>
            <Btn small variant="secondary" onClick={() => onEdit(cat)} aria-label={`Edit ${cat.name}`}>Edit</Btn>
            <Btn small variant="ghost" className="menu-cat-delete" onClick={() => onDelete(cat.id)} aria-label={`Delete ${cat.name}`}>
              Delete
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The Categories tab on /admin/menu. Each top-level category is one card
 * that carries its sub-categories inside it, so the tree reads as a tree
 * instead of a run of indented cards. Rows wrap on a phone: thumbnail and
 * name first, then the action row full width.
 */
export function CategoryList({ categories, canManage, onToggle, onEdit, onDelete, onViewItems }: CategoryListProps) {
  const parents = categories.filter((c) => !c.parent_id);
  const hidden = categories.filter((c) => !c.is_active).length;
  const rowProps = { canManage, onToggle, onEdit, onDelete, onViewItems };

  return (
    <div className="menu-cat-list" data-testid="menu-cat-list">
      <div className="menu-cat-summary">
        {categories.length} {categories.length === 1 ? 'category' : 'categories'}
        {hidden > 0 ? ` · ${hidden} hidden from customers` : ''}
      </div>
      {parents.map((cat) => {
        const subs = categories.filter((c) => c.parent_id === cat.id);
        return (
          <Card key={cat.id} className="menu-cat-card" data-testid={`menu-cat-card-${cat.id}`} style={{ padding: 0, overflow: 'hidden' }}>
            <CategoryRow cat={cat} sub={false} subCount={subs.length} {...rowProps} />
            {subs.length > 0 && (
              <div className="menu-subcat-list">
                {subs.map((sub) => (
                  <CategoryRow key={sub.id} cat={sub} sub subCount={0} {...rowProps} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
