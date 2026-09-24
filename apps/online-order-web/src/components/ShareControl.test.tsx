import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareControl } from './ShareControl';

const CANONICAL = 'https://bakeandgrill.mv/menu/11';

describe('ShareControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a copy as a share of the item, and nothing when it has no id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });

    const first = render(<ShareControl url={CANONICAL} title="Grill Plate" itemId={11} />);
    fireEvent.click(screen.getByTestId('share-open'));
    fireEvent.click(screen.getByTestId('share-copy'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/share-events$/);
    expect(JSON.parse(String(init.body))).toEqual({ item_id: 11, category_id: null, channel: 'copy', surface: 'order' });
    expect(init.keepalive).toBe(true);

    fireEvent.click(screen.getByRole('link', { name: 'WhatsApp' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toMatchObject({ channel: 'whatsapp' });

    first.unmount();
    fetchMock.mockClear();
    render(<ShareControl url={CANONICAL} title="No id" />);
    fireEvent.click(screen.getByTestId('share-open'));
    fireEvent.click(screen.getByTestId('share-copy'));
    await waitFor(() => expect(screen.getByText('Link copied')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
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
