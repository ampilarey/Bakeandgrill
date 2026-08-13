import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiRequestError } from '@shared/api';
import { BusinessDetailsPage } from '../pages/BusinessDetailsPage';
import * as api from '../api/businessDetails';
import type { BusinessDetailsResponse } from '../api/businessDetails';

vi.mock('../api/businessDetails', () => ({
  getBusinessDetails: vi.fn(),
  updateBusinessDetails: vi.fn(),
}));

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return {
    ...actual,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

function field(
  key: string,
  value: string,
  extras: Partial<BusinessDetailsResponse['fields'][number]> = {},
): BusinessDetailsResponse['fields'][number] {
  return {
    key,
    label: extras.label ?? key,
    type: extras.type ?? 'text',
    group: 'General',
    description: extras.description ?? null,
    value,
    used_by: extras.used_by ?? ['Receipts & invoices'],
  };
}

function mockResponse(overrides: Partial<BusinessDetailsResponse> = {}): BusinessDetailsResponse {
  const fields = [
    field('site_name', 'Bake & Grill', { label: 'Trading / display name' }),
    field('business_website', 'https://bakeandgrill.mv'),
    field('business_phone', '+960 912 0011'),
    field('business_email', 'hello@bakeandgrill.mv'),
    field('business_address', 'Kalaafaanu Hingun', { type: 'textarea' }),
    field('business_address_line1', 'Kalaafaanu Hingun'),
    field('business_address_city', 'Malé'),
    field('business_address_country', 'Maldives'),
    field('business_landmark', 'Near H. Sahara'),
    field('business_maps_url', 'https://maps.google.com/?q=Male'),
    field('maps_embed_url', 'https://www.google.com/maps?q=Male&output=embed'),
    field('business_whatsapp', 'https://wa.me/9609120011'),
    field('business_viber', 'viber://chat?number=9609120011'),
    field('site_tagline', 'Fresh daily'),
    field('logo', '/images/logo.png'),
    field('primary_color', '#d4813a'),
  ];

  return {
    scope: 'shared',
    fields,
    sections: [
      {
        id: 'identity',
        title: 'Business identity',
        description: 'Identity',
        fields: fields.filter((f) =>
          ['site_name', 'business_website', 'business_phone', 'business_email'].includes(f.key),
        ),
      },
      {
        id: 'address',
        title: 'Address and location',
        description: 'Address',
        fields: fields.filter((f) =>
          [
            'business_address',
            'business_address_line1',
            'business_address_city',
            'business_address_country',
            'business_landmark',
            'business_maps_url',
            'maps_embed_url',
          ].includes(f.key),
        ),
      },
      {
        id: 'contact',
        title: 'Customer contact channels',
        description: 'Contact',
        fields: fields.filter((f) =>
          ['business_phone', 'business_email', 'business_whatsapp', 'business_viber'].includes(f.key),
        ),
      },
      {
        id: 'documents',
        title: 'Receipt & document branding',
        description: 'Documents',
        fields: fields.filter((f) => ['site_tagline', 'logo', 'primary_color'].includes(f.key)),
      },
    ],
    hours: {
      source: 'business_hours_json',
      editor_path: '/admin/online-ordering',
      editor_label: 'Online Ordering schedule',
      weekly: [
        { day: 'Sunday', label: 'Closed' },
        { day: 'Monday', label: '08:00 – 22:00' },
        { day: 'Tuesday', label: '08:00 – 22:00' },
        { day: 'Wednesday', label: '08:00 – 22:00' },
        { day: 'Thursday', label: '08:00 – 22:00' },
        { day: 'Friday', label: '14:00 – 22:00' },
        { day: 'Saturday', label: '08:00 – 22:00' },
      ],
      closures: [{ date: '2099-12-25', reason: 'Holiday' }],
      open_now: false,
      ramadan_hours_active: false,
      note: 'Managed in Online Ordering.',
    },
    legal: {
      source: 'gst_settings',
      editor_path: '/admin/gst',
      editor_label: 'GST settings',
      seller_name: 'Legal Name Co',
      seller_address: 'Malé',
      seller_tin: 'TIN-1',
      taxable_activity_no: 'TAN-1',
      gst_registered: true,
      receipt_name: 'Bake & Grill',
      receipt_phone: '+960 912 0011',
      receipt_email: 'hello@bakeandgrill.mv',
      receipt_address: 'Kalaafaanu Hingun',
      note: 'GST is authoritative.',
    },
    notice: 'Shared operational business record. Website and Order App branding are separate.',
    mismatches: [],
    ...overrides,
  };
}

function mockViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/business-details']}>
      <BusinessDetailsPage />
    </MemoryRouter>,
  );
}

describe('BusinessDetailsPage', () => {
  beforeEach(() => {
    vi.mocked(api.getBusinessDetails).mockResolvedValue(mockResponse());
    vi.mocked(api.updateBusinessDetails).mockImplementation(async (changes) => {
      const base = mockResponse();
      const nextFields = base.fields.map((f) => {
        const change = changes.find((c) => c.key === f.key);
        return change ? { ...f, value: change.value } : f;
      });
      return {
        ...base,
        fields: nextFields,
        legal: {
          ...base.legal,
          receipt_name: nextFields.find((f) => f.key === 'site_name')?.value ?? base.legal.receipt_name,
        },
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders every Business Details section with loaded settings', async () => {
    renderPage();

    expect(await screen.findByTestId('business-section-identity')).toBeTruthy();
    expect(screen.getByTestId('business-section-address')).toBeTruthy();
    expect(screen.getByTestId('business-section-contact')).toBeTruthy();
    expect(screen.getByTestId('business-section-documents')).toBeTruthy();
    expect(screen.getByTestId('business-section-hours')).toBeTruthy();
    expect(screen.getByTestId('business-section-legal')).toBeTruthy();

    const phoneFields = screen.getAllByTestId('business-field-business_phone');
    expect(phoneFields.length).toBeGreaterThanOrEqual(1);
    expect(within(phoneFields[0]).getByDisplayValue('+960 912 0011')).toBeTruthy();
    expect(screen.getByText('Legal Name Co')).toBeTruthy();
    expect(screen.getByTestId('business-legal-editor-link')).toHaveAttribute('href', '/gst');
    expect(screen.getByTestId('business-hours-editor-link')).toHaveAttribute('href', '/online-ordering');
    expect(screen.getAllByTestId('business-used-by-business_phone').length).toBeGreaterThan(0);

    // Website / Order App marketing content is not on this page.
    expect(screen.queryByTestId('business-field-hero_slides')).toBeNull();
    expect(screen.queryByTestId('business-field-cta_band_headline')).toBeNull();
    expect(screen.queryByTestId('business-field-homepage_categories')).toBeNull();
  });

  it('saves edits and shows Saved', async () => {
    renderPage();
    await screen.findByTestId('business-details-form');

    const input = within(screen.getAllByTestId('business-field-site_name')[0]).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New Trading Name' } });

    fireEvent.click(screen.getByTestId('business-details-save'));

    await waitFor(() => {
      expect(api.updateBusinessDetails).toHaveBeenCalledWith([
        { key: 'site_name', value: 'New Trading Name' },
      ]);
    });
    await waitFor(() => {
      expect(screen.getByTestId('business-details-save-status').textContent).toMatch(/Saved/);
    });
  });

  it('keeps form values and shows Retry when save fails', async () => {
    vi.mocked(api.updateBusinessDetails).mockRejectedValueOnce(
      new ApiRequestError('Server exploded', 500, { message: 'Server exploded' }),
    );

    renderPage();
    await screen.findByTestId('business-details-form');

    const input = within(screen.getAllByTestId('business-field-site_name')[0]).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Keep Me' } });
    fireEvent.click(screen.getByTestId('business-details-save'));

    await waitFor(() => {
      expect(screen.getByTestId('business-details-save-status').textContent).toMatch(/Save failed — Retry/);
    });
    expect(within(screen.getAllByTestId('business-field-site_name')[0]).getByDisplayValue('Keep Me')).toBeTruthy();

    vi.mocked(api.updateBusinessDetails).mockResolvedValueOnce(mockResponse({
      fields: mockResponse().fields.map((f) =>
        f.key === 'site_name' ? { ...f, value: 'Keep Me' } : f,
      ),
    }));

    fireEvent.click(screen.getByTestId('business-details-retry'));
    await waitFor(() => {
      expect(api.updateBusinessDetails).toHaveBeenCalledTimes(2);
    });
  });

  it('shows field validation errors from a failed save', async () => {
    vi.mocked(api.updateBusinessDetails).mockRejectedValueOnce(
      new ApiRequestError('must be a safe public URL', 422, {
        message: 'must be a safe public URL',
        errors: { business_maps_url: ['Google Maps destination URL must be a safe public URL.'] },
      }),
    );

    renderPage();
    await screen.findByTestId('business-details-form');

    const maps = within(screen.getByTestId('business-field-business_maps_url')).getByRole('textbox');
    fireEvent.change(maps, { target: { value: 'javascript:bad' } });
    fireEvent.click(screen.getByTestId('business-details-save'));

    expect(await screen.findByTestId('business-field-error-business_maps_url')).toHaveTextContent(
      /safe public URL/i,
    );
    expect(maps).toHaveValue('javascript:bad');
  });

  it('links legal/tax to GST authoritative source', async () => {
    renderPage();
    const legal = await screen.findByTestId('business-section-legal');
    expect(within(legal).getByText(/gst_settings/)).toBeTruthy();
    expect(within(legal).getByTestId('business-legal-editor-link')).toHaveTextContent('GST settings');
    expect(within(legal).getByText('TIN-1')).toBeTruthy();
  });

  it('registers beforeunload when there are unsaved edits', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderPage();
    await screen.findByTestId('business-details-form');

    const input = within(screen.getAllByTestId('business-field-site_name')[0]).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Dirty' } });

    expect(addSpy.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
    addSpy.mockRestore();
  });

  it.each([320, 375, 390, 414, 768, 1024, 1366] as const)(
    'does not horizontally overflow at %ipx',
    async (width) => {
      mockViewport(width);
      renderPage();
      const page = await screen.findByTestId('business-details-page');
      // Wait for async load — form is absent while the skeleton shows.
      await screen.findByTestId('business-details-form');
      expect(page.scrollWidth).toBeLessThanOrEqual(Math.max(page.clientWidth + 1, width + 1));
    },
  );
});
