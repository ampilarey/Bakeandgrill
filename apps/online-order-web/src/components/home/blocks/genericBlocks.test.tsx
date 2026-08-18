import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderGenericBlock, type BlockMedia } from './index';

const image: BlockMedia = {
  image: { url: '/storage/media/photo.jpg', webp: '/storage/media/photo.webp', alt: 'A loaf' },
};

const video: BlockMedia = {
  video: { url: '/storage/media/clip.mp4', poster_url: '/storage/media/clip.jpg', alt: 'Kitchen' },
};

function draw(
  type: string,
  settings: Record<string, unknown>,
  media: BlockMedia = null,
) {
  return render(
    <MemoryRouter>{renderGenericBlock(type, 'k', settings, media, 'https://api.test')}</MemoryRouter>,
  );
}

describe('generic home blocks', () => {
  it('renders text, image, image+text, buttons, divider, and video', () => {
    const { unmount: a } = draw('rich_text', { heading: 'Our story', body: '<p>Baked daily.</p>' });
    expect(screen.getByText('Our story')).toBeInTheDocument();
    expect(screen.getByText('Baked daily.')).toBeInTheDocument();
    a();

    const { unmount: b } = draw('image', { caption: 'Fresh' }, image);
    expect(document.querySelector('[data-home-block="image"]')).toBeTruthy();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://api.test/storage/media/photo.jpg');
    b();

    const { unmount: c } = draw('image_text', { heading: 'Since 2014', side: 'right' }, image);
    expect(document.querySelector('[data-home-block="image_text"]')).toHaveAttribute('data-side', 'right');
    c();

    const { unmount: d } = draw('button_band', { text: 'Hungry?', button1_label: 'Order', button1_url: '/order/menu' });
    expect(screen.getByText('Hungry?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Order' })).toHaveAttribute('href', '/menu');
    d();

    const { unmount: e } = draw('divider', { style: 'rule', size: 'lg' });
    expect(document.querySelector('[data-home-block="divider"]')).toHaveAttribute('data-divider-size', 'lg');
    e();

    draw('video', { caption: 'Behind the counter' }, video);
    const el = document.querySelector('[data-home-block="video"] video');
    expect(el).toHaveAttribute('src', 'https://api.test/storage/media/clip.mp4');
    expect(el).toHaveAttribute('playsinline');
    expect(el).toHaveAttribute('loop');
  });

  /**
   * The FAQ list used to be website-only, and this asserted the order app
   * drew nothing for it. FaqListBlock and its case in renderGenericBlock
   * arrived together in 79ffe187 — the block was deliberately brought over,
   * and only this assertion was left behind describing the old world.
   */
  it('renders the FAQ list as collapsible questions', () => {
    draw('faq_list', {
      items: [
        { question: 'Are you open on Fridays?', answer: 'From 2pm.' },
        { question: 'Do you deliver?', answer: 'Across Malé.' },
      ],
    });

    expect(document.querySelector('[data-home-block="faq_list"]')).toBeTruthy();
    // Default heading when the block does not set one.
    expect(screen.getByText('FAQ')).toBeInTheDocument();

    // Answers collapsed behind <summary>, not laid out flat.
    const entries = document.querySelectorAll('[data-home-block="faq_list"] details');
    expect(entries).toHaveLength(2);
    expect(screen.getByText('Are you open on Fridays?').tagName).toBe('SUMMARY');
    expect(screen.getByText('From 2pm.')).toBeInTheDocument();
  });

  it('renders nothing for an FAQ block with no questions in it', () => {
    const { container } = draw('faq_list', { items: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when a block has no content or its media is gone', () => {
    expect(draw('rich_text', {}).container).toBeEmptyDOMElement();
    expect(draw('image', { caption: 'Orphan caption' }, null).container).toBeEmptyDOMElement();
    expect(draw('video', {}, { video: null }).container).toBeEmptyDOMElement();
    expect(draw('button_band', { button1_url: '/order/' }).container).toBeEmptyDOMElement();
  });

  it('strips scripts out of a stored body before printing it', () => {
    draw('rich_text', { body: 'Hello<script>window.__pwned = 1;</script>' });
    const block = document.querySelector('[data-home-block="rich_text"]');
    expect(block?.innerHTML).not.toContain('<script');
    expect(block?.textContent).toContain('Hello');
  });

  it('drops unsafe button links instead of following them', () => {
    draw('button_band', { button1_label: 'Tap', button1_url: 'javascript:alert(1)' });
    expect(screen.getByRole('link', { name: 'Tap' })).toHaveAttribute('href', '/');
  });
});
