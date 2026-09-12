/* ═══════════════════════════════════════════════════════════════════════════
   Legal Accordions — Terms & Conditions / Privacy Policy disclosure lists.
   Accessible disclosure pattern: <button aria-expanded> toggles a labelled
   region; only one section open at a time keeps the page compact.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LegalSection } from '@/lib/legal-content';

export default function LegalAccordion({
  sections,
  defaultOpen = null,
}: {
  sections: LegalSection[];
  defaultOpen?: number | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpen);

  return (
    <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
      {sections.map((section, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={section.heading} style={{ borderColor: 'var(--border-light)' }}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left text-[13px] font-medium cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
              aria-expanded={isOpen}
              aria-controls={`legal-panel-${index}`}
              id={`legal-trigger-${index}`}
            >
              {section.heading}
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform"
                style={{
                  color: 'var(--text-muted)',
                  transform: isOpen ? 'rotate(180deg)' : undefined,
                }}
                aria-hidden="true"
              />
            </button>
            {isOpen && (
              <div
                id={`legal-panel-${index}`}
                role="region"
                aria-labelledby={`legal-trigger-${index}`}
                className="pb-3 space-y-2"
              >
                {section.body.map((paragraph, pIndex) => (
                  <p
                    key={pIndex}
                    className="text-xs leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
