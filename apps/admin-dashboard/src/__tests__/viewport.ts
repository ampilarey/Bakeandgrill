import { MOBILE_MEDIA_QUERY } from '../hooks/useIsMobile';

export { MOBILE_MEDIA_QUERY };

function matchesQuery(query: string, width: number): boolean {
  const max = /max-width:\s*(\d+)px/.exec(query);
  const min = /min-width:\s*(\d+)px/.exec(query);
  if (max && min) return width <= Number(max[1]) && width >= Number(min[1]);
  if (max) return width <= Number(max[1]);
  if (min) return width >= Number(min[1]);
  return false;
}

/** Set window.innerWidth and stub matchMedia so useIsMobile / AppShell agree. */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: width <= 767 ? 844 : 800,
  });

  window.matchMedia = (query: string): MediaQueryList => {
    const matches = matchesQuery(query, width);
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  };

  window.dispatchEvent(new Event('resize'));
}

/**
 * jsdom does not apply stylesheet @media blocks. Inject the same mobile
 * stacking rules Signage uses so layout assertions can run.
 */
export function injectSignageMobileCss(): HTMLStyleElement {
  const style = document.createElement('style');
  style.setAttribute('data-testid', 'signage-mobile-css');
  style.textContent = `
    .signage-designer-grid {
      grid-template-columns: 1fr !important;
    }
    .signage-designer-canvas-wrap {
      order: 1 !important;
      min-height: auto !important;
    }
    .signage-designer-props { order: 2 !important; }
    .signage-designer-palette { order: 3 !important; }
    .signage-designer-preview-size { display: none !important; }
    .signage-designer-sticky-actions {
      display: flex !important;
      position: sticky;
      bottom: 0;
    }
    .signage-tab-row {
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      scroll-snap-type: x proximity;
    }
    .signage-tab-row > button { flex-shrink: 0; }
    .form-grid-2, .form-grid-3 {
      grid-template-columns: 1fr !important;
    }
  `;
  document.head.appendChild(style);
  return style;
}
