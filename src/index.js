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
require('./models/user.model');

const Film = mongoose.model('films');
const Cinema = mongoose.model('cinemas');
const User = mongoose.model('users');

// database.films.forEach(f => new Film(f).save());
// database.cinemas.forEach(c => new Cinema(c).save());

const ACTION_TYPE = {
  TOGGLE_FAV_FILM: 'tff',
  SHOW_CINEMAS: 'sc',
  SHOW_CINEMAS_MAP: 'scm',
  SHOW_FILMS: 'sf'
}

const bot = new TelegramBot(config.TOKEN, {
  polling: true
});

bot.on('message', msg => {
  console.log('Working', msg.from.first_name);
  const chatId = helper.getChatId(msg);

  switch(msg.text) {
    case kb.home.favourite:
      showFavouriteFilms(chatId, msg.from.id)
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

  Promise.all([
    Film.findOne({uuid: filmUuid}),
    User.findOne({telegramId: msg.from.id})
  ]).then(([film, user]) => {
    let isFav = false;

    if(user) {
      isFav = user.films.indexOf(film.uuid) !== -1
    }

    const favText = isFav ? 'Delete from favourite' : 'Add to favourite'

    const caption = `Name: ${film.name}\nYear: ${film.year}\Ratio: ${film.rate}\nLength: ${film.length}\nCountry: ${film.country}`
    bot.sendPhoto(chatId, film.picture, {
      caption: caption,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: favText,
              callback_data: JSON.stringify({
                type: ACTION_TYPE.TOGGLE_FAV_FILM,
                filmUuid: film.uuid,
                isFav: isFav
              })
            },
            {
              text: 'Show cinemas',
              callback_data: JSON.stringify({
                type: ACTION_TYPE.SHOW_CINEMAS,
                cinemaUuids: film.cinemas
              })
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

bot.onText(/\/c(.+)/, (msg, [source, match]) => {
  const cinemaUuid = helper.getItemUuid(source);
  const chatId = helper.getChatId(msg);
  Cinema.findOne({uuid: cinemaUuid}).then(cinema => {
    bot.sendMessage(chatId, `Cinema ${cinema.name}`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: cinema.name,
              url: cinema.url
            },
            {
              text: 'Show the map',
              callback_data: JSON.stringify({
                type: ACTION_TYPE.SHOW_CINEMAS_MAP,
                lat: cinema.location.latitude,
                lon: cinema.location.longitude
              })
            }
          ],
          [
            {
              text: 'Show the films',
              callback_data: JSON.stringify({
                type: ACTION_TYPE.SHOW_FILMS,
                filmUuids: cinema.films
              })
            }
          ]
        ]
      }
    });
  });
});

bot.on('callback_query', query => {
  const userId = query.from.id;
  let data

  try {
    data = JSON.parse(query.data);
  } catch (error) {
    throw new Error('Data is not an object');
  }

  const { type } = data;
  if(type === ACTION_TYPE.SHOW_CINEMAS_MAP) {
    const {lat, lon} = data;
    bot.sendLocation(query.message.chat.id, lat, lon);
  } else if(type === ACTION_TYPE.SHOW_CINEMAS) {
    sendCinemasByQuery(userId, {uuid: {'$in': data.cinemaUuids}})
  } else if(type === ACTION_TYPE.TOGGLE_FAV_FILM) {
    togglefavouriteFilm(userId, query.id, data);
  } else if(type === ACTION_TYPE.SHOW_FILMS) {
    sendFilmsByQuery(userId, {uuid: {'$in': data.filmUuids}})
  }
});

bot.on('inline_query', query => {
  Film.find({}).then(films => {
    const results = films.map(f => {
      return {
        id: f.uuid,
        type: 'photo',
        photo_url: f.picture,
        thumb_url: f.picture,
        caption: `Name: ${f.name}\nYear: ${f.year}\Ratio: ${f.rate}\nLength: ${f.length}\nCountry: ${f.country}`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Kinopoisk: ${f.name}`,
                url: f.link
              }
            ]
          ]
        }
      }
    });

    bot.answerInlineQuery(query.id, results, {
      cache_time: 0
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

function togglefavouriteFilm(userId, queryId, { filmUuid, isFav}) {
  let userPromise;

  User.findOne({telegramId: userId}).then(user => {
    if(user) {
      if(isFav) {
        user.films = user.films.filter(fUuid => fUuid !== filmUuid)
      } else {
        user.films.push(filmUuid);
      }
      userPromise = user;
    } else {
      userPromise = new User({
        telegramId: userId,
        films: [filmUuid]
      })
    }

    const answertext = isFav ? 'Deleted' : 'Add';

    userPromise.save().then(_ => {
      bot.answerCallbackQuery({
        callback_query_id: queryId,
        text: ''
      })
    }).catch(err => console.log(err));
  }).catch(err => console.log(err));
}

function showFavouriteFilms(chatId, telegramId) {
  User.findOne({telegramId}).then(user => {
    if(user) {
      Film.find({uuid: {'$in': user.films}}).then(films => {
        let html;
        if(films.length) {
          html = films.map((f, i) => {
            return `<b>${i + 1}</b> ${f.name} - <b>${f.rate} (/f${f.uuid})</b>`
          }).join('\n');
        } else {
          html = 'You dont added nothing yet';
          sendHTML(chatId, html, 'home');
        }
      }).catch(err => console.log(err));
    } else {
      sendHTML(chatId, 'You dont added nothing yet', 'home');
    }
  }).catch(err => console.log(err));
}

function sendCinemasByQuery(userId, query) {
  Cinema.find(query).then(cinemas => {
    const html = cinemas.map((c, i) => {
      return `<b>${i + 1}</b> ${c.name} - /c${c.uuid}`
    }).join('\n');

    sendHTML(userId, html, 'home')
  })
}