"""HTTP client for the real FastAPI processing engine.

Uses only the standard library (``urllib``), so enabling it adds no dependency
to any branch. It sends a ``SiteRequest`` as JSON and validates the reply as a
``SiteResult``; anything that does not match the contract raises a clear error
instead of reaching the UI half-parsed.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Mapping, Optional
from urllib.parse import urljoin

from pydantic import ValidationError

from .config import DEFAULT_ENDPOINT_PATH, DEFAULT_TIMEOUT_S
from .errors import EngineContractError, EngineError, EngineUnavailable, InvalidSiteRequest
from .schemas import SCHEMA_VERSION, SiteRequest, SiteResult


def _detail_from_body(body: bytes) -> str:
    """Pull a readable message out of a FastAPI error body (``{"detail": ...}``)."""
    try:
        data = json.loads(body)
    except ValueError:
        return body[:300].decode("utf-8", errors="replace").strip()
    detail = data.get("detail") if isinstance(data, dict) else None
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        parts = []
        for item in detail:
            if isinstance(item, dict):
                loc = ".".join(str(p) for p in item.get("loc", []) if p != "body")
                parts.append(f"{loc}: {item.get('msg')}" if loc else str(item.get("msg")))
        if parts:
            return "; ".join(parts)
    return str(data)[:300]


class HttpEngineClient:
    def __init__(
        self,
        base_url: str,
        *,
        endpoint_path: str = DEFAULT_ENDPOINT_PATH,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        headers: Optional[Mapping[str, str]] = None,
        opener: Optional[urllib.request.OpenerDirector] = None,
    ) -> None:
        self._url = urljoin(base_url.rstrip("/") + "/", endpoint_path.lstrip("/"))
        self._timeout_s = timeout_s
        self._headers = {"Content-Type": "application/json", "Accept": "application/json", **(headers or {})}
        # Default opener honours HTTP(S)_PROXY / NO_PROXY from the environment.
        self._opener = opener or urllib.request.build_opener()

    @property
    def url(self) -> str:
        return self._url

    def calculate_potential(self, request: SiteRequest) -> SiteResult:
        body = request.model_dump_json(exclude_none=True).encode("utf-8")
        http_request = urllib.request.Request(self._url, data=body, headers=self._headers, method="POST")
        try:
            with self._opener.open(http_request, timeout=self._timeout_s) as response:
                payload = response.read()
        except urllib.error.HTTPError as exc:  # must precede URLError/OSError
            detail = _detail_from_body(exc.read())
            if exc.code in (400, 422):
                raise InvalidSiteRequest(f"The engine rejected the inputs: {detail}") from exc
            raise EngineError(f"Engine returned HTTP {exc.code}: {detail}", status_code=exc.code) from exc
        except (urllib.error.URLError, OSError) as exc:  # includes timeouts and refused connections
            reason = getattr(exc, "reason", exc)
            raise EngineUnavailable(f"Could not reach the engine at {self._url} ({reason}).") from exc

        try:
            return SiteResult.model_validate_json(payload)
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:5]
            )
            raise EngineContractError(
                f"Engine response does not match SiteResult v{SCHEMA_VERSION}: {problems}"
            ) from exc
