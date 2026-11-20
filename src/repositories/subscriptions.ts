import type { Database } from 'better-sqlite3';

export type Subscription = {
  userId: string;
  eventId: number;
  lead1Min: number | null;
  lead2Min: number | null;
};

type SubRow = { user_id: string; event_id: number; lead1_min: number | null; lead2_min: number | null };

const toSub = (r: SubRow): Subscription => ({
  userId: r.user_id,
  eventId: r.event_id,
  lead1Min: r.lead1_min,
  lead2Min: r.lead2_min,
});

const UPSERT = `INSERT INTO subscriptions (user_id, event_id, lead1_min, lead2_min) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, event_id) DO UPDATE SET lead1_min = excluded.lead1_min, lead2_min = excluded.lead2_min`;

export function subscribe(db: Database, s: Subscription): void {
  db.prepare(UPSERT).run(s.userId, s.eventId, s.lead1Min, s.lead2Min);
}

export function unsubscribe(db: Database, userId: string, eventId: number): void {
  db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND event_id = ?').run(userId, eventId);
}

export function listSubscriptions(db: Database, userId: string): Subscription[] {
  const rows = db
    .prepare('SELECT user_id, event_id, lead1_min, lead2_min FROM subscriptions WHERE user_id = ? ORDER BY event_id')
    .all(userId) as SubRow[];
  return rows.map(toSub);
}

export function listSubscribersForEvent(db: Database, eventId: number): Subscription[] {
  const rows = db
    .prepare('SELECT user_id, event_id, lead1_min, lead2_min FROM subscriptions WHERE event_id = ? ORDER BY user_id')
    .all(eventId) as SubRow[];
  return rows.map(toSub);
}

/** Subscribes the user to every default-on fixed event in the guild. defaultLeads = [lead1, lead2]. */
export function autoSubscribeToDefaults(
  db: Database,
  guildId: string,
  userId: string,
  defaultLeads: [number, number],
): void {
  const ids = db
    .prepare(`SELECT id FROM events WHERE guild_id = ? AND type = 'fixed' AND default_subscribed = 1`)
    .all(guildId) as { id: number }[];
  const stmt = db.prepare(UPSERT);
  db.transaction(() => {
    for (const { id } of ids) stmt.run(userId, id, defaultLeads[0], defaultLeads[1]);
  })();
}
