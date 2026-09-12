/* ═══════════════════════════════════════════════════════════════
   Custom Cursor — subtle blue dot + ring, hidden on touch devices
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useRef } from 'react';
import { isLiteMode } from '@/lib/lite-mode';

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip on touch devices, Lite Mode (saves a per-frame rAF loop), and
    // when the user prefers reduced motion.
    if (
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        isLiteMode())
    ) return;

    // If the user enables Lite Mode while the cursor is running, stop it.
    let disabled = false;
    const onLiteChange = () => { if (isLiteMode()) disabled = true; };
    window.addEventListener('lmcc-lite-mode-changed', onLiteChange);

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mouseX = 0, mouseY = 0;
    let ringX = 0, ringY = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.left = `${mouseX - 4}px`;
      dot.style.top = `${mouseY - 4}px`;
    };

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, [role="button"], input, select, textarea, .cursor-pointer')) {
        dot.classList.add('hover');
        ring.classList.add('hover');
      }
    };

    const onMouseOut = () => {
      dot.classList.remove('hover');
      ring.classList.remove('hover');
    };

    const onMouseLeave = () => {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    };

    const onMouseEnter = () => {
      dot.style.opacity = '1';
      ring.style.opacity = '0.4';
    };

    // Smooth ring follow
    const animate = () => {
      if (disabled) {
        dot.style.opacity = '0';
        ring.style.opacity = '0';
        return; // do not re-queue — loop ends, zero ongoing CPU
      }
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      ring.style.left = `${ringX - 16}px`;
      ring.style.top = `${ringY - 16}px`;
      requestAnimationFrame(animate);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);
    const raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('lmcc-lite-mode-changed', onLiteChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mouseenter', onMouseEnter);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="custom-cursor" style={{ opacity: 0 }} />
      <div ref={ringRef} className="custom-cursor-ring" style={{ opacity: 0 }} />
    </>
  );
}
