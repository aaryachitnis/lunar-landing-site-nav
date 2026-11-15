"""Custom lunar landing-site feature: enter coordinates, get power potential + terrain.

Importing this package pulls in only pydantic and numpy. The Streamlit panel
(``ui_streamlit``) and the Plotly builders (``figures``) are imported on demand.
"""

from .client import PotentialEngineClient, get_client
from .errors import (
    CustomSiteError,
    EngineConfigError,
    EngineContractError,
    EngineError,
    EngineUnavailable,
    InvalidSiteRequest,
)
from .schemas import SCHEMA_VERSION, SiteRequest, SiteResult
from .service import build_request, calculate_site_potential

__all__ = [
    "SCHEMA_VERSION",
    "SiteRequest",
    "SiteResult",
    "PotentialEngineClient",
    "get_client",
    "build_request",
    "calculate_site_potential",
    "CustomSiteError",
    "InvalidSiteRequest",
    "EngineConfigError",
    "EngineUnavailable",
    "EngineError",
    "EngineContractError",
]
