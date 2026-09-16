import { Bot, InlineKeyboard, Keyboard, session } from "grammy";
import { createOrder, getOrderWithItems } from "../services/orders.js";
import { clip, esc, money, STATUS, STATUSES, userLabel } from "./format.js";
import * as repo from "./shopRepo.js";

const PAGE = 6;
let botInstance = null;

function initialSession() {
  return { flow: null, step: 0, payload: {} };
}

function shopKeyboard(owner) {
  const kb = new Keyboard()
    .text("🛍 Каталог")
    .text("🔍 Пошук")
    .row()
    .text("🛒 Кошик")
    .text("📦 Мої замовлення")
    .row()
    .text("💬 Підтримка")
    .text("ℹ️ Про магазин");
  if (owner) kb.row().text("👑 Панель власника");
  return kb.resized();
}

function ownerMenu() {
  return new InlineKeyboard()
    .text("📊 Статистика", "own:stats")
    .text("📥 Замовлення", "own:orders:0")
    .row()
    .text("📦 Товари", "own:products:0")
    .text("⚠️ Мало на складі", "own:low")
    .row()
    .text("➕ Додати товар", "own:add")
    .text("📢 Розсилка", "own:broadcast")
    .row()
    .text("👥 Клієнти бота", "own:users");
}

function resetFlow(ctx) {
  ctx.session.flow = null;
  ctx.session.step = 0;
  ctx.session.payload = {};
}

async function requireOwner(ctx) {
  if (await repo.isOwner(ctx.from.id)) return true;
  await ctx.reply("Цей розділ лише для власника. Надішліть /owner і пароль адмінки.");
  return false;
}

function productCaption(p) {
  const old = p.old_price ? ` <s>${esc(money(p.old_price))}</s>` : "";
  const stock =
    p.stock <= 0 ? "Немає в наявності" : p.stock <= 5 ? `Закінчується · ${p.stock} шт.` : `В наявності · ${p.stock} шт.`;
  const bits = [
    p.category_name && `<b>${esc(p.category_name)}</b>`,
    p.color,
    p.storage,
  ].filter(Boolean);
  return [
    `<b>${esc(p.name)}</b>`,
    p.tagline ? esc(p.tagline) : "",
    bits.length ? esc(bits.join(" · ")) : "",
    "",
    `${esc(money(p.price))}${old}`,
    stock,
    "",
    clip(esc(p.description), 600),
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function productButtons(p) {
  const kb = new InlineKeyboard();
  if (p.stock > 0) kb.text("➕ Додати в кошик", `add:${p.id}`);
  kb.text("🛒 Кошик", "cart").row();
  kb.text("⬅️ Категорії", "cats");
  return kb;
}

async function sendProduct(ctx, p) {
  const extra = { caption: productCaption(p), parse_mode: "HTML", reply_markup: productButtons(p) };
  try {
    if (p.telegram_file_id) {
      await ctx.replyWithPhoto(p.telegram_file_id, extra);
      return;
    }
    if (p.image_url) {
      await ctx.replyWithPhoto(p.image_url, extra);
      return;
    }
  } catch {
    /* fallback to text */
  }
  await ctx.reply(productCaption(p), { parse_mode: "HTML", reply_markup: productButtons(p) });
}

async function showCategories(ctx) {
  const cats = await repo.categories();
  const kb = new InlineKeyboard();
  cats.forEach((c, i) => {
    kb.text(c.name, `cat:${c.slug}:0`);
    if (i % 2 === 1) kb.row();
  });
  kb.row().text("⭐ Хіти", "cat:featured:0").text("🛒 Кошик", "cart");
  await ctx.reply("Оберіть категорію техніки Apple:", { reply_markup: kb });
}

async function showProductPage(ctx, slug, offset) {
  const items = await repo.products({
    categorySlug: slug === "featured" || slug === "all" ? null : slug,
    featured: slug === "featured",
    offset,
    limit: PAGE,
  });
  if (!items.length) {
    await ctx.reply("У цій категорії поки немає товарів.");
    return;
  }
  const kb = new InlineKeyboard();
  for (const p of items) {
    const mark = p.stock <= 0 ? "❌ " : "";
    kb.text(`${mark}${p.name} · ${money(p.price)}`, `p:${p.id}`).row();
  }
  const nav = [];
  if (offset > 0) nav.push({ text: "⬅️", data: `cat:${slug}:${Math.max(0, offset - PAGE)}` });
  if (items.length === PAGE) nav.push({ text: "➡️", data: `cat:${slug}:${offset + PAGE}` });
  if (nav.length) {
    nav.forEach((n) => kb.text(n.text, n.data));
    kb.row();
  }
  kb.text("📂 Категорії", "cats");
  const title =
    slug === "featured" ? "Хіти iCore" : items[0].category_name ? items[0].category_name : "Каталог";
  await ctx.reply(`<b>${esc(title)}</b>\nОберіть товар:`, { parse_mode: "HTML", reply_markup: kb });
}

async function showCart(ctx) {
  const items = await repo.cartItems(ctx.from.id);
  if (!items.length) {
    await ctx.reply("Кошик порожній. Відкрийте каталог і додайте техніку.", {
      reply_markup: new InlineKeyboard().text("🛍 Каталог", "cats"),
    });
    return;
  }
  let total = 0;
  const lines = items.map((p) => {
    const sum = p.price * p.quantity;
    total += sum;
    return `• <b>${esc(p.name)}</b>\n  ${p.quantity} × ${esc(money(p.price))} = ${esc(money(sum))}`;
  });
  const kb = new InlineKeyboard();
  for (const p of items) {
    kb.text("−", `q:${p.id}:-1`)
      .text(`${p.name.slice(0, 18)} · ${p.quantity}`, `p:${p.id}`)
      .text("+", `q:${p.id}:1`)
      .row();
  }
  kb.text("🗑 Очистити", "cart:clear").text("✅ Оформити", "checkout");
  await ctx.reply(`<b>Кошик</b>\n\n${lines.join("\n")}\n\n<b>Разом: ${esc(money(total))}</b>`, {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

function orderText(order) {
  const items = (order.items || [])
    .map((i) => `• ${esc(i.product_name || i.name)} × ${i.quantity || i.qty} — ${esc(money((i.price || 0) * (i.quantity || i.qty)))}`)
    .join("\n");
  return [
    `<b>Замовлення №${order.id}</b> · ${STATUS[order.status] || order.status}`,
    `${esc(order.customer_name)} · ${esc(order.customer_phone)}`,
    `${esc(order.city)}, ${esc(order.address)}`,
    order.customer_email ? esc(order.customer_email) : "",
    order.notes ? `Коментар: ${esc(order.notes)}` : "",
    items,
    `<b>Сума: ${esc(money(order.total))}</b>`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function notifyOwners(text, extra = {}) {
  if (!botInstance) return;
  const owners = await repo.listOwners();
  for (const chatId of owners) {
    try {
      await botInstance.api.sendMessage(chatId, text, { parse_mode: "HTML", ...extra });
    } catch (error) {
      console.error("Не вдалося написати власнику", chatId, error.message);
    }
  }
}

export async function notifyNewOrder(order) {
  const full = order.items ? order : await getOrderWithItems(order.id);
  if (!full) return;
  await notifyOwners(`🔔 <b>Нове замовлення</b>\n\n${orderText(full)}`, {
    reply_markup: orderOwnerKeyboard(full.id, full.status),
  });
}

function orderOwnerKeyboard(id, status) {
  const kb = new InlineKeyboard();
  for (const s of STATUSES) {
    if (s === status) continue;
    kb.text(STATUS[s], `ss:${id}:${s}`);
    if (kb.inline_keyboard.at(-1)?.length >= 2) kb.row();
  }
  return kb;
}

async function startCheckout(ctx) {
  const items = await repo.cartItems(ctx.from.id);
  if (!items.length) {
    await ctx.reply("Спочатку додайте товари в кошик.");
    return;
  }
  ctx.session.flow = "checkout";
  ctx.session.step = 1;
  ctx.session.payload = {
    name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" "),
  };
  await ctx.reply("Оформлення замовлення. Як до вас звертатися?\nНадішліть імʼя або натисніть кнопку.", {
    reply_markup: new Keyboard()
      .text(ctx.session.payload.name || "Клієнт")
      .row()
      .text("❌ Скасувати")
      .resized()
      .oneTime(),
  });
}

async function handleCheckout(ctx) {
  const text = ctx.message.text?.trim();
  if (text === "❌ Скасувати") {
    resetFlow(ctx);
    await ctx.reply("Оформлення скасовано.", { reply_markup: shopKeyboard(await repo.isOwner(ctx.from.id)) });
    return;
  }
  const p = ctx.session.payload;

  if (ctx.session.step === 1) {
    p.name = text || p.name;
    ctx.session.step = 2;
    await ctx.reply("Номер телефону для підтвердження замовлення:", {
      reply_markup: new Keyboard()
        .requestContact("📱 Поділитися номером")
        .row()
        .text("❌ Скасувати")
        .resized()
        .oneTime(),
    });
    return;
  }
  if (ctx.session.step === 2) {
    p.phone = ctx.message.contact?.phone_number || text;
    if (!p.phone || p.phone.replace(/\D/g, "").length < 10) {
      await ctx.reply("Вкажіть коректний номер телефону.");
      return;
    }
    ctx.session.step = 3;
    await ctx.reply("Місто доставки:", {
      reply_markup: new Keyboard().text("Київ").text("Львів").text("Одеса").row().text("❌ Скасувати").resized(),
    });
    return;
  }
  if (ctx.session.step === 3) {
    p.city = text;
    ctx.session.step = 4;
    await ctx.reply("Адреса або відділення Нової Пошти (номер і місто):", {
      reply_markup: new Keyboard().text("❌ Скасувати").resized(),
    });
    return;
  }
  if (ctx.session.step === 4) {
    p.address = text;
    ctx.session.step = 5;
    await ctx.reply("Коментар до замовлення або натисніть «Пропустити».", {
      reply_markup: new Keyboard().text("Пропустити").row().text("❌ Скасувати").resized(),
    });
    return;
  }
  if (ctx.session.step === 5) {
    p.notes = text === "Пропустити" ? "" : text;
    const items = await repo.cartItems(ctx.from.id);
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const list = items.map((i) => `• ${i.name} × ${i.quantity}`).join("\n");
    ctx.session.step = 6;
    await ctx.reply(
      `<b>Перевірте замовлення</b>\n\n${esc(p.name)}\n${esc(p.phone)}\n${esc(p.city)}, ${esc(p.address)}\n${
        p.notes ? esc(p.notes) + "\n" : ""
      }\n${esc(list)}\n\n<b>${esc(money(total))}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: new Keyboard().text("✅ Підтвердити").text("❌ Скасувати").resized(),
      }
    );
    return;
  }
  if (ctx.session.step === 6) {
    if (text !== "✅ Підтвердити") {
      await ctx.reply("Натисніть «Підтвердити» або «Скасувати».");
      return;
    }
    const cart = await repo.cartItems(ctx.from.id);
    const email = ctx.from.username
      ? `${ctx.from.username}@telegram.icore`
      : `tg${ctx.from.id}@telegram.icore`;
    try {
      const order = await createOrder({
        name: p.name,
        phone: p.phone,
        email,
        city: p.city,
        address: p.address,
        notes: [p.notes, `Telegram: ${userLabel(ctx.from)}`].filter(Boolean).join(" · "),
        items: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
        telegramChatId: ctx.from.id,
      });
      await repo.clearCart(ctx.from.id);
      resetFlow(ctx);
      const owner = await repo.isOwner(ctx.from.id);
      await ctx.reply(
        `Дякуємо! Замовлення <b>№${order.id}</b> прийнято на суму <b>${esc(money(order.total))}</b>.\nМенеджер підтвердить його в Telegram.`,
        { parse_mode: "HTML", reply_markup: shopKeyboard(owner) }
      );
      await notifyNewOrder(order);
    } catch (error) {
      await ctx.reply(error.message || "Не вдалося оформити замовлення.");
    }
  }
}

async function showOwnerOrders(ctx, offset) {
  const orders = await repo.adminOrders(8, offset);
  if (!orders.length) {
    await ctx.reply(offset ? "Більше замовлень немає." : "Замовлень ще немає.");
    return;
  }
  const kb = new InlineKeyboard();
  for (const o of orders) {
    kb.text(`№${o.id} · ${money(o.total)} · ${STATUS[o.status]}`, `od:${o.id}`).row();
  }
  if (offset > 0) kb.text("⬅️", `own:orders:${Math.max(0, offset - 8)}`);
  if (orders.length === 8) kb.text("➡️", `own:orders:${offset + 8}`);
  kb.row().text("👑 Меню", "own:home");
  await ctx.reply("Останні замовлення:", { reply_markup: kb });
}

async function showOwnerProducts(ctx, offset) {
  const items = await repo.products({ offset, limit: PAGE });
  if (!items.length) {
    await ctx.reply("Товарів немає.");
    return;
  }
  const kb = new InlineKeyboard();
  for (const p of items) {
    kb.text(`${p.name} · ${p.stock} шт · ${money(p.price)}`, `op:${p.id}`).row();
  }
  if (offset > 0) kb.text("⬅️", `own:products:${Math.max(0, offset - PAGE)}`);
  if (items.length === PAGE) kb.text("➡️", `own:products:${offset + PAGE}`);
  kb.row().text("👑 Меню", "own:home");
  await ctx.reply("Каталог для керування:", { reply_markup: kb });
}

async function showOwnerProduct(ctx, id) {
  const p = await repo.productById(id);
  if (!p) return ctx.reply("Товар не знайдено.");
  const kb = new InlineKeyboard()
    .text("📦 Залишок", `editstock:${p.id}`)
    .text("💰 Ціна", `editprice:${p.id}`)
    .row()
    .text("🗑 Видалити", `delp:${p.id}`)
    .text("⬅️ Список", "own:products:0");
  await sendProduct(ctx, p);
  await ctx.reply(`Керування: <b>${esc(p.name)}</b>`, { parse_mode: "HTML", reply_markup: kb });
}

export async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("Telegram-бот вимкнено: немає TELEGRAM_BOT_TOKEN");
    return null;
  }

  const bot = new Bot(token);
  botInstance = bot;
  bot.use(session({ initial: initialSession }));

  bot.use(async (ctx, next) => {
    if (ctx.from) await repo.upsertUser(ctx.from);
    await next();
  });

  bot.catch((err) => {
    console.error("Telegram error:", err.error?.message || err.message || err);
  });

  bot.command("cancel", async (ctx) => {
    resetFlow(ctx);
    await ctx.reply("Поточну дію скасовано.", { reply_markup: shopKeyboard(await repo.isOwner(ctx.from.id)) });
  });

  bot.command("start", async (ctx) => {
    resetFlow(ctx);
    const owner = await repo.isOwner(ctx.from.id);
    await ctx.reply(
      `<b>iCore Store</b> — техніка Apple з доставкою по Україні.\n\nКаталог, кошик і замовлення прямо в Telegram. Якщо ви власник магазину — надішліть /owner і пароль адмінки.`,
      { parse_mode: "HTML", reply_markup: shopKeyboard(owner) }
    );
    await showCategories(ctx);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Команди клієнта:\n/start — головне меню\n/catalog — категорії\n/cart — кошик\n/orders — мої замовлення\n/cancel — скасувати дію\n\nВласник: /owner пароль"
    );
  });

  bot.command("catalog", (ctx) => showCategories(ctx));
  bot.command("cart", (ctx) => showCart(ctx));
  bot.command("orders", async (ctx) => {
    const orders = await repo.customerOrders(ctx.from.id);
    if (!orders.length) return ctx.reply("Ви ще не оформлювали замовлення в боті.");
    for (const o of orders.slice(0, 5)) {
      const full = await getOrderWithItems(o.id);
      await ctx.reply(orderText(full), { parse_mode: "HTML" });
    }
  });

  bot.command("owner", async (ctx) => {
    const password = ctx.match?.trim() || "";
    const expected = process.env.TELEGRAM_OWNER_SECRET || process.env.ADMIN_PASSWORD || "";
    if (!expected || password !== expected) {
      await ctx.reply("Невірний пароль. Формат: /owner ваш_пароль");
      return;
    }
    await repo.grantOwner(ctx.from.id);
    await ctx.reply("Доступ власника активовано.", { reply_markup: shopKeyboard(true) });
    await ctx.reply("Панель власника iCore:", { reply_markup: ownerMenu() });
  });

  bot.callbackQuery("cats", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCategories(ctx);
  });

  bot.callbackQuery(/^cat:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showProductPage(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.callbackQuery(/^p:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const p = await repo.productById(Number(ctx.match[1]));
    if (!p) return ctx.reply("Товар не знайдено.");
    await sendProduct(ctx, p);
  });

  bot.callbackQuery(/^add:(\d+)$/, async (ctx) => {
    try {
      const qty = await repo.addToCart(ctx.from.id, Number(ctx.match[1]), 1);
      await ctx.answerCallbackQuery({ text: `У кошику: ${qty} шт.` });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
    }
  });

  bot.callbackQuery("cart", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCart(ctx);
  });

  bot.callbackQuery("cart:clear", async (ctx) => {
    await repo.clearCart(ctx.from.id);
    await ctx.answerCallbackQuery({ text: "Кошик очищено" });
    await showCart(ctx);
  });

  bot.callbackQuery(/^q:(\d+):(-?\d+)$/, async (ctx) => {
    try {
      await repo.addToCart(ctx.from.id, Number(ctx.match[1]), Number(ctx.match[2]));
      await ctx.answerCallbackQuery();
      await showCart(ctx);
    } catch (error) {
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
    }
  });

  bot.callbackQuery("checkout", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCheckout(ctx);
  });

  bot.callbackQuery("own:home", async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await ctx.reply("Панель власника iCore:", { reply_markup: ownerMenu() });
  });

  bot.callbackQuery("own:stats", async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    const s = await repo.stats();
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `<b>Статистика iCore</b>\n\nТовари: ${s.products}\nЗамовлення: ${s.orders}\nВиручка: ${esc(money(s.revenue))}\nКористувачі бота: ${s.users}\nМало на складі: ${s.lowStock}`,
      { parse_mode: "HTML", reply_markup: ownerMenu() }
    );
  });

  bot.callbackQuery(/^own:orders:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showOwnerOrders(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^own:products:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showOwnerProducts(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery("own:low", async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const items = await repo.lowStockProducts();
    if (!items.length) return ctx.reply("Усі позиції в нормі.");
    const text = items.map((p) => `• ${esc(p.name)} — <b>${p.stock}</b> шт.`).join("\n");
    await ctx.reply(`<b>Мало на складі</b>\n\n${text}`, { parse_mode: "HTML" });
  });

  bot.callbackQuery("own:users", async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const users = await repo.listCustomers();
    const text = users
      .slice(0, 30)
      .map((u) => `• ${esc(u.first_name || "")} ${u.username ? "@" + esc(u.username) : u.chat_id}`)
      .join("\n");
    await ctx.reply(`<b>Користувачі бота: ${users.length}</b>\n\n${text || "Поки нікого"}`, { parse_mode: "HTML" });
  });

  bot.callbackQuery("own:broadcast", async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    ctx.session.flow = "broadcast";
    ctx.session.step = 1;
    await ctx.reply("Надішліть текст або фото з підписом для розсилки всім клієнтам бота. /cancel щоб скасувати.");
  });

  bot.callbackQuery("own:add", async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    ctx.session.flow = "add_product";
    ctx.session.step = 1;
    ctx.session.payload = {};
    const cats = await repo.categories();
    const kb = new InlineKeyboard();
    cats.forEach((c) => kb.text(c.name, `addcat:${c.id}`).row());
    await ctx.reply("Категорія нового товару:", { reply_markup: kb });
  });

  bot.callbackQuery(/^addcat:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    if (ctx.session.flow !== "add_product") return ctx.answerCallbackQuery();
    ctx.session.payload.categoryId = Number(ctx.match[1]);
    ctx.session.step = 2;
    await ctx.answerCallbackQuery();
    await ctx.reply("Назва товару:");
  });

  bot.callbackQuery(/^od:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    const order = await getOrderWithItems(Number(ctx.match[1]));
    if (!order) return ctx.reply("Замовлення не знайдено.");
    await ctx.reply(orderText(order), {
      parse_mode: "HTML",
      reply_markup: orderOwnerKeyboard(order.id, order.status),
    });
  });

  bot.callbackQuery(/^ss:(\d+):(\w+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    const id = Number(ctx.match[1]);
    const status = ctx.match[2];
    if (!STATUSES.includes(status)) return ctx.answerCallbackQuery({ text: "Невідомий статус" });
    const order = await repo.setOrderStatus(id, status);
    await ctx.answerCallbackQuery({ text: "Статус оновлено" });
    const full = await getOrderWithItems(id);
    await ctx.reply(orderText(full), { parse_mode: "HTML", reply_markup: orderOwnerKeyboard(id, status) });
    if (order?.telegram_chat_id) {
      try {
        await bot.api.sendMessage(
          order.telegram_chat_id,
          `Статус замовлення №${id}: <b>${STATUS[status]}</b>`,
          { parse_mode: "HTML" }
        );
      } catch {
        /* user blocked bot */
      }
    }
  });

  bot.callbackQuery(/^op:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    await ctx.answerCallbackQuery();
    await showOwnerProduct(ctx, Number(ctx.match[1]));
  });

  bot.callbackQuery(/^editstock:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    ctx.session.flow = "edit_stock";
    ctx.session.payload = { id: Number(ctx.match[1]) };
    await ctx.answerCallbackQuery();
    await ctx.reply("Новий залишок (ціле число):");
  });

  bot.callbackQuery(/^editprice:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    ctx.session.flow = "edit_price";
    ctx.session.payload = { id: Number(ctx.match[1]) };
    await ctx.answerCallbackQuery();
    await ctx.reply("Нова ціна в гривнях (можна «нова стара», наприклад 54999 57999):");
  });

  bot.callbackQuery(/^delp:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    const ok = await repo.deleteProduct(Number(ctx.match[1]));
    await ctx.answerCallbackQuery({ text: ok ? "Видалено" : "Не знайдено" });
    await showOwnerProducts(ctx, 0);
  });

  bot.callbackQuery(/^reply:(\d+)$/, async (ctx) => {
    if (!(await requireOwner(ctx))) return ctx.answerCallbackQuery();
    ctx.session.flow = "reply_user";
    ctx.session.payload = { chatId: Number(ctx.match[1]) };
    await ctx.answerCallbackQuery();
    await ctx.reply("Напишіть відповідь клієнту:");
  });

  bot.on("message", async (ctx, next) => {
    const text = ctx.message.text;

    if (text === "🛍 Каталог") return showCategories(ctx);
    if (text === "🛒 Кошик") return showCart(ctx);
    if (text === "ℹ️ Про магазин") {
      return ctx.reply(
        "<b>iCore Store</b>\nОфіційна техніка Apple, перевірка комплектації, доставка по Україні.\nСайт магазину також доступний у браузері після запуску сервера.",
        { parse_mode: "HTML" }
      );
    }
    if (text === "📦 Мої замовлення") {
      const orders = await repo.customerOrders(ctx.from.id);
      if (!orders.length) return ctx.reply("Замовлень поки немає.");
      for (const o of orders.slice(0, 5)) {
        const full = await getOrderWithItems(o.id);
        await ctx.reply(orderText(full), { parse_mode: "HTML" });
      }
      return;
    }
    if (text === "🔍 Пошук") {
      ctx.session.flow = "search";
      return ctx.reply("Введіть назву моделі, наприклад iPhone 16 Pro або AirPods:");
    }
    if (text === "💬 Підтримка") {
      ctx.session.flow = "support";
      return ctx.reply("Напишіть питання — власник магазину отримає його в Telegram.");
    }
    if (text === "👑 Панель власника") {
      if (!(await requireOwner(ctx))) return;
      return ctx.reply("Панель власника iCore:", { reply_markup: ownerMenu() });
    }
    if (text === "❌ Скасувати" && ctx.session.flow && ctx.session.flow !== "checkout") {
      resetFlow(ctx);
      return ctx.reply("Скасовано.", { reply_markup: shopKeyboard(await repo.isOwner(ctx.from.id)) });
    }

    if (ctx.session.flow === "checkout" || ctx.message.contact) {
      if (ctx.session.flow === "checkout") return handleCheckout(ctx);
    }

    if (ctx.session.flow === "search" && text) {
      resetFlow(ctx);
      const items = await repo.products({ q: text, limit: 10, offset: 0 });
      if (!items.length) return ctx.reply("Нічого не знайдено. Спробуйте інший запит.");
      const kb = new InlineKeyboard();
      items.forEach((p) => kb.text(`${p.name} · ${money(p.price)}`, `p:${p.id}`).row());
      return ctx.reply(`Знайдено: ${items.length}`, { reply_markup: kb });
    }

    if (ctx.session.flow === "support" && text) {
      resetFlow(ctx);
      await notifyOwners(`💬 <b>Звернення</b> від ${esc(userLabel(ctx.from))}\n\n${esc(text)}`, {
        reply_markup: new InlineKeyboard().text("Відповісти", `reply:${ctx.from.id}`),
      });
      return ctx.reply("Повідомлення надіслано. Відповімо якнайшвидше.");
    }

    if (ctx.session.flow === "reply_user" && text) {
      if (!(await repo.isOwner(ctx.from.id))) return;
      const chatId = ctx.session.payload.chatId;
      resetFlow(ctx);
      try {
        await bot.api.sendMessage(chatId, `💬 Відповідь iCore:\n\n${text}`);
        return ctx.reply("Відповідь доставлено.");
      } catch {
        return ctx.reply("Не вдалося надіслати — клієнт, ймовірно, зупинив бота.");
      }
    }

    if (ctx.session.flow === "broadcast" && (await repo.isOwner(ctx.from.id))) {
      const users = await repo.listCustomers();
      resetFlow(ctx);
      let ok = 0;
      for (const u of users) {
        try {
          if (ctx.message.photo) {
            const fileId = ctx.message.photo.at(-1).file_id;
            await bot.api.sendPhoto(u.chat_id, fileId, { caption: ctx.message.caption || "" });
          } else if (text) {
            await bot.api.sendMessage(u.chat_id, text);
          }
          ok += 1;
        } catch {
          /* skip */
        }
      }
      return ctx.reply(`Розсилку завершено: ${ok} з ${users.length}.`);
    }

    if (ctx.session.flow === "edit_stock" && text && (await repo.isOwner(ctx.from.id))) {
      const stock = Number(text);
      if (!Number.isInteger(stock) || stock < 0) return ctx.reply("Вкажіть ціле невідʼємне число.");
      const p = await repo.updateStock(ctx.session.payload.id, stock);
      resetFlow(ctx);
      return ctx.reply(p ? `Залишок «${p.name}»: ${p.stock} шт.` : "Товар не знайдено.");
    }

    if (ctx.session.flow === "edit_price" && text && (await repo.isOwner(ctx.from.id))) {
      const [price, old] = text.split(/\s+/).map(Number);
      if (!Number.isFinite(price) || price <= 0) return ctx.reply("Некоректна ціна.");
      const p = await repo.updatePrice(ctx.session.payload.id, Math.round(price), old ? Math.round(old) : null);
      resetFlow(ctx);
      return ctx.reply(p ? `Ціна «${p.name}»: ${money(p.price)}` : "Товар не знайдено.");
    }

    if (ctx.session.flow === "add_product" && (await repo.isOwner(ctx.from.id))) {
      const p = ctx.session.payload;
      if (ctx.session.step === 2 && text) {
        p.name = text;
        ctx.session.step = 3;
        return ctx.reply("Ціна в гривнях (лише число):");
      }
      if (ctx.session.step === 3 && text) {
        const price = Number(text.replace(/\s/g, ""));
        if (!Number.isFinite(price) || price <= 0) return ctx.reply("Некоректна ціна.");
        p.price = Math.round(price);
        ctx.session.step = 4;
        return ctx.reply("Кількість на складі:");
      }
      if (ctx.session.step === 4 && text) {
        const stock = Number(text);
        if (!Number.isInteger(stock) || stock < 0) return ctx.reply("Вкажіть ціле число.");
        p.stock = stock;
        ctx.session.step = 5;
        return ctx.reply("Фото товару, посилання на зображення або «Пропустити».");
      }
      if (ctx.session.step === 5) {
        if (ctx.message.photo) p.telegramFileId = ctx.message.photo.at(-1).file_id;
        else if (text && text !== "Пропустити" && /^https?:\/\//i.test(text)) p.imageUrl = text;
        ctx.session.step = 6;
        return ctx.reply("Короткий опис / tagline або «Пропустити».");
      }
      if (ctx.session.step === 6 && text) {
        if (text !== "Пропустити") p.tagline = text;
        ctx.session.step = 7;
        return ctx.reply("Повний опис або «Пропустити».");
      }
      if (ctx.session.step === 7 && text) {
        if (text !== "Пропустити") p.description = text;
        const created = await repo.createProduct(p);
        resetFlow(ctx);
        await ctx.reply(`Товар «${created.name}» додано в каталог (id ${created.id}).`);
        return;
      }
    }

    if (text && !text.startsWith("/")) {
      await ctx.reply("Оберіть дію в меню внизу екрана або натисніть /start.", {
        reply_markup: shopKeyboard(await repo.isOwner(ctx.from.id)),
      });
    }
  });

  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
  } catch {
    /* polling */
  }

  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Відкрити магазин" },
      { command: "catalog", description: "Каталог товарів" },
      { command: "cart", description: "Кошик" },
      { command: "orders", description: "Мої замовлення" },
      { command: "help", description: "Допомога" },
      { command: "owner", description: "Вхід власника" },
      { command: "cancel", description: "Скасувати дію" },
    ]);
  } catch (error) {
    console.error("Не вдалося оновити меню бота:", error.message);
  }

  bot.start({
    drop_pending_updates: true,
    onStart: (me) => {
      console.log(`  Telegram: @${me.username}`);
      console.log("  Власник:  /owner і пароль з ADMIN_PASSWORD");
    },
  }).catch((error) => {
    console.error("Telegram-бот зупинився:", error.description || error.message);
  });

  return bot;
}
