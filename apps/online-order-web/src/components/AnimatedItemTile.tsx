import { AnimatedLogo } from './AnimatedLogo';
import './AnimatedItemTile.css';

/**
 * An opened item with no photo (owner, 2026-10-07, "option 1"): the no-photo
 * tile, cream with the logo in a soft circle, drawn with the moving logo. Only
 * one is ever on screen; the menu cards keep the still picture. The tile is
 * always cream, so the lettering stays dark in dark mode.
 */
export function AnimatedItemTile({ label, aspectRatio = '4 / 3' }: { label: string; aspectRatio?: string }) {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio }} data-testid="animated-item-tile">
      <div className="bgl-tile">
        <AnimatedLogo variant="light" label={label} />
      </div>
    </div>
  );
}
