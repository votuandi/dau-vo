import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDragToPan } from './use-drag-to-pan';

// jsdom has no PointerEvent or pointer capture; a MouseEvent subclass carries the fields we use.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class TestPointerEvent extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    }
    Object.assign(window, { PointerEvent: TestPointerEvent });
  }
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  });
});

function Harness({ onCardClick }: { readonly onCardClick: () => void }) {
  const pan = useDragToPan<HTMLDivElement>();
  return (
    <div data-panning={String(pan.isPanning)} data-testid="viewport" ref={pan.ref}>
      <div data-testid="card" onClick={onCardClick} role="presentation">
        Thẻ trận
      </div>
      <button type="button">Chọn người thắng</button>
    </div>
  );
}

/** Tracks writes to scrollLeft, which jsdom does not implement. */
function trackScrollLeft(element: HTMLElement): { readonly value: () => number } {
  let left = 100;
  Object.defineProperty(element, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (next: number) => {
      left = next;
    },
  });
  return { value: () => left };
}

function pointer(
  type: 'pointerDown' | 'pointerMove' | 'pointerUp',
  target: Element,
  x: number,
  y: number,
  init: PointerEventInit = {},
) {
  fireEvent[type](target, { button: 0, clientX: x, clientY: y, pointerId: 1, ...init });
}

describe('useDragToPan', () => {
  const scrollBy = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    window.scrollBy = scrollBy;
    scrollBy.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pans horizontally and scrolls the page vertically while the mouse drags', () => {
    const onCardClick = vi.fn();
    render(<Harness onCardClick={onCardClick} />);
    const viewport = screen.getByTestId('viewport');
    const scrollLeft = trackScrollLeft(viewport);
    const card = screen.getByTestId('card');

    pointer('pointerDown', card, 200, 200);
    pointer('pointerMove', viewport, 170, 190);
    expect(viewport).toHaveAttribute('data-panning', 'true');
    expect(scrollLeft.value()).toBe(130);
    expect(scrollBy).toHaveBeenLastCalledWith(0, 10);

    pointer('pointerUp', viewport, 170, 190);
    expect(viewport).toHaveAttribute('data-panning', 'false');
    fireEvent.click(card);
    expect(onCardClick).not.toHaveBeenCalled();

    act(() => {
      vi.runAllTimers();
    });
    fireEvent.click(card);
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('keeps panning when the pointer leaves the chart before the pan starts', () => {
    render(<Harness onCardClick={vi.fn()} />);
    const viewport = screen.getByTestId('viewport');
    const scrollLeft = trackScrollLeft(viewport);

    pointer('pointerDown', screen.getByTestId('card'), 200, 200);
    pointer('pointerMove', document.body, 150, 200);
    expect(viewport).toHaveAttribute('data-panning', 'true');
    expect(scrollLeft.value()).toBe(150);

    pointer('pointerUp', document.body, 150, 200);
    expect(viewport).toHaveAttribute('data-panning', 'false');
    pointer('pointerMove', document.body, 50, 200);
    expect(scrollLeft.value()).toBe(150);
  });

  it('treats tiny movements as a normal click', () => {
    const onCardClick = vi.fn();
    render(<Harness onCardClick={onCardClick} />);
    const viewport = screen.getByTestId('viewport');
    const scrollLeft = trackScrollLeft(viewport);
    const card = screen.getByTestId('card');

    pointer('pointerDown', card, 200, 200);
    pointer('pointerMove', viewport, 202, 201);
    pointer('pointerUp', viewport, 202, 201);
    fireEvent.click(card);

    expect(viewport).toHaveAttribute('data-panning', 'false');
    expect(scrollLeft.value()).toBe(100);
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('ignores presses on buttons, non-primary buttons and touch input', () => {
    render(<Harness onCardClick={vi.fn()} />);
    const viewport = screen.getByTestId('viewport');
    const scrollLeft = trackScrollLeft(viewport);
    const card = screen.getByTestId('card');

    pointer('pointerDown', screen.getByRole('button', { name: 'Chọn người thắng' }), 200, 200);
    pointer('pointerMove', viewport, 100, 200);
    pointer('pointerUp', viewport, 100, 200);

    pointer('pointerDown', card, 200, 200, { button: 2 });
    pointer('pointerMove', viewport, 100, 200);
    pointer('pointerUp', viewport, 100, 200);

    pointer('pointerDown', card, 200, 200, { pointerType: 'touch' });
    pointer('pointerMove', viewport, 100, 200, { pointerType: 'touch' });
    pointer('pointerUp', viewport, 100, 200, { pointerType: 'touch' });

    expect(scrollLeft.value()).toBe(100);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(viewport).toHaveAttribute('data-panning', 'false');
  });

  it('scrolls the nearest vertically scrollable ancestor instead of the page', () => {
    render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <Harness onCardClick={vi.fn()} />
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    scroller.scrollTop = 300;
    const viewport = screen.getByTestId('viewport');
    trackScrollLeft(viewport);

    pointer('pointerDown', screen.getByTestId('card'), 200, 200);
    pointer('pointerMove', viewport, 200, 150);

    expect(scroller.scrollTop).toBe(350);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
