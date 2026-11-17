import './UserBadge.css';

export const USER_ADDED_NOTE = 'Added by a user from the Playground. Not part of the curated catalogue; coordinates are unverified.';

export function PersonIcon({ size = 12 }) {
  return (
    <svg className="person-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 14.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Compact marker for user-added sites; `label` shows the text, otherwise it's icon-only with a tooltip. */
export default function UserBadge({ label = false }) {
  return (
    <span className={`user-badge${label ? ' with-label' : ''}`} title={USER_ADDED_NOTE}>
      <PersonIcon />
      {label ? <span>User-added</span> : <span className="visually-hidden">User-added</span>}
    </span>
  );
}
