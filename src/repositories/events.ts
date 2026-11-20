import type { Database } from 'better-sqlite3';
import type { Slot } from '../domain/recurrence.ts';

export type EventRecord = {
  id: number;
  guildId: string;
  type: 'fixed' | 'adhoc';
  name: string;
  description: string | null;
  createdBy: string;
  defaultSubscribed: boolean;
  slots: Slot[]; // fixed events; empty for adhoc
  occurrenceMs?: number; // adhoc only
  creatorTz?: string | null; // adhoc only
};

export type NewFixedEvent = {
  guildId: string;
  name: string;
  description: string;
  createdBy: string;
  defaultSubscribed: boolean;
  slots: Slot[];
};

export type NewAdhocEvent = {
  guildId: string;
  name: string;
  createdBy: string;
  occurrenceMs: number;
  creatorTz: string;
};

export type FixedEventEdit = Partial<Pick<NewFixedEvent, 'name' | 'description' | 'defaultSubscribed' | 'slots'>>;

type EventRow = {
  id: number;
  guild_id: string;
  type: 'fixed' | 'adhoc';
  name: string;
  description: string | null;
  created_by: string;
  default_subscribed: number;
  occurrence_ms: number | null;
  creator_tz: string | null;
};

const SELECT_EVENT = `
  SELECT e.id, e.guild_id, e.type, e.name, e.description, e.created_by, e.default_subscribed,
         a.occurrence_ms, a.creator_tz
  FROM events e LEFT JOIN adhoc_times a ON a.event_id = e.id`;

function insertSlots(db: Database, eventId: number, slots: Slot[]): void {
  const stmt = db.prepare('INSERT INTO event_slots (event_id, day_of_week, time_of_day) VALUES (?, ?, ?)');
  for (const s of slots) stmt.run(eventId, s.dayOfWeek, s.time);
}

function loadSlots(db: Database, eventId: number): Slot[] {
  const rows = db
    .prepare('SELECT day_of_week, time_of_day FROM event_slots WHERE event_id = ? ORDER BY rowid')
    .all(eventId) as { day_of_week: number; time_of_day: string }[];
  return rows.map((r) => ({ dayOfWeek: r.day_of_week, time: r.time_of_day }));
}

function toRecord(db: Database, r: EventRow): EventRecord {
  const rec: EventRecord = {
    id: r.id,
    guildId: r.guild_id,
    type: r.type,
    name: r.name,
    description: r.description,
    createdBy: r.created_by,
    defaultSubscribed: r.default_subscribed === 1,
    slots: r.type === 'fixed' ? loadSlots(db, r.id) : [],
  };
  if (r.type === 'adhoc') {
    rec.occurrenceMs = r.occurrence_ms ?? undefined;
    rec.creatorTz = r.creator_tz;
  }
  return rec;
}

export function createFixedEvent(db: Database, e: NewFixedEvent): number {
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO events (guild_id, type, name, description, created_by, default_subscribed)
         VALUES (?, 'fixed', ?, ?, ?, ?)`,
      )
      .run(e.guildId, e.name, e.description, e.createdBy, e.defaultSubscribed ? 1 : 0);
    const id = Number(info.lastInsertRowid);
    insertSlots(db, id, e.slots);
    return id;
  })();
}

export function createAdhocEvent(db: Database, e: NewAdhocEvent): number {
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO events (guild_id, type, name, description, created_by, default_subscribed)
         VALUES (?, 'adhoc', ?, NULL, ?, 0)`,
      )
      .run(e.guildId, e.name, e.createdBy);
    const id = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO adhoc_times (event_id, occurrence_ms, creator_tz) VALUES (?, ?, ?)').run(
      id,
      e.occurrenceMs,
      e.creatorTz,
    );
    return id;
  })();
}

/** Updates only the provided fields. When `slots` is given, it replaces all slots. */
export function editFixedEvent(db: Database, eventId: number, edit: FixedEventEdit): void {
  db.transaction(() => {
    if (edit.name !== undefined) db.prepare('UPDATE events SET name = ? WHERE id = ?').run(edit.name, eventId);
    if (edit.description !== undefined)
      db.prepare('UPDATE events SET description = ? WHERE id = ?').run(edit.description, eventId);
    if (edit.defaultSubscribed !== undefined)
      db.prepare('UPDATE events SET default_subscribed = ? WHERE id = ?').run(edit.defaultSubscribed ? 1 : 0, eventId);
    if (edit.slots !== undefined) {
      db.prepare('DELETE FROM event_slots WHERE event_id = ?').run(eventId);
      insertSlots(db, eventId, edit.slots);
    }
  })();
}

export function removeEvent(db: Database, eventId: number): void {
  db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
}

export function listEvents(db: Database, guildId: string): EventRecord[] {
  const rows = db.prepare(`${SELECT_EVENT} WHERE e.guild_id = ? ORDER BY e.id`).all(guildId) as EventRow[];
  return rows.map((r) => toRecord(db, r));
}

export function getEvent(db: Database, eventId: number): EventRecord | undefined {
  const r = db.prepare(`${SELECT_EVENT} WHERE e.id = ?`).get(eventId) as EventRow | undefined;
  return r && toRecord(db, r);
}

/** Adhoc events by this creator that have not yet happened. */
export function countActiveAdhocByCreator(db: Database, guildId: string, createdBy: string): number {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS n FROM events e JOIN adhoc_times a ON a.event_id = e.id
       WHERE e.guild_id = ? AND e.created_by = ? AND e.type = 'adhoc' AND a.occurrence_ms >= ?`,
    )
    .get(guildId, createdBy, Date.now()) as { n: number };
  return r.n;
}

export function deleteExpiredAdhoc(db: Database, nowMs: number): void {
  db.prepare(
    `DELETE FROM events WHERE type = 'adhoc'
     AND id IN (SELECT event_id FROM adhoc_times WHERE occurrence_ms < ?)`,
  ).run(nowMs);
}
