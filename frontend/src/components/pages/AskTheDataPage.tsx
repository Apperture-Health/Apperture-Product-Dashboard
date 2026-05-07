"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/api";
import { PageProps } from "./types";

function renderAskChips(extracted: Record<string, unknown>) {
  const chips: string[] = [];
  if (typeof extracted.indication === "string") chips.push(`Condition: ${extracted.indication}`);
  if (typeof extracted.atc_class === "string") chips.push(`Drug Class: ${extracted.atc_class}`);
  if (Array.isArray(extracted.sponsors)) chips.push(...extracted.sponsors.map((v) => `Sponsor: ${v}`));
  if (Array.isArray(extracted.phases)) chips.push(...extracted.phases.map((v) => `Phase: ${v}`));
  if (Array.isArray(extracted.statuses)) chips.push(...extracted.statuses.map((v) => `Status: ${v}`));
  if (Array.isArray(extracted.countries)) chips.push(...extracted.countries.map((v) => `Country: ${v}`));
  if (Array.isArray(extracted.agency_class)) chips.push(...extracted.agency_class.map((v) => `Agency Class: ${v}`));
  if (typeof extracted.has_results === "boolean") chips.push(`Has Results: ${extracted.has_results ? "Yes" : "No"}`);
  return chips.map((chip) => <span key={chip} className="chip">{chip}</span>);
}

type AskPageProps = PageProps & {
  onApplyFilters: (extracted: Record<string, unknown>) => void;
};

export function AskTheDataPage({ onApplyFilters }: AskPageProps) {
  const [question, setQuestion] = useState("");
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  async function extractFilters(q: string) {
    setLoading(true);
    try {
      const result = await apiRequest<{ extracted: Record<string, unknown> }>("/api/ai/extract-filters", {
        method: "POST",
        body: JSON.stringify({ question: q }),
      });
      setExtracted(result.extracted);
    } finally {
      setLoading(false);
    }
  }

  const EXAMPLES = [
    "Phase 2 trials for NSCLC by AstraZeneca",
    "Completed breast cancer trials with posted results",
    "Recruiting AML trials from major pharma",
    "Merck's Phase 3 oncology pipeline",
  ];

  return (
    <div className="page-stack">
      <div className="ask-card">
        <h3>What do you want to explore?</h3>
        <div className="ask-input-row">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. Phase 2 trials for NSCLC by AstraZeneca"
          />
          <button onClick={() => extractFilters(question)} disabled={!question.trim() || loading}>
            Ask ▶
          </button>
        </div>
        <div className="example-grid">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              className="example-button"
              onClick={() => { setQuestion(example); extractFilters(example); }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
      {extracted ? (
        <div className="ask-result">
          <div className="ask-title">🎯 Interpreted as</div>
          <div className="ask-interpretation">{String(extracted.interpretation ?? "—")}</div>
          <div className="chip-row">{renderAskChips(extracted)}</div>
          <div className="inline-controls">
            <button className="action-button" onClick={() => { onApplyFilters(extracted); setExtracted(null); }}>
              Apply to Dashboard
            </button>
            <button className="ghost-button" onClick={() => setExtracted(null)}>Ask Again</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
