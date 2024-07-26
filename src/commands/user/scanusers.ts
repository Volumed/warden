import { TextChannel } from 'discord.js';
import { Colours } from '../../@types/Colours';
import { Command } from '../../structures/Command';
import actionUser from '../../utils/actioning/actionUser';
import logger from '../../utils/logger';
import { sendError, sendSuccess } from '../../utils/messages';
import sendEmbed from '../../utils/messages/sendEmbed';
import db from '../../utils/database';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default new Command({
    name: 'scanusers',
    description: 'Initiates a guild scan',
    defaultMemberPermissions: 'Administrator',
    run: async ({ interaction, client }) => {
        if (!interaction.guild) return sendError(interaction, 'Must be used in a guild');

        const guild = await client.guilds.fetch(interaction.guild.id);

        const settings = await db.getGuild(
            { id: interaction.guild.id },
            { punishments: true, logChannel: true }
        );
        if (!settings) return sendError(interaction, 'Unable to find guild in database');
        if (!settings.punishments?.enabled) return sendError(interaction, 'Punishments are not enabled');

        logger.info({
            labels: { action: 'scanusers', guildId: interaction?.guild?.id },
            message: `Scanusers requested by ${interaction.user.id} in ${interaction.guild.id}`,
        });

        await guild.members.fetch().then(async members => {
            const memberMap = members.filter(x => !x.user.bot).map(x => x.id);
            const users = await db.getManyUsers({
                id: { in: memberMap },
                status: { in: ['BLACKLISTED', 'PERM_BLACKLISTED'] },
            });

            if (users.length === 0)
                return sendSuccess(interaction, 'Scanning has complete, no users blacklisted');

            if (!settings.punishments) return sendError(interaction, 'No punishments set for this guild');
            if (!settings.logChannel) return sendError(interaction, 'Must have a log channel set');

            sendSuccess(interaction, 'Scanning..\n> This may take a while due to Discords rate limit');

            let actioned = 0;

            for (let index = 0; index < users.length; index++) {
                const user = users[index];
                const result = await actionUser(
                    client,
                    guild,
                    settings.logChannel,
                    settings.punishments,
                    user
                );
                if (result) actioned += 1;
                await delay(500);
            }

            logger.info({
                labels: { action: 'scanusers', guildId: interaction?.guild?.id },
                message: `Successfully actioned ${actioned} users, scanning complete`,
            });

            sendEmbed({
                channel: interaction.channel as TextChannel,
                embed: {
                    description: `Scanning has completed, \`${actioned}\` are blacklisted and have been actioned accordingly`,
                    color: Colours.GREEN,
                },
            });

            return true;
        });
        return false;
    },
});
