"""Streamlit panel that implements the schematic.

Left column: longitude, latitude, optional parameters and a "Calculate potential"
button. Right column: landing-site info, 2D terrain map, and the other results
returned by the engine (power, Sun/Earth sky tracks).

Mount it anywhere in the existing dashboard with one call::

    from custom_site.ui_streamlit import render_custom_site_panel
    render_custom_site_panel()          # backend chosen by LUNAR_ENGINE_BACKEND

The panel only talks to ``calculate_site_potential``; it never knows whether the
data came from the mock or the real engine.
"""

from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Optional

from .client import PotentialEngineClient
from .errors import (
    CustomSiteError,
    EngineConfigError,
    EngineContractError,
    EngineError,
    EngineUnavailable,
    InvalidSiteRequest,
)
from .schemas import SiteResult
from .service import calculate_site_potential


def _describe_error(exc: CustomSiteError) -> str:
    if isinstance(exc, InvalidSiteRequest):
        return f"Check your inputs: {exc}"
    if isinstance(exc, EngineUnavailable):
        return f"The processing engine could not be reached. {exc}"
    if isinstance(exc, EngineConfigError):
        return f"Engine is not configured correctly. {exc}"
    if isinstance(exc, EngineContractError):
        return f"The engine replied with unexpected data. {exc}"
    if isinstance(exc, EngineError):
        return f"The engine reported an error. {exc}"
    return str(exc)


def _site_info(st, result: SiteResult) -> None:
    site = result.site
    with st.container(border=True):
        st.markdown(f"#### Landing site info\n**{site.name}**")
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Latitude", f"{site.latitude:.4f}°")
        c2.metric("Longitude", f"{site.longitude:.4f}°")
        c3.metric("Hemisphere", "Near side" if site.near_side else "Far side")
        c4.metric(
            "Centre elevation",
            "n/a" if site.centre_elevation_m is None else f"{site.centre_elevation_m:,.0f} m",
        )
        extras = [p for p in (site.terrain_class and f"Terrain class: {site.terrain_class}", site.notes) if p]
        if extras:
            st.caption(" · ".join(extras))


def _terrain(st, result: SiteResult, key: str) -> None:
    from .figures import terrain_figure

    t = result.terrain
    with st.container(border=True):
        st.markdown(f"#### Terrain mapping\nSource: {t.source}")
        st.plotly_chart(terrain_figure(result), key=f"{key}:terrain")
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Elevation range", f"{t.max_elevation_m - t.min_elevation_m:,.0f} m")
        c2.metric("Mean slope", f"{t.mean_slope_deg:.1f}°")
        c3.metric("Max slope", f"{t.max_slope_deg:.1f}°")
        c4.metric("Roughness (RMS)", f"{t.roughness_m:.1f} m")
        st.caption(f"Tile: {2 * t.radius_km:g} km square, {t.pixel_size_m:.0f} m per pixel.")


def _power(st, result: SiteResult, key: str) -> None:
    from .figures import power_figure, sky_figure

    s = result.power.summary
    with st.container(border=True):
        st.markdown(f"#### Power potential and sky\nSun and Earth positions: {result.ephemeris.source}")
        c1, c2, c3 = st.columns(3)
        c1.metric("Mean power", f"{s.mean_power_w:,.0f} W")
        c2.metric("Peak power", f"{s.peak_power_w:,.0f} W")
        c3.metric("Energy in window", f"{s.total_energy_kwh:,.0f} kWh")
        c4, c5, c6 = st.columns(3)
        c4.metric("Sunlit", f"{s.sunlit_fraction:.0%}")
        c5.metric("Longest darkness", f"{s.longest_darkness_hours:,.0f} h")
        c6.metric("Earth in view", f"{s.earth_visible_fraction:.0%}")
        st.plotly_chart(power_figure(result), key=f"{key}:power")
        st.plotly_chart(sky_figure(result), key=f"{key}:sky")
        with st.expander("View as table"):
            e = result.ephemeris
            st.dataframe(
                {
                    "Time (UTC)": [t.strftime("%Y-%m-%d %H:%M") for t in e.times_utc],
                    "Sun elevation (°)": e.sun.elevation_deg,
                    "Sun azimuth (°)": e.sun.azimuth_deg,
                    "Earth elevation (°)": e.earth.elevation_deg,
                    "Earth azimuth (°)": e.earth.azimuth_deg,
                    "Power (W)": result.power.power_w,
                }
            )


def render_custom_site_panel(
    client: Optional[PotentialEngineClient] = None, *, key: str = "custom_site"
) -> Optional[SiteResult]:
    """Render the whole schematic. Returns the current result (or None).

    ``client`` overrides the environment-selected backend, which is useful for
    tests or for injecting an in-process engine. ``key`` namespaces the widgets
    and session state so the panel can be mounted more than once or alongside
    other widgets without collisions.
    """
    import streamlit as st

    result_key, error_key = f"{key}:result", f"{key}:error"
    left, right = st.columns([1, 2.4], gap="large")

    with left:
        st.subheader("Custom landing site")
        with st.form(f"{key}:form"):
            longitude = st.number_input(
                "Longitude (°, east positive)",
                min_value=-180.0, max_value=180.0, value=0.0, step=0.0001, format="%.4f",
                key=f"{key}:lon",
            )
            latitude = st.number_input(
                "Latitude (°, north positive)",
                min_value=-90.0, max_value=90.0, value=0.0, step=0.0001, format="%.4f",
                key=f"{key}:lat",
            )
            with st.expander("Other parameters"):
                use_now = st.checkbox("Start at current time (UTC)", value=True, key=f"{key}:now")
                now = datetime.now(timezone.utc)
                start_date = st.date_input("Start date (UTC)", value=now.date(), key=f"{key}:date")
                start_clock = st.time_input("Start time (UTC)", value=time(0, 0), key=f"{key}:time")
                duration = st.number_input(
                    "Duration (days)", min_value=0.5, max_value=366.0, value=29.53, step=1.0, key=f"{key}:dur"
                )
                step = st.number_input(
                    "Time step (hours)", min_value=0.1, max_value=48.0, value=1.0, step=0.5, key=f"{key}:step"
                )
                area = st.number_input(
                    "Solar array area (m²)", min_value=0.1, max_value=1_000_000.0, value=10.0, key=f"{key}:area"
                )
                efficiency = st.number_input(
                    "Array efficiency", min_value=0.01, max_value=1.0, value=0.28, step=0.01, key=f"{key}:eff"
                )
                radius = st.number_input(
                    "Terrain tile half-width (km)", min_value=0.5, max_value=50.0, value=5.0, step=0.5,
                    key=f"{key}:radius",
                )
            submitted = st.form_submit_button("Calculate potential", type="primary")

        if submitted:
            start = None if use_now else datetime.combine(start_date, start_clock, tzinfo=timezone.utc)
            try:
                with st.spinner("Calculating potential..."):
                    st.session_state[result_key] = calculate_site_potential(
                        longitude,
                        latitude,
                        client=client,
                        start_time_utc=start,
                        duration_days=duration,
                        step_hours=step,
                        panel_area_m2=area,
                        panel_efficiency=efficiency,
                        terrain_radius_km=radius,
                    )
                st.session_state.pop(error_key, None)
            except CustomSiteError as exc:
                st.session_state.pop(result_key, None)
                st.session_state[error_key] = _describe_error(exc)

        if error_key in st.session_state:
            st.error(st.session_state[error_key])

    result: Optional[SiteResult] = st.session_state.get(result_key)
    with right:
        if result is None:
            st.info("Enter a longitude and latitude, then click **Calculate potential**.")
            return None
        for warning in result.warnings:
            st.warning(warning)
        _site_info(st, result)
        _terrain(st, result, key)
        _power(st, result, key)
    return result
