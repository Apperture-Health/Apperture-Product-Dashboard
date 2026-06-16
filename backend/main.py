from __future__ import annotations

import importlib.util as _ilu
import sys
from pathlib import Path


SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# src/main.py is also named "main.py". Importing it by name would cause a
# circular import when uvicorn registers this file as the "main" module.
# Load it by file path instead to avoid the name collision.
_spec = _ilu.spec_from_file_location("_src_main", SRC_DIR / "main.py")
_mod = _ilu.module_from_spec(_spec)
sys.modules["_src_main"] = _mod
_spec.loader.exec_module(_mod)
app = _mod.app
