FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./backend/

# backend/src uses bare imports (e.g. "from api.routes import ...") so both
# the repo root and backend/src must be on the path
ENV PYTHONPATH=/app:/app/backend/src

EXPOSE 8080

CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 2
