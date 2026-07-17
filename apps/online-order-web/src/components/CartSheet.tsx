/**
 * Cart bottom sheet host (Phase 3 PR2 extract). Reuses CartDrawer body logic.
 */
import { useLanguage } from '../context/LanguageContext';
import { CartDrawer } from './CartDrawer';
import { Sheet } from './ui/Sheet';

export type CartSheetProps = {
  open: boolean;
  onClose: () => void;
  closedMessage?: string | null;
  isOpen?: boolean;
};

export function CartSheet({
  open,
  onClose,
  closedMessage,
  isOpen = true,
}: CartSheetProps) {
  const { t } = useLanguage();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('cart.title')}
      closeAriaLabel={t('sheet.close')}
    >
      <CartDrawer isOpen={isOpen} closedMessage={closedMessage} compact />
    </Sheet>
  );
}
