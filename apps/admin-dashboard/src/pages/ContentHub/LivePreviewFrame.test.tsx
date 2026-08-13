import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LivePreviewFrame } from './LivePreviewFrame';

describe('LivePreviewFrame', () => {
  const OriginalRO = globalThis.ResizeObserver;

  beforeEach(() => {
    class FakeRO {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        Object.defineProperty(target, 'clientWidth', { configurable: true, value: 320 });
        this.cb([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = FakeRO as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = OriginalRO;
  });

  it('keeps a true 390px logical width for Mobile and scales to fit', () => {
    render(<LivePreviewFrame url="https://example.test/preview" defaultDevice="mobile" />);

    const frame = screen.getByTestId('live-preview-frame');
    expect(frame.getAttribute('data-device')).toBe('mobile');
    expect(frame.getAttribute('data-logical-width')).toBe('390');

    const iframe = screen.getByTestId('preview-iframe') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('390px');
    // 320/390 ≈ 0.8205 — must not silently set iframe to 100% of host
    expect(Number(iframe.style.transform.replace(/scale\((.+)\)/, '$1'))).toBeLessThan(1);
    expect(iframe.style.maxWidth).not.toBe('100%');
  });

  it('switches Desktop to 1280 logical width', () => {
    render(<LivePreviewFrame url="https://example.test/preview" defaultDevice="mobile" />);
    fireEvent.click(screen.getByTestId('preview-device-desktop'));
    expect(screen.getByTestId('live-preview-frame').getAttribute('data-logical-width')).toBe('1280');
    expect((screen.getByTestId('preview-iframe') as HTMLIFrameElement).style.width).toBe('1280px');
  });

  it('locks device to editorDevice (matrix 13) and ignores toggle clicks', () => {
    render(
      <LivePreviewFrame
        url="https://example.test/preview"
        defaultDevice="desktop"
        editorDevice="mobile"
      />,
    );
    const frame = screen.getByTestId('live-preview-frame');
    expect(frame.getAttribute('data-device')).toBe('mobile');
    expect(frame.getAttribute('data-device-locked')).toBe('1');
    expect(frame.getAttribute('data-editor-device')).toBe('mobile');
    fireEvent.click(screen.getByTestId('preview-device-desktop'));
    expect(frame.getAttribute('data-device')).toBe('mobile');
    expect(frame.getAttribute('data-logical-width')).toBe('390');
  });
});
