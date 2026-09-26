import "dotenv/config";
import { createPool, pool } from "../db/pool.js";

const usedPattern = "б\\s*[/\\\\]\\s*у|б\\s+у|вживан|як\\s+нов(ий|а|е)|хороший\\s+стан|стандартна\\s+батарея|refurbished|\\mused\\M";
const applyChanges = process.argv.includes("--apply");

await createPool();
try {
  const count = await pool.query(
    "SELECT COUNT(*)::int AS count FROM products WHERE name ~* $1 OR specifications::text ~* $1",
    [usedPattern]
  );
  const matches = count.rows[0].count;
  if (!applyChanges) {
    console.log(`Знайдено товарів б/у: ${matches}. Для видалення запустіть скрипт із --apply.`);
  } else {
    await pool.query("BEGIN");
    try {
      const deleted = await pool.query(
        "DELETE FROM products WHERE name ~* $1 OR specifications::text ~* $1 RETURNING id",
        [usedPattern]
      );
      await pool.query("COMMIT");
      console.log(`Видалено товарів б/у: ${deleted.rowCount}.`);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await pool.end();
}
