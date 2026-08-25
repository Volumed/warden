import { ApplicationCommandOptionTypes, BitwisePermissionFlags } from '@discordeno/bot'
import { type BadServer, getBadServerById, updateBadServerName } from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { get, set } from '../../redis/redis.js'
import { commonComponent } from '../../utils/components.js'
import { checkIfValidInvite, checkIfValidServerId, fetchInviteInfo, getInviteCode } from '../../utils/server.js'
import { GUILD_INVITE_CACHE_PREFIX, GUILD_INVITE_CACHE_TTL } from '../public/checkServer.js'

createCommand({
  name: 'updateservername',
  description: 'Updates the name of a blacklisted server.',
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  options: [
    {
      name: 'invite',
      description: 'Update the server name by invite.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'invite',
          description: 'An invite link or code of the server to check.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'force',
      description: 'Force update the server name.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'server_id',
          description: 'The ID of the server.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'server_name',
          description: 'The new name of the server.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
      ],
    },
  ],
  async run(interaction, options) {
    const typedOptions = options as {
      invite?: { invite?: string }
      force?: { server_id?: string; server_name?: string }
    }

    await interaction.defer()

    let badServer: BadServer | null = null
    let guildId: string | null = null
    let serverId: string | null = null
    let guildName: string | null = null

    if (typedOptions.invite) {
      const invite = typedOptions.invite.invite as string

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
          guildName = parsed.name
        } else {
          const inviteInfo = await fetchInviteInfo(inviteCode)
          if (inviteInfo?.guild) {
            guildId = inviteInfo.guild.id as string
            guildName = inviteInfo.guild.name as string
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
    } else if (typedOptions.force) {
      serverId = typedOptions.force.server_id as string

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
          `This server is not currently blacklisted.`,
        ].join('\n'),
      })
      await interaction.respond(response)
      return
    }

    try {
      const newName = typedOptions.force?.server_name || guildName

      if (!newName) {
        const response = commonComponent({
          color: 'orange',
          content: 'Could not determine the new server name.',
        })
        await interaction.respond(response)
        return
      }

      if (badServer.name === newName) {
        const response = commonComponent({
          color: 'blue',
          content: [
            `### The server name for the blacklisted server with ID "${badServer.id}" is already "${newName}".`,
            `No update was necessary.`,
          ].join('\n'),
        })
        await interaction.respond(response)
        return
      }

      await updateBadServerName(badServer.id, newName)
      const response = commonComponent({
        color: 'blue',
        content: [
          `### Successfully updated the name of the blacklisted server with ID "${badServer.id}".`,
          `**Old Name:** ${badServer.name}`,
          `**New Name:** ${newName}`,
        ].join('\n'),
      })
      await interaction.respond(response)
    } catch (err) {
      bot.logger.error(`Error updating server name for ID ${badServer.id}:`, err)
      const response = commonComponent({
        color: 'red',
        content: 'An error occurred while updating the server name. Please try again later.',
      })
      await interaction.respond(response)
    }
  },
})
