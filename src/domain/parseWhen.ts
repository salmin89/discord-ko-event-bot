import { DateTime } from 'luxon';

export type ParseWhenResult = { ok: true; instantMs: number } | { ok: false; error: string };

const FORMAT_HELP = 'Use "today HH:mm", "tomorrow HH:mm" or "YYYY-MM-DD HH:mm".';

export function parseWhen(input: string, userTz: string, nowMs: number): ParseWhenResult {
  const text = input.trim().replace(/\s+/g, ' ');
  const m = /^(today|tomorrow|\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2})$/i.exec(text);
  if (!m) return { ok: false, error: `Cannot read the time "${input}". ${FORMAT_HELP}` };

  const now = DateTime.fromMillis(nowMs, { zone: userTz });
  if (!now.isValid) return { ok: false, error: `Unknown time zone "${userTz}".` };

  const word = m[1].toLowerCase();
  let day: DateTime;
  if (word === 'today') day = now.startOf('day');
  else if (word === 'tomorrow') day = now.startOf('day').plus({ days: 1 });
  else day = DateTime.fromISO(word, { zone: userTz });
  if (!day.isValid) return { ok: false, error: `The date "${m[1]}" is not valid. ${FORMAT_HELP}` };

  const dt = day.set({ hour: Number(m[2]), minute: Number(m[3]) });
  if (Number(m[2]) > 23 || Number(m[3]) > 59 || !dt.isValid) {
    return { ok: false, error: `The time "${m[2]}:${m[3]}" is not valid. ${FORMAT_HELP}` };
  }
  if (dt.toMillis() <= nowMs) return { ok: false, error: 'That time is in the past. Give a time in the future.' };
  return { ok: true, instantMs: dt.toMillis() };
}
