'use strict';

// Bounded, idempotent repair for legacy schedule cursors written with local DB time.
// It only touches enabled sources without an active queued/running run and records an audit event.
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { computeSchedule } = require('../worker/src/scheduleSlots');

const env = process.env;
const connection = mysql.createPool({ host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_USER || 'root', password: env.DB_PASSWORD || '', database: env.DB_NAME || 'public_opinion', connectionLimit: 1, timezone: 'Z' });

async function main() {
  const conn = await connection.getConnection();
  let changed = 0;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT s.id,s.game_id,s.default_account_id,s.frequency_seconds,s.schedule_effective_at,
      st.last_scheduled_at,st.next_scheduled_at
      FROM po_sources s JOIN po_source_schedule_state st ON st.source_id=s.id
      WHERE s.enabled=1 AND NOT EXISTS (SELECT 1 FROM po_sync_runs r WHERE r.source_id=s.id AND r.status IN ('queued','running'))
      ORDER BY s.id LIMIT 100`);
    const now = new Date();
    for (const row of rows) {
      const schedule = computeSchedule({ now, frequencySeconds: row.frequency_seconds, effectiveAt: row.schedule_effective_at, lastProcessedScheduledAt: row.last_scheduled_at });
      const next = schedule.dueSlotAt ? schedule.dueSlotAt : schedule.nextSlotAt;
      const nextDb = new Date(next).toISOString().replace('T', ' ').slice(0, 23);
      const previousMs = row.next_scheduled_at == null ? null : new Date(row.next_scheduled_at).getTime();
      const nextMs = new Date(next).getTime();
      if (previousMs === nextMs) continue;
      const result = await conn.query(`UPDATE po_source_schedule_state st SET next_scheduled_at=?, updated_at=UTC_TIMESTAMP(3), last_reason_code='UTC_CURSOR_RECONCILED'
        WHERE st.source_id=? AND NOT EXISTS (SELECT 1 FROM po_sync_runs r WHERE r.source_id=st.source_id AND r.status IN ('queued','running'))`, [nextDb, row.id]);
      if (result[0].affectedRows === 1) {
        changed += 1;
        await conn.query(`INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,event_type,outcome,detail)
          VALUES (?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), row.game_id, row.id, row.default_account_id || null, 'system', 'schedule_state_utc_reconciled', 'success', JSON.stringify({ previousNextScheduledAt: row.next_scheduled_at, nextScheduledAt: nextDb, dueSlotAt: schedule.dueSlotAt, bounded: true })]);
      }
    }
    await conn.commit();
    console.log(JSON.stringify({ status: 'completed', inspected: rows.length, changed }));
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); await connection.end(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
