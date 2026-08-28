import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareControl } from './ShareControl';

const CANONICAL = 'https://bakeandgrill.mv/menu/11';

describe('ShareControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares the canonical menu URL, never an /order path', () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
    });
    render(<ShareControl url={CANONICAL} title="Grill Plate" text="Grill Plate at Bake & Grill" />);

    fireEvent.click(screen.getByTestId('share-open'));

    const popover = screen.getByRole('dialog', { name: 'Share this page' });
    expect(popover).toHaveAttribute('data-share-url', CANONICAL);
    expect(popover.getAttribute('data-share-url')).not.toContain('/order/');
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent(CANONICAL)),
    );
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).not.toContain('/order/');
  });

  it('uses navigator.share only after a click', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share });

    render(<ShareControl url={CANONICAL} title="Grill Plate" />);

    expect(share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('share-open'));
    expect(share).toHaveBeenCalledWith({
      title: 'Grill Plate',
      text: 'Grill Plate',
      url: CANONICAL,
    });
    expect(screen.queryByRole('dialog', { name: 'Share this page' })).toBeNull();
  });

  it('falls back to a select-and-copy field when Clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: undefined,
    });

    render(<ShareControl url={CANONICAL} title="Grill Plate" />);
    fireEvent.click(screen.getByTestId('share-open'));
    fireEvent.click(screen.getByTestId('share-copy'));

    const input = await screen.findByTestId('share-fallback-input');
    expect(input).toHaveValue(CANONICAL);
    expect(screen.getByText('Select and copy the link')).toBeInTheDocument();
  });

  it('copies via the Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });

    render(<ShareControl url={CANONICAL} title="Grill Plate" />);
    fireEvent.click(screen.getByTestId('share-open'));
    fireEvent.click(screen.getByTestId('share-copy'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CANONICAL));
    expect(screen.getByText('Link copied')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the Share button', () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined });
    render(<ShareControl url={CANONICAL} title="Grill Plate" />);

    const openBtn = screen.getByTestId('share-open');
    fireEvent.click(openBtn);
    expect(screen.getByRole('dialog', { name: 'Share this page' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Share this page' })).toBeNull();
    expect(openBtn).toHaveFocus();
  });
});
