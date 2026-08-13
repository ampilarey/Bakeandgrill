import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContentHubChooser } from '../pages/ContentHub/ContentHubChooser';

describe('ContentHubChooser', () => {
  it('offers Website and Order App destinations', () => {
    render(
      <MemoryRouter initialEntries={['/content']}>
        <Routes>
          <Route path="/content" element={<ContentHubChooser />} />
          <Route path="/content/website" element={<div>Website dest</div>} />
          <Route path="/content/order-app" element={<div>Order dest</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('content-hub-chooser')).toBeTruthy();
    fireEvent.click(screen.getByTestId('content-chooser-website'));
    expect(screen.getByText('Website dest')).toBeTruthy();
  });
});
