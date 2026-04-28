import { ApplicationCommandOptionTypes, MessageComponentTypes, MessageFlags } from '@discordeno/bot'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { type BadServer, getBadServerById } from '../../postgresql/db.js'
import { get, set } from '../../redis/redis.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'
import {
  checkIfValidInvite,
  checkIfValidServerId,
  fetchInviteInfo,
  getInviteCode,
  serverTypeMap,
} from '../../utils/server.js'

const GUILD_ID_CACHE_PREFIX = 'invite:'
const GUILD_ID_CACHE_TTL = 30 * 24 * 60 * 60 // 30 days

createCommand({
  name: 'checkserver',
  description: 'Check if a server is blacklisted.',
  options: [
    {
      name: 'server_id',
      description: 'The ID of the server to check.',
      type: ApplicationCommandOptionTypes.String,
      required: false,
    },
    {
      name: 'invite',
      description: 'An invite link or code of the server to check.',
      type: ApplicationCommandOptionTypes.String,
      required: false,
    },
  ],
  async run(interaction, options) {
    const { server_id: serverId, invite } = options as { server_id: string; invite: string }

    if (!serverId && !invite) {
      const response = commonComponent({
        color: 'orange',
        content: 'Please provide either a server ID or an invite link/code.',
      })
      await interaction.respond(response)
      return
    }

    await interaction.defer()

    let badServer: BadServer | null = null
    let guildId: string | null = null

    if (invite) {
      if (!checkIfValidInvite({ invite })) {
        const response = commonComponent({
          color: 'orange',
          content: 'Please provide a valid invite link or code.',
        })
        await interaction.respond(response)
        return
      }

      const inviteCode = getInviteCode({ invite })
      try {
        const cached = await get(`${GUILD_ID_CACHE_PREFIX}${inviteCode}`)
        if (cached) {
          guildId = cached
        } else {
          const inviteInfo = await fetchInviteInfo(inviteCode)
          if (inviteInfo?.guild) {
            guildId = inviteInfo.guild.id as string
            await set(`${GUILD_ID_CACHE_PREFIX}${inviteCode}`, guildId, GUILD_ID_CACHE_TTL)
          }
        }
      } catch (err) {
        bot.logger.error(`Error fetching invite info for code ${inviteCode}:`, err)
        const response = commonComponent({
          color: 'red',
          content: 'An error occurred while fetching invite information. Please try again later.',
        })
        await interaction.respond(response)
        return
      }

      if (!guildId) {
        const response = commonComponent({
          color: 'orange',
          content: 'Could not fetch information for the provided invite. Please ensure it is valid and try again.',
        })
        await interaction.respond(response)
        return
      }

      try {
        badServer = await getBadServerById(guildId)
      } catch (err) {
        bot.logger.error(`Error fetching server with ID ${guildId}:`, err)
        const response = commonComponent({
          color: 'red',
          content: 'An error occurred while fetching server information. Please try again later.',
        })
        await interaction.respond(response)
        return
      }
    } else if (serverId) {
      if (!checkIfValidServerId({ serverId })) {
        const response = commonComponent({
          color: 'orange',
          content: 'Please provide a valid server ID.',
        })
        await interaction.respond(response)
        return
      }

      try {
        badServer = await getBadServerById(serverId as string)
      } catch (err) {
        bot.logger.error(`Error fetching server with ID ${serverId}:`, err)
        const response = commonComponent({
          color: 'red',
          content: 'An error occurred while fetching server information. Please try again later.',
        })
        await interaction.respond(response)
        return
      }
    }

    if (!badServer) {
      const response = commonComponent({
        color: 'blue',
        content: [
          `### No blacklisted server found with ID "${serverId || guildId}".`,
          `This server is not currently blacklisted for cheating, leaks, or reselling. However, that does not automatically mean it is safe or trustworthy. Always use your own judgement before interacting with or purchasing anything. If you believe this server should be blacklisted, please submit a report ticket.`,
        ].join('\n'),
      })
      await interaction.respond(response)
      return
    }

    const serverType = badServer ? serverTypeMap({ type: badServer.type }) : null

    const response = {
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: MessageComponentTypes.Container as const,
          accentColor: componentColors.blue,
          components: [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [
                `### Server "${badServer.name}" is blacklisted!`,
                `> **ID:** ${badServer.id}`,
                `> **Date Added:** <t:${Math.floor(new Date(badServer.createdat).getTime() / 1000)}:f>`,
              ].join('\n'),
            },
            {
              type: MessageComponentTypes.Separator as const,
            },
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [`**Server type:** ${serverType?.label}`, `\`\`\`${serverType?.description}\`\`\``].join('\n'),
            },
          ],
        },
      ],
    }

    await interaction.respond(response)
  },
})
