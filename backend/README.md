# SosaLand Backend — Этап 1

Node.js + Express + SQLite

## Быстрый старт

```bash
# 1. Перейди в папку бэкенда
cd backend

# 2. Установи зависимости
npm install

# 3. Создай файл с переменными окружения
cp .env.example .env

# 4. Создай таблицы в базе данных (выполнить один раз)
npm run migrate

# 5. Запусти сервер
npm start
```

Сервер будет доступен на `http://localhost:3001`

---

## Эндпоинты

### GET /api/health
Проверка, что сервер работает.

```bash
curl http://localhost:3001/api/health
```

Ответ:
```json
{ "status": "ok", "timestamp": 1712345678901 }
```

---

### POST /api/users
Создание нового пользователя.

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456","minecraftUuid":"550e8400-e29b-41d4-a716-446655440000"}'
```

Ответ (201 Created):
```json
{
  "id": "генерированный-uuid",
  "username": "test",
  "minecraftUuid": "550e8400-e29b-41d4-a716-446655440000",
  "role": "user",
  "createdAt": 1712345678
}
```

Возможные ошибки:
- `400` — не переданы обязательные поля
- `409` — username или minecraftUuid уже заняты
- `500` — внутренняя ошибка сервера

---

## Структура папки

```
backend/
├── migrations/
│   └── 001_create_users.js   # SQL-схема таблицы users
├── scripts/
│   └── run-migration.js      # Запускает миграции
├── db.js                     # Подключение к SQLite
├── server.js                 # Express-сервер и эндпоинты
├── .env.example              # Пример переменных окружения
├── .env                      # Твои переменные (не коммитить в git!)
└── database.sqlite           # Файл БД (создаётся автоматически)
```

---

## Что дальше (Этап 2)

- [ ] Хеширование паролей через `bcrypt`
- [ ] Система тикетов регистрации (таблица `tickets`)
- [ ] Эндпоинты для модерации тикетов
- [ ] Авторизация через JWT
