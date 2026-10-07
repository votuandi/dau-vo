import { useCallback, useEffect, useState } from 'react';

/**
 * Keeps the screen awake while the board is visible. Browsers release the
 * lock when the tab is hidden, so it is re-acquired on visibility changes.
 * Silently does nothing where the Wake Lock API is unavailable.
 */
export function useScreenWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async (): Promise<void> => {
      if (document.visibilityState !== 'visible' || sentinel) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (disposed) {
          void lock.release();
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Denied (e.g. battery saver); the board still works without it.
      }
    };
    const onVisibilityChange = (): void => {
      void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release();
    };
  }, []);
}

/** Fullscreen toggle for the document; `supported` is false on e.g. iOS Safari. */
export function useFullscreen(): {
  readonly supported: boolean;
  readonly active: boolean;
  readonly toggle: () => void;
} {
  // jsdom and some embedded browsers leave this undefined.
  const supported = Boolean(document.fullscreenEnabled as boolean | undefined);
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = (): void => {
      setActive(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void request.catch(() => undefined);
  }, []);

  return { supported, active, toggle };
}
