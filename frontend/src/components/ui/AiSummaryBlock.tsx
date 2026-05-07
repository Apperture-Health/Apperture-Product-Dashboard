"use client";

export function AiSummaryBlock({
  pageKey,
  summary,
  loading,
  onGenerate,
}: {
  pageKey: string;
  summary?: string;
  loading: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="page-stack">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="action-button" onClick={onGenerate} disabled={loading}>
          🤖 AI Summary
        </button>
      </div>
      {summary ? (
        <div className="ask-result">
          <div className="ask-title">🤖 AI Generated · GPT-4o · Based on current filters</div>
          <div style={{ marginTop: 16, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{summary}</div>
        </div>
      ) : null}
    </div>
  );
}
