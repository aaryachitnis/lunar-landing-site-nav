// One source for metric wording: tile tooltips in the site panel and the Guide's reference both read this.

export const METRIC_GROUPS = [
  { key: 'sky', label: 'Sun & Earth' },
  { key: 'power', label: 'Power' },
  { key: 'terrain', label: 'Location & terrain' },
];

export const METRIC_DOCS = {
  'Sun altitude': {
    group: 'sky',
    text: 'Angular height of the Sun above the local lunar horizon. The higher it is, the more directly sunlight falls on a horizontal solar panel.',
  },
  'Sun visible': {
    group: 'sky',
    text: 'Whether the Sun is above the real skyline (hills and crater rims) at the selected time. The flat-horizon answer is shown underneath for comparison.',
  },
  'Time to sunset': {
    group: 'sky',
    text: 'Time remaining until the Sun drops below the skyline, starting the next period without direct sunlight.',
  },
  'Time to sunrise': {
    group: 'sky',
    text: 'Time remaining until the Sun rises above the skyline, bringing direct sunlight back.',
  },
  'Earth altitude': {
    group: 'sky',
    text: 'Angular height of Earth above the horizon as seen from the site. Higher generally means a clearer radio link to Earth.',
  },
  'Earth visible': {
    group: 'sky',
    text: 'Whether Earth is above the real skyline, i.e. in line of sight for direct-to-Earth radio. The flat-horizon answer is shown underneath.',
  },
  'Time to Earthset': {
    group: 'sky',
    text: 'Time remaining until Earth drops below the skyline, interrupting direct communication.',
  },
  'Time to Earthrise': {
    group: 'sky',
    text: 'Time remaining until Earth reappears above the skyline, restoring direct communication.',
  },
  Sunlit: {
    group: 'sky',
    text: 'Share of the forecast window during which the site gets direct sunlight. Higher means more solar energy for sustained operations.',
  },
  'Longest darkness': {
    group: 'sky',
    text: 'Longest unbroken stretch without direct sunlight in the forecast window. This sets how big the battery must be to survive the night.',
  },
  'Earth in view': {
    group: 'sky',
    text: 'Share of the forecast window during which Earth is above the skyline and direct radio contact is possible.',
  },
  'Longest comms gap': {
    group: 'sky',
    text: 'Longest unbroken stretch with Earth hidden. "Lost to terrain" is time Earth is above the flat horizon but behind a hill.',
  },
  'Terrain horizon': {
    group: 'sky',
    text: 'How high the skyline rises in the direction of the Sun or Earth. A body is visible only when it is higher than this. From a summit it can be below 0°, letting you see past the flat horizon.',
  },
  'Power now': {
    group: 'power',
    text: 'Estimated solar power available per square metre of flat, horizontal panel at the selected time.',
  },
  Energy: {
    group: 'power',
    text: 'Total solar energy per square metre collected over the forecast window. Useful for estimating the overall energy budget.',
  },
  'Mean power': {
    group: 'power',
    text: 'Average solar power per square metre across 24 h periods, counting both lit and dark hours.',
  },
  'Mean, sunlit days': {
    group: 'power',
    text: 'Average solar power per square metre on days with at least some sunlight. Leaves out fully dark days, so it shows what you get while the Sun is up.',
  },
  'Peak power': {
    group: 'power',
    text: 'Highest power per square metre reached at any point in the window, i.e. when the Sun is highest.',
  },
  Hemisphere: {
    group: 'terrain',
    text: 'Near side faces Earth, so direct radio contact is possible. The far side never sees Earth and needs a relay satellite.',
  },
  Latitude: {
    group: 'terrain',
    text: "The site's north/south position relative to the lunar equator. Negative values are in the southern hemisphere.",
  },
  Longitude: {
    group: 'terrain',
    text: "The site's east/west position around the Moon, measured from the reference meridian that faces Earth.",
  },
  Altitude: {
    group: 'terrain',
    text: "The site's elevation relative to the lunar reference surface. Gives context for the surrounding terrain.",
  },
  'Mean slope': {
    group: 'terrain',
    text: 'Average steepness of the ground around the site. Lower slopes give level ground for landing and surface operations.',
  },
  'Surface roughness': {
    group: 'terrain',
    text: 'Variation in terrain height around the site, as an RMS (root mean square) value. Higher means more uneven ground. Measured at km scale, so boulders are not included.',
  },
  'Patch altitude': {
    group: 'terrain',
    text: 'Minimum, mean or maximum elevation within the surrounding terrain patch (80 km in the site panel, your chosen tile size in the Playground). Helps spot major highs and lows around the site.',
  },
  Relief: {
    group: 'terrain',
    text: 'Height difference between the lowest and highest points in the patch. Large relief means big hills or deep craters nearby that can cast long shadows.',
  },
};
