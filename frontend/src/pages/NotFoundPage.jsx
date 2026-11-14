import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-secondary)' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>Page not found</h1>
        <Link to="/">Back to the globe</Link>
      </div>
    </div>
  );
}
