"""Plotly figure builders for the right-hand side of the dashboard.

Each function takes a ``SiteResult`` and returns a ``plotly.graph_objects.Figure``,
so they work unchanged in Streamlit (``st.plotly_chart``) or Dash (``dcc.Graph``).
Plotly is imported lazily; the rest of the package does not need it.

Colours follow the validated categorical order: Earth = blue (slot 1),
Sun = orange (slot 2), power = aqua (slot 3). Backgrounds are transparent so the
figures sit on whatever theme the host page uses.
"""

from __future__ import annotations

import numpy as np

from .schemas import SiteResult
from .terrain import hillshade

EARTH_COLOR = "#2a78d6"
SUN_COLOR = "#eb6834"
POWER_COLOR = "#1baf7a"
_FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"


def _base_layout(go, **overrides):
    layout = dict(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family=_FONT, size=12),
        margin=dict(l=10, r=10, t=30, b=10),
    )
    layout.update(overrides)
    return go.Layout(**layout)


def terrain_figure(result: SiteResult):
    """2D terrain map: shaded relief with an elevation colour overlay and the site marked."""
    import plotly.graph_objects as go

    t = result.terrain
    elevation = np.asarray(t.elevation_m, dtype=float)
    shade = hillshade(elevation, t.pixel_size_m)
    ny, nx = elevation.shape
    x = np.linspace(-t.radius_km, t.radius_km, nx)
    y = np.linspace(t.radius_km, -t.radius_km, ny)  # row 0 = north

    fig = go.Figure(layout=_base_layout(go))
    fig.add_trace(
        go.Heatmap(
            x=x, y=y, z=shade, colorscale="Greys", showscale=False, hoverinfo="skip", zsmooth=False
        )
    )
    fig.add_trace(
        go.Heatmap(
            x=x,
            y=y,
            z=elevation,
            colorscale="Cividis",
            opacity=0.55,
            zsmooth=False,
            colorbar=dict(title=dict(text="Elevation (m)"), thickness=12, len=0.9),
            hovertemplate="E %{x:.2f} km, N %{y:.2f} km<br>%{z:.1f} m<extra></extra>",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=[0],
            y=[0],
            mode="markers",
            marker=dict(symbol="x", size=12, color="#ffffff", line=dict(width=2, color="#0b0b0b")),
            name="Landing site",
            hovertemplate="Landing site<extra></extra>",
            showlegend=False,
        )
    )
    fig.update_xaxes(title="East of site (km)", constrain="domain", showgrid=False, zeroline=False)
    fig.update_yaxes(title="North of site (km)", scaleanchor="x", showgrid=False, zeroline=False)
    fig.update_layout(height=460)
    return fig


def sky_figure(result: SiteResult):
    """Sun and Earth elevation above the local horizon over the analysis window."""
    import plotly.graph_objects as go

    e = result.ephemeris
    fig = go.Figure(layout=_base_layout(go))
    for name, track, color in (("Earth", e.earth, EARTH_COLOR), ("Sun", e.sun, SUN_COLOR)):
        fig.add_trace(
            go.Scatter(
                x=e.times_utc,
                y=track.elevation_deg,
                customdata=track.azimuth_deg,
                mode="lines",
                name=name,
                line=dict(color=color, width=2),
                hovertemplate=f"{name}<br>elevation %{{y:.1f}}°, azimuth %{{customdata:.1f}}°<extra></extra>",
            )
        )
    fig.add_hline(y=0, line=dict(width=1, dash="dot"), opacity=0.6)
    fig.update_yaxes(title="Elevation above horizon (°)", range=[-90, 90], gridcolor="rgba(128,128,128,0.2)")
    fig.update_xaxes(title=None, gridcolor="rgba(128,128,128,0.2)")
    fig.update_layout(height=300, hovermode="x unified", legend=dict(orientation="h", y=1.12, x=0))
    return fig


def power_figure(result: SiteResult):
    """Array power output over the analysis window."""
    import plotly.graph_objects as go

    e = result.ephemeris
    fig = go.Figure(layout=_base_layout(go))
    fig.add_trace(
        go.Scatter(
            x=e.times_utc,
            y=result.power.power_w,
            mode="lines",
            name="Array power",
            line=dict(color=POWER_COLOR, width=2),
            fill="tozeroy",
            fillcolor="rgba(27,175,122,0.18)",
            hovertemplate="%{y:,.0f} W<extra></extra>",
        )
    )
    fig.add_annotation(
        x=1, xref="paper", y=1, yref="paper", xanchor="right", yanchor="bottom",
        text="Array power (W)", showarrow=False, font=dict(size=12),
    )
    fig.update_yaxes(title="Power (W)", rangemode="tozero", gridcolor="rgba(128,128,128,0.2)")
    fig.update_xaxes(title=None, gridcolor="rgba(128,128,128,0.2)")
    fig.update_layout(height=260, hovermode="x unified", showlegend=False)
    return fig
