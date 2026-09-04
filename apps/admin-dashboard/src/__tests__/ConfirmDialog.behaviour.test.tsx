import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { ConfirmDialog, useConfirmDialog } from '../components/SharedUI';

/**
 * Admin layout audit, A4 (2026-09-03 → fixed 2026-09-04).
 *
 * ConfirmDialog is how 20 pages ask before a delete, and it had none of what a
 * dialog owes you: no Escape, no focus trap, no focus restore, no scroll lock,
 * no portal, and — the one that stranded people on a phone — no maximum height,
 * so a long question pushed Cancel and Confirm off the bottom of the screen
 * with nothing to scroll.
 */

function Harness({ message = 'Delete this?', onConfirm = () => {} }: { message?: string; onConfirm?: () => void }) {
  const { state, ask, close } = useConfirmDialog();
  const [done, setDone] = useState(false);
  return (
    <div>
      <button type="button" data-testid="opener" onClick={() => ask({ message, onConfirm })}>
        Open
      </button>
      <button type="button" data-testid="outside">Outside</button>
      {done && <span>done</span>}
      <ConfirmDialog state={state} close={() => { close(); setDone(true); }} />
    </div>
  );
}

afterEach(() => cleanup());

describe('ConfirmDialog', () => {
  it('closes on Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('opener'));
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('locks the page behind it and releases on close', () => {
    render(<Harness />);
    expect(document.body.style.overflow).not.toBe('hidden');

    fireEvent.click(screen.getByTestId('opener'));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('portals to the body so a transformed ancestor cannot trap it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('opener'));

    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog.parentElement).toBe(document.body);
  });

  it('starts focus on Cancel, so a stray Enter does not confirm a delete', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('opener'));

    await vi.waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Cancel');
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('opener'));

    const dialog = screen.getByTestId('confirm-dialog');
    const buttons = Array.from(dialog.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Confirm']);

    // Tab off the last one wraps to the first rather than escaping to the page.
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);

    // And Shift+Tab off the first wraps to the last.
    buttons[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it('is announced as a dialog, with its question as the description', () => {
    render(<Harness message="This removes 12 orders." />);
    fireEvent.click(screen.getByTestId('opener'));

    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const descId = dialog.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.textContent).toBe('This removes 12 orders.');
  });

  it('caps its height and scrolls the question, never the buttons', () => {
    const long = 'Are you sure? '.repeat(200);
    render(<Harness message={long} />);
    fireEvent.click(screen.getByTestId('opener'));

    const dialog = screen.getByTestId('confirm-dialog');
    const panel = dialog.firstElementChild as HTMLElement;
    expect(panel.style.maxHeight).toBe('min(85dvh, 640px)');
    expect(panel.style.display).toBe('flex');
    expect(panel.style.flexDirection).toBe('column');

    // The message is the scroll region…
    const descId = dialog.getAttribute('aria-describedby')!;
    const message = document.getElementById(descId)!;
    expect(message.style.overflowY).toBe('auto');
    expect(message.style.minHeight).toBe('0px');

    // …and the buttons sit outside it, so they cannot be pushed off-screen.
    const actions = panel.lastElementChild as HTMLElement;
    expect(actions.contains(message)).toBe(false);
    expect(actions.style.flexShrink).toBe('0');
    expect(actions.querySelectorAll('button').length).toBe(2);
  });

  it('confirms and closes when Confirm is pressed', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('opener'));

    const confirm = Array.from(screen.getByTestId('confirm-dialog').querySelectorAll('button'))
      .find((b) => b.textContent === 'Confirm')!;
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('closes on a backdrop press but not on a press inside the panel', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('opener'));

    const dialog = screen.getByTestId('confirm-dialog');
    fireEvent.mouseDown(dialog.firstElementChild!);
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();

    fireEvent.mouseDown(dialog);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
});
