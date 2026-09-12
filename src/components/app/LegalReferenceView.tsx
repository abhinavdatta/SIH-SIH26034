/* ═══════════════════════════════════════════════════════════════════════════
   Legal Reference — Offline reference for LM Rules, 2011
   All legal data embedded in code; works completely offline.
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Scale, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  LEGAL_ACT_TITLE, RULES_TITLE, NOTIFICATION_DATE,
  AMENDMENT_HISTORY, MANDATORY_FIELDS, LEGAL_RULES, PENALTY_TABLE,
} from '@/lib/legal-data';

export default function LegalReferenceView() {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mandatory' | 'rules' | 'penalty'>('mandatory');

  const tabs = [
    { key: 'mandatory' as const, label: 'Mandatory Fields' },
    { key: 'rules' as const, label: 'Rules & Sections' },
    { key: 'penalty' as const, label: 'Penalty Table' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="card-static p-5 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
        >
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Legal Reference</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {LEGAL_ACT_TITLE} — {RULES_TITLE}
          </p>
        </div>
      </div>

      {/* Governing Legislation */}
      <div className="card-static p-5">
        <div className="flex items-center gap-2 mb-3">
          <Scale className="h-4 w-4" style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Governing Legislation</h3>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{LEGAL_ACT_TITLE}</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{RULES_TITLE}</p>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Notified: {NOTIFICATION_DATE}</p>

        <div className="mt-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Amendment History</p>
          <div className="space-y-1.5">
            {AMENDMENT_HISTORY.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                >
                  {a.year}
                </span>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{a.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === tab.key ? 'nav-active' : 'hover:bg-[var(--bg-hover)]'
            }`}
            style={{ color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mandatory Fields Tab */}
      {activeTab === 'mandatory' && (
        <div className="space-y-3">
          {MANDATORY_FIELDS.map(field => (
            <div key={field.fieldKey} className="card-static p-4">
              <div className="flex items-start gap-2 flex-wrap">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{field.label}</p>
                <Badge variant="outline" className={`text-[10px] font-medium ${
                  field.severity === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800' :
                  field.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800' :
                  'bg-slate-50 text-slate-700 border-slate-200'
                }`}>
                  {field.severity}
                </Badge>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{field.ruleRef}</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{field.description}</p>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>Format: {field.format}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Examples: {field.examples.join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-2">
          {LEGAL_RULES.map(rule => {
            const isExpanded = expandedRule === rule.ruleRef;
            return (
              <div key={rule.ruleRef} className="card-static overflow-hidden">
                <button
                  onClick={() => setExpandedRule(isExpanded ? null : rule.ruleRef)}
                  className="w-full flex items-center gap-3 p-4 text-left cursor-pointer"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    : <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-semibold" style={{ color: 'var(--primary)' }}>{rule.ruleRef}</span>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rule.title}</p>
                      {rule.mandatory && (
                        <Badge variant="outline" className="text-[10px] font-medium" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>Mandatory</Badge>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="rounded-[var(--radius-md)] p-3" style={{ background: 'var(--bg-input)' }}>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rule.description}</p>
                      {rule.penaltyRef && (
                        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                          <AlertTriangle className="h-3 w-3" /> {rule.penaltyRef}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Penalty Tab */}
      {activeTab === 'penalty' && (
        <div className="card-static overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full clean-table">
              <thead>
                <tr>
                  <th>Offence</th>
                  <th>1st Offence</th>
                  <th>Subsequent</th>
                  <th className="hidden md:table-cell">Rule Ref</th>
                </tr>
              </thead>
              <tbody>
                {PENALTY_TABLE.map((p, i) => (
                  <tr key={i}>
                    <td className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.offence}</td>
                    <td className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.firstOffence}</td>
                    <td className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.subsequentOffence}</td>
                    <td className="text-[10px] hidden md:table-cell font-mono" style={{ color: 'var(--primary)' }}>{p.ruleRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
