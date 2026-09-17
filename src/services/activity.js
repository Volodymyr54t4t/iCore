import { pool } from "../db/pool.js";

/** Records events that are useful for customer support and store administration. */
export async function logActivity({ actorType, actorId = null, actorName = "", action, entityType, entityId = null, details = {}, db = pool }) {
  await db.query(
    `INSERT INTO activity_log (actor_type, actor_id, actor_name, action, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [actorType, actorId, actorName, action, entityType, entityId, JSON.stringify(details)]
  );
}
