import type { Database } from 'better-sqlite3';

export function wasSent(db: Database, eventId: number, occurrenceMs: number, userId: string, leadMin: number): boolean {
  const r = db
    .prepare('SELECT 1 FROM sent_reminders WHERE event_id = ? AND occurrence_ms = ? AND user_id = ? AND lead_min = ?')
    .get(eventId, occurrenceMs, userId, leadMin);
  return r !== undefined;
}

export function markSent(db: Database, eventId: number, occurrenceMs: number, userId: string, leadMin: number): void {
  db.prepare(
    'INSERT OR IGNORE INTO sent_reminders (event_id, occurrence_ms, user_id, lead_min) VALUES (?, ?, ?, ?)',
  ).run(eventId, occurrenceMs, userId, leadMin);
}
