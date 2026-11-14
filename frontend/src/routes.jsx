import GlobePage from './pages/GlobePage/GlobePage.jsx';

// Route registry: the nav bar and <Routes> are both built from this list.
// To add a feature: create pages/<Feature>/<Feature>.jsx and add an entry here.
export const routes = [
  { path: '/', label: "God's-eye view", element: <GlobePage />, index: true },
];
