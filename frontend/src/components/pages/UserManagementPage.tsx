"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

// Shape returned by GET /api/admin/users (data/auth_repository.list_all_users_full)
type AdminUser = {
  username: string;
  password: string;
  display_name: string;
  is_active: boolean;
  is_admin: boolean;
  tabs: string[];
  tabs_exclude: string[];
  disease_areas: string[];
  disease_areas_exclude: string[];
};

type Options = { tabs: string[]; disease_areas: string[] };

type AccessMode = "all" | "include" | "exclude";

type FormState = {
  isNew: boolean;
  username: string;
  password: string;
  display_name: string;
  is_active: boolean;
  is_admin: boolean;
  tabsMode: AccessMode;
  tabsValues: string[];
  diseaseMode: AccessMode;
  diseaseValues: string[];
};

function blankForm(): FormState {
  return {
    isNew: true, username: "", password: "", display_name: "",
    is_active: true, is_admin: false,
    tabsMode: "all", tabsValues: [], diseaseMode: "all", diseaseValues: [],
  };
}

function formFromUser(u: AdminUser): FormState {
  const tabsMode: AccessMode = u.tabs.length ? "include" : u.tabs_exclude.length ? "exclude" : "all";
  const diseaseMode: AccessMode =
    u.disease_areas.length ? "include" : u.disease_areas_exclude.length ? "exclude" : "all";
  return {
    isNew: false,
    username: u.username,
    password: u.password,
    display_name: u.display_name,
    is_active: u.is_active,
    is_admin: u.is_admin,
    tabsMode,
    tabsValues: tabsMode === "include" ? u.tabs : tabsMode === "exclude" ? u.tabs_exclude : [],
    diseaseMode,
    diseaseValues:
      diseaseMode === "include" ? u.disease_areas : diseaseMode === "exclude" ? u.disease_areas_exclude : [],
  };
}

function accessBlock(mode: AccessMode, values: string[]) {
  return mode === "all" ? null : { mode, values };
}

function summarize(inc: string[], exc: string[]): string {
  if (inc.length) return `Only: ${inc.length}`;
  if (exc.length) return `All except: ${exc.length}`;
  return "All";
}

async function errorMessage(e: unknown): Promise<string> {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.detail?.errors) return parsed.detail.errors.join("; ");
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    /* not JSON */
  }
  return raw;
}

// ── multi-select (light theme, self-contained) ──────────────────────────────
function MultiSelect({
  options, values, onChange, disabled,
}: { options: string[]; values: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search],
  );
  function toggle(o: string) {
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  }
  if (disabled) return <div className="um-multi-disabled">Applies to all — no selection needed.</div>;
  return (
    <div className="um-multi">
      <input
        className="um-input"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="um-multi-list">
        {filtered.map((o) => (
          <label key={o} className="um-multi-item">
            <input type="checkbox" checked={values.includes(o)} onChange={() => toggle(o)} />
            <span>{o}</span>
          </label>
        ))}
        {!filtered.length && <div className="um-empty">No options match</div>}
      </div>
      {values.length > 0 && (
        <div className="um-chips">
          {values.map((v) => (
            <span key={v} className="um-chip">
              {v}
              <button type="button" onClick={() => toggle(v)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [options, setOptions] = useState<Options>({ tabs: [], disease_areas: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState("");
  const activeUserCount = users.filter((user) => user.is_active).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [u, o] = await Promise.all([
        apiRequest<{ users: AdminUser[] }>("/api/admin/users"),
        apiRequest<Options>("/api/admin/options"),
      ]);
      setUsers(u.users);
      setOptions(o);
    } catch (e) {
      setError(await errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        username: form.username.trim(),
        password: form.password,
        display_name: form.display_name.trim() || form.username.trim(),
        is_active: form.is_active,
        is_admin: form.is_admin,
        tabs: accessBlock(form.tabsMode, form.tabsValues),
        disease_areas: accessBlock(form.diseaseMode, form.diseaseValues),
      };
      if (form.isNew) {
        await apiRequest("/api/admin/users", { method: "POST", body: JSON.stringify(body) });
      } else {
        await apiRequest(`/api/admin/users/${encodeURIComponent(form.username)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }
      setForm(null);
      await load();
    } catch (e) {
      setFormError(await errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(u: AdminUser, active: boolean) {
    const verb = active ? "activate" : "deactivate";
    if (!active && !confirm(`Deactivate ${u.username}? They will no longer be able to log in.`)) return;
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(u.username)}/${verb}`, { method: "POST" });
      await load();
    } catch (e) {
      alert(await errorMessage(e));
    }
  }

  async function rebuildSnapshots() {
    setRebuilding(true);
    setRebuildMsg("");
    try {
      const r = await apiRequest<{
        active_users: number;
        scopes: { scope_key: string }[];
      }>("/api/admin/rebuild-snapshots", { method: "POST" });
      setRebuildMsg(
        `✓ Rebuilt ${r.scopes.length} access-scope snapshot(s) for ${r.active_users} active users.`,
      );
    } catch (e) {
      setRebuildMsg(`✕ ${await errorMessage(e)}`);
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="um-page">
      <div className="um-toolbar">
        <div>
          <div className="um-count">{activeUserCount} Active users</div>
          {rebuildMsg && <div className="um-rebuild-msg">{rebuildMsg}</div>}
        </div>
        <div className="um-toolbar-actions">
          <button className="um-btn" onClick={rebuildSnapshots} disabled={rebuilding}>
            {rebuilding ? "Rebuilding…" : "↻ Rebuild snapshots"}
          </button>
          <button className="um-btn um-btn-primary" onClick={() => { setFormError(""); setForm(blankForm()); }}>
            + Add user
          </button>
        </div>
      </div>

      {error && <div className="um-alert">{error}</div>}
      {loading ? (
        <div className="um-loading">Loading users…</div>
      ) : (
        <div className="um-table-card">
          <table className="um-table">
            <thead>
              <tr>
                <th>Username</th><th>Display name</th><th>Password</th>
                <th>Tabs</th><th>Disease areas</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username} className={u.is_active ? "" : "um-row-inactive"}>
                  <td className="um-mono">
                    {u.username}
                    {u.is_admin && <span className="um-badge um-badge-admin">ADMIN</span>}
                  </td>
                  <td>{u.display_name}</td>
                  <td className="um-mono">{u.password}</td>
                  <td>{summarize(u.tabs, u.tabs_exclude)}</td>
                  <td>{summarize(u.disease_areas, u.disease_areas_exclude)}</td>
                  <td>
                    <span className={`um-badge ${u.is_active ? "um-badge-active" : "um-badge-inactive"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="um-row-actions">
                    <button className="um-btn um-btn-ghost" onClick={() => { setFormError(""); setForm(formFromUser(u)); }}>
                      Edit
                    </button>
                    {u.is_active ? (
                      <button className="um-btn um-btn-danger" onClick={() => setActive(u, false)}>Deactivate</button>
                    ) : (
                      <button className="um-btn" onClick={() => setActive(u, true)}>Activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="um-modal-overlay" onClick={() => !saving && setForm(null)}>
          <div className="um-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="um-modal-title">{form.isNew ? "Add user" : `Edit ${form.username}`}</h3>

            <div className="um-field">
              <label>Username</label>
              <input
                className="um-input"
                value={form.username}
                disabled={!form.isNew}
                onChange={(e) => patch({ username: e.target.value })}
              />
            </div>

            <div className="um-field-row">
              <div className="um-field">
                <label>Password</label>
                <input className="um-input" value={form.password} onChange={(e) => patch({ password: e.target.value })} />
              </div>
              <div className="um-field">
                <label>Display name</label>
                <input className="um-input" value={form.display_name} onChange={(e) => patch({ display_name: e.target.value })} />
              </div>
            </div>

            <div className="um-field-row">
              <label className="um-check">
                <input type="checkbox" checked={form.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
                Active
              </label>
              <label className="um-check">
                <input type="checkbox" checked={form.is_admin} onChange={(e) => patch({ is_admin: e.target.checked })} />
                Super-admin (sees only User Management)
              </label>
            </div>

            <div className="um-field">
              <label>Tab access</label>
              <select className="um-select" value={form.tabsMode} onChange={(e) => patch({ tabsMode: e.target.value as AccessMode })}>
                <option value="all">All tabs</option>
                <option value="include">Only these tabs</option>
                <option value="exclude">All tabs except these</option>
              </select>
              <MultiSelect
                options={options.tabs}
                values={form.tabsValues}
                onChange={(v) => patch({ tabsValues: v })}
                disabled={form.tabsMode === "all"}
              />
            </div>

            <div className="um-field">
              <label>Disease-area access</label>
              <select className="um-select" value={form.diseaseMode} onChange={(e) => patch({ diseaseMode: e.target.value as AccessMode })}>
                <option value="all">All disease areas</option>
                <option value="include">Only these</option>
                <option value="exclude">All except these</option>
              </select>
              <MultiSelect
                options={options.disease_areas}
                values={form.diseaseValues}
                onChange={(v) => patch({ diseaseValues: v })}
                disabled={form.diseaseMode === "all"}
              />
            </div>

            {formError && <div className="um-alert">{formError}</div>}

            <div className="um-modal-actions">
              <button className="um-btn um-btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
              <button className="um-btn um-btn-primary" onClick={save} disabled={saving || !form.username.trim() || !form.password}>
                {saving ? "Saving…" : form.isNew ? "Create user" : "Save changes"}
              </button>
            </div>
            {!form.isNew && (
              <p className="um-hint">Changes take effect on the user’s next request. Rebuild snapshots after changing disease-area scope so their Home KPIs match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
