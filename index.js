require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const mongoose = require('mongoose');

// ===== TIMEZONE =====
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tz = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(tz);

const TZ = 'Asia/Novosibirsk';

// ===== DB =====
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.log(err));

const userSchema = new mongoose.Schema({
  chatId: Number,
  lesson: String,
  homework: [String],
  wishes: [String],
  reminders: [Number],
  lastTime: Object
});

const User = mongoose.model('User', userSchema);

// ===== BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const state = {};

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
bot.onText(/\/start|\/bot|\/qudema/, async (msg) => {
  await User.findOneAndUpdate(
    { chatId: msg.chat.id },
    { chatId: msg.chat.id },
    { upsert: true }
  );

  bot.sendMessage(msg.chat.id, '👇 Выбери:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚡ Быстро', callback_data: 'fast' }],
        [{ text: '📅 Запланировать', callback_data: 'plan' }],
        [{ text: '📖 Расписание', callback_data: 'schedule' }],
        [{ text: '📚 Домашка', callback_data: 'hw' }],
        [{ text: '🎯 Желания', callback_data: 'wish' }]
      ]
    }
  });
});

// ===== CALLBACK =====
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  const user = await User.findOne({ chatId });

  // 📅 план
  if (data === 'plan') {
    const days = getNext7Days();

    return bot.sendMessage(chatId, '📅 Выбери день:', {
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
    state[chatId] = { date };

    return bot.sendMessage(chatId, '⏰ Выбери или введи время:', {
      reply_markup: { inline_keyboard: timeButtons() }
    });
  }

  if (data === 'custom_time') {
    state[chatId].awaitingTime = true;
    return bot.sendMessage(chatId, 'Введи время HH:MM');
  }

  if (data.startsWith('time_')) {
    return setTime(chatId, data.replace('time_', ''));
  }

  // 📖 расписание
  if (data === 'schedule') {
    if (!user.lesson) return bot.sendMessage(chatId, '❌ Нет занятия');
    return bot.sendMessage(chatId, `📅 ${formatDate(user.lesson)}`);
  }

  // 📚 домашка (с кнопками)
  if (data === 'hw') {
    if (!user.homework.length) {
      return bot.sendMessage(chatId, 'Нет домашки\nНапиши: домашка: текст');
    }

    user.homework.forEach((h, i) => {
      bot.sendMessage(chatId, `${i+1}. ${h}`, {
        reply_markup: {
          inline_keyboard: [[
            { text: '❌', callback_data: `del_hw_${i}` },
            { text: '✏️', callback_data: `edit_hw_${i}` }
          ]]
        }
      });
    });
  }

  // 🎯 желания (с кнопками)
  if (data === 'wish') {
    if (!user.wishes.length) {
      return bot.sendMessage(chatId, 'Нет желаний\nНапиши: желание: текст');
    }

    user.wishes.forEach((w, i) => {
      bot.sendMessage(chatId, `${i+1}. ${w}`, {
        reply_markup: {
          inline_keyboard: [[
            { text: '❌', callback_data: `del_w_${i}` },
            { text: '✏️', callback_data: `edit_w_${i}` }
          ]]
        }
      });
    });
  }

  // ❌ удаление
  if (data.startsWith('del_hw_')) {
    user.homework.splice(data.split('_')[2], 1);
    await user.save();
    return bot.sendMessage(chatId, 'Удалено');
  }

  if (data.startsWith('del_w_')) {
    user.wishes.splice(data.split('_')[2], 1);
    await user.save();
    return bot.sendMessage(chatId, 'Удалено');
  }

  // ✏️ редактирование
  if (data.startsWith('edit_hw_')) {
    state[chatId] = { type: 'hw', index: data.split('_')[2] };
    return bot.sendMessage(chatId, 'Введи новый текст');
  }

  if (data.startsWith('edit_w_')) {
    state[chatId] = { type: 'wish', index: data.split('_')[2] };
    return bot.sendMessage(chatId, 'Введи новый текст');
  }

  bot.answerCallbackQuery(q.id);
});

// ===== УСТАНОВКА ВРЕМЕНИ =====
async function setTime(chatId, time) {
  const user = await User.findOne({ chatId });

  const [h, m] = time.split(':');
  const date = state[chatId].date.hour(h).minute(m);

  user.lesson = date.toISOString();
  user.lastTime = { h, m };
  user.reminders = [];

  await user.save();

  bot.sendMessage(chatId, `✅ ${formatDate(date)}`);
}

// ===== TEXT =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();

  if (!text) return;

  let user = await User.findOne({ chatId });
  if (!user) user = await User.create({ chatId, homework: [], wishes: [] });

  // редактирование
  if (state[chatId]) {
    if (state[chatId].awaitingTime) {
      const match = text.match(/^([0-2]?\d):([0-5]\d)$/);
      if (!match) return bot.sendMessage(chatId, 'Ошибка формата');

      state[chatId].awaitingTime = false;
      return setTime(chatId, text);
    }

    if (state[chatId].type === 'hw') {
      user.homework[state[chatId].index] = text;
    }

    if (state[chatId].type === 'wish') {
      user.wishes[state[chatId].index] = text;
    }

    await user.save();
    state[chatId] = null;

    return bot.sendMessage(chatId, '✏️ Обновлено');
  }

  // добавление
  if (text.startsWith('домашка')) {
    const t = text.replace('домашка','').replace(':','').trim();
    user.homework.push(t);
    await user.save();
    return bot.sendMessage(chatId, '✅ добавлено');
  }

  if (text.startsWith('желание')) {
    const t = text.replace('желание','').replace(':','').trim();
    user.wishes.push(t);
    await user.save();
    return bot.sendMessage(chatId, '🎯 добавлено');
  }
});

// ===== CRON =====
cron.schedule('* * * * *', async () => {
  const users = await User.find();

  users.forEach(async (user) => {
    if (!user.lesson) return;

    const now = nowNSK();
    const lesson = dayjs(user.lesson).tz(TZ);

    const diff = lesson.diff(now, 'minute');

    const send = (min) => {
      if (diff <= min && diff > min - 1 && !user.reminders.includes(min)) {
        bot.sendMessage(user.chatId, `⏰ Через ${min} минут занятие`);
        user.reminders.push(min);
      }
    };

    send(60);
    send(30);
    send(10);

    await user.save();
  });
});

console.log('🔥 FULL MONGO BOT READY');