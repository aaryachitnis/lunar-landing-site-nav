from typing import Any

from pydantic import BaseModel

from core.models import SiteSummary


class CommunicationMetricsResponse(BaseModel):
    site: SiteSummary
    start: str
    end: str
    step: str
    analysis: dict[str, Any]
