import {
  ApplicationCommandOptionTypes,
  BitwisePermissionFlags,
  MessageComponentTypes,
  MessageFlags,
} from '@discordeno/bot'
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

import { GUILD_INVITE_CACHE_PREFIX, GUILD_INVITE_CACHE_TTL } from '../public/checkServer.js'

createCommand({
  name: 'checkserveradmin',
  description: 'Check server admin.',
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
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
        const cached = await get(`${GUILD_INVITE_CACHE_PREFIX}${inviteCode}`)
        if (cached) {
          const parsed = JSON.parse(cached) as { id: string; name: string }
          guildId = parsed.id
        } else {
          const inviteInfo = await fetchInviteInfo(inviteCode)
          if (inviteInfo?.guild) {
            guildId = inviteInfo.guild.id as string
            const guildName = inviteInfo.guild.name as string
            await set(
              `${GUILD_INVITE_CACHE_PREFIX}${inviteCode}`,
              JSON.stringify({ id: guildId, name: guildName }),
              GUILD_INVITE_CACHE_TTL,
            )
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
          `Server might not be blacklisted, or the provided information is incorrect.`,
        ].join('\n'),
      })
      await interaction.respond(response)
      return
    }

    const serverType = badServer ? serverTypeMap({ type: badServer.type }) : null

    const addedAt = Math.floor(new Date(badServer.createdat).getTime() / 1000)
    const updatedAt = Math.floor(new Date(badServer.updatedat).getTime() / 1000)

    const response = {
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: MessageComponentTypes.Container as const,
          accentColor: componentColors.blue,
          components: [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: `### Server "${badServer.name}" is blacklisted!`,
            },
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [
                `> **ID:** \`${badServer.id}\``,
                `> **Type:** ${serverType?.label ?? 'Unknown'}`,
                `> **Reason:** ${badServer.reason}`,
                badServer.invite
                  ? `> **Invite:** https://discord.gg/${getInviteCode({ invite: badServer.invite })}`
                  : null,
              ]
                .filter(Boolean)
                .join('\n'),
            },
            {
              type: MessageComponentTypes.Separator as const,
              divider: true,
            },
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [`-# Date Added: <t:${addedAt}:f>  ·  Updated: <t:${updatedAt}:f>`].filter(Boolean).join('\n'),
            },
          ],
        },
      ],
    }

    await interaction.respond(response)
  },
})
