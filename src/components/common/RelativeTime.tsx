/**
 * Renders a timestamp relative to the *effective* time, so the whole interface
 * agrees with whatever the time-simulation panel is currently doing.
 */
export function RelativeTime({
  iso,
  now,
  prefix = '',
  fallback = 'never',
}: {
  iso: string | null;
  now: number;
  prefix?: string;
  fallback?: string;
}) {
  if (!iso) return <span className="muted">{fallback}</span>;
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return <span className="muted">{fallback}</span>;

  const delta = value - now;
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  let text: string;
  if (minutes < 1) text = 'just now';
  else if (minutes < 60) text = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  else if (hours < 48) text = `${hours} hour${hours === 1 ? '' : 's'}`;
  else text = `${days} day${days === 1 ? '' : 's'}`;

  const phrase =
    minutes < 1 ? text : delta > 0 ? `in ${text}` : `${text} ago`;

  return (
    <time dateTime={iso} title={new Date(value).toLocaleString()}>
      {prefix}
      {phrase}
    </time>
  );
}
