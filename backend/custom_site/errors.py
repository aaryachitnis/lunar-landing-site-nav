"""Exceptions raised by the custom-site feature.

The UI only needs to catch ``CustomSiteError``; the subclasses let it show a
useful message for each failure mode.
"""

from __future__ import annotations

from typing import Optional


class CustomSiteError(Exception):
    """Base class for every error raised by this package."""


class InvalidSiteRequest(CustomSiteError, ValueError):
    """The coordinates or parameters are not usable (bad range, NaN, unknown name...)."""


class EngineConfigError(CustomSiteError):
    """Backend selection or URL is misconfigured (e.g. http backend without a URL)."""


class EngineUnavailable(CustomSiteError):
    """The engine could not be reached (connection refused, DNS failure, timeout)."""


class EngineError(CustomSiteError):
    """The engine was reached but reported an error."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class EngineContractError(CustomSiteError):
    """The engine replied, but the payload does not match ``SiteResult``."""
