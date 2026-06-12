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

// ===== STATE =====
const userState = {};

// ===== UTILS =====
function getNext7Days() {
  const days = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(now.getDate() + i);

    days.push({
      label: d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }),
      value: d.toISOString()
    });
  }

  return days;
}

function timeButtons() {
  return ['16:00','17:00','18:00','19:00','20:00'].map(t => ({
    text: t,
    callback_data: `time_${t}`
  }));
}

// ===== START =====
bot.onText(/\/start|\/bot|\/qudema/, (msg) => {
  bot.sendMessage(msg.chat.id,
`🤖 Привет!

Я сделаю всё сам 😎

👇 Выбери:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚡ Быстро (как обычно)', callback_data: 'fast' }],
          [{ text: '📅 Запланировать', callback_data: 'plan' }],
          [{ text: '📖 Расписание', callback_data: 'schedule' }],
          [{ text: '📚 Домашка', callback_data: 'hw' }]
        ]
      }
    }
  );
});

// ===== CALLBACK =====
bot.on('callback_query', (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  let db = readDB();
  if (!db[chatId]) {
    db[chatId] = {
      lesson: null,
      homework: [],
      reminders: [],
      lastTime: null
    };
  }

  // ⚡ КАК ОБЫЧНО
  if (data === 'fast') {
    if (!db[chatId].lastTime) {
      bot.sendMessage(chatId, '❌ Пока нет прошлого занятия');
      return;
    }

    const next = new Date();
    next.setDate(next.getDate() + 7);
    next.setHours(db[chatId].lastTime.h);
    next.setMinutes(db[chatId].lastTime.m);

    db[chatId].lesson = next;
    db[chatId].reminders = [];

    writeDB(db);

    bot.sendMessage(chatId,
`⚡ Назначено как обычно:
${next.toLocaleString()}`
    );
  }

  // 📅 ВЫБОР ДНЯ
  if (data === 'plan') {
    const days = getNext7Days();

    bot.sendMessage(chatId,
`📅 Выбери день:`,
      {
        reply_markup: {
          inline_keyboard: days.map(d => [{
            text: d.label,
            callback_data: `day_${d.value}`
          }])
        }
      }
    );
  }

  if (data.startsWith('day_')) {
    const date = new Date(data.replace('day_', ''));

    userState[chatId] = { date };

    bot.sendMessage(chatId,
`⏰ Выбери время:`,
      {
        reply_markup: {
          inline_keyboard: [timeButtons()]
        }
      }
    );
  }

  if (data.startsWith('time_')) {
    const time = data.replace('time_', '');
    const [h, m] = time.split(':');

    const state = userState[chatId];
    if (!state) return;

    state.date.setHours(h);
    state.date.setMinutes(m);

    db[chatId].lesson = state.date;
    db[chatId].lastTime = { h, m };
    db[chatId].reminders = [];

    writeDB(db);

    bot.sendMessage(chatId,
`✅ Готово:
${state.date.toLocaleString()}

🔁 Повторять каждую неделю?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Да', callback_data: 'repeat_yes' }],
            [{ text: 'Нет', callback_data: 'repeat_no' }]
          ]
        }
      }
    );
  }

  if (data === 'repeat_yes') {
    db[chatId].repeat = true;
    writeDB(db);
    bot.sendMessage(chatId, '🔁 Будет повторяться каждую неделю');
  }

  if (data === 'repeat_no') {
    db[chatId].repeat = false;
    writeDB(db);
    bot.sendMessage(chatId, 'Ок 👌');
  }

  // 📖 РАСПИСАНИЕ
  if (data === 'schedule') {
    if (!db[chatId].lesson) {
      bot.sendMessage(chatId, '❌ Нет занятия');
    } else {
      bot.sendMessage(chatId,
        `📅 ${new Date(db[chatId].lesson).toLocaleString()}`
      );
    }
  }

  // 📚 ДОМАШКА
  if (data === 'hw') {
    if (db[chatId].homework.length === 0) {
      bot.sendMessage(chatId, '📚 Нет домашки\n\nНапиши: домашка: текст');
    } else {
      bot.sendMessage(chatId,
        db[chatId].homework.map((h, i) => `${i+1}. ${h}`).join('\n')
      );
    }
  }

  bot.answerCallbackQuery(q.id);
});

// ===== ТЕКСТ =====
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();

  let db = readDB();
  if (!db[chatId]) db[chatId] = { lesson: null, homework: [], reminders: [] };

  // 📚 ДОМАШКА
  if (text.startsWith('домашка')) {
    const hw = text.replace('домашка', '').replace(':', '').trim();

    if (!hw) {
      bot.sendMessage(chatId, 'Напиши: домашка: текст');
      return;
    }

    db[chatId].homework.push(hw);
    writeDB(db);

    bot.sendMessage(chatId, '✅ Добавлено');
  }
});

// ===== НАПОМИНАНИЯ =====
cron.schedule('* * * * *', () => {
  const db = readDB();

  Object.entries(db).forEach(([chatId, data]) => {
    if (!data.lesson) return;

    const now = new Date();
    const lesson = new Date(data.lesson);

    const diff = (lesson - now) / 60000;

    const send = (min) => {
      if (diff <= min && diff > min - 1 && !data.reminders.includes(min)) {
        bot.sendMessage(chatId, `⏰ Через ${min} минут занятие`);
        data.reminders.push(min);
      }
    };

    send(60);
    send(30);
    send(10);

    // авто повтор
    if (diff < -5 && data.repeat) {
      const next = new Date(lesson);
      next.setDate(next.getDate() + 7);

      data.lesson = next;
      data.reminders = [];

      bot.sendMessage(chatId,
        `🔁 Новое занятие:
${next.toLocaleString()}`
      );
    }

    writeDB(db);
  });
});

console.log('🚀 FINAL BOSS BOT READY');