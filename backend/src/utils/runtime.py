"""
Minimal runtime helpers for the FastAPI migration layer.

This replaces the small subset of Streamlit functionality used by the copied
data/auth/service modules:
  - `cache_data(...)`
  - `secrets`
  - `session_state` (only as a compatibility dict)
  - `error/info/warning` logging helpers
"""
from __future__ import annotations

import functools
import logging
import pickle
import threading
import time
import tomllib
from pathlib import Path
from typing import Any, Callable, TypeVar


F = TypeVar("F", bound=Callable[..., Any])


class _TTLCache:
    def __init__(self) -> None:
        self._store: dict[bytes, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: bytes, ttl: int) -> Any:
        now = time.time()
        with self._lock:
            item = self._store.get(key)
            if item is None:
                raise KeyError
            expires_at, value = item
            if expires_at < now:
                self._store.pop(key, None)
                raise KeyError
            return value

    def set(self, key: bytes, ttl: int, value: Any) -> None:
        with self._lock:
            self._store[key] = (time.time() + ttl, value)


class RuntimeCompat:
    def __init__(self) -> None:
        self._logger = logging.getLogger("ctip.backend")
        self._cache = _TTLCache()
        self.session_state: dict[str, Any] = {}
        self._secrets: dict[str, Any] | None = None

    @property
    def secrets(self) -> dict[str, Any]:
        if self._secrets is None:
            import os
            override = os.getenv("SECRETS_TOML_PATH")
            if override:
                secrets_path = Path(override)
            else:
                root = Path(__file__).resolve().parents[3]
                secrets_path = root / ".streamlit" / "secrets.toml"
            self._logger.info(f"Loading secrets from: {secrets_path} (exists={secrets_path.exists()})")
            if not secrets_path.exists():
                self._secrets = {}
            else:
                with secrets_path.open("rb") as fh:
                    self._secrets = tomllib.load(fh)
        return self._secrets

    def cache_data(self, ttl: int = 300, show_spinner: bool = False) -> Callable[[F], F]:
        del show_spinner

        def decorator(func: F) -> F:
            @functools.wraps(func)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                key = pickle.dumps((func.__module__, func.__qualname__, args, kwargs))
                try:
                    return self._cache.get(key, ttl)
                except KeyError:
                    value = func(*args, **kwargs)
                    self._cache.set(key, ttl, value)
                    return value

            return wrapper  # type: ignore[return-value]

        return decorator

    def error(self, message: str) -> None:
        self._logger.error(message)

    def warning(self, message: str) -> None:
        self._logger.warning(message)

    def info(self, message: str) -> None:
        self._logger.info(message)


runtime = RuntimeCompat()
