# Clinical Trials Intelligence Platform

A pharma competitive intelligence dashboard built with **Next.js 15** (frontend) and **FastAPI** (backend), connected to GCP Cloud SQL (PostgreSQL).

---

## Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.11+
- A `.streamlit/secrets.toml` file at the project root (contains GCP and DB credentials — not committed to git)

---

## Local Development

### 1. Configure secrets

Create `.streamlit/secrets.toml` at the project root with your credentials:

```toml
openai_api_key = "sk-..."

[gcp]
instance_connection_name = "project:region:instance"
service_account = { type = "service_account", ... }

[db_creds]
db_user = "..."
db_pass = "..."

[dbs]
db_name_aact        = "aact"
db_name_fdaers      = "fdaers"
db_name_pricing     = "pricing"
db_name_drugs       = "drugs"
db_name_marketaccess = "marketaccess"
```

> `secrets.toml` is gitignored — never commit it.

---

### 2. Run the backend

```bash
# Install dependencies (first time only)
cd backend
pip install -r requirements.txt

# Start the FastAPI server
cd src
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend runs at: `http://127.0.0.1:8000`

---

### 3. Run the frontend

Open a second terminal:

```bash
# Install dependencies (first time only)
cd frontend
npm install

# Create the env file pointing to the local backend (first time only)
echo "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000" > .env.local

# Start the Next.js dev server
npm run dev
```

Frontend runs at: `http://localhost:3000` — open this in your browser.

---

## Project Structure

```
.
├── backend/
│   ├── requirements.txt
│   ├── main.py                  ← entry point shim (adds src/ to sys.path)
│   └── src/
│       ├── main.py              ← FastAPI app factory
│       ├── api/
│       │   ├── routes.py        ← all API endpoints
│       │   ├── schemas.py       ← Pydantic request/response models
│       │   └── page_registry.py ← maps page keys to data-fetch functions
│       ├── config/settings.py   ← constants and environment config
│       ├── data/
│       │   ├── db.py            ← query execution helpers
│       │   ├── query_builder.py ← parameterised WHERE clause builder
│       │   └── repository.py    ← all SQL queries
│       ├── services/
│       │   ├── ai_summary.py    ← OpenAI page summary generation
│       │   └── analytics.py     ← cross-page aggregation helpers
│       └── utils/
│           ├── auth.py          ← session auth helpers
│           ├── db_conn.py       ← GCP Cloud SQL connector
│           ├── filters.py       ← FilterState dataclass
│           ├── runtime.py       ← secrets loader + cache compat layer
│           └── preloader.py     ← background data preload on startup
│
├── frontend/
│   ├── app/
│   │   ├── dashboard/page.tsx   ← dashboard route (renders DashboardShell)
│   │   └── api/[...path]/       ← proxy to FastAPI backend
│   └── src/
│       ├── components/
│       │   ├── DashboardShell.tsx       ← main orchestrator
│       │   ├── LoginPage.tsx
│       │   ├── Sidebar.tsx
│       │   ├── FilterSummaryBar.tsx
│       │   ├── pages/                   ← one component per dashboard tab
│       │   └── ui/                      ← reusable UI primitives
│       ├── hooks/
│       │   ├── useAuth.ts               ← session / login / logout
│       │   ├── useFilters.ts            ← filter state + cascading
│       │   └── usePageData.ts           ← page data fetching + LRU cache
│       └── lib/
│           ├── api.ts                   ← fetch helpers
│           ├── types.ts                 ← shared TypeScript types
│           ├── transforms.ts            ← pure data-transform functions
│           └── constants.ts             ← static maps (pages, filters, chips)
│
├── legacy/                      ← original Streamlit app (not deployed)
│   ├── app.py
│   └── ...
│
└── .streamlit/
    └── secrets.toml             ← credentials (gitignored)
```

---

## Build for Production

```bash
# Frontend production build
cd frontend
npm run build
npm start
```

```bash
# Backend (production uses Docker — see backend/Dockerfile)
# The Dockerfile runs:
# uvicorn backend.main:app --host 0.0.0.0 --port 8080
```
