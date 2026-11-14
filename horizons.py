from astroquery.jplhorizons import Horizons

lunar_site = {
    'lon': 0.0,         # East longitude in degrees (0 to 360 or -180 to 180)
    'lat': -89.9,       # Latitude in degrees (-90 to +90)
    'elevation': 1.5,   # Elevation in kilometers above lunar reference radius (1737.4 km)
    'body': '301'       # '301' specifies the Moon
}

start_date = '2026-11-14'
end_date = '2026-11-15'

sun_from_moon = Horizons(
    id='10',
    location=lunar_site,
    epochs={'start': start_date, 'stop': end_date, 'step': '1h'}
)

earth_from_moon = Horizons(
    id='399',
    location=lunar_site,
    epochs={'start': start_date, 'stop': end_date, 'step': '1h'}
)

# Fetch ephemerides (e.g., Azimuth, Elevation, RA, DEC, Distance)
eph = sun_from_moon.ephemerides()
print(eph['datetime_str', 'AZ', 'EL', 'delta'])
# AZ = azimuth - which direction along the horizon to face to find an object (compass)
# EL = elevation - how high above the horizon to look for an object (degrees)
# delta = distance from the observer to the object (in AU)
