import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DraftPublishStatus } from '../components/DraftPublishStatus';

describe('DraftPublishStatus', () => {
  it('shows Saving draft while autosaving', () => {
    render(<DraftPublishStatus dirtyCount={1} autosaving />);
    expect(screen.getByTestId('draft-save-status').textContent).toMatch(/Saving draft/);
  });

  it('shows Draft saved when unpublished and synced', () => {
    render(<DraftPublishStatus dirtyCount={2} lastSavedAt="2026-07-23T12:00:00Z" />);
    expect(screen.getByTestId('draft-save-status').textContent).toMatch(/Draft saved/);
    expect(screen.getByTestId('draft-save-status').textContent).not.toMatch(/Draft not saved/);
  });

  it('shows Draft not saved with Retry and keeps error tone', () => {
    const onRetrySave = vi.fn();
    render(
      <DraftPublishStatus dirtyCount={1} saveFailed onRetrySave={onRetrySave} />,
    );
    const status = screen.getByTestId('draft-save-status');
    expect(status.textContent).toMatch(/Draft not saved/);
    expect(status.className).toMatch(/error/);
    expect(status.textContent).toMatch(/only on this device/);
    fireEvent.click(screen.getByTestId('draft-retry-save'));
    expect(onRetrySave).toHaveBeenCalled();
  });

  it('shows Publishing and Publish failed states', () => {
    const { rerender } = render(<DraftPublishStatus dirtyCount={1} publishing />);
    expect(screen.getByTestId('draft-save-status').textContent).toMatch(/Publishing/);

    const onRetryPublish = vi.fn();
    rerender(
      <DraftPublishStatus dirtyCount={1} publishFailed onRetryPublish={onRetryPublish} />,
    );
    expect(screen.getByTestId('draft-save-status').textContent).toMatch(/Publish failed/);
    fireEvent.click(screen.getByTestId('draft-retry-publish'));
    expect(onRetryPublish).toHaveBeenCalled();
  });

  it('shows All published when clean', () => {
    render(<DraftPublishStatus dirtyCount={0} />);
    expect(screen.getByTestId('draft-save-status').textContent).toMatch(/All published/);
  });
});
