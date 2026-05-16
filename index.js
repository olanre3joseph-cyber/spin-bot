require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  PermissionsBitField
} = require('discord.js');

const sqlite3 = require('sqlite3').verbose();

/* ---------------- CONFIG ---------------- */

const ALLOWED_ROLE_ID = '1476817334126641237';

const CHANNEL_ID = '1502642107037388821';

/* ---------------- FIXED REWARDS ---------------- */

const rewards = [
  { reward: '300 steel', weight: 22 },
  { reward: '200 uranium', weight: 20 },
  { reward: '250k', weight: 18 },
  { reward: '$5M', weight: 10 },
  { reward: '1000 gasoline', weight: 10 },
  { reward: '1000 aluminium', weight: 5 },
  { reward: 'Try Again Tomorrow', weight: 5 },
  { reward: 'Try Again Tomorrow', weight: 5 },
  { reward: 'Try Again Tomorrow', weight: 5 },
  { reward: '$30M', weight: 1 }
];

/* ---------------- CLIENT ---------------- */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* ---------------- DATABASE ---------------- */

const db = new sqlite3.Database('/data/spins.db');

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS spins (
      userId TEXT,
      username TEXT,
      reward TEXT,
      date TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      userId TEXT PRIMARY KEY,
      username TEXT,
      spins INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0
    )
  `);

});

/* ---------------- REWARD SCORE ---------------- */

function getRewardScore(reward) {

  const r = reward.toLowerCase();

  if (r.includes('$30m')) return 500;
  if (r.includes('$5m')) return 100;
  if (r.includes('uranium')) return 40;
  if (r.includes('steel')) return 30;
  if (r.includes('gasoline')) return 50;
  if (r.includes('aluminium')) return 70;
  if (r.includes('try again')) return 0;

  return 10;
}

/* ---------------- WEIGHTED PICK ---------------- */

function pickWeightedReward() {

  const total = rewards.reduce(
    (sum, r) => sum + r.weight,
    0
  );

  let random = Math.random() * total;

  for (const r of rewards) {

    if (random < r.weight) {
      return r.reward;
    }

    random -= r.weight;
  }

}

/* ---------------- READY ---------------- */

client.once(Events.ClientReady, async () => {

  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    {
      name: 'leaderboard',
      description: 'Show top spin players'
    },
    {
      name: 'mystats',
      description: 'View your spin stats'
    },
    {
      name: 'spinhistory',
      description: 'View spin reward history',
      options: [
        {
          name: 'user',
          description: 'User to check',
          type: 6,
          required: false
        }
      ]
    },
    {
      name: 'claimrewards',
      description: 'Clear a player reward history',
      options: [
        {
          name: 'user',
          description: 'User to clear',
          type: 6,
          required: true
        }
      ]
    },
    {
      name: 'fullreset',
      description: 'Completely wipe all bot data'
    }
  ];

  const guildId = '1393443854514130974';

  const guild = await client.guilds.fetch(guildId);

  await guild.commands.set(commands);

  const channel =
    await client.channels.fetch(CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setTitle('🎰 Daily Spin')
    .setDescription(
      'Click below to spin once per day!'
    )
    .setColor('Blue');

  const button = new ButtonBuilder()
    .setCustomId('spin')
    .setLabel('SPIN')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder()
    .addComponents(button);

  await channel.send({
    embeds: [embed],
    components: [row]
  });

});

/* ---------------- COMMANDS ---------------- */

client.on(Events.InteractionCreate, async interaction => {

  if (!interaction.isChatInputCommand()) return;

  /* ---------------- LEADERBOARD ---------------- */

  if (interaction.commandName === 'leaderboard') {

    db.all(
      `SELECT * FROM stats
       ORDER BY score DESC
       LIMIT 10`,
      (err, rows) => {

        if (!rows.length) {

          return interaction.reply({
            content: 'No leaderboard data yet.',
            flags: 64
          });

        }

        let text = '';

        rows.forEach((r, i) => {

          text +=
            `#${i + 1} ${r.username} ` +
            `— Score: ${r.score} ` +
            `| Spins: ${r.spins}\n`;

        });

        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🏆 Spin Leaderboard')
              .setDescription(text)
              .setColor('Gold')
          ]
        });

      }
    );
  }

  /* ---------------- MY STATS ---------------- */

  if (interaction.commandName === 'mystats') {

    db.get(
      `SELECT * FROM stats
       WHERE userId = ?`,
      [interaction.user.id],
      (err, row) => {

        if (!row) {

          return interaction.reply({
            content: 'No stats yet.',
            flags: 64
          });

        }

        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('📊 Your Stats')
              .addFields(
                {
                  name: '🎰 Spins',
                  value: String(row.spins),
                  inline: true
                },
                {
                  name: '🏆 Score',
                  value: String(row.score),
                  inline: true
                }
              )
              .setColor('Blue')
          ],
          flags: 64
        });

      }
    );
  }

  /* ---------------- SPIN HISTORY ---------------- */

  if (interaction.commandName === 'spinhistory') {

    const target =
      interaction.options.getUser('user') ||
      interaction.user;

    db.all(
      `SELECT * FROM spins
       WHERE userId = ?
       ORDER BY rowid DESC`,
      [target.id],
      (err, rows) => {

        if (!rows.length) {

          return interaction.reply({
            content: 'No spin history found.',
            flags: 64
          });

        }

        let text = '';

        rows.forEach(r => {

          text += `${r.date} → ${r.reward}\n`;

        });

        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `📜 ${target.username}'s Spin History`
              )
              .setDescription(text.slice(0, 4000))
              .setColor('Blue')
          ]
        });

      }
    );
  }

  /* ---------------- CLAIM REWARDS ---------------- */

  if (interaction.commandName === 'claimrewards') {

    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {

      return interaction.reply({
        content: '❌ No permission.',
        flags: 64
      });

    }

    const target =
      interaction.options.getUser('user');

    db.run(
      `DELETE FROM spins
       WHERE userId = ?`,
      [target.id],
      async () => {

        await interaction.reply({
          content:
            `✅ Cleared reward history for ${target.username}`,
          flags: 64
        });

      }
    );
  }

  /* ---------------- FULL RESET ---------------- */

  if (interaction.commandName === 'fullreset') {

    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {

      return interaction.reply({
        content: '❌ No permission.',
        flags: 64
      });

    }

    db.run(`DELETE FROM spins`);

    db.run(`DELETE FROM stats`);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Full Reset Complete')
          .setDescription(
            'All spin history and leaderboard data have been wiped.'
          )
          .setColor('Red')
      ],
      flags: 64
    });

  }

});

/* ---------------- SPIN SYSTEM ---------------- */

client.on(Events.InteractionCreate, async interaction => {

  if (!interaction.isButton()) return;

  if (interaction.customId === 'spin') {

    const member = interaction.member;

    /* ROLE CHECK */

    if (
      !member.roles.cache.has(ALLOWED_ROLE_ID)
    ) {

      return interaction.reply({
        content:
          '❌ You are not allowed to spin.',
        flags: 64
      });

    }

    const today =
      new Date().toDateString();

    db.get(
      `SELECT * FROM spins
       WHERE userId = ?
       AND date = ?`,
      [interaction.user.id, today],
      async (err, row) => {

        if (row) {

          return interaction.reply({
            content:
              '❌ You already spun today.',
            flags: 64
          });

        }

        const reward =
          pickWeightedReward();

        const score =
          getRewardScore(reward);

        /* SAVE SPIN */

        db.run(
          `INSERT INTO spins
           VALUES (?, ?, ?, ?)`,
          [
            interaction.user.id,
            interaction.user.username,
            reward,
            today
          ]
        );

        /* UPDATE STATS */

        db.get(
          `SELECT * FROM stats
           WHERE userId = ?`,
          [interaction.user.id],
          (err, row) => {

            if (!row) {

              db.run(
                `INSERT INTO stats
                (userId, username, spins, score)
                VALUES (?, ?, 1, ?)`,
                [
                  interaction.user.id,
                  interaction.user.username,
                  score
                ]
              );

            } else {

              db.run(
                `UPDATE stats
                 SET spins = spins + 1,
                     score = score + ?
                 WHERE userId = ?`,
                [
                  score,
                  interaction.user.id
                ]
              );

            }

          }
        );

        /* JACKPOT CHECK */

        const rewardData =
          rewards.find(r => r.reward === reward);

        const isJackpot =
          rewardData.weight <= 1;

        if (isJackpot) {

          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('💰 JACKPOT!')
                .setDescription(
                  `🎉 ${interaction.user} hit the JACKPOT!\n\n🏆 ${reward}`
                )
                .setColor('Gold')
            ]
          });

        } else {

          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('🎉 Spin Result')
                .setDescription(
                  `${interaction.user} won:\n\n🏆 ${reward}`
                )
                .setColor('Green')
            ]
          });

        }

      }
    );
  }

});

/* ---------------- LOGIN ---------------- */

client.login(process.env.TOKEN);
