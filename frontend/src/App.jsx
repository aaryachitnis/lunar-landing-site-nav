import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { redirects, routes } from './routes.jsx';

function RedirectKeepingQuery({ to }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {routes.map((r) =>
          r.index ? <Route key={r.path} index element={r.element} /> : <Route key={r.path} path={r.path} element={r.element} />,
        )}
        {redirects.map((r) => (
          <Route key={r.from} path={r.from} element={<RedirectKeepingQuery to={r.to} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
