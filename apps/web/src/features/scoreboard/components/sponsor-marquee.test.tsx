import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SponsorMarquee } from './sponsor-marquee';

describe('SponsorMarquee', () => {
  it('shows each sponsor logo, or its name when it has none', () => {
    render(
      <SponsorMarquee
        sponsors={[
          {
            id: 'a',
            name: 'Gold Co',
            details: null,
            imageUrl: '/api/media/sponsors/gold.webp',
            adUrl: null,
            tier: 1,
            tierName: 'Vàng',
          },
          {
            id: 'b',
            name: 'Plain Co',
            details: null,
            imageUrl: null,
            adUrl: null,
            tier: 2,
            tierName: 'Bạc',
          },
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Nhà tài trợ' });
    // The loop repeats the logos, but each sponsor is announced once.
    expect(within(region).getAllByRole('img', { name: 'Gold Co' })).toHaveLength(1);
    expect(within(region).getAllByRole('listitem')).toHaveLength(2);
    expect(within(region).getAllByText('Plain Co').length).toBeGreaterThan(1);
    // Logos keep their ratio at the header's height instead of being cropped.
    expect(within(region).getByRole('img', { name: 'Gold Co' })).toHaveClass(
      'h-full',
      'w-auto',
      'object-contain',
    );
  });

  it('keeps an empty spacer without sponsors so the header stays laid out', () => {
    render(<SponsorMarquee sponsors={[]} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
