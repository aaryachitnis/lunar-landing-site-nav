"""Compatibility access to the canonical landing-site coordinate catalog."""

from data import SITES

Sites = [list(coordinates) for coordinates in SITES]

__all__ = ["Sites"]
