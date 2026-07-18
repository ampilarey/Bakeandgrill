import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrayerBar } from './PrayerBar';
import { LanguageProvider } from '../context/LanguageContext';

const malePrayers = {
  fajr: '04:30',
  sunrise: '05:55',
  dhuhr: '12:16',
  asr: '15:40',
  maghrib: '18:20',
  isha: '19:40',
};

const islands = [
  {
    id: 102,
    atoll: 'K',
    atoll_latin: 'Kaafu',
    name: 'މާލެ',
    name_latin: 'Malé',
    latitude: 4.17,
    longitude: 73.5,
    offset_minutes: 0,
  },
  {
    id: 50,
    atoll: 'ADh',
    atoll_latin: 'Alif Dhaalu',
    name: 'މަހިބަދޫ',
    name_latin: 'Mahibadhoo',
    latitude: 3.75,
    longitude: 72.96,
    offset_minutes: 0,
  },
];

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/prayer-times/islands')) {
        return new Response(JSON.stringify({ islands }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/prayer-times?')) {
        return new Response(JSON.stringify({ prayers: malePrayers }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/health')) {
        return new Response(null, { status: 200, headers: { Date: new Date().toUTCString() } });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

describe('PrayerBar island picker', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens Change island and keeps the panel open', async () => {
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <PrayerBar />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Malé/i })).toBeTruthy();
    });

    // Expand so Change island is available, then open the picker.
    await user.click(screen.getByRole('button', { name: /Dhuhr|Fajr|Asr|Maghrib|Isha|Sunrise|Prayer Times/i }));
    const changeBtn = await screen.findByRole('button', { name: /Change island/i });
    await user.click(changeBtn);

    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText('Mahibadhoo')).toBeTruthy();

    // Panel must still be open after the opening click settles.
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeTruthy();
    });
  });
});
