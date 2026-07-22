import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContentEditor } from '../pages/ContentStudio/AppContentEditor';

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
  copyContentSection: vi.fn(),
  uploadContentImage: vi.fn(),
  exportContent: vi.fn(),
  importContent: vi.fn(),
  getContentRevisions: vi.fn(async () => ({ revisions: [] })),
  restoreContentRevision: vi.fn(),
  scheduleContent: vi.fn(),
  cancelContentSchedule: vi.fn(),
  createContentPreviewToken: vi.fn(async () => ({
    token: 't', website_url: '/p', order_app_url: '/o', expires_in: 900,
  })),
  uploadContentVideo: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

describe('ContentStudioPage (Website Content editor)', () => {
  it('loads registry blocks and shows resolved seed value without shared/split toggle', async () => {
    render(
      <MemoryRouter>
        <AppContentEditor app="website" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Phone number')).toBeTruthy();
    });
    expect(screen.getByText('Website Content')).toBeTruthy();
    expect(screen.queryByText(/Make different per app/i)).toBeNull();
    expect(screen.getByDisplayValue('+960 912 0011')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy from Order App/i })).toBeTruthy();
  });
});
