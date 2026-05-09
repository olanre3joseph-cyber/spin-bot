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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const db = new sqlite3.Database('./spins.db');

/* ---------------- DATABASE ---------------- */

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
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reward TEXT,
      weight INTEGER
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

/* ---------------- REWARD SCORING ---------------- */

function getRewardScore(reward) {

  const r = reward.toLowerCase();

  if (r.includes('$10m')) return 100;
  if (r.includes('$50k')) return 10;
  if (r.includes('food')) return 5;
  if (r.includes('aluminium')) return 15;
  if (r.includes('war chest')) return 200;
  if (r.includes('lucky')) return 80;
  if (r.includes('try again')) return 0;

  return 10;
}

/* ---------------- WEIGHTED PICK ---------------- */

function pickWeightedReward(rewards) {

  const total = rewards.reduce((s, r) => s + r.weight, 0);

  let random = Math.random() * total;

  for (const r of rewards) {
    if (random < r.weight) return r.reward;
    random -= r.weight;
  }

}

/* ---------------- READY ---------------- */

client.once(Events.ClientReady, async () => {

  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    {
      name: 'addreward',
      description: 'Add reward with weight',
      options: [
        {
          name: 'reward',
          type: 3,
          description: 'Reward name',
          required: true
        },
        {
          name: 'weight',
          type: 4,
          description: 'Chance weight (higher = more common)',
          required: true
        }
      ]
    },
    {
      name: 'removereward',
      description: 'Remove reward',
      options: [
        {
          name: 'id',
          type: 4,
          description: 'Reward ID',
          required: true
        }
      ]
    },
    {
      name: 'listrewards',
      description: 'Show all rewards'
    },
    {
      name: 'resetspins',
      description: 'Reset all spins (admin only)'
    },
    {
      name: 'leaderboard',
      description: 'Show top players'
    },
    {
      name: 'mystats',
      description: 'View your stats'
    }
  ];

  const guildId = '1393443854514130974';
  const channelId = '1502642107037388821';

  const guild = await client.guilds.fetch(guildId);
  await guild.commands.set(commands);

  const channel = await client.channels.fetch(channelId);

  const embed = new EmbedBuilder()
    .setTitle('🎰 Daily Spin')
    .setDescription('Click the button to spin once per day!')
    .setColor('Blue');

  const button = new ButtonBuilder()
    .setCustomId('spin')
    .setLabel('SPIN')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(button);

  await channel.send({
    embeds: [embed],
    components: [row]
  });

});

/* ---------------- COMMANDS ---------------- */

client.on(Events.InteractionCreate, async interaction => {

  if (!interaction.isChatInputCommand()) return;

  /* ADD REWARD */
  if (interaction.commandName === 'addreward') {

    const reward = interaction.options.getString('reward');
    const weight = interaction.options.getInteger('weight');

    db.get(`SELECT COUNT(*) as count FROM rewards`, (err, row) => {

      if (row.count >= 10) {
        return interaction.reply({ content: '❌ Max 10 rewards.', flags: 64 });
      }

      db.run(
        `INSERT INTO rewards (reward, weight) VALUES (?, ?)`,
        [reward, weight]
      );

      interaction.reply({
        content: `✅ Added ${reward} (weight ${weight})`,
        flags: 64
      });

    });
  }

  /* LIST */
  if (interaction.commandName === 'listrewards') {

    db.all(`SELECT * FROM rewards`, (err, rows) => {

      if (!rows.length) {
        return interaction.reply({ content: 'No rewards.', flags: 64 });
      }

      let text = '';
      rows.forEach(r => {
        text += `ID ${r.id} → ${r.reward} (w:${r.weight})\n`;
      });

      interaction.reply({
        embeds: [new EmbedBuilder().setTitle('🎁 Rewards').setDescription(text)],
        flags: 64
      });

    });
  }

  /* REMOVE */
  if (interaction.commandName === 'removereward') {

    db.run(`DELETE FROM rewards WHERE id = ?`, [
      interaction.options.getInteger('id')
    ]);

    interaction.reply({ content: '🗑️ Removed', flags: 64 });
  }

  /* RESET */
  if (interaction.commandName === 'resetspins') {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ No permission', flags: 64 });
    }

    db.run(`DELETE FROM spins`, async () => {
      await interaction.reply({ content: '🔄 Spins reset!', flags: 64 });
    });
  }

  /* LEADERBOARD */
  if (interaction.commandName === 'leaderboard') {

    db.all(`SELECT * FROM stats ORDER BY score DESC LIMIT 10`, (err, rows) => {

      if (!rows.length) {
        return interaction.reply({ content: 'No data yet.', flags: 64 });
      }

      let text = '';
      rows.forEach((r, i) => {
        text += `#${i + 1} ${r.username} — Score: ${r.score} | Spins: ${r.spins}\n`;
      });

      interaction.reply({
        embeds: [new EmbedBuilder().setTitle('🏆 Leaderboard').setDescription(text)]
      });

    });
  }

  /* MY STATS */
  if (interaction.commandName === 'mystats') {

    db.get(
      `SELECT * FROM stats WHERE userId = ?`,
      [interaction.user.id],
      (err, row) => {

        if (!row) {
          return interaction.reply({ content: 'No stats yet.', flags: 64 });
        }

        interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('📊 Your Stats')
              .addFields(
                { name: 'Spins', value: String(row.spins), inline: true },
                { name: 'Score', value: String(row.score), inline: true }
              )
          ],
          flags: 64
        });

      }
    );
  }

});

/* ---------------- SPIN SYSTEM ---------------- */

client.on(Events.InteractionCreate, async interaction => {

  if (!interaction.isButton()) return;

  if (interaction.customId === 'spin') {

    const member = interaction.member;

    /* ROLE CHECK */
    if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
      return interaction.reply({
        content: '❌ You are not allowed to spin.',
        flags: 64
      });
    }

    const today = new Date().toDateString();

    db.get(
      `SELECT * FROM spins WHERE userId = ? AND date = ?`,
      [interaction.user.id, today],
      async (err, row) => {

        if (row) {
          return interaction.reply({
            content: '❌ Already spun today.',
            flags: 64
          });
        }

        db.all(`SELECT * FROM rewards`, async (err, rewards) => {

          const reward = pickWeightedReward(rewards);

          const score = getRewardScore(reward);

          /* SAVE SPIN */
          db.run(
            `INSERT INTO spins VALUES (?, ?, ?, ?)`,
            [interaction.user.id, interaction.user.username, reward, today]
          );

          /* UPDATE STATS */
          db.get(
            `SELECT * FROM stats WHERE userId = ?`,
            [interaction.user.id],
            (err, row) => {

              if (!row) {
                db.run(
                  `INSERT INTO stats (userId, username, spins, score) VALUES (?, ?, 1, ?)`,
                  [interaction.user.id, interaction.user.username, score]
                );
              } else {
                db.run(
                  `UPDATE stats SET spins = spins + 1, score = score + ? WHERE userId = ?`,
                  [score, interaction.user.id]
                );
              }

            }
          );

          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('🎉 You Won!')
                .setDescription(`${interaction.user} got:\n\n🏆 ${reward}`)
                .setColor('Green')
            ]
          });

        });

      }
    );
  }
});

/* ---------------- LOGIN ---------------- */

client.login(process.env.TOKEN);