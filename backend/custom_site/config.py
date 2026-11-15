"""Backend selection, driven by environment variables.

LUNAR_ENGINE_BACKEND        "mock" (default) or "http"
LUNAR_ENGINE_URL            Base URL of the FastAPI engine, e.g. http://localhost:8000
LUNAR_ENGINE_ENDPOINT_PATH  Path of the potential endpoint (default below)
LUNAR_ENGINE_TIMEOUT_S      Request timeout in seconds (default 120)

Switching from mock to the real engine is therefore a configuration change,
not a code change.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional

ENV_BACKEND = "LUNAR_ENGINE_BACKEND"
ENV_URL = "LUNAR_ENGINE_URL"
ENV_ENDPOINT_PATH = "LUNAR_ENGINE_ENDPOINT_PATH"
ENV_TIMEOUT = "LUNAR_ENGINE_TIMEOUT_S"

# Proposed endpoint; agree the final path with whoever owns the engine.
DEFAULT_ENDPOINT_PATH = "/api/v1/landing-site/potential"
DEFAULT_TIMEOUT_S = 120.0


@dataclass(frozen=True)
class Settings:
    backend: str = "mock"
    url: Optional[str] = None
    endpoint_path: str = DEFAULT_ENDPOINT_PATH
    timeout_s: float = DEFAULT_TIMEOUT_S


def load_settings(env: Optional[Mapping[str, str]] = None) -> Settings:
    env = os.environ if env is None else env
    try:
        timeout = float(env.get(ENV_TIMEOUT, DEFAULT_TIMEOUT_S))
    except ValueError:
        timeout = DEFAULT_TIMEOUT_S
    return Settings(
        backend=env.get(ENV_BACKEND, "mock").strip().lower() or "mock",
        url=(env.get(ENV_URL) or None),
        endpoint_path=env.get(ENV_ENDPOINT_PATH) or DEFAULT_ENDPOINT_PATH,
        timeout_s=timeout,
    )
