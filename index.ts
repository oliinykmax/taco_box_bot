import { Bot, session, InlineKeyboard, type Context, type SessionFlavor } from "grammy";
import "dotenv/config";
import { initDB, saveUser, getUser, saveMeal, getTodayMeals } from "./database";
import {
  calculateBMR,
  calculateTDEE,
  type Sex,
  type ActivityLevel,
  activityMultipliers,
  activityDescriptions
} from "./calculations";

// Ініціалізація бази даних при запуску
initDB();

interface SessionData {
  step: "idle" | "age" | "height" | "weight" | "sex" | "activity" | "add_meal";
  age?: number;
  height?: number;
  weight?: number;
  sex?: Sex;
  activity?: ActivityLevel;
}

type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is not defined in .env");
}

const bot = new Bot<MyContext>(token);

bot.use(
  session({
    initial: (): SessionData => ({ step: "idle" }),
  })
);

bot.command("start", (ctx) => {
  return ctx.reply(
    "Привіт! Я твій помічник для контролю калорій. 😊\n\n" +
      "🔸 Використовуй /set_profile, щоб налаштувати свій профіль.\n" +
      "🔸 Якщо ви вже налаштували профіль, ви можете переглянути його за допомогою /my_profile.\n" +
      "🔸 Щоб записати прийом їжі, використовуй /add_meal.\n\n" +
      "Використовуй /help, щоб побачити список усіх команд."
  );
});

bot.command("set_profile", async (ctx) => {
  ctx.session.step = "age";
  await ctx.reply("Введіть ваш вік:");
});

bot.command("add_meal", async (ctx) => {
  ctx.session.step = "add_meal";
  await ctx.reply("Що ви сьогодні їли?\n\n💡 Ви можете додати замітки через вертикальну риску, наприклад: `Яйця з тостом | без масла`", { parse_mode: "Markdown" });
});

bot.command("today", async (ctx) => {
  const userId = ctx.from!.id;
  const meals = getTodayMeals(userId);

  if (meals.length === 0) {
    return ctx.reply("Сьогодні ще немає записаних прийомів їжі. 🍽️");
  }

  let totalCalories = 0;
  let message = "📅 Списокок страв за сьогодні:\n\n";

  meals.forEach((meal, index) => {
    const time = meal.time_str;
    const notes = meal.notes ? `\n   📝 Нотатки: ${meal.notes}` : "";
    message += `${index + 1}. 🕒 ${time} — *${meal.raw_text}*\n   🔥 ${meal.calories_estimated} kcal${notes}\n\n`;
    totalCalories += meal.calories_estimated;
  });

  message += `\n📊 *Всього за день: ${totalCalories.toFixed(0)} kcal*`;

  return ctx.reply(message, { parse_mode: "Markdown" });
});

bot.command("my_profile", async (ctx) => {
  let profile = ctx.session.age ? ctx.session : null;

  // Якщо в сесії порожньо, спробуємо завантажити з БД
  if (!profile) {
    const dbUser = getUser(ctx.from!.id);
    if (dbUser) {
      profile = {
        age: dbUser.age,
        height: dbUser.height,
        weight: dbUser.weight,
        sex: dbUser.sex as Sex,
        activity: dbUser.activity_level as ActivityLevel,
        step: "idle"
      };
      // Оновимо сесію, щоб при наступних запитах брати звідти
      ctx.session.age = dbUser.age;
      ctx.session.height = dbUser.height;
      ctx.session.weight = dbUser.weight;
      ctx.session.sex = dbUser.sex as Sex;
      ctx.session.activity = dbUser.activity_level as ActivityLevel;
    }
  }

  const { age, height, weight, sex, activity } = profile || {};

  if (!age || !height || !weight || !sex || !activity) {
    return ctx.reply(
      "Ваш профіль ще не налаштовано. Використовуйте /set_profile, щоб ввести дані."
    );
  }

  const bmr = calculateBMR(weight, height, age, sex);
  const tdee = calculateTDEE(bmr, activity);

  const sexEmoji = sex === "male" ? "👨 Чоловік" : "👩 Жінка";
  const activityLabels: Record<ActivityLevel, string> = {
    low: "Низький (1.2)",
    light: "Легкий (1.375)",
    medium: "Середній (1.55)",
    high: "Високий (1.725)",
  };

  const activityDesc = activityDescriptions[activity];

  return ctx.reply(
    `📋 Ваш профіль:\n\n` +
      `🎂 Вік: ${age}\n` +
      `📏 Зріст: ${height} см\n` +
      `⚖️ Вага: ${weight} кг\n` +
      `🚻 Стать: ${sexEmoji}\n` +
      `🏃 Активність: ${activityLabels[activity]}\n` +
      `ℹ️ Опис: ${activityDesc}\n\n` +
      `🔥 BMR (метаболізм у спокої): ${bmr.toFixed(0)} ккал\n` +
      `⚡ TDEE (денна норма): ${tdee.toFixed(0)} ккал\n\n` +
      `💡 Рекомендації для вашої мети:\n` +
      `📉 Схуднення: ${(tdee * 0.85).toFixed(0)} ккал (-15%)\n` +
      `⚖️ Підтримка ваги: ${tdee.toFixed(0)} ккал\n` +
      `📈 Набір маси: ${(tdee * 1.15).toFixed(0)} ккал (+15%)`
  );
});

bot.command("help", (ctx) => {
  return ctx.reply(
    "Доступні команди:\n" +
      "/start - Почати роботу з ботом\n" +
      "/help - Отримати список команд\n" +
      "/joke - Цікавий факт або корисна інформація\n" +
      "/set_profile - Налаштувати профіль та порахувати калорії\n" +
      "/my_profile - Переглянути мій профіль\n" +
      "/add_meal - Записати прийом їжі\n" +
      "/today - Переглянути зʼїдене за сьогодні"
  );
});

bot.command("joke", (ctx) => {
  const facts = [
    "Мед — єдиний продукт, який ніколи не псується. Археологи знаходили їстівний мед у давньоєгипетських гробницях.",
    "Восьминоги мають три серця, а їхня кров блакитного кольору.",
    "Гаряча вода замерзає швидше, ніж холодна, за певних умов (ефект Мпемби).",
    "Шотландія має понад 400 слів для означення снігу.",
    "Коала спить до 22 годин на добу.",
  ];
  const randomFact = facts[Math.floor(Math.random() * facts.length)];
  return ctx.reply(`Цікавий факт: ${randomFact}`);
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (ctx.session.step === "sex") {
    if (data === "male" || data === "female") {
      ctx.session.sex = data as Sex;
      ctx.session.step = "activity";

      const keyboard = new InlineKeyboard()
        .text("Низький (low)", "low")
        .text("Легкий (light)", "light")
        .row()
        .text("Середній (medium)", "medium")
        .text("Високий (high)", "high");

      await ctx.answerCallbackQuery();
      await ctx.editMessageText("Оберіть ваш рівень активності:", {
        reply_markup: keyboard,
      });
    }
  } else if (ctx.session.step === "activity") {
    if (["low", "light", "medium", "high"].includes(data)) {
      ctx.session.activity = data as ActivityLevel;

      const { weight, height, age, sex, activity } = ctx.session;

      if (weight && height && age && sex && activity) {
        const bmr = calculateBMR(weight, height, age, sex);
        const tdee = calculateTDEE(bmr, activity);

        // Збереження в базу даних
        saveUser({
          telegram_id: ctx.from!.id,
          age,
          weight,
          height,
          sex,
          activity_level: activity,
          bmr,
          tdee,
        });

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
          `Ваші результати:\n` +
            `🔹 BMR (Базальний метаболізм): ${bmr.toFixed(2)} ккал\n` +
            `🔹 TDEE (Денна норма): ${tdee.toFixed(2)} ккал\n\n` +
            `Дякуємо! Профіль налаштовано та збережено.`
        );
        ctx.session.step = "idle";
      } else {
        await ctx.answerCallbackQuery();
        await ctx.reply("Сталася помилка. Спробуйте ще раз /set_profile");
        ctx.session.step = "idle";
      }
    }
  }
});

bot.on("message:text", async (ctx) => {
  const step = ctx.session.step;
  const text = ctx.message.text;

  if (step === "age") {
    const age = parseInt(text);
    if (isNaN(age) || age < 10 || age > 100) {
      return ctx.reply("Будь ласка, введіть коректний вік (число від 10 до 100):");
    }
    ctx.session.age = age;
    ctx.session.step = "height";
    return ctx.reply("Введіть ваш зріст (см):");
  }

  if (step === "height") {
    const height = parseFloat(text);
    if (isNaN(height) || height < 100 || height > 250) {
      return ctx.reply("Будь ласка, введіть коректний зріст (число від 100 до 250):");
    }
    ctx.session.height = height;
    ctx.session.step = "weight";
    return ctx.reply("Введіть вашу вагу (кг):");
  }

  if (step === "weight") {
    const weight = parseFloat(text);
    if (isNaN(weight) || weight < 30 || weight > 300) {
      return ctx.reply("Будь ласка, введіть коректну вагу (число від 30 до 300):");
    }
    ctx.session.weight = weight;
    ctx.session.step = "sex";

    const keyboard = new InlineKeyboard()
      .text("Чоловік", "male")
      .text("Жінка", "female");

    return ctx.reply("Оберіть вашу стать:", { reply_markup: keyboard });
  }

  if (step === "add_meal") {
    const parts = text.split("|").map(p => p.trim());
    const foodName = parts[0] || ""; // Забезпечуємо, що це завжди string
    const notes = parts.length > 1 ? parts[1] : undefined;

    saveMeal({
      user_id: ctx.from!.id,
      raw_text: foodName,
      calories_estimated: 0,
      notes: notes,
    });
    ctx.session.step = "idle";
    return ctx.reply("Прийом їжі збережено ✅");
  }

  if (text.toLowerCase().includes("hello") || text.toLowerCase().includes("привіт")) {
    return ctx.reply("Привіт! Чим я можу тобі допомогти? 😊");
  }

  if (step === "idle") {
    return ctx.reply(`Я отримав твоє повідомлення: ${text}`);
  }
});

bot.start();
console.log("Бот запущений...");
