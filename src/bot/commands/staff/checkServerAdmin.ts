import {
  type ActionRow,
  ApplicationCommandOptionTypes,
  BitwisePermissionFlags,
  type Interaction,
  MessageComponentTypes,
  MessageFlags,
  type SeparatorComponent,
  type TextDisplayComponent,
} from '@discordeno/bot'
import { type BadServer, getBadServerById } from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { get, set, ttl } from '../../redis/redis.js'
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

export const BULK_CHECK_SERVERS_CACHE_PREFIX = 'multicheckservers:'
export const BULK_CHECK_SERVERS_CACHE_TTL = 300 // 5 minutes

const MAX_BULK_PER_PAGE = 5
const BULK_CHECK_SERVERS_CACHE_TTL_WARN = 30 // disable buttons when ≤30s remain
const multiCheckServersPage = new Map<string, number>()

export interface MultiCheckServersResult {
  found: Array<{ badServer: BadServer; guildId: string }>
  notFound: Array<{ guildId: string }>
  failedInvites: string[]
}

export const multiCheckServersMessage = async (
  interaction: Interaction,
  page: number,
  cacheKey: string,
  newMessage: boolean,
) => {
  const cached = await get(`${BULK_CHECK_SERVERS_CACHE_PREFIX}${cacheKey}`)
  if (!cached) {
    const response = commonComponent({
      color: 'orange',
      content: 'This multi check session has expired. Please run the command again.',
    })
    if (newMessage) await interaction.respond(response)
    else await interaction.edit(response)
    return
  }

  const remaining = await ttl(`${BULK_CHECK_SERVERS_CACHE_PREFIX}${cacheKey}`)
  const isExpiring = remaining >= 0 && remaining <= BULK_CHECK_SERVERS_CACHE_TTL_WARN

  const { found, notFound, failedInvites } = JSON.parse(cached) as MultiCheckServersResult
  const totalPages = Math.max(1, Math.ceil(found.length / MAX_BULK_PER_PAGE))
  const isLastPage = page >= totalPages - 1
  const pageServers = found.slice(page * MAX_BULK_PER_PAGE, (page + 1) * MAX_BULK_PER_PAGE)

  const containerComponents: Array<TextDisplayComponent | SeparatorComponent | ActionRow> = []

  containerComponents.push({
    type: MessageComponentTypes.TextDisplay as const,
    content: `### Multi check — ${found.length} blacklisted, ${notFound.length} not found${failedInvites.length > 0 ? `, ${failedInvites.length} invite(s) failed` : ''}`,
  })

  if (pageServers.length > 0) {
    for (const { badServer } of pageServers) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const, divider: true })
      const serverType = serverTypeMap({ type: badServer.type })
      const addedAt = Math.floor(new Date(badServer.createdat).getTime() / 1000)
      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: [
          `**${badServer.name}** \`${badServer.id}\``,
          `> **Type:** ${serverType?.label ?? 'Unknown'}`,
          `> **Reason:** ${badServer.reason}`,
          badServer.invite ? `> **Invite:** https://discord.gg/${getInviteCode({ invite: badServer.invite })}` : null,
          `-# Added by <@${badServer.addedby}> on <t:${addedAt}:f>`,
        ]
          .filter(Boolean)
          .join('\n'),
      })
    }
  }

  if (isLastPage) {
    if (notFound.length > 0) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const, divider: true })
      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: ['**Not blacklisted:**', notFound.map(({ guildId }) => `- \`${guildId}\``).join('\n')].join('\n'),
      })
    }
    if (failedInvites.length > 0) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const, divider: true })
      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: ['**Failed to resolve invites:**', failedInvites.map((inv) => `- \`${inv}\``).join('\n')].join('\n'),
      })
    }
  }

  if (totalPages > 1) {
    containerComponents.push({ type: MessageComponentTypes.Separator as const })
    containerComponents.push({
      type: MessageComponentTypes.ActionRow as const,
      components: [
        {
          type: MessageComponentTypes.Button as const,
          label: '❮',
          customId: `multicheckservers-previous-${page}-${cacheKey}`,
          style: 1,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❮❮',
          customId: `multicheckservers-first-0-${cacheKey}`,
          style: 2,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: `${page + 1} / ${totalPages}`,
          customId: 'multicheckservers-page-indicator',
          style: 2,
          disabled: true,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯❯',
          customId: `multicheckservers-last-${totalPages - 1}-${cacheKey}`,
          style: 2,
          disabled: isLastPage || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯',
          customId: `multicheckservers-next-${page}-${cacheKey}`,
          style: 1,
          disabled: isLastPage || isExpiring,
        },
      ],
    })
  }

  const response = {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: MessageComponentTypes.Container as const,
        accentColor: found.length > 0 ? componentColors.blue : componentColors.orange,
        components: containerComponents,
      },
    ],
  }

  multiCheckServersPage.set(cacheKey, page)

  if (newMessage) {
    await interaction.respond(response)
    // Proactively disable all buttons before the cache expires
    setTimeout(
      () => {
        multiCheckServersMessage(interaction, multiCheckServersPage.get(cacheKey) ?? page, cacheKey, false).catch(
          () => {},
        )
        multiCheckServersPage.delete(cacheKey)
      },
      (BULK_CHECK_SERVERS_CACHE_TTL - BULK_CHECK_SERVERS_CACHE_TTL_WARN) * 1000,
    )
  } else {
    await interaction.edit(response)
  }
}

const checkServerAdminRun: Parameters<typeof createCommand>[0]['run'] = async (interaction, options) => {
  const typedOptions = options as {
    check?: { server_id?: string; invite?: string }
    multi?: { server_ids?: string; invites?: string }
  }

  if (typedOptions.check !== undefined) {
    const { server_id: serverId, invite } = typedOptions.check

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

    const serverType = serverTypeMap({ type: badServer.type })
    const addedAt = Math.floor(new Date(badServer.createdat).getTime() / 1000)

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
                `-# Added by <@${badServer.addedby}> on <t:${addedAt}:f>`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        },
      ],
    }

    await interaction.respond(response)
    return
  }

  if (typedOptions.multi !== undefined) {
    const { server_ids: serverIdsRaw, invites: invitesRaw } = typedOptions.multi

    if (!serverIdsRaw && !invitesRaw) {
      const response = commonComponent({
        color: 'orange',
        content: 'Please provide comma-separated server IDs and/or invite links/codes.',
      })
      await interaction.respond(response)
      return
    }

    await interaction.defer()

    const serverIds = serverIdsRaw
      ? [
          ...new Set(
            serverIdsRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ]
      : []
    const inviteList = invitesRaw
      ? [
          ...new Set(
            invitesRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ]
      : []

    const invalidIds = serverIds.filter((id) => !checkIfValidServerId({ serverId: id }))
    const invalidInvites = inviteList.filter((inv) => !checkIfValidInvite({ invite: inv }))

    if (invalidIds.length > 0 || invalidInvites.length > 0) {
      const lines: string[] = []
      if (invalidIds.length > 0) lines.push(`Invalid server IDs: ${invalidIds.map((id) => `\`${id}\``).join(', ')}`)
      if (invalidInvites.length > 0)
        lines.push(`Invalid invites: ${invalidInvites.map((inv) => `\`${inv}\``).join(', ')}`)
      const response = commonComponent({ color: 'orange', content: lines.join('\n') })
      await interaction.respond(response)
      return
    }

    // Resolve all invite codes to guild IDs in parallel
    const failedInvites: string[] = []
    const resolvedFromInvites: string[] = []

    const inviteResults = await Promise.allSettled(
      inviteList.map(async (invite) => {
        const inviteCode = getInviteCode({ invite })
        const cached = await get(`${GUILD_INVITE_CACHE_PREFIX}${inviteCode}`)
        if (cached) {
          const parsed = JSON.parse(cached) as { id: string; name: string }
          return parsed.id
        }
        const inviteInfo = await fetchInviteInfo(inviteCode)
        if (inviteInfo?.guild) {
          const guildId = inviteInfo.guild.id as string
          const guildName = inviteInfo.guild.name as string
          await set(
            `${GUILD_INVITE_CACHE_PREFIX}${inviteCode}`,
            JSON.stringify({ id: guildId, name: guildName }),
            GUILD_INVITE_CACHE_TTL,
          )
          return guildId
        }
        return null
      }),
    )

    for (let i = 0; i < inviteResults.length; i++) {
      const result = inviteResults[i]
      if (result.status === 'fulfilled' && result.value) {
        resolvedFromInvites.push(result.value)
      } else {
        failedInvites.push(inviteList[i])
        if (result.status === 'rejected') {
          bot.logger.error(`Error resolving invite "${inviteList[i]}":`, result.reason)
        }
      }
    }

    // Combine and deduplicate all guild IDs
    const seen = new Set<string>()
    const allGuildIds: string[] = []
    for (const id of [...serverIds, ...resolvedFromInvites]) {
      if (!seen.has(id)) {
        seen.add(id)
        allGuildIds.push(id)
      }
    }

    // Fetch all bad server records in parallel
    const dbResults = await Promise.allSettled(
      allGuildIds.map((guildId) => getBadServerById(guildId).then((badServer) => ({ badServer, guildId }))),
    )

    const found: Array<{ badServer: BadServer; guildId: string }> = []
    const notFound: Array<{ guildId: string }> = []

    for (const result of dbResults) {
      if (result.status === 'fulfilled') {
        if (result.value.badServer) {
          found.push({ badServer: result.value.badServer, guildId: result.value.guildId })
        } else {
          notFound.push({ guildId: result.value.guildId })
        }
      } else {
        bot.logger.error('Error fetching server record in multi check:', result.reason)
      }
    }

    // Cache results and render first page with pagination
    const cacheKey = String(interaction.id)
    await set(
      `${BULK_CHECK_SERVERS_CACHE_PREFIX}${cacheKey}`,
      JSON.stringify({ found, notFound, failedInvites }),
      BULK_CHECK_SERVERS_CACHE_TTL,
    )
    await multiCheckServersMessage(interaction as Interaction, 0, cacheKey, true)
  }
}

const checkServerAdminCommandOptions = {
  options: [
    {
      name: 'check',
      description: 'Check a single server by ID or invite.',
      type: ApplicationCommandOptionTypes.SubCommand,
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
    },
    {
      name: 'multi',
      description: 'Check multiple servers at once via comma-separated IDs or invites.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'server_ids',
          description: 'Comma-separated server IDs to check.',
          type: ApplicationCommandOptionTypes.String,
          required: false,
        },
        {
          name: 'invites',
          description: 'Comma-separated invite links or codes to check.',
          type: ApplicationCommandOptionTypes.String,
          required: false,
        },
      ],
    },
  ],
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  run: checkServerAdminRun,
}

createCommand({ name: 'checkserveradmin', description: 'Check server admin.', ...checkServerAdminCommandOptions })
createCommand({ name: 'csa', description: 'Alias for /checkserveradmin.', ...checkServerAdminCommandOptions })
