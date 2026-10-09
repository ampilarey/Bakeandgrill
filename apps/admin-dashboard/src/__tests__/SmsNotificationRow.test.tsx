import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Receipt } from 'lucide-react';
import type { SmsTemplate } from '../api';

/*
 * Settings audit, 2026-10-09 (owner: "minimizing vertical scrolling as much
 * as possible"): the customer SMS wording boxes stood open, thirteen of them.
 * Each message is one line until Edit, and a switch that sends two texts
 * shows both under it.
 */

const api = vi.hoisted(() => ({
  updateSmsTemplate: vi.fn(),
  previewSmsTemplateById: vi.fn(),
}));
vi.mock('../api', () => api);

import { SmsNotificationRow } from '../pages/SettingsPage/SmsNotificationRow';

function template(id: number, body: string): SmsTemplate {
  return { id, slug: `t${id}`, name: `T${id}`, body, type: 'customer_notification', variables: [{ name: 'order_number' }] } as unknown as SmsTemplate;
}

describe('SmsNotificationRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateSmsTemplate.mockImplementation(async (id: number, { body }: { body: string }) => ({ template: template(id, body) }));
  });

  it('shows each message as one line under the one switch', () => {
    render(
      <SmsNotificationRow
        toggleKey="sms_customer_ready_enabled"
        label="Order Ready / Packed"
        desc="SMS when an order is ready."
        icon={Receipt}
        enabled
        onToggle={() => {}}
        messages={[
          { template: template(1, 'Order #{{order_number}} is ready for pickup'), label: 'Pickup ready' },
          { template: template(2, 'Order #{{order_number}} is packed'), label: 'Delivery packed' },
        ]}
      />,
    );

    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Order #{{order_number}} is ready for pickup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit message: pickup ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit message: delivery packed' })).toBeInTheDocument();
  });

  it('opens the wording on Edit, saves only a change, and folds back', async () => {
    const onSaved = vi.fn();
    render(
      <SmsNotificationRow
        toggleKey="sms_customer_preparing_enabled"
        label="Order Preparing"
        desc="SMS when the kitchen starts."
        icon={Receipt}
        enabled
        onToggle={() => {}}
        messages={[{ template: template(5, 'We are preparing #{{order_number}}') }]}
        onTemplateSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    const box = screen.getByRole('textbox', { name: 'Message' });
    const save = screen.getByRole('button', { name: 'Save message' });
    expect(save).toBeDisabled();

    fireEvent.change(box, { target: { value: 'Cooking #{{order_number}} now' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(api.updateSmsTemplate).toHaveBeenCalledWith(5, { body: 'Cooking #{{order_number}} now' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText('Cooking #{{order_number}} now')).toBeInTheDocument();
  });

  it('keeps an unsaved edit when folded, and says so', () => {
    render(
      <SmsNotificationRow
        toggleKey="k"
        label="Delivered"
        desc="SMS when delivered."
        icon={Receipt}
        enabled
        onToggle={() => {}}
        messages={[{ template: template(9, 'Delivered #{{order_number}}') }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Here it is' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Here it is')).toBeInTheDocument();
    expect(screen.getByText(/not saved/)).toBeInTheDocument();
    expect(api.updateSmsTemplate).not.toHaveBeenCalled();
  });
});
