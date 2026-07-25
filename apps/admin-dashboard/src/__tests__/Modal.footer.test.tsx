import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal, ModalActions, Btn } from '../components/SharedUI';

describe('SharedUI Modal sticky footer', () => {
  it('lifts trailing ModalActions into a sticky footer slot', () => {
    render(
      <Modal title="Test modal" onClose={vi.fn()}>
        <p>Body content</p>
        <ModalActions>
          <Btn variant="secondary">Cancel</Btn>
          <Btn>Save</Btn>
        </ModalActions>
      </Modal>,
    );

    const footer = screen.getByTestId('modal-footer');
    const body = screen.getByTestId('modal-body');
    expect(footer).toBeTruthy();
    expect(footer.textContent).toMatch(/Cancel/);
    expect(footer.textContent).toMatch(/Save/);
    expect(body.textContent).toMatch(/Body content/);
    expect(body.textContent).not.toMatch(/Cancel/);
    expect(document.querySelector('.modal-backdrop')).toBeTruthy();
    expect(document.querySelector('.modal-container')).toBeTruthy();
  });

  it('supports an explicit footer prop', () => {
    render(
      <Modal
        title="Explicit footer"
        onClose={vi.fn()}
        footer={<ModalActions><Btn>Create</Btn></ModalActions>}
      >
        <p>Only body</p>
      </Modal>,
    );

    expect(screen.getByTestId('modal-footer').textContent).toMatch(/Create/);
    expect(screen.getByTestId('modal-body').textContent).toMatch(/Only body/);
  });
});
