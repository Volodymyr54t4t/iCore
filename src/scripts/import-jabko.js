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

try {
  if (!dryRun && !scanOnly) {
    await createPool();
    await initDatabase();
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
  if (!dryRun && !scanOnly && !checkDb) await pool.query(`INSERT INTO catalog_import_runs (source,status,stats,finished_at) VALUES ('jabko','completed',$1::jsonb,NOW())`, [JSON.stringify(stats)]);
} catch (error) {
  console.error("Імпорт Ябко завершився помилкою:", error.message);
  process.exitCode = 1;
}
