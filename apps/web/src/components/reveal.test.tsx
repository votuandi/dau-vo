import { act, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reveal } from './reveal';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Reveal accessibility and prerendering', () => {
  it('keeps prerendered content visible without JavaScript', () => {
    expect(renderToString(<Reveal>Feature content</Reveal>)).toContain('opacity-100');
  });

  it('keeps content visible when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<Reveal>Feature content</Reveal>);
    expect(container.firstChild).toHaveClass('opacity-100');
  });

  it('respects reduced motion without observing or hiding content', () => {
    const observer = vi.fn();
    vi.stubGlobal('IntersectionObserver', observer);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const { container } = render(<Reveal>Feature content</Reveal>);
    expect(container.firstChild).toHaveClass('opacity-100');
    expect(observer).not.toHaveBeenCalled();
  });

  it('reveals below-fold content once it enters the viewport and cleans up', () => {
    let onIntersect: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 2000,
    } as DOMRect);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersect = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const { container, unmount } = render(<Reveal>Feature content</Reveal>);
    expect(container.firstChild).toHaveClass('opacity-0');
    expect(container.firstChild).toHaveAttribute('data-reveal', 'hidden');
    act(() => {
      onIntersect?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(container.firstChild).toHaveClass('opacity-100');
    expect(container.firstChild).toHaveAttribute('data-reveal', 'shown');
    expect(disconnect).toHaveBeenCalledOnce();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
