require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Храним данные Насти прямо в коде
const nastyaData = {
  name: 'Настя',
  class: '11 класс',
  schedule: 'Каждую среду в 17:00',
  // Сюда ты можешь вписывать актуальное домашнее задание
  homework: 'Порешать 7 номер на сайте КЕГЭ (10 задач).'
};

// Команда /start (для лички или при первом запуске в чате)
bot.start((ctx) => {
  ctx.reply(
    `Привет! Я бот-помощник онлайн-школы Qudema.\n\n` +
    `Доступные команды в этом чате:\n` +
    `📅 /schedule — посмотреть расписание\n` +
    `📝 /dz — посмотреть актуальное д/з`
  );
});

// Команда для просмотра расписания
bot.command('schedule', (ctx) => {
  ctx.reply(
    `📅 *Следующее занятие (${nastyaData.class}):*\n\n` +
    `• День: *10 августа*\n` +
    `• Время: *17:00*\n\n` +
    `• Продолжительность: *2 часа*\n\n` +
    `_Пожалуйста, не опаздывай! Если нужно перенести — предупреди заранее._`,
    { parse_mode: 'Markdown' }
  );
});

// Команда для просмотра домашнего задания
bot.command('dz', (ctx) => {
  ctx.reply(
    `📝 *Актуальное домашнее заданиe:*\n\n` +
    `${nastyaData.homework}\n\n` +
    `Выполни до следующей среды!`,
    { parse_mode: 'Markdown' }
  );
});

// Дополнительно: Бот будет вежливо приветствовать, если кто-то упомянет его или поздоровается
bot.on('text', (ctx) => {
  const messageText = ctx.message.text.toLowerCase();
  
  if (messageText.includes('привет бот') || messageText.includes('привет, бот')) {
    ctx.reply(`Привет, ${ctx.from.first_name}! Чем могу помочь? Используй команды /schedule или /dz 🚀`);
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('🚀 Персональный бот-ассистент запущен!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));