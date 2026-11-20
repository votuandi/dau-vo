import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicSponsor } from '@/services/api/watch';
import { WatchSponsorStrip } from './watch-sponsor-strip';

const sponsor = (overrides: Partial<PublicSponsor>): PublicSponsor => ({
  id: 's-1',
  name: 'Gold Co',
  details: 'Nhà tài trợ chính',
  imageUrl: '/api/media/sponsors/gold.webp',
  adUrl: 'https://gold.example.com/ads',
  tier: 1,
  tierName: 'Kim cương',
  ...overrides,
});

describe('WatchSponsorStrip', () => {
  it('opens a sponsor link in a new tab and describes it in a tooltip on hover', () => {
    render(<WatchSponsorStrip sponsors={[sponsor({})]} />);
    // The loop repeats logos, but only one copy of each can be reached.
    const link = screen.getByRole('link', { name: 'Gold Co (mở trong tab mới)' });
    expect(link).toHaveAttribute('href', 'https://gold.example.com/ads');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link.querySelector('img')).toHaveAttribute('src', '/api/media/sponsors/gold.webp');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.mouseEnter(link);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      /Gold Co.*Kim cương.*Nhà tài trợ chính.*gold\.example\.com/,
    );
    expect(link).toHaveAccessibleDescription(/Gold Co/);
    fireEvent.mouseLeave(link);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('is not a link without a safe advertising link, but still explains itself on focus', () => {
    render(
      <WatchSponsorStrip
        sponsors={[
          sponsor({ id: 'a', name: 'No Link', adUrl: null }),
          sponsor({ id: 'b', name: 'Bad Link', adUrl: 'javascript:alert(1)' }),
        ]}
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const tile = screen.getByRole('img', { name: 'No Link' });
    fireEvent.focus(tile);
    expect(screen.getByRole('tooltip')).toHaveTextContent('No Link');
  });

  it('scrolls inside a strip that stops while pointed at', () => {
    render(<WatchSponsorStrip sponsors={[sponsor({})]} />);
    expect(screen.getByRole('region', { name: 'Nhà tài trợ' })).toHaveAttribute(
      'data-pausable',
      'true',
    );
  });

  it('renders nothing without sponsors', () => {
    const { container } = render(<WatchSponsorStrip sponsors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
