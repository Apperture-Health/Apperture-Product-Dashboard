# Next.js + FastAPI Migration Runbook

## Backend

1. Create a virtual environment and install `backend/requirements.txt`.
2. Keep the existing `.streamlit/secrets.toml` file in place. The FastAPI backend reads the same credentials, database settings, and OpenAI key.
3. Create or upgrade the auth schema. This command is idempotent and ensures that `user_creds.is_admin` exists:

```powershell
python backend/scripts/create_auth_table.py
```

4. Start the API from the repo root:

```powershell
uvicorn backend.main:app --reload
```

## Frontend

1. Install dependencies from `frontend/package.json`.
2. Copy `frontend/.env.example` to `.env.local` if needed.
3. Start the app:

```powershell
cd frontend
npm run dev
```

## Parity Scope Implemented

- FastAPI session auth using the existing user access rules and secrets.
- Shared global filter state with static global catalogs and dynamically scoped downstream options.
- Page bundle APIs for all currently reachable tabs.
- Next.js dashboard shell, login page, sidebar filters, tabbed navigation, charts, exports, AI actions, and placeholder score page.
- Existing Streamlit source retained as the parity reference during the migration.

## Remaining Hardening

- Install dependencies and run full frontend type/build verification.
- Execute end-to-end parity checks against the original Streamlit app with live database access.
- Replace the temporary HTML table renderer with AG Grid React if strict table UI parity is required in production.
