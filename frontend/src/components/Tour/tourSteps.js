// `target` matches a [data-tour] attribute; `needsSite` opens the tour site first so the panel exists.
// `body` may be a function of the Tour's `context` (e.g. which site is open). `follow` (Lunarium) turns the view to a body.
export const TOUR_SITE_ID = 'orig1';
export const TOUR_STORAGE_KEY = 'lsn:tour-done';

export const TOUR_STEPS = [
  {
    title: 'Welcome to Lunar Site Navigator',
    body: 'Compare places to land on the Moon by sunlight, contact with Earth and terrain. This one-minute tour shows you around.',
    next: 'Show me around',
  },
  {
    title: 'The Moon',
    body: 'Drag to spin it, scroll or pinch to zoom. Each marker is a landing site. Click one to open it.',
    placement: 'bottom',
  },
  {
    target: 'list',
    title: 'Landing sites',
    body: 'Or pick from the catalogue: Artemis candidates, commercial (CLPS) landers, international missions and Apollo. Sites you save in the Playground show up here as user-added.',
  },
  {
    target: 'panel',
    needsSite: true,
    title: 'Site panel',
    body: ({ siteName, tourPicked }) =>
      `${tourPicked ? `We opened ${siteName ?? 'a site'} for you. ` : ''}This panel has everything about ${tourPicked || !siteName ? 'the selected site' : siteName}. "Stand here" takes you to Lunarium to see its horizon, and the ⓘ button gives its background.`,
  },
  {
    target: 'location',
    needsSite: true,
    title: 'Location & terrain',
    body: "Coordinates, slope and roughness from NASA's LOLA elevation data, with a bird's-eye view of the surrounding 80 km. Hover or tap any ⓘ to see what a number means.",
  },
  {
    target: 'time',
    needsSite: true,
    title: 'Pick a moment',
    body: 'Every figure below is for this date and time. Step a day at a time to watch the light change.',
  },
  {
    target: 'power',
    needsSite: true,
    title: 'Solar power',
    body: 'What a 1 m² flat panel would produce now and over the next month. Polar sites get little, because the Sun stays low.',
  },
  {
    target: 'sky',
    needsSite: true,
    title: 'Sun & Earth',
    body: 'The timeline shows when the Sun and Earth are above the real skyline. The Sun must be up to make power. Earth must be up to talk home directly.',
  },
  {
    target: 'nav',
    title: 'More views',
    body: 'Lunarium puts you on the surface to watch the sky move. Playground analyses any coordinates you type. Guide explains the science behind it all.',
  },
  {
    title: "You're all set",
    body: 'Open the Guide to learn why the poles are so tricky, or start exploring. You can replay this tour from the Guide at any time.',
    next: 'Start exploring',
    guideLink: true,
  },
];

export const LUNARIUM_TOUR_STORAGE_KEY = 'lsn:lunarium-tour-done';

export const LUNARIUM_TOUR_STEPS = [
  {
    title: 'Welcome to Lunarium',
    body: ({ siteName }) =>
      `You're standing on the Moon${siteName ? ` at ${siteName}` : ''}, looking at the real horizon traced from NASA terrain data. Drag to look around, scroll or pinch to zoom. On a phone, turn on Motion and move the phone to look around.`,
    next: 'Show me',
    placement: 'bottom',
  },
  {
    target: 'hz-site',
    title: 'Pick a site',
    body: 'Switch landing sites here. The chip next to it shows how detailed the terrain is: 5 m at key polar sites, 1.9 km elsewhere.',
  },
  {
    target: 'hz-sun',
    follow: 'sun',
    title: 'Sun and Earth',
    body: "We've turned you to face the Sun. Its card and Earth's say whether each one is above the skyline, partly blocked or hidden, and when it next rises or sets. Follow keeps your view on it. When one is out of view, an arrow at the screen edge points to it.",
  },
  {
    target: 'hz-time',
    title: 'Move through time',
    body: 'Press play and pick a speed, or drag along the bars. The coloured bars show when the Sun and Earth are visible. Use the buttons to jump to the next sunrise, sunset, Earthrise or Earthset.',
  },
  {
    title: 'Over to you',
    body: 'Try jumping to the next sunrise and watch the light sweep across the terrain. You can replay this intro from the Guide.',
    next: 'Start exploring',
  },
];
