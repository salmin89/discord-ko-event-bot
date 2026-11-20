import { DateTime } from 'luxon';

export type Slot = { dayOfWeek: number; time: string };

/** UTC-ms instants of weekly slots inside [fromMs, fromMs + windowMs], sorted. */
export function nextOccurrences(
  slots: Slot[],
  serverTz: string,
  fromMs: number,
  windowMs: number,
): number[] {
  const toMs = fromMs + windowMs;
  const results: number[] = [];
  let day = DateTime.fromMillis(fromMs, { zone: serverTz }).startOf('day');
  const lastDay = DateTime.fromMillis(toMs, { zone: serverTz }).startOf('day');
  while (day <= lastDay) {
    for (const slot of slots) {
      if (slot.dayOfWeek !== day.weekday) continue;
      const [hour, minute] = slot.time.split(':').map(Number);
      const ms = day.set({ hour, minute }).toMillis();
      if (ms >= fromMs && ms <= toMs) results.push(ms);
    }
    day = day.plus({ days: 1 }).startOf('day');
  }
  return results.sort((a, b) => a - b);
}
