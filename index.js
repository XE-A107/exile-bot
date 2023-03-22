const Discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const moment = require('moment-timezone');
const axios = require('axios');
const client = new Discord.Client();

const db = new sqlite3.Database('./player_data.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    db.run(`CREATE TABLE IF NOT EXISTS player_data (
            user_id TEXT PRIMARY KEY,
            availability TEXT,
            timezone TEXT
            )`, (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
      }
    });
  }
});

async function checkPublicHolidayStatus() {
  try {
    const response = await axios.get('https://elitebgs.app/api/ebgs/v5/factions', {
      params: {
        name: 'Rackham Capital Investments',
      },
    });

    const result = response.data;
    const holidayStatus = { active: false, pending: false };

    for (const element of result.docs) {
      for (const system of element.faction_presence) {
        if (system.active_states) {
          for (const activeState of system.active_states) {
            if (activeState.state === 'publicholiday') {
              holidayStatus.active = true;
            }
          }
        }

        if (system.pending_states) {
          for (const pendingState of system.pending_states) {
            if (pendingState.state === 'publicholiday') {
              holidayStatus.pending = true;
            }
          }
        }
      }
    }

    return holidayStatus;
  } catch (error) {
    console.error('Error checking for public holiday:', error);
    return { active: false, pending: false };
  }
}

client.on('message', async (message) => {
  if (message.author.bot) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const userId = message.author.id;
  const requestorTimezone = await getTimezone(userId);

  switch (command) {
    case 'rackham_holiday':
      const holidayStatus = await checkPublicHolidayStatus();

      if (holidayStatus.active) {
        message.reply("There is a public holiday at Rackham's (HIP 58832) right now.");
      } else if (holidayStatus.pending) {
        message.reply("There is a public holiday pending at Rackham's (HIP 58832).");
      } else {
        message.reply("There is no public holiday at Rackham's (HIP 58832) currently.");
      }
      break;

    case 'set_availability':
        const targetUserSet = message.mentions.users.first();
        const timeRange = args[0];

        if (!targetUserSet || !timeRange) {
            message.reply('Please provide a user and time range: /set_availability @name HH:MM-HH:MM');
            break;
        }

        const userIdSet = targetUserSet.id;

        db.run('INSERT OR REPLACE INTO player_data (user_id, availability) VALUES (?, ?)', [userIdSet, timeRange], (err) => {
            if (err) {
            console.error(err);
            message.reply('There was an error setting the availability.');
            } else {
            message.reply(`Availability for ${targetUserSet.username} has been set to: ${timeRange}`);
            }
        });
        break;


    case 'set_tz':
        const targetUserTz = message.mentions.users.first();
        const timezone = args[0];

        if (!targetUserTz || !timezone) {
            message.reply('Please provide a user and timezone: /set_tz @name Timezone');
            break;
        }

        if (!moment.tz.zone(timezone)) {
            message.reply('Invalid timezone provided. Please use a valid IANA timezone.');
            break;
        }

        const userIdTz = targetUserTz.id;

        db.run('INSERT OR REPLACE INTO player_data (user_id, timezone) VALUES (?, ?)', [userIdTz, timezone], (err) => {
            if (err) {
            console.error(err);
            message.reply('There was an error setting the timezone.');
            } else {
            message.reply(`Timezone for ${targetUserTz.username} has been set to: ${timezone}`);
            }
        });
        break;


    case 'get_availability':
        const targetUserGet = message.mentions.users.first();

        if (!targetUserGet) {
            message.reply('Please mention a user: /get_availability @name');
            break;
        }

        const userIdGet = targetUserGet.id;

        db.get('SELECT availability, timezone FROM player_data WHERE user_id = ?', [userIdGet], (err, row) => {
            if (err) {
            console.error(err);
            message.reply('There was an error fetching the availability.');
            } else if (!row) {
            message.reply(`${targetUserGet.username} has not set their availability.`);
            } else {
            const [start, end] = row.availability.split('-');
            const startTime = moment.tz(`${start} ${row.timezone}`, 'HH:mm Z');
            const endTime = moment.tz(`${end} ${row.timezone}`, 'HH:mm Z');

            const localStartTime = startTime.clone().tz(requestorTimezone).format('HH:mm');
            const localEndTime = endTime.clone().tz(requestorTimezone).format('HH:mm');

            message.reply(`Availability for ${targetUserGet.username} (${row.timezone}): ${row.availability} | Your local time (${requestorTimezone}): ${localStartTime}-${localEndTime}`);
            }
        });
        break;


            case 'available_now':
        db.all('SELECT user_id, availability, timezone FROM player_data', [], (err, rows) => {
            if (err) {
            console.error(err);
            message.reply('There was an error fetching player data.');
            } else {
            const availablePlayers = [];

            for (const player of rows) {
                const [start, end] = player.availability.split('-');
                const startTime = moment.tz(`${start} ${player.timezone}`, 'HH:mm Z');
                const endTime = moment.tz(`${end} ${player.timezone}`, 'HH:mm Z');

                const localStartTime = startTime.clone().tz(requestorTimezone);
                const localEndTime = endTime.clone().tz(requestorTimezone);

                const localCurrentTime = moment().tz(requestorTimezone);

                if (localCurrentTime.isBetween(localStartTime, localEndTime, undefined, '[)')) {
                availablePlayers.push(client.users.cache.get(player.user_id).username);
                }
            }

            if (availablePlayers.length > 0) {
                message.reply(`Players available right now: ${availablePlayers.join(', ')}`);
            } else {
                message.reply('No players are available right now.');
            }
            }
        });
        break;


    // ... other cases ...
  }
});

client.login('your_bot_token');
