import { Bot, session, InlineKeyboard, Keyboard, type Context, type SessionFlavor } from "grammy";
import "dotenv/config";
import { initDB, saveUser, getUser, saveMeal, getTodayMeals, clearTodayMeals } from "./database";
import { estimateCalories, getMealIdeas } from "./gemini";
import {
  calculateBMR,
  calculateTDEE,
  calculateRecommendedCalories,
  type Sex,
  type ActivityLevel,
  type Goal,
  activityMultipliers,
  activityDescriptions
} from "./calculations";

// Ініціалізація бази даних при запуску
initDB();

interface SessionData {
  step: "idle" | "age" | "height" | "weight" | "sex" | "activity" | "goal" | "add_meal";
  age?: number;
  height?: number;
  weight?: number;
  sex?: Sex;
  activity?: ActivityLevel;
  goal?: Goal;
}

const goalLabels: Record<Goal, string> = {
  lose: "🔻 Схуднення",
  maintain: "⚖️ Підтримка",
  gain: "🔺 Набір маси",
};

type MyContext = Context & SessionFlavor<SessionData>;

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is not defined in .env");
}

const bot = new Bot<MyContext>(token);

// Простий Rate Limiter (в пам'яті)
const userLastMessageTime = new Map<number, number>();

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId) {
    const now = Date.now();
    const lastTime = userLastMessageTime.get(userId) || 0;
    if (now - lastTime < 1000) { // 1 секунда
      return ctx.reply("⏳ Ви надсилаєте запити занадто швидко. Будь ласка, зачекайте секунду.");
    }
    userLastMessageTime.set(userId, now);
  }
  await next();
});

bot.use(
  session({
    initial: (): SessionData => ({ step: "idle" }),
  })
);

const mainMenu = new Keyboard()
  .text("➕ Add meal")
  .text("📊 Today")
  .row()
  .text("📋 Plan")
  .text("⚙️ Set profile")
  .resized();

bot.command("start", (ctx) => {
  return ctx.reply(
    "Привіт! Я твій помічник для контролю калорій. 😊\n\n" +
      "🔸 Використовуй /set_profile, щоб налаштувати свій профіль.\n" +
      "🔸 Якщо ви вже налаштували профіль, ви можете переглянути його за допомогою /my_profile.\n" +
      "🔸 Щоб записати прийом їжі, використовуй /add_meal.\n\n" +
      "Використовуй /help, щоб побачити список усіх команд.",
    {
      reply_markup: mainMenu,
    }
  );
});

// Глобальний обробник помилок
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);
  ctx.reply("Сталася помилка. Спробуйте ще раз пізніше.").catch(e => console.error("Failed to send error message:", e));
});

const setProfileHandler = async (ctx: MyContext) => {
  try {
    ctx.session.step = "age";
    await ctx.reply(
      "1️⃣ <b>Крок 1: Вік</b>\n\n" +
        "Будь ласка, введіть ваш вік у роках (наприклад: 25).\n" +
        "Це допоможе нам розрахувати базовий метаболізм.",
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Error in setProfileHandler:", error);
    await ctx.reply("Сталася помилка. Спробуйте ще раз пізніше.");
  }
};

bot.command("set_profile", setProfileHandler);
bot.hears("⚙️ Set profile", setProfileHandler);

const addMealHandler = async (ctx: MyContext) => {
  try {
    ctx.session.step = "add_meal";
    await ctx.reply("Що ви їли?");
  } catch (error) {
    console.error("Error in addMealHandler:", error);
    await ctx.reply("Сталася помилка. Спробуйте ще раз пізніше.");
  }
};

bot.command("add_meal", addMealHandler);
bot.hears("➕ Add meal", addMealHandler);

const todayHandler = async (ctx: MyContext) => {
  try {
    const userId = ctx.from!.id;
    const meals = getTodayMeals(userId);
    const user = getUser(userId);

    if (meals.length === 0) {
      return ctx.reply("Сьогодні ще немає записаних прийомів їжі. 🍽️");
    }

    let totalCalories = 0;
    let message = "📅 <b>Ваш раціон за сьогодні:</b>\n\n";

    meals.forEach((meal, index) => {
      const time = meal.time_str;
      const notes = meal.notes ? ` <i>(${meal.notes})</i>` : "";
      message += `${index + 1}. 🕒 ${time} — <b>${meal.raw_text}</b>${notes}\n   🔥 ${meal.calories_estimated} kcal\n\n`;
      totalCalories += meal.calories_estimated;
    });

    message += `📊 <b>Всього за день: ${totalCalories.toFixed(0)} kcal</b>\n`;

    if (user && user.tdee && user.goal) {
      const targetCalories = calculateRecommendedCalories(user.tdee, user.goal as Goal);
      const remaining = targetCalories - totalCalories;
      const percent = (totalCalories / targetCalories) * 100;
      
      message += `🎯 Ваша ціль (${goalLabels[user.goal as Goal]}): <b>${targetCalories.toFixed(0)} kcal</b>\n\n`;
      
      if (remaining > 0) {
        message += `✅ Ви спожили <b>${percent.toFixed(0)}%</b> від норми.\n`;
        message += `💡 Можна з'їсти ще <b>${remaining.toFixed(0)} kcal</b>.`;
      } else {
        message += `⚠️ <b>Норма перевищена на ${Math.abs(remaining).toFixed(0)} kcal!</b> 😱\n`;
        message += `🏃 Час для невеликої прогулянки або тренування.`;
      }
    } else if (!user || !user.age || !user.height || !user.weight || !user.sex || !user.activity_level) {
      message += `\n💡 <i>Спочатку заповніть профіль через /set_profile</i>`;
    } else if (!user.goal) {
      message += `\n💡 <i>Оновіть профіль і виберіть вашу ціль за допомогою /set_profile</i>`;
    }

    return ctx.reply(message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Error in todayHandler:", error);
    await ctx.reply("Сталася помилка. Спробуйте ще раз пізніше.");
  }
};

bot.command("today", todayHandler);
bot.hears("📊 Today", todayHandler);

const planHandler = async (ctx: MyContext) => {
  try {
    const userId = ctx.from!.id;
    const user = getUser(userId);

    if (!user || !user.age || !user.height || !user.weight || !user.sex || !user.activity_level) {
      return ctx.reply("Спочатку заповніть профіль через /set_profile 😊");
    }

    if (!user.goal) {
      return ctx.reply("Оновіть профіль і виберіть вашу ціль за допомогою /set_profile 🎯");
    }

    const targetCalories = calculateRecommendedCalories(user.tdee, user.goal as Goal);
    const goalName = goalLabels[user.goal as Goal];
    
    let explanation = "";
    if (user.goal === "lose") {
      explanation = "Це помірний дефіцит калорій для поступового зниження ваги без стресу для організму.";
    } else if (user.goal === "maintain") {
      explanation = "Ця кількість калорій дозволить вам підтримувати поточну вагу при вашому рівні активності.";
    } else if (user.goal === "gain") {
      explanation = "Це невеликий профіцит калорій для якісного набору м'язової маси разом з тренуваннями.";
    }

    await ctx.reply(
      `📋 <b>Ваш персональний план:</b>\n\n` +
      `🎯 Ваша ціль: <b>${goalName}</b>\n\n` +
      `🔥 Рекомендації:\n` +
      `<b>${targetCalories.toFixed(0)} kcal / день</b>\n\n` +
      `💡 ${explanation}\n\n` +
      `⌛ <i>Генерую ідеї страв...</i>`,
      { parse_mode: "HTML" }
    );

    const mealIdeas = await getMealIdeas(goalName, targetCalories);

    return ctx.reply(
      `<b>Ідеї страв:</b>\n${mealIdeas}\n\n` +
      `⚠️ <i>Це загальні рекомендації, а не медична порада.</i>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Error in planHandler:", error);
    await ctx.reply("Сталася помилка. Спробуйте ще раз пізніше.");
  }
};

bot.command("plan", planHandler);
bot.hears("📋 Plan", planHandler);

bot.command("my_profile", async (ctx) => {
  try {
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
          goal: dbUser.goal as Goal,
          step: "idle"
        };
        // Оновимо сесію, щоб при наступних запитах брати звідти
        ctx.session.age = dbUser.age;
        ctx.session.height = dbUser.height;
        ctx.session.weight = dbUser.weight;
        ctx.session.sex = dbUser.sex as Sex;
        ctx.session.activity = dbUser.activity_level as ActivityLevel;
        ctx.session.goal = dbUser.goal as Goal;
      }
    }

    const { age, height, weight, sex, activity, goal } = profile || {};

    if (!age || !height || !weight || !sex || !activity) {
      return ctx.reply(
        "Спочатку заповніть профіль через /set_profile 😊"
      );
    }

    if (!goal) {
      return ctx.reply(
        "Оновіть профіль і виберіть вашу ціль за допомогою /set_profile 🎯"
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
        `🎯 Ціль: ${goalLabels[goal]}\n` +
        `ℹ️ Опис: ${activityDesc}\n\n` +
        `🔥 BMR (метаболізм у спокої): ${bmr.toFixed(0)} ккал\n` +
        `⚡ TDEE (денна норма): ${tdee.toFixed(0)} ккал\n\n` +
        `💡 Рекомендації для вашої мети:\n` +
        `📉 Схуднення: ${(tdee * 0.85).toFixed(0)} ккал (-15%)\n` +
        `⚖️ Підтримка ваги: ${tdee.toFixed(0)} ккал\n` +
        `📈 Набір маси: ${(tdee * 1.15).toFixed(0)} ккал (+15%)`
    );
  } catch (error) {
    console.error("Error in my_profile command:", error);
    await ctx.reply("Сталася помилка. Спробуйте ще раз пізніше.");
  }
});

bot.command("help", (ctx) => {
  return ctx.reply(
    "🆘 <b>Доступні команди:</b>\n\n" +
      "🔹 /start — Почати роботу з ботом\n" +
      "🔹 /help — Отримати список команд\n" +
      "🔹 /joke — Цікавий факт про їжу 💡\n" +
      "🔹 /set_profile — Налаштувати профіль ⚙️\n" +
      "🔹 /my_profile — Мій профіль 📋\n" +
      "🔹 /plan — Мій план харчування 🥗\n" +
      "🔹 /add_meal — Записати прийом їжі 🍽️\n" +
      "🔹 /today — Зʼїдене за сьогодні 📅\n" +
      "🔹 /clear_today — Очистити список за сьогодні 🗑️",
    { parse_mode: "HTML" }
  );
});

bot.command("clear_today", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("✅ Так, очистити", "confirm_clear")
    .text("❌ Скасувати", "cancel_clear");

  await ctx.reply("⚠️ <b>Ви впевнені, що хочете видалити всі записи за сьогодні?</b>", {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });
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

  if (data === "confirm_clear") {
    clearTodayMeals(ctx.from!.id);
    await ctx.answerCallbackQuery("Дані за сьогодні видалено! 🗑️");
    return ctx.editMessageText("✅ <b>Всі записи за сьогодні успішно видалено.</b>", { parse_mode: "HTML" });
  }

  if (data === "cancel_clear") {
    await ctx.answerCallbackQuery("Дію скасовано. 🙂");
    return ctx.editMessageText("👌 <b>Видалення скасовано. Ваші записи в безпеці!</b>", { parse_mode: "HTML" });
  }

  if (ctx.session.step === "sex") {
    if (data === "male" || data === "female") {
      ctx.session.sex = data as Sex;
      ctx.session.step = "activity";

      const keyboard = new InlineKeyboard()
        .text("Низький", "low")
        .text("Легкий", "light")
        .row()
        .text("Середній", "medium")
        .text("Високий", "high");

      let activityText = "5️⃣ <b>Крок 5: Рівень активності</b>\n\nОберіть ваш рівень фізичної активності:\n\n";
      for (const [key, desc] of Object.entries(activityDescriptions)) {
        const label = key === "low" ? "Низький" : key === "light" ? "Легкий" : key === "medium" ? "Середній" : "Високий";
        activityText += `🔹 <b>${label}</b>: ${desc}\n`;
      }

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(activityText, {
        reply_markup: keyboard,
        parse_mode: "HTML",
      });
    }
  } else if (ctx.session.step === "activity") {
    if (["low", "light", "medium", "high"].includes(data)) {
      ctx.session.activity = data as ActivityLevel;
      ctx.session.step = "goal";

      const keyboard = new InlineKeyboard()
        .text("🔻 Схуднення", "lose")
        .text("⚖️ Підтримка", "maintain")
        .row()
        .text("🔺 Набір маси", "gain");

      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "<b>Яка ваша ціль?</b>",
        { reply_markup: keyboard, parse_mode: "HTML" }
      );
    }
  } else if (ctx.session.step === "goal") {
    if (["lose", "maintain", "gain"].includes(data)) {
      ctx.session.goal = data as Goal;

      const { weight, height, age, sex, activity, goal } = ctx.session;

      if (weight && height && age && sex && activity && goal) {
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
          goal,
        });

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
          `🎉 <b>Профіль успішно налаштовано!</b>\n\n` +
            `🔹 Ціль: <b>${goalLabels[goal]}</b>\n` +
            `🔹 BMR (Базальний метаболізм): <b>${bmr.toFixed(0)} ккал</b>\n` +
            `🔹 TDEE (Денна норма): <b>${tdee.toFixed(0)} ккал</b>\n\n` +
            `Тепер ви можете додавати прийоми їжі за допомогою кнопки <b>➕ Add meal</b>.`,
          { parse_mode: "HTML" }
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
      return ctx.reply("Будь ласка, введіть вік від 10 до 100 років.");
    }
    ctx.session.age = age;
    ctx.session.step = "height";
    return ctx.reply(
      "2️⃣ <b>Крок 2: Зріст</b>\n\n" +
      "Введіть ваш зріст у сантиметрах (наприклад: 175).",
      { parse_mode: "HTML" }
    );
  }

  if (step === "height") {
    const height = parseFloat(text);
    if (isNaN(height) || height < 100 || height > 250) {
      return ctx.reply("Будь ласка, введіть зріст від 100 до 250 см.");
    }
    ctx.session.height = height;
    ctx.session.step = "weight";
    return ctx.reply(
      "3️⃣ <b>Крок 3: Вага</b>\n\n" +
      "Введіть вашу вагу в кілограмах (наприклад: 70.5).",
      { parse_mode: "HTML" }
    );
  }

  if (step === "weight") {
    const weight = parseFloat(text);
    if (isNaN(weight) || weight < 30 || weight > 300) {
      return ctx.reply("Будь ласка, введіть вагу від 30 до 300 кг.");
    }
    ctx.session.weight = weight;
    ctx.session.step = "sex";

    const keyboard = new InlineKeyboard()
      .text("Чоловік 👨", "male")
      .text("Жінка 👩", "female");

    return ctx.reply(
      "4️⃣ <b>Крок 4: Стать</b>\n\n" +
      "Оберіть вашу стать для точнішого розрахунку метаболізму:",
      { reply_markup: keyboard, parse_mode: "HTML" }
    );
  }

  if (step === "add_meal") {
    const parts = text.split("|").map(p => p.trim());
    const foodName = parts[0] || ""; // Забезпечуємо, що це завжди string
    const notes = parts.length > 1 ? parts[1] : undefined;

    await ctx.reply("⌛ Оцінюю калорії за допомогою Gemini...");
    
    const mealData = await estimateCalories(text);

    if (!mealData || mealData.total_calories === 0) {
      ctx.session.step = "idle";
      return ctx.reply("Не вдалося проаналізувати їжу. Спробуйте описати простіше.");
    }

    saveMeal({
      user_id: ctx.from!.id,
      raw_text: foodName,
      calories_estimated: mealData.total_calories,
      notes: notes,
      gemini_json: JSON.stringify(mealData),
    });
    ctx.session.step = "idle";
    
    const itemsText = mealData.items.map(item => `• ${item.name} — ${item.calories} kcal`).join("\n");

    return ctx.reply(
      `<b>Знайдено:</b>\n\n` +
      `${itemsText}\n\n` +
      `<b>Всього: ${mealData.total_calories} kcal</b>\n` +
      `Точність: ${mealData.confidence.toFixed(2)}\n\n` +
      `<i>Примітка: це орієнтовна оцінка калорій.</i>`,
      { parse_mode: "HTML", reply_markup: mainMenu }
    );
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
