# iCore Store

Інтернет-магазин техніки Apple з вітриною, кошиком і адмін-панеллю.

Стек: **HTML / CSS / JavaScript**, **Node.js (Express)**, **PostgreSQL**.

## Запуск

Потрібен лише **Node.js 18+**. База піднімається сама.

У терміналі з папки проєкту:

```bash
chmod +x start.sh
./start.sh
```

Або:

```bash
npm install
npm start
```

Браузер відкриється автоматично. Якщо порт 3000 зайнятий, сервер візьме наступний вільний.

### Адмін-панель

- Адреса: `/admin/login.html`
- Email: `admin@icore.store`
- Пароль: `Admin123!`

Облікові дані змінюються в `.env`.

### PostgreSQL (необовʼязково)

Якщо встановлений Docker:

```bash
docker compose up -d
```

У `.env` поставте:

```
USE_POSTGRES=1
DATABASE_URL=postgres://icore:icore@localhost:5432/icore
```

## Можливості

- Каталог iPhone, Mac, iPad, Watch, AirPods і аксесуарів
- Пошук, фільтри, сортування
- Кошик і оформлення замовлення
- Адмінка: статистика, товари, статуси замовлень
