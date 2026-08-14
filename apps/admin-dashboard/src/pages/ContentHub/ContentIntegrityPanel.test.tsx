import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentIntegrityPanel } from './ContentIntegrityPanel';

const getContentIntegrity = vi.fn();

vi.mock('../../api/content', () => ({
  getContentIntegrity: (...args: unknown[]) => getContentIntegrity(...args),
}));

describe('ContentIntegrityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a persistent banner for singleton duplicates with surface, type and ids', async () => {
    getContentIntegrity.mockResolvedValue({
      generated_at: '2026-08-13T00:00:00Z',
      surfaces: [{ id: 'website.mobile.header', count: 2 }],
      issues: [
        {
          severity: 'warning',
          code: 'singleton_duplicate_surface',
          message: 'Duplicate components need review on website.mobile.header: prayer_bar × 2',
          meta: {
            surface: 'website.mobile.header',
            block_type: 'prayer_bar',
            block_ids: [12, 88],
          },
        },
      ],
      needs_review: [
        {
          kind: 'singleton_duplicate',
          identifier: 'website.mobile.header.prayer_bar',
          detail: 'Duplicate prayer_bar on website.mobile.header: block IDs 12, 88',
        },
      ],
      summary: { issue_count: 1, needs_review_count: 1, surface_count: 14 },
    });

    render(<ContentIntegrityPanel appFilter="website" />);

    await waitFor(() => expect(screen.getByTestId('content-integrity-singleton-banner')).toBeInTheDocument());
    expect(screen.getByTestId('content-integrity-singleton-banner').textContent).toMatch(/Nothing was deleted/);
    const row = screen.getByTestId('content-integrity-dupe-website.mobile.header-prayer_bar');
    expect(row.textContent).toMatch(/website\.mobile\.header/);
    expect(row.textContent).toMatch(/prayer_bar/);
    expect(row.textContent).toMatch(/12/);
    expect(row.textContent).toMatch(/88/);
  });

  it('does not invent delete actions — warning only until surface resolve', async () => {
    getContentIntegrity.mockResolvedValue({
      generated_at: '2026-08-13T00:00:00Z',
      surfaces: [],
      issues: [
        {
          severity: 'warning',
          code: 'singleton_duplicate_surface',
          message: 'dup',
          meta: { surface: 'order_app.mobile.home', block_type: 'hero', block_ids: [1, 2] },
        },
      ],
      needs_review: [],
      summary: { issue_count: 1, needs_review_count: 0, surface_count: 14 },
    });

    render(<ContentIntegrityPanel />);
    await waitFor(() => expect(screen.getByTestId('content-integrity-singleton-banner')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('onlyWhenIssues hides the panel when the report is clean', async () => {
    getContentIntegrity.mockResolvedValue({
      generated_at: '2026-08-13T00:00:00Z',
      surfaces: [],
      issues: [],
      needs_review: [],
      summary: { issue_count: 0, needs_review_count: 0, surface_count: 14 },
    });
    const { container } = render(<ContentIntegrityPanel appFilter="website" onlyWhenIssues />);
    await waitFor(() => expect(getContentIntegrity).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[data-testid="content-integrity-panel"]')).toBeNull());
  });
});
