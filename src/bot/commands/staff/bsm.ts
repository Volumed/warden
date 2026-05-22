import { ApplicationCommandOptionTypes, BitwisePermissionFlags } from '@discordeno/bot'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { addBadServer, type BadServer, getBadServerById } from '../../postgresql/db.js'
import { get, set } from '../../redis/redis.js'
import { commonComponent } from '../../utils/components.js'
import { checkIfValidInvite, fetchInviteInfo, getInviteCode } from '../../utils/server.js'

import { GUILD_INVITE_CACHE_PREFIX, GUILD_INVITE_CACHE_TTL } from '../public/checkServer.js'

createCommand({
  name: 'bsm',
  description: 'Add new blacklisted server.',
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  options: [
    {
      name: 'invite',
      description: 'An invite link or code of the server to blacklist.',
      type: ApplicationCommandOptionTypes.String,
      required: true,
    },
    {
      name: 'type',
      description: 'The type of the server.',
      type: ApplicationCommandOptionTypes.String,
      choices: [
        { name: 'Advertising', value: 'ADVERTISING' },
        { name: 'Cheating', value: 'CHEATING' },
        { name: 'Leaking', value: 'LEAKING' },
        { name: 'Other', value: 'OTHER' },
        { name: 'Reselling', value: 'RESELLING' },
      ],
      required: true,
    },
    {
      name: 'reason',
      description: 'The reason for blacklisting the server.',
      type: ApplicationCommandOptionTypes.String,
      required: true,
    },
  ],
  async run(interaction, options) {
    const { invite, type, reason } = options as { invite: string; type: string; reason: string }

    if (!checkIfValidInvite({ invite })) {
      const response = commonComponent({
        color: 'orange',
        content: 'Please provide a valid invite link or code.',
      })
      await interaction.respond(response)
      return
    }

    await interaction.defer()

    let badServer: BadServer | null = null
    let guild: { id: string; name: string } | null = null

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
        guild = parsed
      } else {
        const inviteInfo = await fetchInviteInfo(inviteCode)
        if (inviteInfo?.guild) {
          guild = { id: inviteInfo.guild.id as string, name: inviteInfo.guild.name as string }
          await set(`${GUILD_INVITE_CACHE_PREFIX}${inviteCode}`, JSON.stringify(guild), GUILD_INVITE_CACHE_TTL)
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

    if (!guild) {
      const response = commonComponent({
        color: 'orange',
        content: 'Could not fetch information for the provided invite. Please ensure it is valid and try again.',
      })
      await interaction.respond(response)
      return
    }

    try {
      badServer = await getBadServerById(guild.id)
    } catch (err) {
      bot.logger.error(`Error fetching server with ID ${guild.id}:`, err)
      const response = commonComponent({
        color: 'red',
        content: 'An error occurred while fetching server information. Please try again later.',
      })
      await interaction.respond(response)
      return
    }

    if (badServer) {
      const response = commonComponent({
        color: 'orange',
        content: 'This server is already blacklisted.',
      })
      await interaction.respond(response)
      return
    }

    try {
      await addBadServer({
        id: guild.id,
        name: guild.name,
        type: type as BadServer['type'],
        addedby: String(interaction.user.id),
        invite: inviteCode,
        reason,
      })
    } catch (err) {
      bot.logger.error(`Error adding bad server with ID ${guild.id}:`, err)
      const response = commonComponent({
        color: 'red',
        content: 'An error occurred while adding the server to the blacklist. Please try again later.',
      })
      await interaction.respond(response)
      return
    }

    const response = commonComponent({
      color: 'blue',
      content: `Server "${guild.name}" has been successfully added to the blacklist.`,
    })
    await interaction.respond(response)
  },
})
