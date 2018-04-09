const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const helper = require('./helper');
const kb = require('./keyboard-buttons');
const keyboard = require('./keyboard');
const mongoose = require('mongoose');

helper.logStart();

mongoose.connect(config.DB_URL, {
  useMongoClient: true
}).then(() => console.log('MongoDB connected'))
  .catch((err) => console.log(err));

const bot = new TelegramBot(config.TOKEN, {
  polling: true
});

bot.on('message', msg => {
  console.log('Working', msg.from.first_name);
  const chatId = helper.getChatId(msg);

  switch(msg.text) {
    case kb.home.favourite:
      break;
    case kb.home.films:
      bot.sendMessage(chatId, 'Select jenre', {
        reply_markup: {
          keyboard: keyboard.films
        }
      });
      break;
    case kb.home.cinemas:
      break
    case kb.back:
      bot.sendMessage(chatId, 'What would you like to watch?', {
        reply_markup: {
          keyboard: keyboard.home
        }
      });
      break
  }
});

bot.onText(/\/start/, msg => {
  const text = `Hello, ${msg.from.first_name}\nPlease, check the command for start the work:`;
  bot.sendMessage(helper.getChatId(msg), text, {
    reply_markup: {
      keyboard: keyboard.home
    }
  });
});