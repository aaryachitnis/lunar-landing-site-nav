import GlobePage from './pages/GlobePage/GlobePage.jsx';
import HorizonPage from './pages/HorizonPage/HorizonPage.jsx';
import PlaygroundPage from './pages/PlaygroundPage/PlaygroundPage.jsx';
import GuidePage from './pages/GuidePage/GuidePage.jsx';

// `immersive`: full-bleed view; on small screens the nav collapses to a floating ☰ button.
export const routes = [
  { path: '/', label: 'Landing Sites', element: <GlobePage />, index: true },
  { path: '/lunarium', label: 'Lunarium', element: <HorizonPage />, immersive: true },
  { path: '/playground', label: 'Playground', element: <PlaygroundPage /> },
  { path: '/guide', label: 'Guide', element: <GuidePage /> },
];

// Old paths that still work (query string is kept): from → to.
export const redirects = [{ from: '/horizon', to: '/lunarium' }];

// Query params that follow you between tabs, so the selected site and time stay put.
export const SHARED_PARAMS = ['site', 't'];
