from astroquery.jplhorizons import Horizons

lunar_site = {
    'lon': 0.0,         # East longitude in degrees (0 to 360 or -180 to 180)
    'lat': -89.9,       # Latitude in degrees (-90 to +90)
    'elevation': 1.5,   # Elevation in kilometers above lunar reference radius (1737.4 km)
    'body': '301'       # '301' specifies the Moon
}

sun_from_moon = Horizons(
    id='10',
    location=lunar_site,
    epochs={'start': '2026-11-14', 'stop': '2026-11-15', 'step': '1h'}
)

earth_from_moon = Horizons(
    id='399',
    location=lunar_site,
    epochs={'start': '2026-11-14', 'stop': '2026-11-15', 'step': '1h'}
)

# Fetch ephemerides (e.g., Azimuth, Elevation, RA, DEC, Distance)
eph = sun_from_moon.ephemerides()
print(eph['datetime_str', 'AZ', 'EL', 'delta'])
