import { Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { routes } from './routes.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {routes.map((r) =>
          r.index ? <Route key={r.path} index element={r.element} /> : <Route key={r.path} path={r.path} element={r.element} />,
        )}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
