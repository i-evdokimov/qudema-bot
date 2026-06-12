require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const cron = require('node-cron');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const DB_FILE = 'db.json';

// =====================
// 📦 DB
// =====================
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// =====================
// 🧠 Умный парсер даты
// =====================
function parseDate(text) {
  text = text.toLowerCase();
  const now = new Date();

  let date = new Date();

  if (text.includes('завтра')) {
    date.setDate(now.getDate() + 1);
  } else if (text.includes('сегодня')) {
    // today
  }

  // дни недели
  const days = ['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу'];
  days.forEach((day, i) => {
    if (text.includes(day)) {
      const current = now.getDay();
      let diff = i - current;
      if (diff <= 0) diff += 7;
      date.setDate(now.getDate() + diff);
    }
  });

  const timeMatch = text.match(/(\d{1,2})[:.](\d{2})/);

  if (timeMatch) {
    date.setHours(timeMatch[1]);
    date.setMinutes(timeMatch[2]);
    date.setSeconds(0);
    return date;
  }

  return null;
}

// =====================
// 🎛️ Кнопки
// =====================
function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        ['📅 Расписание', '📚 Домашка'],
        ['➕ Запланировать', '🔁 Перенести']
      ],
      resize_keyboard: true
    }
  };
}

// =====================
// 💬 Сообщения
// =====================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();

  let db = readDB();
  if (!db[chatId]) {
    db[chatId] = {
      lesson: null,
      homework: [],
      lastReminder: null
    };
  }

  // старт
  if (text === '/start' || text.startsWith('/bot') || text.startsWith('/qudema')) {
    bot.sendMessage(chatId,
`🤖 Я твой помощник по занятиям

Я умею:
📅 вести расписание  
📚 хранить домашку  
⏰ напоминать о занятиях  

Просто пиши как удобно:
"завтра в 18"
"перенеси на пятницу 17:00"
"домашка: решить №5"
`, mainMenu());
    return;
  }

  // =====================
  // 📅 Расписание
  // =====================
  if (text.includes('расписание')) {
    if (!db[chatId].lesson) {
      bot.sendMessage(chatId, '❌ Пока нет занятия');
    } else {
      bot.sendMessage(chatId,
        `📅 Занятие: ${new Date(db[chatId].lesson).toLocaleString()}`
      );
    }
    return;
  }

  // =====================
  // ➕ Планирование
  // =====================
  if (text.includes('запланировать') || text.includes('назначь')) {
    const date = parseDate(text);

    if (!date) {
      bot.sendMessage(chatId, '❌ Напиши например: "завтра в 18:00"');
      return;
    }

    db[chatId].lesson = date;
    db[chatId].lastReminder = null;
    writeDB(db);

    bot.sendMessage(chatId,
      `✅ Запланировано: ${date.toLocaleString()}`
    );
    return;
  }

  // =====================
  // 🔁 Перенос
  // =====================
  if (text.includes('перенеси')) {
    const date = parseDate(text);

    if (!date) {
      bot.sendMessage(chatId, '❌ Напиши: "перенеси на пятницу 17:00"');
      return;
    }

    db[chatId].lesson = date;
    db[chatId].lastReminder = null;
    writeDB(db);

    bot.sendMessage(chatId,
      `🔁 Перенесено на: ${date.toLocaleString()}`
    );
    return;
  }

  // =====================
  // 📚 Домашка
  // =====================
  if (text.startsWith('домашка')) {
    const hw = text.replace('домашка', '').replace(':', '').trim();

    if (!hw) {
      bot.sendMessage(chatId, 'Напиши: домашка: что сделать');
      return;
    }

    db[chatId].homework.push(hw);
    writeDB(db);

    bot.sendMessage(chatId, '✅ Добавлено');
    return;
  }

  if (text.includes('домашка') || text.includes('показать домашку')) {
    if (db[chatId].homework.length === 0) {
      bot.sendMessage(chatId, '📚 Нет домашки');
    } else {
      bot.sendMessage(chatId,
        '📚 Домашка:\n\n' +
        db[chatId].homework.map((h, i) => `${i + 1}. ${h}`).join('\n')
      );
    }
    return;
  }
});

// =====================
// ⏰ Напоминания
// =====================
cron.schedule('* * * * *', () => {
  const db = readDB();

  Object.entries(db).forEach(([chatId, data]) => {
    if (!data.lesson) return;

    const now = new Date();
    const lesson = new Date(data.lesson);

    const diff = (lesson - now) / 60000;

    // напоминание только 1 раз
    if (diff <= 10 && diff > 9) {
      if (data.lastReminder === 'sent') return;

      bot.sendMessage(chatId,
        `⏰ Через 10 минут занятие!\n\nГотовься 🚀`
      );

      data.lastReminder = 'sent';
      writeDB(db);
    }
  });
});

console.log('🔥 PRO BOT RUNNING');