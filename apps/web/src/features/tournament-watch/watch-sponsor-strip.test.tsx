import { render, screen } from '@testing-library/react';
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
  it('opens a sponsor link in a new tab and describes it with a tooltip', () => {
    render(<WatchSponsorStrip sponsors={[sponsor({})]} />);
    const link = screen.getByRole('link', { name: 'Gold Co (mở trong tab mới)' });
    expect(link).toHaveAttribute('href', 'https://gold.example.com/ads');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAccessibleDescription(
      /Gold Co.*Kim cương.*Nhà tài trợ chính.*gold\.example\.com/,
    );
    expect(screen.getByRole('img', { name: 'Gold Co' })).toHaveAttribute(
      'src',
      '/api/media/sponsors/gold.webp',
    );
  });

  it('is not a link without a safe advertising link', () => {
    render(
      <WatchSponsorStrip
        sponsors={[
          sponsor({ id: 'a', name: 'No Link', adUrl: null }),
          sponsor({ id: 'b', name: 'Bad Link', adUrl: 'javascript:alert(1)' }),
        ]}
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('tooltip')).toHaveLength(2);
  });

  it('renders nothing without sponsors', () => {
    const { container } = render(<WatchSponsorStrip sponsors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
