/**
 * @deprecated Prefer ItemSheet — compatibility wrapper for MenuPage until the
 * Menu body swap (Phase 3 PR3) wires ItemSheet directly.
 */
import type { Item, Modifier } from '../api';
import type { Variant } from '@shared/types';
import { ItemSheet } from './ItemSheet';

type Props = {
  item: Item;
  qty: number;
  selectedModifiers: Modifier[];
  onToggleModifier: (modifier: Modifier) => void;
  onAddToCart: (variant?: Variant | null) => void;
  onClose: () => void;
};

export function ItemModal(props: Props) {
  return <ItemSheet open {...props} />;
}
