const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const helper = require('./helper');
const kb = require('./keyboard-buttons');
const keyboard = require('./keyboard');
const mongoose = require('mongoose');
const database = require('../database.json');
const geolib = require('geolib');
const _ = require('lodash');

helper.logStart();

mongoose.Promise = global.Promise;
mongoose.connect(config.DB_URL)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log(err));

require('./models/film.model');
require('./models/cinema.model');

const Film = mongoose.model('films');
const Cinema = mongoose.model('cinemas');
// database.cinemas.forEach(c => new Cinema(c).save());

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
    case kb.film.comedy:
      sendFilmsByQuery(chatId, {type: 'comedy'})
      break;
    case kb.film.action:
      sendFilmsByQuery(chatId, {type: 'action'})
      break;
    case kb.film.random:
      sendFilmsByQuery(chatId, {})
      break;
    case kb.home.cinemas:
      bot.sendMessage(chatId, `Send location`, {
        reply_markup: {
          keyboard: keyboard.cinemas
        }
      });
      break
    case kb.back:
      bot.sendMessage(chatId, 'What would you like to watch?', {
        reply_markup: {
          keyboard: keyboard.home
        }
      });
      break
  }

  if(msg.location) {
    getCinemasInCoords(chatId, msg.location);
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

bot.onText(/\/f(.+)/, (msg, [source, match]) => {
  const filmUuid = helper.getItemUuid(source);
  const chatId = helper.getChatId(msg);
  Film.findOne({uuid: filmUuid}).then(film => {
    const caption = `Name: ${film.name}\nYear: ${film.year}\Ratio: ${film.rate}\nLength: ${film.length}\nCountry: ${film.country}`
    bot.sendPhoto(chatId, film.picture, {
      caption: caption,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Add to favourite',
              callback_data: ''
            },
            {
              text: 'Show cinemas',
              callback_data: ''
            }
          ],
          [
            {
              text: `Kinopoisk ${film.name}`,
              url: film.link
            }
          ]
        ]
      }
    })
  })
});
function sendFilmsByQuery(chatId, query) {
  Film.find(query).then(films => {
    const html = films.map((f, i) => {
      return `<b>${i + 1}</b> ${f.name} - /f${f.uuid}`
    }).join('\n');

    sendHTML(chatId, html, 'films');
  })
}

function sendHTML(chatId, html, kbName = null) {
  const options = {
    parse_mode: 'HTML'
  }
  if(kbName) {
    options['reply_markup'] = {
      keyboard: keyboard[kbName]
    }
  }

  bot.sendMessage(chatId, html, options);
}

function getCinemasInCoords(chatId, location) {
  Cinema.find({}).then(cinemas => {
    cinemas.forEach(c => {
      c.distance = geolib.getDistance(location, c.location) / 1000;
    });

    cinemas = _.sortBy(cinemas, 'distance');
    const html = cinemas.map((c, i) => {
      return `<b>${i + 1}</b> ${c.name}. <em>Distance</em> - <strong>${c.distance}</strong>km. /c${c.uuid}`
    }).join('\n');
    sendHTML(chatId, html, 'home');
  })
}