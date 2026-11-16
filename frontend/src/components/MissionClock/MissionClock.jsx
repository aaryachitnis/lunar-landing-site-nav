import { useEffect, useState } from 'react';
import './MissionClock.css';

const pad = (n) => String(n).padStart(2, '0');

export default function MissionClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  return (
    <div className="mission-clock" aria-label={`Current time ${date} ${time} UTC`}>
      <span className="mission-clock-dot" aria-hidden="true" />
      <span className="hud-label">UTC</span>
      <span className="tabular">
        {date} <strong>{time}</strong>
      </span>
    </div>
  );
}
