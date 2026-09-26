import { pool } from "../db/pool.js";
import { runJabkoImport, isJabkoImportRunning } from "./jabkoImport.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let started = false;
let activeJob = null;

async function checkAndSync() {
  if (isJabkoImportRunning()) return;
  try {
    const [{ rows: recentRuns }, { rows: completedRuns }] = await Promise.all([
      pool.query("SELECT status, started_at, finished_at FROM catalog_import_runs WHERE source='jabko' ORDER BY id DESC LIMIT 1"),
      pool.query("SELECT finished_at FROM catalog_import_runs WHERE source='jabko' AND status='completed' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1"),
    ]);
    const lastRun = recentRuns[0];
    if (lastRun && !lastRun.finished_at && Date.now() - new Date(lastRun.started_at).getTime() < CHECK_INTERVAL_MS * 2) return;
    if (completedRuns[0] && Date.now() - new Date(completedRuns[0].finished_at).getTime() < WEEK_MS) return;

    const { rows: inserted } = await pool.query(`INSERT INTO catalog_import_runs (source,status,stats)
      VALUES ('jabko','collecting','{}'::jsonb) RETURNING id,started_at`);
    const run = inserted[0];
    activeJob = { id: run.id, status: "collecting", phase: "collecting", startedAt: run.started_at, scheduled: true };
    try {
      const stats = await runJabkoImport({
        onProgress: (progress) => {
          activeJob = { ...activeJob, status: progress.phase, ...progress, scheduled: true };
          pool.query("UPDATE catalog_import_runs SET status=$1,stats=$2::jsonb WHERE id=$3", [progress.phase, JSON.stringify(progress.stats || {}), run.id]).catch((error) => console.error("Не вдалося оновити стан щотижневої синхронізації Ябко:", error.message));
        },
      });
      await pool.query("UPDATE catalog_import_runs SET status='completed',stats=$1::jsonb,finished_at=NOW() WHERE id=$2", [JSON.stringify(stats), run.id]);
      activeJob = { ...activeJob, status: "completed", phase: "completed", stats, finishedAt: new Date().toISOString() };
      console.log(`Щотижневу синхронізацію Ябко завершено: оновлено ${stats.imported} товарів.`);
    } catch (error) {
      await pool.query("UPDATE catalog_import_runs SET status='failed',stats=$1::jsonb,finished_at=NOW() WHERE id=$2", [JSON.stringify({ error: error.message }), run.id]);
      activeJob = { ...activeJob, status: "failed", phase: "failed", error: error.message, finishedAt: new Date().toISOString() };
      console.error("Щотижнева синхронізація Ябко завершилася помилкою:", error.message);
    }
  } catch (error) {
    console.error("Не вдалося перевірити розклад синхронізації Ябко:", error.message);
  }
}

export function startWeeklyJabkoSync() {
  if (started) return;
  started = true;
  const initialCheck = setTimeout(checkAndSync, 5000);
  initialCheck.unref?.();
  const interval = setInterval(checkAndSync, CHECK_INTERVAL_MS);
  interval.unref?.();
}

export function getWeeklyJabkoJob() {
  return activeJob;
}
