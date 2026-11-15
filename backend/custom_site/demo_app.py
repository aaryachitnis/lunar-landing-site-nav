"""Standalone preview of the panel, so the UI can be tried without touching the main dashboard.

    streamlit run custom_site/demo_app.py

Uses the mock engine unless LUNAR_ENGINE_BACKEND=http (and LUNAR_ENGINE_URL) are set.
"""

import sys
from pathlib import Path

# Allow `streamlit run custom_site/demo_app.py` from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st  # noqa: E402

from custom_site.ui_streamlit import render_custom_site_panel  # noqa: E402

st.set_page_config(page_title="Custom lunar landing site", layout="wide")
render_custom_site_panel()
