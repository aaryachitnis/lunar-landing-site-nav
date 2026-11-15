export function isCalculatedLocationCurrent(result, values, { busy, error }) {
  if (!result || busy || error) return false;

  const latitude = Number(values.lat);
  const rawLongitude = Number(values.lon);
  const longitude = rawLongitude > 180 ? rawLongitude - 360 : rawLongitude;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    result.request.lat === latitude &&
    result.request.lon === longitude
  );
}
