import { useEffect, useRef } from 'react';

const COLORS = ['#fde047', '#fb923c', '#f87171', '#f472b6', '#a78bfa', '#60a5fa', '#34d399'];
const GRAVITY = 0.045;
const LAUNCH_EVERY_MS = 650;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  size: number;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Fireworks launched continuously from the bottom of the screen. Decorative
 * only: hidden from assistive technology and skipped for reduced motion.
 */
export function FireworksCanvas({ className }: { readonly className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || prefersReducedMotion()) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rockets: Rocket[] = [];
    const particles: Particle[] = [];
    const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#fde047';
    const launch = () => {
      rockets.push({
        x: width * (0.1 + Math.random() * 0.8),
        y: height,
        vy: -(height / 90 + Math.random() * 3),
        targetY: height * (0.12 + Math.random() * 0.35),
        color: pick(),
      });
    };
    const explode = (rocket: Rocket) => {
      const count = 70 + Math.floor(Math.random() * 40);
      const speed = 2 + Math.random() * 2.5;
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2;
        const force = speed * (0.55 + Math.random() * 0.45);
        particles.push({
          x: rocket.x,
          y: rocket.y,
          vx: Math.cos(angle) * force,
          vy: Math.sin(angle) * force,
          life: 1,
          decay: 0.009 + Math.random() * 0.012,
          color: Math.random() < 0.25 ? pick() : rocket.color,
          size: 1.6 + Math.random() * 1.6,
        });
      }
    };

    let frame = 0;
    let lastLaunch = 0;
    const tick = (now: number) => {
      if (now - lastLaunch > LAUNCH_EVERY_MS) {
        launch();
        if (Math.random() < 0.35) launch();
        lastLaunch = now;
      }
      // Fade the previous frame for light trails instead of clearing it.
      context.globalCompositeOperation = 'destination-out';
      context.fillStyle = 'rgba(0, 0, 0, 0.22)';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      for (let index = rockets.length - 1; index >= 0; index -= 1) {
        const rocket = rockets[index];
        if (!rocket) continue;
        rocket.y += rocket.vy;
        rocket.vy += GRAVITY * 0.4;
        context.fillStyle = rocket.color;
        context.fillRect(rocket.x - 1, rocket.y, 2, 7);
        if (rocket.y <= rocket.targetY || rocket.vy >= 0) {
          explode(rocket);
          rockets.splice(index, 1);
        }
      }
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        if (!particle) continue;
        particle.vx *= 0.985;
        particle.vy = particle.vy * 0.985 + GRAVITY;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.life -= particle.decay;
        if (particle.life <= 0) {
          particles.splice(index, 1);
          continue;
        }
        context.globalAlpha = particle.life;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas aria-hidden="true" className={className} ref={canvasRef} />;
}
