import './LightToggle.css';

export default function LightToggle({ lit, onToggle, style }) {
  return (
    <button
      type="button"
      className={`light-toggle${lit ? ' on' : ''}`}
      onClick={onToggle}
      aria-pressed={lit}
      title={lit ? 'Return to natural sunlight' : 'Illuminate the night side of the Moon'}
      style={style}
    >
      <svg className="light-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="12" y1="2.5" x2="12" y2="5" transform={`rotate(${a} 12 12)`} />
        ))}
      </svg>
      <span>{lit ? 'Lights on' : 'Let there be light'}</span>
    </button>
  );
}
