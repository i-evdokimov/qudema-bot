require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const cron = require('node-cron');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const DB_FILE = 'db.json';

// ===== DB =====
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// ===== UI =====
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📅 Запланировать', callback_data: 'plan' }],
      [{ text: '📖 Расписание', callback_data: 'schedule' }],
      [{ text: '📚 Домашка', callback_data: 'hw' }]
    ]
  }
};

// ===== STATE =====
const userState = {}; // память диалога

// ===== START =====
bot.onText(/\/start|\/bot|\/qudema/, (msg) => {
  bot.sendMessage(msg.chat.id,
`🤖 Привет! Я помощник

👇 Выбери действие:`,
    mainMenu
  );
});

// ===== CALLBACK =====
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  let db = readDB();
  if (!db[chatId]) db[chatId] = { lesson: null, homework: [], lastReminder: null };

  // ===== ПЛАНИРОВАНИЕ =====
  if (data === 'plan') {
    userState[chatId] = { step: 'choose_day' };

    bot.sendMessage(chatId,
`📅 Когда занятие?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Сегодня', callback_data: 'day_today' }],
            [{ text: 'Завтра', callback_data: 'day_tomorrow' }]
          ]
        }
      }
    );
  }

  if (data.startsWith('day_')) {
    const now = new Date();
    let date = new Date();

    if (data === 'day_tomorrow') {
      date.setDate(now.getDate() + 1);
    }

    userState[chatId] = { step: 'choose_time', date };

    bot.sendMessage(chatId,
`⏰ Выбери время:`,
      {
        reply_markup: {
          inline_keyboard: [
            ['16:00','17:00','18:00','19:00'].map(t => ({
              text: t,
              callback_data: `time_${t}`
            }))
          ]
        }
      }
    );
  }

  if (data.startsWith('time_')) {
    const time = data.replace('time_', '');
    const state = userState[chatId];

    if (!state) return;

    const [h, m] = time.split(':');

    state.date.setHours(h);
    state.date.setMinutes(m);

    db[chatId].lesson = state.date;
    db[chatId].lastReminder = null;

    writeDB(db);

    bot.sendMessage(chatId,
`✅ Запланировано:
${state.date.toLocaleString()}`,
      mainMenu
    );
  }

  // ===== РАСПИСАНИЕ =====
  if (data === 'schedule') {
    if (!db[chatId].lesson) {
      bot.sendMessage(chatId, '❌ Нет занятия', mainMenu);
    } else {
      bot.sendMessage(chatId,
        `📅 ${new Date(db[chatId].lesson).toLocaleString()}`,
        mainMenu
      );
    }
  }

  // ===== ДОМАШКА =====
  if (data === 'hw') {
    if (db[chatId].homework.length === 0) {
      bot.sendMessage(chatId, '📚 Нет домашки\n\nНапиши: домашка: текст');
    } else {
      bot.sendMessage(chatId,
        '📚 Домашка:\n\n' +
        db[chatId].homework.map((h, i) => `${i+1}. ${h}`).join('\n')
      );
    }
  }

  bot.answerCallbackQuery(query.id);
});

// ===== ТЕКСТ =====
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();

  let db = readDB();
  if (!db[chatId]) db[chatId] = { lesson: null, homework: [], lastReminder: null };

  // домашка
  if (text.startsWith('домашка')) {
    const hw = text.replace('домашка', '').replace(':', '').trim();

    if (!hw) {
      bot.sendMessage(chatId, 'Напиши: домашка: что сделать');
      return;
    }

    db[chatId].homework.push(hw);
    writeDB(db);

    bot.sendMessage(chatId, '✅ Добавлено');
  }
});

// ===== НАПОМИНАНИЕ =====
cron.schedule('* * * * *', () => {
  const db = readDB();

  Object.entries(db).forEach(([chatId, data]) => {
    if (!data.lesson) return;

    const now = new Date();
    const lesson = new Date(data.lesson);

    const diff = (lesson - now) / 60000;

    if (diff <= 10 && diff > 9) {
      if (data.lastReminder === 'sent') return;

      bot.sendMessage(chatId, '⏰ Через 10 минут занятие!');

      data.lastReminder = 'sent';
      writeDB(db);
    }
  });
});

console.log('🔥 ULTRA BOT READY');