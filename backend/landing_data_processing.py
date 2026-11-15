"""Compatibility access to the canonical landing-site coordinate catalog."""

from data import SITES

Sites = [list(site[2]) for site in SITES]

__all__ = ["Sites"]
