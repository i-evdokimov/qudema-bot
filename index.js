require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const cron = require('node-cron');

// ===== TIMEZONE =====
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tz = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(tz);

const TZ = 'Asia/Novosibirsk';

// ===== BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const DB_FILE = 'db.json';

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({}));
}

const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const userState = {};

// ===== HELPERS =====
function nowNSK() {
  return dayjs().tz(TZ);
}

function formatDate(d) {
  return dayjs(d).tz(TZ).format('DD.MM.YYYY HH:mm');
}

function getNext7Days() {
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = nowNSK().add(i, 'day');

    days.push({
      label: d.format('dd D'),
      value: d.toISOString()
    });
  }

  return days;
}

function timeButtons() {
  return [
    ['16:00','17:00','18:00','19:00','20:00'].map(t => ({
      text: t,
      callback_data: `time_${t}`
    })),
    [{ text: '✏️ Ввести время', callback_data: 'custom_time' }]
  ];
}

// ===== START =====
bot.onText(/\/start|\/bot|\/qudema/, (msg) => {
  bot.sendMessage(msg.chat.id,
`🤖 Привет!

👇 Выбери:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚡ Быстро', callback_data: 'fast' }],
          [{ text: '📅 Запланировать', callback_data: 'plan' }],
          [{ text: '📖 Расписание', callback_data: 'schedule' }],
          [{ text: '📚 Домашка', callback_data: 'hw' }],
          [{ text: '🎯 Желания', callback_data: 'wish' }]
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
      wishes: [],
      reminders: [],
      lastTime: null
    };
  }

  if (data === 'plan') {
    const days = getNext7Days();

    bot.sendMessage(chatId, '📅 Выбери день:', {
      reply_markup: {
        inline_keyboard: days.map(d => [{
          text: d.label,
          callback_data: `day_${d.value}`
        }])
      }
    });
  }

  if (data.startsWith('day_')) {
    const date = dayjs(data.replace('day_', '')).tz(TZ);
    userState[chatId] = { date };

    bot.sendMessage(chatId, '⏰ Выбери или введи время:', {
      reply_markup: {
        inline_keyboard: timeButtons()
      }
    });
  }

  if (data === 'custom_time') {
    userState[chatId].awaitingTime = true;
    bot.sendMessage(chatId, '✏️ Введи время в формате HH:MM (например 18:30)');
  }

  if (data.startsWith('time_')) {
    const time = data.replace('time_', '');
    setTime(chatId, time);
  }

  if (data === 'schedule') {
    if (!db[chatId].lesson) {
      bot.sendMessage(chatId, '❌ Нет занятия');
    } else {
      bot.sendMessage(chatId, `📅 ${formatDate(db[chatId].lesson)}`);
    }
  }

  if (data === 'hw') {
    if (!db[chatId].homework.length) {
      bot.sendMessage(chatId, '📚 Нет домашки\nНапиши: домашка: текст');
    } else {
      bot.sendMessage(chatId,
        db[chatId].homework.map((h, i) => `${i+1}. ${h}`).join('\n')
      );
    }
  }

  if (data === 'wish') {
    if (!db[chatId].wishes.length) {
      bot.sendMessage(chatId, '🎯 Нет желаний\nНапиши: желание: текст');
    } else {
      bot.sendMessage(chatId,
        db[chatId].wishes.map((w, i) => `${i+1}. ${w}`).join('\n')
      );
    }
  }

  bot.answerCallbackQuery(q.id);
});

// ===== УСТАНОВКА ВРЕМЕНИ =====
function setTime(chatId, time) {
  let db = readDB();
  const [h, m] = time.split(':');

  const state = userState[chatId];
  if (!state) return;

  const date = state.date.hour(h).minute(m);

  db[chatId].lesson = date.toISOString();
  db[chatId].lastTime = { h, m };
  db[chatId].reminders = [];

  writeDB(db);

  bot.sendMessage(chatId, `✅ Готово:\n${formatDate(date)}`);
}

// ===== TEXT =====
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();

  if (!text) return;

  let db = readDB();
  if (!db[chatId]) db[chatId] = { lesson: null, homework: [], wishes: [], reminders: [] };

  // кастомное время
  if (userState[chatId]?.awaitingTime) {
    const match = text.match(/^([0-2]?\d):([0-5]\d)$/);

    if (!match) {
      bot.sendMessage(chatId, '❌ Неверный формат. Пример: 18:30');
      return;
    }

    userState[chatId].awaitingTime = false;
    setTime(chatId, text);
    return;
  }

  // домашка
  if (text.startsWith('домашка')) {
    const hw = text.replace('домашка', '').replace(':', '').trim();

    if (!hw) return bot.sendMessage(chatId, 'Напиши: домашка: текст');

    db[chatId].homework.push(hw);
    writeDB(db);

    bot.sendMessage(chatId, '✅ Добавлено');
  }

  // желания
  if (text.startsWith('желание')) {
    const wish = text.replace('желание', '').replace(':', '').trim();

    if (!wish) return bot.sendMessage(chatId, 'Напиши: желание: текст');

    db[chatId].wishes.push(wish);
    writeDB(db);

    bot.sendMessage(chatId, '🎯 Добавлено');
  }
});

// ===== CRON =====
cron.schedule('* * * * *', () => {
  const db = readDB();

  Object.entries(db).forEach(([chatId, data]) => {
    if (!data.lesson) return;

    const now = nowNSK();
    const lesson = dayjs(data.lesson).tz(TZ);

    const diff = lesson.diff(now, 'minute');

    const send = (min) => {
      if (diff <= min && diff > min - 1 && !data.reminders.includes(min)) {
        bot.sendMessage(chatId, `⏰ Через ${min} минут занятие`);
        data.reminders.push(min);
      }
    };

    send(60);
    send(30);
    send(10);

    writeDB(db);
  });
});

console.log('🚀 BOT UPGRADED');