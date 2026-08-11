import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from './LanguageContext';
import { SiteSettingsProvider, useSiteSettings } from './SiteSettingsContext';

function jsonResponse(settings: Record<string, string>): Response {
  return {
    ok: true,
    json: async () => ({ content: settings }),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function Probe() {
  const settings = useSiteSettings();
  const { lang, setLang } = useLanguage();

  return (
    <div>
      <p data-testid="lang">{lang}</p>
      <p>{settings.site_name}</p>
      <button type="button" data-testid="set-en" onClick={() => setLang('en')}>EN</button>
      <button type="button" data-testid="set-dv" onClick={() => setLang('dv')}>ދވ</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <LanguageProvider>
      <SiteSettingsProvider>
        <Probe />
      </SiteSettingsProvider>
    </LanguageProvider>,
  );
}

describe('SiteSettingsProvider locale fetch', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes the active locale in the content URL and refetches when language changes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return jsonResponse({
        site_name: url.includes('locale=dv') ? 'ދވ Site' : 'EN Site',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    expect(await screen.findByText('EN Site')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/content?app=order_app&locale=en'));

    fireEvent.click(screen.getByTestId('set-dv'));

    expect(await screen.findByText('ދވ Site')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/content?app=order_app&locale=dv'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let an older language response overwrite newer state', async () => {
    const en = deferred<Response>();
    const dv = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('locale=dv') ? dv.promise : en.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('set-dv'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    en.resolve(jsonResponse({ site_name: 'Stale EN' }));
    await Promise.resolve();
    expect(screen.queryByText('Stale EN')).not.toBeInTheDocument();

    dv.resolve(jsonResponse({ site_name: 'Fresh DV' }));
    expect(await screen.findByText('Fresh DV')).toBeInTheDocument();
  });
});
