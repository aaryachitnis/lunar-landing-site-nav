import GlobePage from './pages/GlobePage/GlobePage.jsx';
import HorizonPage from './pages/HorizonPage/HorizonPage.jsx';

// Route registry: the nav bar and <Routes> are both built from this list.
// To add a feature: create pages/<Feature>/<Feature>.jsx and add an entry here.
//   immersive: full-bleed view; on small screens the nav collapses to a floating ☰ button over it.
export const routes = [
  { path: '/', label: 'Landing Sites', element: <GlobePage />, index: true },
  { path: '/lunarium', label: 'Lunarium', element: <HorizonPage />, immersive: true },
];

// Old paths that still work (query string is kept): from → to.
export const redirects = [{ from: '/horizon', to: '/lunarium' }];

// Query params that follow you between tabs, so the selected site and time stay put.
export const SHARED_PARAMS = ['site', 't'];
