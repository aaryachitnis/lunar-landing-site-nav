import numpy as np
from astroquery.jplhorizons import Horizons
from datetime import datetime, time, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

from landing_data_processing import Sites
STEP = '4hour'  # step for ephemerides
SOLAR_INTENSITY = 1361  # W/m^2
SOLAR_PANEL_AREA = 2.0  # m^2
SOLAR_PANEL_EFFICIENCY = 0.2  # 20% efficiency

# ==========================================
# LUNAR SITE GENERATION
# ==========================================
def get_lunar_sites_loc(location):
    lunar_site = {
        'lon': location[1],
        'lat': location[0],
        'elevation': 0,
        'body': 301
    }
    return lunar_site

# ==========================================
# TIME RANGE
# ==========================================
def get_time_range():
    start_datetime = datetime.now(timezone.utc) - timedelta(days=3) - timedelta(days=15)
    end_datetime = start_datetime + timedelta(days=27) + timedelta(days=15)

    start_datetime_str = start_datetime.strftime("%Y-%m-%d %H:%M")
    end_datetime_str = end_datetime.strftime("%Y-%m-%d %H:%M")

    return start_datetime_str, end_datetime_str


# ==========================================
# HORIZONS EPHS DATA
# ==========================================
def get_horizons_data(lunar_site_loc, start_datetime_str, end_datetime_str, step):
    sun_from_moon = Horizons(
        id='10',
        location=lunar_site_loc,
        epochs={
            'start': start_datetime_str,
            'stop': end_datetime_str,
            'step': step
        }
    )
    earth_from_moon = Horizons(
        id='399',
        location=lunar_site_loc,
        epochs={
            'start': start_datetime_str,
            'stop': end_datetime_str,
            'step': step
        }
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        sun_future = executor.submit(sun_from_moon.ephemerides, quantities='4,20')
        earth_future = executor.submit(earth_from_moon.ephemerides, quantities='4')

        sun_eph = sun_future.result()
        earth_eph = earth_future.result()

    return sun_eph, earth_eph

def get_sunrise_sunset(lunar_site_loc, start_datetime_str, end_datetime_str):
    sun = Horizons(
        id='10',
        location=lunar_site_loc,
        epochs={
            'start': start_datetime_str,
            'stop': end_datetime_str,
            'step': '5m'
        }
    )
    sunrise_sunset = sun.ephemerides(
        quantities='4',
        optional_settings={
            'R_T_S_ONLY': 'YES'
        }
    )

    return sunrise_sunset


# ==========================================
# BETA ANGLE CALCULATION
# ==========================================
def calculate_beta_angle(sun_eph):
    n = np.array([0, 0, 1])  # Lunar surface normal

    az = np.deg2rad(np.array(sun_eph['AZ']))
    el = np.deg2rad(np.array(sun_eph['EL']))

    # Calculate Sun unit vectors for every timestamp
    sun_vector = np.column_stack((
        np.cos(az) * np.cos(el),
        np.sin(az) * np.cos(el),
        np.sin(el)
    ))

    dot_product = sun_vector @ n
    beta = np.arccos(np.clip(dot_product, -1.0, 1.0))
    return np.rad2deg(beta)


# ==========================================
# HORIZONS SUNSET/RISE DATA
# ==========================================

def get_crossing_indicies(sun_eph):
    data = np.array(sun_eph['EL'], dtype=float)
    threshold = 0
    crossings = [
        i + 1
        for i, (prev_val, curr_val) in enumerate(zip(data, data[1:]))
        if (prev_val < threshold <= curr_val) or (prev_val >= threshold > curr_val)
    ]
    return crossings

def get_sunrise_sunset(lunar_site_loc, start_datetime_str, end_datetime_str):
    sun = Horizons(
        id='10',
        location=lunar_site_loc,
        epochs={
            'start': start_datetime_str,
            'stop': end_datetime_str,
            'step': '5m'
        }
    )
    sunrise_sunset = sun.ephemerides(
        quantities='4',
        optional_settings={
            'R_T_S_ONLY': 'YES'
        }
    )
    return sunrise_sunset


# ==========================================
# POWER AND ENERGY CALCULATION
# ==========================================
def calculate_energy_per_day(inst_solar_power, sun_eph):
    timestamps = np.array(sun_eph['datetime_jd'], dtype=float)
    time_seconds = (timestamps - timestamps[0]) * 86400     # Convert Julian dates into elapsed seconds
    solar_power = np.asarray(inst_solar_power, dtype=float)

    # Check input consistency
    if len(time_seconds) != len(inst_solar_power):
        raise ValueError("Solar power and timestamps must have equal lengths.")
    if np.any(np.diff(time_seconds) <= 0):
        raise ValueError("Timestamps must be strictly increasing.")

    daily_energy_kWh = []

    # Calculate number of complete Earth days
    number_of_days = int(time_seconds[-1] // 86400)
    for day in range(number_of_days):
        start_time = day * 86400
        end_time = (day + 1) * 86400

        mask = (
            (time_seconds > start_time) &
            (time_seconds < end_time)
        ) # Select timestamps inside this 24-hour period

        # Include exact start and end times
        sample_times = np.concatenate(([start_time], time_seconds[mask], [end_time]))

        # Interpolate power at the selected timestamps
        sample_power = np.interp(sample_times, time_seconds, inst_solar_power)

        # Integrate power over time
        energy_joules = np.trapezoid(sample_power, sample_times)  # Energy in Joules (W*s)
        daily_energy_kWh.append(float(energy_joules / 3.6e6))
    return daily_energy_kWh


# ==========================================
# MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    lunar_location = Sites[0]
    lunar_site_loc = get_lunar_sites_loc(lunar_location)
    start_datetime_str, end_datetime_str = get_time_range()
    start = datetime.now()
    sun_eph, earth_eph = get_horizons_data(lunar_site_loc, start_datetime_str, end_datetime_str, STEP)
    print(f"Time taken for Horizons queries: {datetime.now() - start}")
    beta_angle = calculate_beta_angle(sun_eph)
    sunset_sunrise = get_sunrise_sunset(lunar_site_loc, start_datetime_str, end_datetime_str)

    inst_solar_power = (
        SOLAR_INTENSITY
        * SOLAR_PANEL_AREA
        * SOLAR_PANEL_EFFICIENCY
        * np.maximum(0, np.cos(np.deg2rad(beta_angle)))
    )

    daily_energy = calculate_energy_per_day(inst_solar_power, sun_eph)
    
    average_power_24h = np.mean(daily_energy) * 1000 / 24 # includes when energy is 0

    sunlit_days = [energy for energy in daily_energy if energy > 0]

    average_power_sunlit = (
        np.mean(sunlit_days) * 1000 / 24
        if sunlit_days else 0
    ) # excludes when energy is 0
    
    print(average_power_24h)
    print(average_power_sunlit)


    # Calculate separately from individual sunrise/sunset events
    # maximum_darkness = calculate_maximum_darkness(sun_eph)
    # print(daily_energy)