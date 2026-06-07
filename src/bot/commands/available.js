const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../db/queries');
const { BRANDING, FEATHER_TYPES, ICONS, ITEM_TYPES } = require('../../utils/constants');
const { updateLiveBoard } = require('../liveboard');
const { getInteractionLanguage, translate } = require('../i18n');
const BOOK_TYPES = ['Album', 'Illution Box', 'album', 'illution-box'];

const activeLocks = new Set();

const displayItemType = (type) => ITEM_TYPES[type]?.label || type;

/** Check whether the current round can accept reservations. */
async function checkEligibility(interaction) {
  const language = await getInteractionLanguage(interaction);
  const round = await db.getOrCreateCurrentRound();
  if (!round || round.status !== 'open') return { ok: false, msg: translate(language, 'reservationsClosed') };
  return { ok: true, round };
}

/** Render the user's reservation status summary for /mystuff. */
async function renderUserStatus(interaction, discordUserId, round, successMsg = null) {
  const language = await getInteractionLanguage(interaction);
  const myReservations = await db.getMyReservations(discordUserId, round.id);

  const ldUsage = myReservations.filter(r => r.item_type.toLowerCase() === 'light-dark').length;
  const tsUsage = myReservations.filter(r => r.item_type.toLowerCase() === 'time-space').length;
  const albumItemsCount = myReservations.filter(r => BOOK_TYPES.map(x => x.toLowerCase()).includes(r.item_type.toLowerCase())).length;

  if (myReservations.length === 0) {
    const content = (successMsg ? `${successMsg}\n\n` : '') + translate(language, 'noActiveReservations');
    if (!interaction.deferred && !interaction.replied) return interaction.reply({ content, flags: [MessageFlags.Ephemeral] });
    return interaction.editReply({ content, components: [] });
  }

  const currentList = myReservations.map(r => {
    return `• **Page ${r.page_name}** - ${displayItemType(r.item_type)} #${r.position}`;
  }).join('\n');

  let rows = [];
  let currentRow = new ActionRowBuilder();
  
  const groups = {};
  myReservations.forEach(r => {
    if (BOOK_TYPES.map(x => x.toLowerCase()).includes(r.item_type.toLowerCase())) return;

    const key = `${r.page_name}_${r.item_type}`;
    if (!groups[key]) groups[key] = { page_name: r.page_name, type: r.item_type, items: [] };
    groups[key].items.push(r);
  });

  Object.values(groups).forEach(g => {
    g.items.sort((a, b) => a.position - b.position);
    const positions = g.items.map(i => i.position).join(', ');
    const itemIds = g.items.map(i => i.item_id).join('_');
    
    const btnStyle = ButtonStyle.Danger;
    
    // Prefix with original emoji for clarity if desired, but red button implies cancel.
    // Keep cancellation buttons grouped like reservation buttons.
    // To distinguish LD/TS, we can include the emoji.
    const typeEmoji = (g.type.toLowerCase() === 'light-dark' || g.type.toLowerCase() === 'ขนนกดำ') ? '🤍 ' : ((g.type.toLowerCase() === 'time-space' || g.type.toLowerCase() === 'ขนนกขาว') ? '❤️ ' : '');

    const btn = new ButtonBuilder()
      .setCustomId(`c_b_${itemIds}`)
      .setLabel(`❌ ${typeEmoji}P.${g.page_name} [${positions}]`)
      .setStyle(btnStyle);

    if (currentRow.components.length === 5) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
    currentRow.addComponents(btn);
  });

  // Only add 'cancel all' if there is at least one cancellable item
  if (Object.keys(groups).length > 0) {
    const cancelAllBtn = new ButtonBuilder().setCustomId('unreserve_me').setLabel(translate(language, 'cancelAll')).setStyle(ButtonStyle.Danger);
    if (currentRow.components.length === 5) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
    currentRow.addComponents(cancelAllBtn);
  }
  
  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  const finalContent = (successMsg ? `${successMsg}\n\n` : '') +
    `${translate(language, 'yourReservations')}\n` +
    `🤍 LD: ${ldUsage}/${round.quota_ld >= 999 ? '∞' : round.quota_ld}\n` +
    `❤️ TS: ${tsUsage}/${round.quota_ts >= 999 ? '∞' : round.quota_ts}\n` +
    `${albumItemsCount > 0 ? '📒 Book: 1/1\n' : ''}\n` +
    `${currentList}`;

  if (!interaction.deferred && !interaction.replied) return interaction.reply({ content: finalContent, components: rows.slice(0, 5), flags: [MessageFlags.Ephemeral] });
  return interaction.editReply({ content: finalContent, components: rows.slice(0, 5) });
}

async function reserveFeatherBundle(interaction, category, specificIds = null) {
  const language = await getInteractionLanguage(interaction);
  const discordUserId = interaction.user.id;
  const discordUsername = interaction.member?.displayName ?? interaction.user.username;
  const lockKey = `bundle_${discordUserId}_${category}`;
  if (activeLocks.has(lockKey)) return interaction.reply({ content: translate(language, 'processing'), flags: [MessageFlags.Ephemeral] }).catch(() => { });
  activeLocks.add(lockKey);

  let toReserve = [];
  try {
    const check = await checkEligibility(interaction);
    if (!check.ok) return interaction.reply({ content: check.msg, flags: [MessageFlags.Ephemeral] });
    const { round } = check;

    const myRes = await db.getMyReservations(discordUserId, round.id);

    const isLD = category.toLowerCase() === 'ld';
    const quota = isLD ? (round.quota_ld || 1) : (round.quota_ts || 1);
    const itemType = isLD ? 'Light-Dark' : 'Time-Space';

    const currentUsage = myRes.filter(r => r.item_type.toLowerCase() === itemType.toLowerCase()).length;
    if (currentUsage >= quota) {
      return interaction.reply({ content: translate(language, 'quotaFull', { itemType, currentUsage, quota }), flags: [MessageFlags.Ephemeral] });
    }

    // Check Click Quota (Global across all feathers)
    const featherRes = myRes.filter(r => r.item_type.toLowerCase() === 'light-dark' || r.item_type.toLowerCase() === 'time-space');
    const distinctClicks = new Set(featherRes.map(r => new Date(r.reserved_at).getTime())).size;
    const clickQuota = round.quota || 1;

    if (distinctClicks >= clickQuota) {
      return interaction.reply({ content: translate(language, 'clickLimit', { distinctClicks, clickQuota }), flags: [MessageFlags.Ephemeral] });
    }

    const needed = quota - currentUsage;
    const allAvailable = await db.getAvailableItems(round.id);

    toReserve = [];
    if (specificIds && specificIds.length > 0) {
      // Find all available items from this bundle
      const availableInBundle = allAvailable.filter(i => specificIds.includes(i.id));
      if (availableInBundle.length === 0) {
        return interaction.reply({ content: translate(language, 'setReserved'), flags: [MessageFlags.Ephemeral] });
      }

      // Strict adherence: Do not allow them to slice a FULL 4-item page bundle if there are still other fragmented pages available.
      // However, if there are no fragmented pages left on the board (only full pages are left), allow slicing it.
      if (availableInBundle.length > needed && availableInBundle.length >= 4) {
        const itemsByPage = {};
        allAvailable.forEach(i => {
          if (i.item_type.toLowerCase() === itemType.toLowerCase()) {
            if (!itemsByPage[i.page_name]) itemsByPage[i.page_name] = 0;
            itemsByPage[i.page_name]++;
          }
        });
        const hasFragmented = Object.values(itemsByPage).some(count => count > 0 && count < 4);
        if (hasFragmented) {
          return interaction.reply({ content: translate(language, 'quotaTooSmall', { needed, itemType }), flags: [MessageFlags.Ephemeral] });
        }
      }

      // Take as many as possible within remaining quota (this will slice fragmented buttons if needed)
      toReserve = availableInBundle.slice(0, needed);
    } else {
      const categoryAvailable = allAvailable.filter(i => i.item_type.toLowerCase() === itemType.toLowerCase());
      if (categoryAvailable.length === 0) {
        return interaction.reply({ content: translate(language, 'noMoreType', { itemType }), flags: [MessageFlags.Ephemeral] });
      }
      toReserve = categoryAvailable.slice(0, needed);
    }

    await db.addMultipleReservations(round.id, toReserve.map(i => i.id), discordUserId, discordUsername);
    updateLiveBoard(interaction.client, round.id).catch(err => console.error('❌ Board update error:', err));

    const updatedRes = await db.getMyReservations(discordUserId, round.id);
    const ldUsage = updatedRes.filter(r => r.item_type.toLowerCase() === 'light-dark').length;
    const tsUsage = updatedRes.filter(r => r.item_type.toLowerCase() === 'time-space').length;
    const ldQuota = round.quota_ld || 1;
    const tsQuota = round.quota_ts || 1;
    const ldLeft = ldQuota >= 999 ? '∞' : Math.max(0, ldQuota - ldUsage);
    const tsLeft = tsQuota >= 999 ? '∞' : Math.max(0, tsQuota - tsUsage);
    const quotaStr = translate(language, 'remainingQuota', { ldLeft, tsLeft });

    const pages = {};
    toReserve.forEach(i => {
      if (!pages[i.page_name]) pages[i.page_name] = [];
      pages[i.page_name].push(i.position);
    });
    const detailList = Object.entries(pages).map(([pageNum, posList]) => {
      posList.sort((a, b) => a - b);
      return `P.${pageNum} [${posList.join(', ')}]`;
    }).join(' | ');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`c_b_${toReserve.map(i => i.id).join('_')}`)
        .setLabel(translate(language, 'cancelThis'))
        .setStyle(ButtonStyle.Danger)
    );

    console.log(`[Reserve] User ${discordUsername} reserved ${toReserve.length} ${itemType} items. IDs: ${toReserve.map(i => i.id).join(', ')}`);

    return interaction.reply({
      content: translate(language, 'reservedBundle', { count: toReserve.length, itemType, detailList, quotaStr }),
      components: [row],
      flags: [MessageFlags.Ephemeral]
    });

  } catch (err) {
    if (err.code === '23505' || err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT') {
      const attemptedIds = (specificIds && specificIds.length > 0) ? specificIds : toReserve.map(i => i.id);
      console.log(`[Reserve Race] User ${discordUsername} tried to reserve already reserved items: [${attemptedIds.join(', ')}]`);
      if (!interaction.replied) {
        return interaction.reply({ content: translate(language, 'race'), flags: [MessageFlags.Ephemeral] });
      }
    }
    console.error('[Reserve Error]', err);
    if (!interaction.replied) interaction.reply({ content: translate(language, 'reserveFailed'), flags: [MessageFlags.Ephemeral] }).catch(() => { });
  } finally {
    activeLocks.delete(lockKey);
  }
}

async function reserveBookItem(interaction, itemId) {
  const language = await getInteractionLanguage(interaction);
  const lockKey = `item_${itemId}`;
  if (activeLocks.has(lockKey)) return interaction.reply({ content: translate(language, 'processing'), flags: [MessageFlags.Ephemeral] }).catch(() => { });
  activeLocks.add(lockKey);

  try {
    const discordUserId = interaction.user.id;
    const discordUsername = interaction.member?.displayName ?? interaction.user.username;
    const check = await checkEligibility(interaction);
    if (!check.ok) return interaction.reply({ content: check.msg, flags: [MessageFlags.Ephemeral] });
    const { round } = check;

    const myRes = await db.getMyReservations(discordUserId, round.id);
    // Books/boxes are limited to one per user; feathers use their own quotas.
    const hasAlbum = myRes.some(r => BOOK_TYPES.map(x => x.toLowerCase()).includes(r.item_type.toLowerCase()));
    if (hasAlbum) return interaction.reply({ content: translate(language, 'bookLimit'), flags: [MessageFlags.Ephemeral] });

    const ok = await db.isWhitelisted(discordUserId);
    if (!ok) return interaction.reply({ content: translate(language, 'whitelistOnly'), flags: [MessageFlags.Ephemeral] });

    const item = await db.getItemById(itemId);
    if (!item) return interaction.reply({ content: translate(language, 'itemNotFound'), flags: [MessageFlags.Ephemeral] });

    if (await db.isItemReserved(round.id, itemId)) {
      updateLiveBoard(interaction.client, round.id).catch(err => console.error('❌ Board update error:', err));
      return interaction.reply({ content: translate(language, 'alreadyReserved'), flags: [MessageFlags.Ephemeral] });
    }

    await db.addReservation(round.id, itemId, discordUserId, discordUsername);
    updateLiveBoard(interaction.client, round.id).catch(err => console.error('❌ Board update error:', err));

    // Success - Minimal Response
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`c_i_${itemId}`).setLabel(translate(language, 'cancelPage', { pageName: item.page_name, position: item.position })).setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ content: translate(language, 'reservedSingle', { pageName: item.page_name, itemType: displayItemType(item.item_type), position: item.position }), components: [row], flags: [MessageFlags.Ephemeral] });

  } catch (err) {
    if (err.code === '23505' || err.message?.includes('UNIQUE constraint failed') || err.code === 'SQLITE_CONSTRAINT') {
      console.log(`[Reserve] Race condition: User ${discordUsername} tried to reserve already reserved item ID: ${itemId}.`);
      if (!interaction.replied) {
        return interaction.reply({ content: translate(language, 'race'), flags: [MessageFlags.Ephemeral] });
      }
    }
    console.error('[Book Reserve Error]', err);
    if (!interaction.replied) interaction.reply({ content: translate(language, 'genericError'), flags: [MessageFlags.Ephemeral] }).catch(() => { });
  } finally {
    activeLocks.delete(lockKey);
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('available').setDescription('View available items and make a reservation'),
  async execute(interaction) {
    const language = await getInteractionLanguage(interaction);
    const check = await checkEligibility(interaction);
    if (!check.ok) return interaction.reply({ content: check.msg, flags: [MessageFlags.Ephemeral] });
    const { round } = check;
    const allAvailable = await db.getAvailableItems(round.id);

    const ldItems = allAvailable.filter(i => i.item_type.toLowerCase() === 'light-dark');
    const tsItems = allAvailable.filter(i => i.item_type.toLowerCase() === 'time-space');

    if (ldItems.length === 0 && tsItems.length === 0) return interaction.reply({ content: translate(language, 'noFeathers'), flags: [MessageFlags.Ephemeral] });

    const embed = new EmbedBuilder()
      .setTitle(translate(language, 'availableTitle'))
      .setColor(0x00FF00)
      .setDescription(translate(language, 'availableHelp'))
      .setFooter({ text: `Round: ${round.name}` });

    const row = new ActionRowBuilder();

    if (ldItems.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`reserve_f_ld_bundle`)
          .setLabel(`Reserve LD (x${round.quota_ld})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji(ICONS.LIGHT_DARK)
      );
    }

    if (tsItems.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`reserve_f_ts_bundle`)
          .setLabel(`Reserve TS (x${round.quota_ts})`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(ICONS.TIME_SPACE)
      );
    }

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
  async handleButton(interaction) {
    const id = interaction.customId;
    const { LB_FEATHER_PREFIX, LB_BOOK_PREFIX } = require('../liveboard');
    if (id.startsWith('reserve_f_') || id.startsWith(LB_FEATHER_PREFIX)) {
      const prefix = id.startsWith('reserve_f_') ? 'reserve_f_' : LB_FEATHER_PREFIX;
      const categoryPart = id.slice(prefix.length);

      if (categoryPart.includes('_bundle_')) {
        const parts = categoryPart.split('_bundle_');
        const category = parts[0];
        const data = parts[1];

        let specificIds = null;
        if (data && !data.startsWith('idx_') && data !== 'rem') {
          specificIds = data.split(',').map(x => parseInt(x));
        }

        return await reserveFeatherBundle(interaction, category, specificIds);
      }

      return await reserveFeatherBundle(interaction, id.includes('ld') ? 'ld' : 'ts');
    }
    if (id.startsWith('reserve_i_') || id.startsWith(LB_BOOK_PREFIX)) {
      const prefix = id.startsWith('reserve_i_') ? 'reserve_i_' : LB_BOOK_PREFIX;
      return await reserveBookItem(interaction, parseInt(id.slice(prefix.length)));
    }
  },
  async handleSelect(interaction) {
    if (interaction.customId === 'lb_more_items') {
      const [type, id] = interaction.values[0].split(':');
      if (type === 'feather') {
        // If it's a specific ID from an old menu, we'll just try to bundle it based on type
        const item = await db.getItemById(parseInt(id));
        const category = item.item_type.toLowerCase().includes('light-dark') ? 'ld' : 'ts';
        return await reserveFeatherBundle(interaction, category);
      }
      if (type === 'book') return await reserveBookItem(interaction, parseInt(id));
    }
    if (interaction.customId.startsWith('lb_album_menu_')) return await reserveBookItem(interaction, parseInt(interaction.values[0]));
    if (interaction.customId.startsWith('lb_ld_menu_')) return await reserveFeatherBundle(interaction, 'ld');
    if (interaction.customId.startsWith('lb_ts_menu_')) return await reserveFeatherBundle(interaction, 'ts');
  },
  renderUserStatus,
};
