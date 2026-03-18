import { Bot, session, InlineKeyboard, type Context, type SessionFlavor } from "grammy";
import "dotenv/config";
import {
  calculateBMR,
  calculateTDEE,
  type Sex,
  type ActivityLevel,
  activityMultipliers,
  activityDescriptions
} from "./calculations";

interface SessionData {
  step: "idle" | "age" | "height" | "weight" | "sex" | "activity";
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
    "Привіт! Я твій новий Telegram-бот.\nЯ можу відповідати на команди та повторювати твої повідомлення.\nВикористовуй /set_profile для налаштування свого профілю та розрахунку калорій."
  );
});

bot.command("set_profile", async (ctx) => {
  ctx.session.step = "age";
  await ctx.reply("Введіть ваш вік:");
});

bot.command("my_profile", async (ctx) => {
  const { age, height, weight, sex, activity } = ctx.session;

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
    "Доступні команди:\n/start - Почати роботу з ботом\n/help - Отримати список команд\n/joke - Цікавий факт або корисна інформація\n/set_profile - Налаштувати профіль та порахувати калорії\n/my_profile - Переглянути мій профіль"
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

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
          `Ваші результати:\n` +
            `🔹 BMR (Базальний метаболізм): ${bmr.toFixed(2)} ккал\n` +
            `🔹 TDEE (Денна норма): ${tdee.toFixed(2)} ккал\n\n` +
            `Дякуємо! Профіль налаштовано.`
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

  if (text.toLowerCase().includes("hello") || text.toLowerCase().includes("привіт")) {
    return ctx.reply("Привіт! Чим я можу тобі допомогти? 😊");
  }

  if (step === "idle") {
    return ctx.reply(`Я отримав твоє повідомлення: ${text}`);
  }
});

bot.start();
console.log("Бот запущений...");
