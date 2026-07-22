import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContentStudioPage from '../pages/ContentStudio/ContentStudioPage';

vi.mock('../api/content', () => ({
  getContentBlocks: vi.fn(async () => ({
    locale: 'en',
    locales: ['en', 'dv'],
    blocks: [
      {
        key: 'business_phone',
        label: 'Phone number',
        group: 'Contact',
        type: 'text',
        apps: ['website', 'order_app'],
        shareable: true,
        public: true,
        shared: '+960 912 0011',
        website: null,
        order_app: null,
        resolved_website: '+960 912 0011',
        resolved_order_app: '+960 912 0011',
        state: 'shared',
      },
    ],
  })),
  getContentSchedules: vi.fn(async () => ({ schedules: [] })),
  updateContent: vi.fn(),
  shareContentBlock: vi.fn(),
  splitContentBlock: vi.fn(),
  copyContentBlock: vi.fn(),
  uploadContentImage: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('ContentStudioPage', () => {
  it('loads registry blocks and shows shared state', async () => {
    render(
      <MemoryRouter>
        <ContentStudioPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Phone number')).toBeTruthy();
    });
    expect(screen.getByText(/Make different per app/i)).toBeTruthy();
    expect(screen.getByDisplayValue('+960 912 0011')).toBeTruthy();
  });
});
