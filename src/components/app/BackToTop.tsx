/* ═══════════════════════════════════════════════════════════════════════════
   Back to Top — smooth scroll, appears after 300px of scroll
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    const onScroll = () => setVisible(main.scrollTop > 300);
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!visible) return null;

  return (
    <button onClick={scrollToTop} className="back-to-top" aria-label="Back to top">
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
