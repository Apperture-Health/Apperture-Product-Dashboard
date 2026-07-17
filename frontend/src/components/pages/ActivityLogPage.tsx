"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { PAGE_META } from "@/lib/constants";

type TabVisit = { tab: string; visited_at: string };

// Shape returned by GET /api/admin/activity (data/activity_log.get_recent_sessions)
type Session = {
  session_id: string;
  username: string;
  display_name: string;
  login_at: string;
  tab_count: number;
  tabs: TabVisit[];
};

type UserOption = { username: string; display_name: string };

const TAB_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  PAGE_META.map((p) => [p.key, p.label]),
);

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

async function errorMessage(e: unknown): Promise<string> {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    /* not JSON */
  }
  return raw;
}

export function ActivityLogPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Session | null>(null);

  // The dropdown lists every user that has at least one logged session. It is
  // seeded from the unfiltered load (seedOptions=true) and left untouched while a
  // filter is applied, so filtering never collapses the option list.
  const loadSessions = useCallback(async (username: string, seedOptions = false) => {
    setLoading(true);
    setError("");
    try {
      const qs = username ? `?username=${encodeURIComponent(username)}` : "";
      const r = await apiRequest<{ sessions: Session[] }>(`/api/admin/activity${qs}`);
      setSessions(r.sessions);
      if (seedOptions) {
        const byUser = new Map<string, string>();
        for (const s of r.sessions) {
          if (!byUser.has(s.username)) byUser.set(s.username, s.display_name || s.username);
        }
        setUserOptions(
          Array.from(byUser, ([un, display_name]) => ({ username: un, display_name }))
            .sort((a, b) => a.username.localeCompare(b.username)),
        );
      }
    } catch (e) {
      setError(await errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial unfiltered load populates both the table and the dropdown options.
  useEffect(() => {
    loadSessions("", true);
  }, [loadSessions]);

  function onSelectUser(username: string) {
    setSelectedUser(username);
    loadSessions(username);
  }

  return (
    <div className="um-page">
      <div className="um-activity">
        <div className="um-toolbar">
          <div className="um-count">Login sessions</div>
          <div className="um-toolbar-actions um-activity-filter">
            <label className="um-filter-label" htmlFor="activity-user">User</label>
            <select
              id="activity-user"
              className="um-select"
              value={selectedUser}
              onChange={(e) => onSelectUser(e.target.value)}
            >
              <option value="">All users</option>
              {userOptions.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.display_name ? `${u.display_name} (${u.username})` : u.username}
                </option>
              ))}
            </select>
            <button
              className="um-btn"
              onClick={() => loadSessions(selectedUser, selectedUser === "")}
              disabled={loading}
            >
              {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {error && <div className="um-alert">{error}</div>}
        {loading ? (
          <div className="um-loading">Loading activity…</div>
        ) : sessions.length === 0 ? (
          <div className="um-loading">No login sessions recorded yet.</div>
        ) : (
          <div className="um-table-card">
            <table className="um-table">
              <thead>
                <tr><th>User</th><th>Login time</th><th>Tabs visited</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.session_id}>
                    <td>
                      {s.display_name || s.username}
                      <span className="um-mono um-visit-user">{s.username}</span>
                    </td>
                    <td>{formatTime(s.login_at)}</td>
                    <td>
                      {s.tab_count === 0 ? (
                        <span className="um-tabs-empty">No tabs</span>
                      ) : (
                        <button className="um-tabs-link" onClick={() => setDetail(s)}>
                          {s.tab_count} {s.tab_count === 1 ? "tab" : "tabs"} visited
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="um-modal-overlay" onClick={() => setDetail(null)}>
          <div className="um-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="um-modal-title">
              Tabs visited — {detail.display_name || detail.username}
            </h3>
            <p className="um-hint">Session started {formatTime(detail.login_at)}</p>
            <div className="um-table-card">
              <table className="um-table">
                <thead>
                  <tr><th>#</th><th>Tab</th><th>Visited</th></tr>
                </thead>
                <tbody>
                  {detail.tabs.map((t, i) => (
                    <tr key={`${t.tab}-${t.visited_at}-${i}`}>
                      <td className="um-mono">{i + 1}</td>
                      <td>{TAB_LABEL_BY_KEY[t.tab] ?? t.tab}</td>
                      <td>{formatTime(t.visited_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="um-modal-actions">
              <button className="um-btn um-btn-primary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
