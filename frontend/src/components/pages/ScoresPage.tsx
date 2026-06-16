"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { AgGridTable } from "@/components/ui/AgGridTable";
import { CsvButton } from "@/components/ui/CsvButton";
import { MetricRow } from "@/components/ui/MetricRow";
import { KeyValueRecord } from "@/lib/types";
import { PageProps, toRecs } from "./types";

const COLOR_A = "#0F4C81";
const COLOR_B = "#F18F01";

const outcomeCache = new Map<string, KeyValueRecord[]>();

function SlotCard({ slot, nctId, color }: { slot: string; nctId: string | null; color: string }) {
  return (
    <div style={{
      background: nctId ? `${color}0D` : "white",
      border: `2px solid ${nctId ? color : "#E5E7EB"}`,
      borderRadius: 12,
      padding: "16px 20px",
      minHeight: 80,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Trial {slot}
      </span>
      <div style={{ fontSize: 20, fontWeight: 700, color: nctId ? color : "#D1D5DB", fontFamily: "monospace", marginTop: 6 }}>
        {nctId ?? "—"}
      </div>
      {!nctId && <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>No trial loaded</div>}
    </div>
  );
}

function SelectionBar({ selectedNct }: { selectedNct: string | null }) {
  if (selectedNct) {
    return (
      <div style={{ background: "#F0F9FF", border: "1.5px solid #2E86AB", borderRadius: 10, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13, color: "#1A1A2E" }}>Selected:</span>
        <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: COLOR_A }}>{selectedNct}</span>
        <span style={{ fontSize: 13, color: "#6B7280", marginLeft: 4 }}>— choose a slot below</span>
      </div>
    );
  }
  return (
    <div style={{ background: "#F8FAFC", border: "1.5px dashed #D1D5DB", borderRadius: 10, padding: "12px 18px" }}>
      <span style={{ fontSize: 13, color: "#9CA3AF" }}>↑  Click a row in the table above to select a trial, then load it into Trial A or B below.</span>
    </div>
  );
}

function PlaceholderPanel({ slot, color }: { slot: string; color: string }) {
  return (
    <div style={{ border: `2px dashed ${color}33`, borderRadius: 12, padding: "48px 24px", textAlign: "center", background: "#F8FAFC" }}>
      <div style={{ fontSize: 32 }}>🔬</div>
      <p style={{ color: "#6B7280", fontSize: 14, marginTop: 8 }}>
        Load a trial into slot <strong>{slot}</strong> using the controls above.
      </p>
    </div>
  );
}

function OutcomePanel({ slot, nctId, color }: { slot: string; nctId: string; color: string }) {
  const [rows, setRows] = useState<KeyValueRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = outcomeCache.get(nctId);
    if (cached) {
      setRows(cached);
      setLoading(false);
      return;
    }

    let aborted = false;
    const controller = new AbortController();
    setLoading(true);

    apiRequest<{ outcomeData: KeyValueRecord[] }>(`/api/pages/outcome-scores/trial/${nctId}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (aborted) return;
        const data = r.outcomeData ?? [];
        outcomeCache.set(nctId, data);
        setRows(data);
      })
      .catch((error) => {
        if (aborted || error.name === "AbortError") return;
        setRows([]);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [nctId]);

  return (
    <div>
      <div style={{ background: `${color}15`, borderLeft: `4px solid ${color}`, borderRadius: 8, padding: "10px 16px", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, color, fontSize: 14 }}>Trial {slot} — {nctId}</span>
      </div>
      {loading ? (
        <p style={{ color: "#6B7280", fontSize: 13 }}>Loading outcome data…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "#6B7280", fontSize: 13 }}>No numeric outcome measurements found for this trial.</p>
      ) : (
        <>
          <AgGridTable rows={rows} height={320} />
          <CsvButton rows={rows} filename={`outcomes_${nctId}.csv`} />
        </>
      )}
    </div>
  );
}

export function ScoresPage({ pageData }: PageProps) {
  const [selectedNct, setSelectedNct] = useState<string | null>(null);
  const [trialA, setTrialA] = useState<string | null>(null);
  const [trialB, setTrialB] = useState<string | null>(null);

  if (pageData?.filterRequired || pageData === null) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔎</div>
        <h3>Filter Required</h3>
        <p>Please select at least one filter in the sidebar to view outcome data.</p>
      </div>
    );
  }

  const trials = toRecs(pageData.trialsWithOutcomes);

  if (trials.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <h3>No Data</h3>
        <p>No trials with numeric outcome measurements match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <MetricRow items={[{ label: "Trials with Outcome Data", value: trials.length, icon: "📊" }]} />

      <p style={{ color: "#6B7280", fontSize: 13, margin: "12px 0 4px" }}>
        Step 1 — Click a row to select a trial.
      </p>
      <AgGridTable
        rows={trials}
        height={280}
        onRowClick={(row) => setSelectedNct(row.nct_id as string)}
      />

      <p style={{ color: "#6B7280", fontSize: 13, margin: "16px 0 6px" }}>
        Step 2 — Load the selected trial into a comparison slot.
      </p>
      <SelectionBar selectedNct={selectedNct} />

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <SlotCard slot="A" nctId={trialA} color={COLOR_A} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => { if (selectedNct) setTrialA(selectedNct); }}
              disabled={!selectedNct}
              style={{ flex: 3, padding: "8px 0", borderRadius: 8, border: "none", background: selectedNct ? COLOR_A : "#E5E7EB", color: selectedNct ? "white" : "#9CA3AF", fontWeight: 600, fontSize: 13, cursor: selectedNct ? "pointer" : "not-allowed" }}
            >
              {selectedNct ? "↙ Load into" : "Load into"} Trial A
            </button>
            {trialA && (
              <button onClick={() => setTrialA(null)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #E5E7EB", background: "white", cursor: "pointer", fontSize: 13 }}>
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        <div>
          <SlotCard slot="B" nctId={trialB} color={COLOR_B} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => { if (selectedNct) setTrialB(selectedNct); }}
              disabled={!selectedNct}
              style={{ flex: 3, padding: "8px 0", borderRadius: 8, border: "none", background: selectedNct ? COLOR_B : "#E5E7EB", color: selectedNct ? "white" : "#9CA3AF", fontWeight: 600, fontSize: 13, cursor: selectedNct ? "pointer" : "not-allowed" }}
            >
              {selectedNct ? "↙ Load into" : "Load into"} Trial B
            </button>
            {trialB && (
              <button onClick={() => setTrialB(null)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #E5E7EB", background: "white", cursor: "pointer", fontSize: 13 }}>
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <h3 style={{ color: COLOR_A, marginTop: 32 }}>Side-by-Side Comparison</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>{trialA ? <OutcomePanel slot="A" nctId={trialA} color={COLOR_A} /> : <PlaceholderPanel slot="A" color={COLOR_A} />}</div>
        <div>{trialB ? <OutcomePanel slot="B" nctId={trialB} color={COLOR_B} /> : <PlaceholderPanel slot="B" color={COLOR_B} />}</div>
      </div>
    </div>
  );
}
