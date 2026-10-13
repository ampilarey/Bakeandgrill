import { useEffect, useState, type ReactNode } from 'react';
import { ListChecks, Map, MousePointerClick, Ruler } from 'lucide-react';
import { Btn, Modal, ModalActions } from '../SharedUI';

/*
 * The first-visit tour (round 5 of the usability work, owner, 2026-10-13):
 * four cards the first time the Labels hub opens in this browser, and again
 * from "How it works" on Make a label. Seen is kept in the browser only
 * (localStorage), so each person sees it once per device.
 */

export const TOUR_KEY = 'labels.tour';
const TOUR_EVENT = 'labels:tour';

/** Open the tour from anywhere on the hub (the wizard's How it works). */
export function openLabelsTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}

function seen(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === 'seen'; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(TOUR_KEY, 'seen'); } catch { /* a private window keeps nothing */ }
}

export const TOUR_CARDS: { title: string; text: string; icon: ReactNode }[] = [
  { title: 'Make a label in four steps', text: 'What it is for, which label, a look at it, how many to print. A menu item not yet on labels is switched on the moment you pick it.', icon: <ListChecks size={26} /> },
  { title: 'Tap the label to change it', text: 'On the preview, tap the name, the dates or the logo and a small sheet opens with just those boxes. All details has the rest.', icon: <MousePointerClick size={26} /> },
  { title: 'Any size, any shape', text: 'Picture cards for the usual labels: big pack sticker, jar or tub, price tag, round lid, bottle wrap, or a size of your own. The size decides the look.', icon: <Ruler size={26} /> },
  { title: 'Where things live', text: 'Print labels prints. Custom labels is for things not on the menu. Wording and logos holds the types, brands, bottom strips and templates. Saved labels keeps every print. Settings says which items get labels.', icon: <Map size={26} /> },
];

export function LabelsTour() {
  const [open, setOpen] = useState(() => !seen());
  const [step, setStep] = useState(0);
  useEffect(() => {
    const show = () => { setStep(0); setOpen(true); };
    window.addEventListener(TOUR_EVENT, show);
    return () => window.removeEventListener(TOUR_EVENT, show);
  }, []);
  if (!open) return null;
  const close = () => { markSeen(); setOpen(false); };
  const card = TOUR_CARDS[step];
  const last = step === TOUR_CARDS.length - 1;
  return (
    <Modal title="How Labels works" onClose={close} maxWidth={480}>
      <div className="text-center space-y-3" data-testid="labels-tour" data-step={step + 1}>
        <span className="mx-auto w-14 h-14 rounded-full inline-flex items-center justify-center bg-[var(--color-tone-rust-bg)] text-[var(--color-tone-rust-text)] border border-[var(--color-tone-rust-border)]">{card.icon}</span>
        <h4 className="text-base font-bold text-[var(--color-text)]">{card.title}</h4>
        <p className="text-sm text-[var(--color-text-secondary)]">{card.text}</p>
        <div className="flex justify-center gap-1.5" aria-label={`Card ${step + 1} of ${TOUR_CARDS.length}`} role="status">
          {TOUR_CARDS.map((c, i) => <span key={c.title} aria-hidden className={['block w-2 h-2 rounded-full', i === step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'].join(' ')} />)}
        </div>
      </div>
      <ModalActions>
        <Btn variant="secondary" small onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Btn>
        {last
          ? <Btn onClick={close} data-testid="labels-tour-done">Done</Btn>
          : <Btn onClick={() => setStep((s) => Math.min(TOUR_CARDS.length - 1, s + 1))} data-testid="labels-tour-next">Next</Btn>}
      </ModalActions>
    </Modal>
  );
}
