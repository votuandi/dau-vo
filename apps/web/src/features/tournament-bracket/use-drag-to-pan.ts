import { useEffect, useRef, useState, type RefObject } from 'react';

/** Movement (px) before a press becomes a pan, so plain clicks on cards still work. */
export const DRAG_TO_PAN_THRESHOLD_PX = 4;

// Presses that start on these keep their normal behaviour (click, focus, text input).
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]';

function isScrollableY(element: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(element);
  return (
    (overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight
  );
}

/** The element that scrolls vertically for `element`; `null` means the window. */
function verticalScroller(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (isScrollableY(node)) return node;
  }
  return null;
}

interface DragState {
  readonly pointerId: number;
  readonly verticalScroller: HTMLElement | null;
  active: boolean;
  x: number;
  y: number;
}

/**
 * Lets a mouse or pen "grab" a scroll container and pan its content: horizontal movement
 * scrolls the container itself, vertical movement scrolls the nearest vertically scrollable
 * ancestor (or the page). Touch input is left to the browser's native, momentum-based
 * scrolling, which already pans the same containers.
 */
export function useDragToPan<T extends HTMLElement>(): {
  readonly ref: RefObject<T | null>;
  readonly isPanning: boolean;
} {
  const ref = useRef<T>(null);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let drag: DragState | null = null;
    let suppressClick = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;
      drag = {
        pointerId: event.pointerId,
        verticalScroller: verticalScroller(element),
        active: false,
        x: event.clientX,
        y: event.clientY,
      };
      // Follow the pointer on the window: the first movement can leave the chart before the
      // pan starts and pointer capture is taken.
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerEnd);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.active) {
        if (Math.hypot(dx, dy) < DRAG_TO_PAN_THRESHOLD_PX) return;
        drag.active = true;
        element.setPointerCapture(event.pointerId);
        window.getSelection()?.removeAllRanges();
        setIsPanning(true);
      }
      event.preventDefault();
      element.scrollLeft -= dx;
      if (drag.verticalScroller) drag.verticalScroller.scrollTop -= dy;
      else window.scrollBy(0, -dy);
      drag.x = event.clientX;
      drag.y = event.clientY;
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return;
      if (drag.active) {
        // The click that follows a pan must not trigger whatever is under the pointer.
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
        if (element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
        setIsPanning(false);
      }
      drag = null;
      stopFollowing();
    };

    function stopFollowing(): void {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    }

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('click', onClickCapture, true);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('click', onClickCapture, true);
      stopFollowing();
    };
  }, []);

  return { ref, isPanning };
}
