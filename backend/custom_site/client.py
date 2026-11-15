"""The engine-client interface and the factory that picks an implementation."""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from .config import Settings, load_settings
from .errors import EngineConfigError
from .schemas import SiteRequest, SiteResult


@runtime_checkable
class PotentialEngineClient(Protocol):
    """Anything with this method can back the dashboard: the mock, the HTTP
    client, or a direct in-process call into the Python engine."""

    def calculate_potential(self, request: SiteRequest) -> SiteResult: ...


def get_client(settings: Optional[Settings] = None) -> PotentialEngineClient:
    """Build the client selected by ``LUNAR_ENGINE_BACKEND`` (default: mock)."""
    settings = settings or load_settings()

    if settings.backend == "mock":
        from .mock_engine import MockEngineClient

        return MockEngineClient()

    if settings.backend == "http":
        if not settings.url:
            raise EngineConfigError("LUNAR_ENGINE_BACKEND=http requires LUNAR_ENGINE_URL to be set.")
        from .http_client import HttpEngineClient

        return HttpEngineClient(
            settings.url, endpoint_path=settings.endpoint_path, timeout_s=settings.timeout_s
        )

    raise EngineConfigError(
        f"Unknown LUNAR_ENGINE_BACKEND '{settings.backend}'. Use 'mock' or 'http'."
    )
