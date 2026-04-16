/**
 * SQLite persistence layer for meeting sessions.
 *
 * Schema:
 *   sessions        — one row per recording session
 *   topics          — normalised topic strings (case-insensitive unique)
 *   session_topics  — M:N junction for fast topic filtering
 *   action_items    — per-session tasks (preserves `done` across upserts)
 *   key_decisions   — per-session decisions
 *
 * All writes go through `upsertSession` which runs in a single transaction.
 * Topic filtering uses an indexed junction table so it stays O(log n).
 */

import { createRequire } from 'module'
import { app } from 'electron'
import path from 'path'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredSession {
  id: string
  started_at: number
  ended_at: number | null
  summary: string
  chunk_count: number
  topics: string[]
  action_items: StoredActionItem[]
  key_decisions: string[]
}

export interface StoredActionItem {
  id: number
  task: string
  owner: string | null
  deadline: string | null
  done: boolean
}

export interface SessionRow {
  id: string
  started_at: number
  ended_at: number | null
  summary: string
  chunk_count: number
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const dbPath = path.join(app.getPath('userData'), 'sessions.db')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT    PRIMARY KEY,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    summary     TEXT    NOT NULL DEFAULT '',
    chunk_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS topics (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    UNIQUE NOT NULL COLLATE NOCASE
  );

  CREATE TABLE IF NOT EXISTS session_topics (
    session_id TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    topic_id   INTEGER NOT NULL REFERENCES topics(id)   ON DELETE CASCADE,
    PRIMARY KEY (session_id, topic_id)
  );
  CREATE INDEX IF NOT EXISTS idx_session_topics_topic ON session_topics(topic_id);

  CREATE TABLE IF NOT EXISTS action_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    task       TEXT    NOT NULL,
    owner      TEXT,
    deadline   TEXT,
    done       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_action_items_session ON action_items(session_id);

  CREATE TABLE IF NOT EXISTS key_decisions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    decision   TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_key_decisions_session ON key_decisions(session_id);
`)

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const stmts = {
  upsertSession: db.prepare(`
    INSERT INTO sessions (id, started_at, ended_at, summary, chunk_count)
    VALUES (@id, @started_at, @ended_at, @summary, @chunk_count)
    ON CONFLICT(id) DO UPDATE SET
      ended_at    = excluded.ended_at,
      summary     = excluded.summary,
      chunk_count = excluded.chunk_count
  `),

  deleteSessionTopics: db.prepare(`DELETE FROM session_topics WHERE session_id = ?`),
  insertTopic:         db.prepare(`INSERT OR IGNORE INTO topics (name) VALUES (?)`),
  getTopicId:          db.prepare(`SELECT id FROM topics WHERE name = ? COLLATE NOCASE`),
  insertSessionTopic:  db.prepare(`INSERT OR IGNORE INTO session_topics (session_id, topic_id) VALUES (?, ?)`),

  // Preserve done status: fetch existing tasks keyed by task text before replacing
  getExistingDone: db.prepare(`SELECT task, done FROM action_items WHERE session_id = ?`),
  deleteActions:   db.prepare(`DELETE FROM action_items WHERE session_id = ?`),
  insertAction:    db.prepare(`
    INSERT INTO action_items (session_id, task, owner, deadline, done)
    VALUES (@session_id, @task, @owner, @deadline, @done)
  `),

  deleteDecisions: db.prepare(`DELETE FROM key_decisions WHERE session_id = ?`),
  insertDecision:  db.prepare(`INSERT INTO key_decisions (session_id, decision) VALUES (?, ?)`),

  updateDone:      db.prepare(`UPDATE action_items SET done = ? WHERE id = ?`),

  deleteSession:   db.prepare(`DELETE FROM sessions WHERE id = ?`),

  getSessions:     db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC`),
  getSessionsByTopic: db.prepare(`
    SELECT s.* FROM sessions s
    JOIN session_topics st ON st.session_id = s.id
    JOIN topics t          ON t.id = st.topic_id
    WHERE t.name = ? COLLATE NOCASE
    ORDER BY s.started_at DESC
  `),
  getSession:      db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  getActions:      db.prepare(`SELECT * FROM action_items WHERE session_id = ? ORDER BY id`),
  getDecisions:    db.prepare(`SELECT decision FROM key_decisions WHERE session_id = ? ORDER BY id`),
  getSessionTopics:db.prepare(`
    SELECT t.name FROM topics t
    JOIN session_topics st ON st.topic_id = t.id
    WHERE st.session_id = ?
    ORDER BY t.name COLLATE NOCASE
  `),
  getAllTopics:     db.prepare(`
    SELECT t.name, COUNT(st.session_id) as count
    FROM topics t
    JOIN session_topics st ON st.topic_id = t.id
    GROUP BY t.id
    ORDER BY count DESC, t.name COLLATE NOCASE
  `),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function replaceChildren<I, P>(
  sessionId: string,
  deleteStmt: { run: (id: string) => void },
  insertStmt: { run: (params: P) => void },
  items: I[],
  transform: (item: I, sessionId: string) => P
): void {
  deleteStmt.run(sessionId)
  for (const item of items) {
    insertStmt.run(transform(item, sessionId))
  }
}

// Helper for typed queries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function typedAll<T, P, R = any>(stmt: { all: (params: P) => any }, params: P, mapper: (row: R) => T): T[] {
  return stmt.all(params).map(mapper)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const upsertSession = db.transaction((
  sessionId: string,
  startedAt: number,
  endedAt: number | null,
  summary: string,
  chunkCount: number,
  topics: string[],
  actionItems: Array<{ task: string; owner?: string; deadline?: string }>,
  keyDecisions: string[],
) => {
  stmts.upsertSession.run({ id: sessionId, started_at: startedAt, ended_at: endedAt, summary, chunk_count: chunkCount })

  // Topics — sync junction table
  stmts.deleteSessionTopics.run(sessionId)
  for (const name of topics) {
    stmts.insertTopic.run(name)
    const row = stmts.getTopicId.get(name) as { id: number } | undefined
    if (row?.id) stmts.insertSessionTopic.run(sessionId, row.id)
  }

  // Action items — preserve `done` by matching task text
  const prevDone = new Map<string, number>()
  for (const row of stmts.getExistingDone.all(sessionId) as Array<{ task: string; done: number }>) {
    prevDone.set(row.task, row.done)
  }
  replaceChildren(
    sessionId,
    stmts.deleteActions,
    stmts.insertAction,
    actionItems,
    (item, sid) => ({
      session_id: sid,
      task: item.task,
      owner: item.owner ?? null,
      deadline: item.deadline ?? null,
      done: prevDone.get(item.task) ?? 0,
    })
  )

  // Key decisions — replace all
  replaceChildren(
    sessionId,
    stmts.deleteDecisions,
    stmts.insertDecision,
    keyDecisions,
    (decision, sid) => [sid, decision] as [string, string]
  )
})

export function getSessions(topicFilter?: string): StoredSession[] {
  const rows: SessionRow[] = topicFilter
    ? stmts.getSessionsByTopic.all(topicFilter) as SessionRow[]
    : stmts.getSessions.all() as SessionRow[]
  return rows.map(hydrate)
}

export function getSession(id: string): StoredSession | null {
  const row = stmts.getSession.get(id) as SessionRow | undefined
  return row ? hydrate(row) : null
}

export function deleteSession(id: string) {
  stmts.deleteSession.run(id)
}

export function getTopics(): Array<{ name: string; count: number }> {
  return stmts.getAllTopics.all() as Array<{ name: string; count: number }>
}

export function updateActionDone(id: number, done: boolean) {
  stmts.updateDone.run(done ? 1 : 0, id)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hydrate(row: SessionRow): StoredSession {
  const topics = typedAll(stmts.getSessionTopics, row.id, (r) => r.name)
  const action_items = typedAll(stmts.getActions, row.id, (r) => ({
    id: r.id,
    task: r.task,
    owner: r.owner,
    deadline: r.deadline,
    done: r.done === 1,
  }))
  const key_decisions = typedAll(stmts.getDecisions, row.id, (r) => r.decision)
  return { ...row, topics, action_items, key_decisions }
}
