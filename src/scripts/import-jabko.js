import "dotenv/config";
import { createPool, pool } from "../db/pool.js";
import { initDatabase } from "../db/init.js";
import { runJabkoImport, scanJabkoCatalog, verifyJabkoDatabaseWrite } from "../services/jabkoImport.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const scanOnly = args.includes("--scan-only");
const checkDb = args.includes("--check-db");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = Math.max(0, Number(limitArg?.split("=")[1]) || 0);
let runId = null;

try {
  if (!dryRun && !scanOnly) {
    await createPool();
    await initDatabase();
    if (!checkDb) {
      const { rows } = await pool.query(`INSERT INTO catalog_import_runs (source,trigger_type,status,stats)
        VALUES ('jabko','manual',$1,'{}'::jsonb) RETURNING id`, [dryRun ? "testing" : "collecting"]);
      runId = rows[0].id;
    }
  }
  const stats = checkDb ? await verifyJabkoDatabaseWrite() : scanOnly ? await scanJabkoCatalog() : await runJabkoImport({
    dryRun,
    limit,
    onProgress: (progress) => {
      if (progress.phase === "collecting") console.log(`Сторінка ${progress.page}: ${progress.category}`);
      else if (progress.current === 0 || progress.current === progress.total || progress.current % 25 === 0) console.log(`${progress.phase}: ${progress.current}/${progress.total}`);
    },
  });
  console.log(JSON.stringify(stats, null, 2));
  if (runId) await pool.query("UPDATE catalog_import_runs SET status=$1,stats=$2::jsonb,finished_at=NOW() WHERE id=$3", [dryRun ? "tested" : "completed", JSON.stringify(stats), runId]);
} catch (error) {
  if (runId) await pool.query("UPDATE catalog_import_runs SET status='failed',stats=$1::jsonb,finished_at=NOW() WHERE id=$2", [JSON.stringify({ error: error.message }), runId]).catch(() => {});
  console.error("Імпорт Ябко завершився помилкою:", error.message);
  process.exitCode = 1;
}
