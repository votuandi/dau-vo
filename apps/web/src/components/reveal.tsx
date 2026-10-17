import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type RevealDirection = 'up' | 'left' | 'right' | 'zoom';

const hiddenClassNames: Record<RevealDirection, string> = {
  up: 'translate-y-8',
  left: '-translate-x-10',
  right: 'translate-x-10',
  zoom: 'scale-95',
};

interface RevealProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
  readonly direction?: RevealDirection;
}

/**
 * Fades its children in the first time they scroll into view. Without
 * IntersectionObserver (old browsers, tests) the content is shown immediately,
 * and users who prefer reduced motion never see the movement.
 */
export function Reveal({ children, className, delay = 0, direction = 'up' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the first client render identical to the prerendered HTML.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      element.getBoundingClientRect().top < window.innerHeight * 0.95
    )
      return;
    setVisible(false);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const style: CSSProperties | undefined = delay
    ? { transitionDelay: `${String(delay)}ms` }
    : undefined;

  return (
    <div
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none',
        visible
          ? 'translate-x-0 translate-y-0 scale-100 opacity-100'
          : ['opacity-0', hiddenClassNames[direction]],
        className,
      )}
      ref={ref}
      style={style}
    >
      {children}
    </div>
  );
}
