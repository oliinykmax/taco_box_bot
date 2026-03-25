import { Database } from "bun:sqlite";

const DB_PATH = "bot_database.sqlite";

// Ініціалізація бази даних
const db = new Database(DB_PATH);

/**
 * Створює таблиці, якщо вони не існують
 */
export function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      age INTEGER,
      weight REAL,
      height REAL,
      sex TEXT,
      activity_level TEXT,
      bmr REAL,
      tdee REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      raw_text TEXT,
      calories_estimated REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(telegram_id)
    )
  `);

  // Міграція: додаємо стовпці по одному
  const migrations = [
    { table: "users", column: "activity_level", type: "TEXT" },
    { table: "users", column: "bmr", type: "REAL" },
    { table: "users", column: "tdee", type: "REAL" },
    { table: "meals", column: "user_id", type: "INTEGER" },
    { table: "meals", column: "raw_text", type: "TEXT" },
    { table: "meals", column: "calories_estimated", type: "REAL" },
    { table: "meals", column: "timestamp", type: "DATETIME" },
    { table: "meals", column: "notes", type: "TEXT" },
  ];

  for (const m of migrations) {
    try {
      db.run(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
      console.log(`Додано стовпець ${m.column} до таблиці ${m.table}`);
    } catch (e) {
      // Стовпець ймовірно вже існує, ігноруємо
    }
  }

  console.log("База даних готова до роботи.");
}

export function saveUser(user: {
  telegram_id: number;
  age: number;
  weight: number;
  height: number;
  sex: string;
  activity_level: string;
  bmr: number;
  tdee: number;
}) {
  db.run(
    `INSERT OR REPLACE INTO users (telegram_id, age, weight, height, sex, activity_level, bmr, tdee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.telegram_id,
      user.age,
      user.weight,
      user.height,
      user.sex,
      user.activity_level,
      user.bmr,
      user.tdee,
    ]
  );
}

export function getUser(telegram_id: number) {
  const query = db.prepare("SELECT * FROM users WHERE telegram_id = ?");
  return query.get(telegram_id) as {
    telegram_id: number;
    age: number;
    weight: number;
    height: number;
    sex: string;
    activity_level: string;
    bmr: number;
    tdee: number;
  } | null;
}

export function saveMeal(meal: {
  user_id: number;
  raw_text: string;
  calories_estimated: number;
  notes?: string;
}) {
  db.run(
    `INSERT INTO meals (user_id, raw_text, calories_estimated, notes, timestamp)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [meal.user_id, meal.raw_text, meal.calories_estimated, meal.notes || null]
  );
}

export function getTodayMeals(user_id: number) {
  const query = db.prepare(
    "SELECT *, time(timestamp, 'localtime') as time_str FROM meals WHERE user_id = ? AND date(timestamp) = date('now')"
  );
  return query.all(user_id) as {
    id: number;
    user_id: number;
    raw_text: string;
    calories_estimated: number;
    notes: string | null;
    timestamp: string;
    time_str: string;
  }[];
}

export default db;
