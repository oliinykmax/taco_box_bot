import { Bot } from "grammy";
import "dotenv/config";

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is not defined in .env");
}

const bot = new Bot(token);

bot.command("start", (ctx) => {
  return ctx.reply(
    "Привіт! Я твій новий Telegram-бот.\nЯ можу відповідати на команди та повторювати твої повідомлення."
  );
});

bot.command("help", (ctx) => {
  return ctx.reply(
    "Доступні команди:\n/start - Почати роботу з ботом\n/help - Отримати список команд\n/joke - Цікавий факт або корисна інформація"
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

bot.on("message:text", (ctx) => {
  const text = ctx.message.text.toLowerCase();

  if (text.includes("hello") || text.includes("привіт")) {
    return ctx.reply("Привіт! Чим я можу тобі допомогти? 😊");
  }

  return ctx.reply(`Я отримав твоє повідомлення: ${ctx.message.text}`);
});

bot.start();
console.log("Бот запущений...");
