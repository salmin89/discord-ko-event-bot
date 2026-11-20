import { DateTime, Duration, IANAZone } from 'luxon';

export function formatCountdown(ms: number): string {
  const totalMinutes = Math.floor(Duration.fromMillis(Math.max(0, ms)).as('minutes'));
  if (totalMinutes < 1) return 'soon';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function renderLocal(instantMs: number, tz: string): string {
  return DateTime.fromMillis(instantMs, { zone: tz })
    .setLocale('en-US')
    .toFormat('h:mm a');
}

export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}
