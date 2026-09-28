import { pool } from "../db/pool.js";
import { aiConfig, cleanTelegramPost, recordAiOperation, safeOpenAIError, selectAndDraftProducts, shopProductUrl } from "./openaiService.js";

const TIME_ZONE = "Europe/Kyiv";
const DAILY_COUNT = 10;
const POST_TIMES = ["08:00", "09:20", "10:40", "12:00", "13:20", "14:40", "16:00", "17:20", "18:40", "20:00"];
let running = false;

function customModelPrices() {
  const input = process.env.OPENAI_INPUT_PRICE_PER_MILLION?.trim();
  const output = process.env.OPENAI_OUTPUT_PRICE_PER_MILLION?.trim();
  return input && output && Number.isFinite(Number(input)) && Number.isFinite(Number(output))
    ? [Number(input), Number(output)] : null;
}

function kyivParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function kyivDateString(date = new Date()) {
  const p = kyivParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function kyivDateTime(dateString, time) {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let result = target;
  for (let i = 0; i < 3; i += 1) {
    const p = kyivParts(new Date(result));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    result += target - represented;
  }
  return new Date(result);
}

async function canSpend() {
  const ceiling = Math.max(0.1, Number(process.env.OPENAI_BUDGET_USD) || 4.5);
  const { rows } = await pool.query(`SELECT model,COALESCE(SUM(input_tokens),0) AS input,
    COALESCE(SUM(output_tokens),0) AS output FROM ai_operation_logs GROUP BY model`);
  const spent = rows.reduce((total, row) => {
    const prices = String(row.model).includes("gpt-4.1-mini") ? [0.4, 1.6]
      : String(row.model).includes("gpt-4o-mini") ? [0.15, 0.6] : customModelPrices();
    return total + (prices ? Number(row.input) * prices[0] / 1_000_000 + Number(row.output) * prices[1] / 1_000_000 : ceiling);
  }, 0);
  return { allowed: spent + 0.05 < ceiling, spent, ceiling };
}

async function createDailyBatch(batchDate, force = false) {
  if (!aiConfig().configured || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const { rows: reservation } = await pool.query(`INSERT INTO ai_daily_batches(batch_date,status) VALUES($1,'generating')
    ON CONFLICT(batch_date) DO UPDATE SET status='generating',error='',created_at=NOW()
    WHERE $2=TRUE AND ai_daily_batches.status='failed' RETURNING batch_date`, [batchDate, force]);
  if (!reservation.length) return;
  const budget = await canSpend();
  if (!budget.allowed) {
    await pool.query("UPDATE ai_daily_batches SET status='failed',error=$2 WHERE batch_date=$1", [batchDate, `Досягнуто ліміт витрат $${budget.ceiling.toFixed(2)}`]);
    await recordAiOperation({ operation: "daily_batch", status: "failed", error: `Досягнуто бюджетний ліміт $${budget.ceiling.toFixed(2)}` });
    return;
  }
  let usage = {};
  let operationModel = aiConfig().model;
  let processedCount = 0;
  try {
    const { rows: products } = await pool.query(`SELECT p.id,p.name,p.tagline,p.description,p.price,p.old_price,p.color,p.storage,
      p.slug,p.specifications,c.name AS category_name,
      EXISTS(SELECT 1 FROM telegram_product_posts t WHERE t.product_id=p.id AND t.created_at>NOW()-INTERVAL '14 days') AS previously_published
      FROM products p JOIN categories c ON c.id=p.category_id
      WHERE p.is_active=TRUE AND p.price>0 AND (CASE WHEN p.source='jabko' THEN p.source_available ELSE p.stock>0 END)
      AND NOT EXISTS(SELECT 1 FROM telegram_product_posts t WHERE t.product_id=p.id AND t.created_at>NOW()-INTERVAL '14 days')
      AND NOT EXISTS(SELECT 1 FROM scheduled_telegram_posts t WHERE t.product_id=p.id AND t.status IN ('scheduled','sending'))
      ORDER BY p.featured DESC,p.updated_at DESC LIMIT 100`);
    if (products.length < DAILY_COUNT) throw Object.assign(new Error("Недостатньо товарів"), { publicMessage: `Для десяти різних постів потрібно щонайменше 10 придатних товарів; знайдено ${products.length}.` });
    const candidates = products.map((p) => ({ ...p, available: true, url: shopProductUrl(p) }));
    let draft = await selectAndDraftProducts(candidates, DAILY_COUNT);
    usage = draft.usage || {};
    operationModel = draft.model || operationModel;
    processedCount = draft.processed;
    const selected = [...draft.selected];
    if (selected.length < DAILY_COUNT) {
      const selectedIds = new Set(selected.map((item) => item.id));
      const remaining = candidates.filter((product) => !selectedIds.has(Number(product.id)));
      const completion = await selectAndDraftProducts(remaining, DAILY_COUNT - selected.length);
      usage = {
        input_tokens: Number(usage.input_tokens || 0) + Number(completion.usage?.input_tokens || 0),
        output_tokens: Number(usage.output_tokens || 0) + Number(completion.usage?.output_tokens || 0),
      };
      operationModel = completion.model || operationModel;
      for (const item of completion.selected) {
        if (selectedIds.has(item.id)) continue;
        selectedIds.add(item.id);
        selected.push(item);
      }
    }
    if (selected.length !== DAILY_COUNT) throw Object.assign(new Error("Не вистачає вибраних товарів"), {
      publicMessage: `AI підготував ${selected.length} із ${DAILY_COUNT} постів після повторного добору.`, usage, model: operationModel, processed: processedCount,
    });
    draft = { ...draft, selected, usage, model: operationModel };
    const log = await recordAiOperation({ operation: "daily_batch", processed: draft.processed, model: draft.model, usage: draft.usage, status: "success" });
    for (let i = 0; i < DAILY_COUNT; i += 1) {
      const post = draft.selected[i];
      const product = candidates.find((p) => Number(p.id) === post.id);
      await pool.query(`INSERT INTO scheduled_telegram_posts(batch_date,product_id,product_name,telegram_text,scheduled_at,ai_log_id)
        VALUES($1,$2,$3,$4,$5,$6)`, [batchDate, post.id, product.name, post.telegram_text, kyivDateTime(batchDate, POST_TIMES[i]), log.id]);
    }
    await pool.query("UPDATE ai_daily_batches SET status='ready',error='' WHERE batch_date=$1", [batchDate]);
  } catch (error) {
    usage = error.usage || usage;
    operationModel = error.model || operationModel;
    processedCount = error.processed || processedCount;
    const message = safeOpenAIError(error);
    await pool.query("UPDATE ai_daily_batches SET status='failed',error=$2 WHERE batch_date=$1", [batchDate, message]);
    await recordAiOperation({ operation: "daily_batch", processed: processedCount, model: operationModel, usage, status: "failed", error: message }).catch(() => {});
  }
}

async function publishDuePosts() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const { rows } = await pool.query(`UPDATE scheduled_telegram_posts SET status='sending'
    WHERE id IN (SELECT id FROM scheduled_telegram_posts WHERE status='scheduled' AND scheduled_at<=NOW() ORDER BY scheduled_at LIMIT 5 FOR UPDATE SKIP LOCKED)
    RETURNING id,product_id,product_name,telegram_text,ai_log_id`);
  for (const post of rows) {
    try {
      const { rows: productRows } = post.product_id
        ? await pool.query("SELECT slug FROM products WHERE id=$1", [post.product_id])
        : { rows: [] };
      const telegramText = cleanTelegramPost(post.telegram_text, shopProductUrl(productRows[0] || {}));
      await pool.query("UPDATE scheduled_telegram_posts SET telegram_text=$2 WHERE id=$1", [post.id, telegramText]);
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: telegramText, disable_web_page_preview: false }), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error("Telegram не прийняв повідомлення");
      await pool.query("UPDATE scheduled_telegram_posts SET status='published',sent_at=NOW(),telegram_message_id=$2,error='' WHERE id=$1", [post.id, data.result?.message_id || null]);
      if (post.product_id) await pool.query("INSERT INTO telegram_product_posts(product_id,ai_log_id,telegram_text,telegram_message_id) VALUES($1,$2,$3,$4)", [post.product_id, post.ai_log_id, telegramText, data.result?.message_id || null]);
    } catch (error) {
      await pool.query("UPDATE scheduled_telegram_posts SET status='failed',error=$2 WHERE id=$1", [post.id, "Не вдалося надіслати пост у Telegram."]);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = kyivParts();
    const currentTime = `${now.hour}:${now.minute}`;
    if (currentTime >= "05:00" && currentTime < "08:00") await createDailyBatch(`${now.year}-${now.month}-${now.day}`);
    if (currentTime >= "08:00") {
      const tomorrow = new Date(Date.UTC(Number(now.year), Number(now.month) - 1, Number(now.day) + 1)).toISOString().slice(0, 10);
      await createDailyBatch(tomorrow);
    }
    await publishDuePosts();
  } catch (error) {
    console.error("Планувальник Telegram-постів:", error.message);
  } finally { running = false; }
}

export function startTelegramPostScheduler() {
  tick();
  setInterval(tick, 60_000).unref();
}

export async function generateDailyBatchNow() {
  const now = kyivParts();
  const today = `${now.year}-${now.month}-${now.day}`;
  const batchDate = `${now.hour}:${now.minute}` < "08:00"
    ? today
    : new Date(Date.UTC(Number(now.year), Number(now.month) - 1, Number(now.day) + 1)).toISOString().slice(0, 10);
  const { rows: existing } = await pool.query("SELECT status,error FROM ai_daily_batches WHERE batch_date=$1", [batchDate]);
  await createDailyBatch(batchDate, existing[0]?.status === "failed");
  const { rows } = await pool.query("SELECT status,error FROM ai_daily_batches WHERE batch_date=$1", [batchDate]);
  return { ...(rows[0] || { status: "not_started" }), batchDate };
}
