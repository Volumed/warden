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
import { addImport, addUser, getUserById, type User } from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { get, set, ttl } from '../../redis/redis.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'
import { checkIfValidServerId } from '../../utils/server.js'
import { checkIfValidUserId, mapUserStatus, mapUserTypes } from '../../utils/user.js'

export const ADDUSER_BULK_CACHE_PREFIX = 'adduserbulk:'
export const ADDUSER_BULK_CACHE_TTL = 300 // 5 minutes

const ADDUSER_BULK_PER_PAGE = 10
const ADDUSER_BULK_CACHE_TTL_WARN = 30 // disable buttons when ≤30s remain
const addUserBulkPage = new Map<string, number>()

export interface AddUserBulkResult {
  added: string[]
  alreadyExists: string[]
  failed: string[]
  type: User['type']
  status: User['status']
  reason: string
}

export const addUserBulkMessage = async (
  interaction: Interaction,
  page: number,
  cacheKey: string,
  newMessage: boolean,
) => {
  const cached = await get(`${ADDUSER_BULK_CACHE_PREFIX}${cacheKey}`)
  if (!cached) {
    const response = commonComponent({
      color: 'orange',
      content: 'This bulk add session has expired. Please run the command again.',
    })
    if (newMessage) await interaction.respond(response)
    else await interaction.edit(response)
    return
  }

  const remaining = await ttl(`${ADDUSER_BULK_CACHE_PREFIX}${cacheKey}`)
  const isExpiring = remaining >= 0 && remaining <= ADDUSER_BULK_CACHE_TTL_WARN

  const { added, alreadyExists, failed, type, status, reason } = JSON.parse(cached) as AddUserBulkResult
  const totalPages = Math.max(1, Math.ceil(added.length / ADDUSER_BULK_PER_PAGE))
  const isLastPage = page >= totalPages - 1
  const pageUsers = added.slice(page * ADDUSER_BULK_PER_PAGE, (page + 1) * ADDUSER_BULK_PER_PAGE)

  const containerComponents: Array<TextDisplayComponent | SeparatorComponent | ActionRow> = []

  containerComponents.push({
    type: MessageComponentTypes.TextDisplay as const,
    content: [
      `### Bulk add — ${added.length} added, ${alreadyExists.length} already existed${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
      `> **Type:** ${mapUserTypes([type])[0].label}  ·  **Status:** ${mapUserStatus(status)}  ·  **Reason:** ${reason}`,
    ]
      .filter(Boolean)
      .join('\n'),
  })

  if (pageUsers.length > 0) {
    for (const userId of pageUsers) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const, divider: true })
      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: `<@${userId}> \`${userId}\``,
      })
    }
  }

  if (isLastPage) {
    if (alreadyExists.length > 0) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const, divider: true })
      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: ['**Already existed:**', alreadyExists.map((id) => `- <@${id}> \`${id}\``).join('\n')].join('\n'),
      })
    }
    if (failed.length > 0) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const, divider: true })
      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: ['**Failed:**', failed.map((id) => `- \`${id}\``).join('\n')].join('\n'),
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
          customId: `adduserbulk-previous-${page}-${cacheKey}`,
          style: 1,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❮❮',
          customId: `adduserbulk-first-0-${cacheKey}`,
          style: 2,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: `${page + 1} / ${totalPages}`,
          customId: 'adduserbulk-page-indicator',
          style: 2,
          disabled: true,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯❯',
          customId: `adduserbulk-last-${totalPages - 1}-${cacheKey}`,
          style: 2,
          disabled: isLastPage || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯',
          customId: `adduserbulk-next-${page}-${cacheKey}`,
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
        accentColor: added.length > 0 ? componentColors.blue : componentColors.orange,
        components: containerComponents,
      },
    ],
  }

  addUserBulkPage.set(cacheKey, page)

  if (newMessage) {
    await interaction.respond(response)
    // Proactively disable all buttons before the cache expires
    setTimeout(
      () => {
        addUserBulkMessage(interaction, addUserBulkPage.get(cacheKey) ?? page, cacheKey, false).catch(() => {})
        addUserBulkPage.delete(cacheKey)
      },
      (ADDUSER_BULK_CACHE_TTL - ADDUSER_BULK_CACHE_TTL_WARN) * 1000,
    )
  } else {
    await interaction.edit(response)
  }
}

createCommand({
  name: 'adduser',
  description: 'Add a user to the database.',
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  options: [
    {
      name: 'add',
      description: 'Add a single user to the database.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user',
          description: 'The user to add.',
          type: ApplicationCommandOptionTypes.User,
          required: true,
        },
        {
          name: 'server_id',
          description: 'ID of a blacklisted server for the import. Use 1038440855469576202 for N/A.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'type',
          description: 'The type of the user.',
          type: ApplicationCommandOptionTypes.String,
          choices: [
            { name: 'Other', value: 'OTHER' },
            { name: 'Leaker', value: 'LEAKER' },
            { name: 'Cheater', value: 'CHEATER' },
            { name: 'Supporter', value: 'SUPPORTER' },
            { name: 'Owner', value: 'OWNER' },
          ],
          required: true,
        },
        {
          name: 'status',
          description: 'The status of the user.',
          type: ApplicationCommandOptionTypes.String,
          choices: [
            { name: 'Appealed', value: 'APPEALED' },
            { name: 'Blacklisted', value: 'BLACKLISTED' },
            { name: 'Permanently Blacklisted', value: 'PERM_BLACKLISTED' },
            { name: 'Whitelisted', value: 'WHITELISTED' },
          ],
          required: true,
        },
        {
          name: 'reason',
          description: 'The reason for adding the user.',
          type: ApplicationCommandOptionTypes.String,
          required: false,
        },
      ],
    },
    {
      name: 'bulk',
      description: 'Add multiple users at once with the same server, type, status, and reason.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user_ids',
          description: 'Comma-separated Discord user IDs to add.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'server_id',
          description: 'ID of a blacklisted server for the import. Use 1038440855469576202 for N/A.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'type',
          description: 'The type for all users.',
          type: ApplicationCommandOptionTypes.String,
          choices: [
            { name: 'Other', value: 'OTHER' },
            { name: 'Leaker', value: 'LEAKER' },
            { name: 'Cheater', value: 'CHEATER' },
            { name: 'Supporter', value: 'SUPPORTER' },
            { name: 'Owner', value: 'OWNER' },
          ],
          required: true,
        },
        {
          name: 'status',
          description: 'The status for all users.',
          type: ApplicationCommandOptionTypes.String,
          choices: [
            { name: 'Appealed', value: 'APPEALED' },
            { name: 'Blacklisted', value: 'BLACKLISTED' },
            { name: 'Permanently Blacklisted', value: 'PERM_BLACKLISTED' },
            { name: 'Whitelisted', value: 'WHITELISTED' },
          ],
          required: true,
        },
        {
          name: 'reason',
          description: 'The reason that will be added to all users.',
          type: ApplicationCommandOptionTypes.String,
          required: false,
        },
      ],
    },
  ],
  async run(interaction, options) {
    const typedOptions = options as {
      add?: {
        user?: { user: { id: bigint; toggles: { bitfield: number } } }
        server_id?: string
        type?: User['type']
        status?: User['status']
        reason?: string
      }
      bulk?: {
        user_ids?: string
        server_id?: string
        type?: User['type']
        status?: User['status']
        reason?: string
      }
    }

    if (typedOptions.add !== undefined) {
      const {
        user: userOption,
        server_id: serverIdOption,
        type: typeOption,
        status: statusOption,
        reason: reasonOption,
      } = typedOptions.add

      const userId = userOption?.user?.id

      if (!userId || !serverIdOption || !typeOption || !statusOption) {
        const response = commonComponent({
          color: 'orange',
          content: `Please provide all required options.\nMissing options: ${!userId ? 'user ' : ''}${!serverIdOption ? 'server_id ' : ''}${!typeOption ? 'type ' : ''}${!statusOption ? 'status' : ''}`,
        })
        await interaction.respond(response)
        return
      }

      if (!checkIfValidUserId(userId)) {
        const response = commonComponent({
          color: 'red',
          content: 'Invalid user ID provided. Please provide a valid Discord user ID.',
        })
        await interaction.respond(response)
        return
      }

      if (!checkIfValidServerId({ serverId: serverIdOption })) {
        const response = commonComponent({
          color: 'red',
          content: 'Invalid server ID provided. Please provide a valid Discord server ID.',
        })
        await interaction.respond(response)
        return
      }

      const isBot = userOption?.user?.toggles?.bitfield === 1
      if (isBot) {
        const response = commonComponent({
          color: 'orange',
          content: `<@${userId}> is a bot. Bots are not subject to blacklisting.`,
        })
        await interaction.respond(response)
        return
      }

      await interaction.defer()

      let user: User | null

      try {
        user = await getUserById(userId.toString())
      } catch (err) {
        bot.logger.error(`Error fetching user with ID ${userId}:`, err)
        const response = commonComponent({
          color: 'red',
          content: 'An error occurred while fetching user information. Please try again later.',
        })
        await interaction.respond(response)
        return
      }

      if (user) {
        const response = commonComponent({
          color: 'blue',
          content: `### User <@${userId}> already exists in the database.\nUse \`\`/upstatus\`\` to update the user.`,
        })
        await interaction.respond(response)
        return
      }

      try {
        await addUser({
          id: userId.toString(),
          last_username: 'EMPTY',
          avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
          type: typeOption,
          status: statusOption,
          appeals: 0,
          reason: reasonOption || 'No reason provided.',
          appealedfirst: undefined,
          appealedlast: undefined,
        })
        await addImport({
          id: userId.toString(),
          server: serverIdOption,
          roles: '',
          type: typeOption,
          appealed: false,
          reason: reasonOption || 'No reason provided.',
        })
      } catch (err) {
        bot.logger.error(`Error adding user with ID ${userId}:`, err)
        const response = commonComponent({
          color: 'red',
          content: 'An error occurred while adding the user. Please try again later.',
        })
        await interaction.respond(response)
        return
      }

      const response = commonComponent({
        color: 'blue',
        content: `### User <@${userId}> is added to the database with status \`\`${mapUserStatus(statusOption)}\`\` and type \`\`${mapUserTypes([typeOption])[0].label}\`\`.\n**Reason:** ${reasonOption || 'No reason provided.'}`,
      })
      await interaction.respond(response)
      return
    }

    if (typedOptions.bulk !== undefined) {
      const {
        user_ids: userIdsRaw,
        server_id: serverIdOption,
        type: typeOption,
        status: statusOption,
        reason: reasonOption,
      } = typedOptions.bulk

      if (!userIdsRaw || !serverIdOption || !typeOption || !statusOption) {
        const response = commonComponent({
          color: 'orange',
          content: `Please provide all required options.\nMissing options: ${!userIdsRaw ? 'user_ids ' : ''}${!serverIdOption ? 'server_id ' : ''}${!typeOption ? 'type ' : ''}${!statusOption ? 'status' : ''}`,
        })
        await interaction.respond(response)
        return
      }

      if (!checkIfValidServerId({ serverId: serverIdOption })) {
        const response = commonComponent({
          color: 'red',
          content: 'Invalid server ID provided. Please provide a valid Discord server ID.',
        })
        await interaction.respond(response)
        return
      }

      const userIds = [
        ...new Set(
          userIdsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ]
      const invalidIds = userIds.filter((id) => !/^\d{17,19}$/.test(id))

      if (invalidIds.length > 0) {
        const response = commonComponent({
          color: 'orange',
          content: `Invalid user IDs: ${invalidIds.map((id) => `\`${id}\``).join(', ')}`,
        })
        await interaction.respond(response)
        return
      }

      await interaction.defer()

      const added: string[] = []
      const alreadyExists: string[] = []
      const failed: string[] = []

      const results = await Promise.allSettled(
        userIds.map(async (userId) => {
          const existing = await getUserById(userId)
          if (existing) return { outcome: 'alreadyExists' as const, userId }
          await addUser({
            id: userId,
            last_username: 'EMPTY',
            avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
            type: typeOption,
            status: statusOption,
            appeals: 0,
            reason: reasonOption || 'No reason provided.',
            appealedfirst: undefined,
            appealedlast: undefined,
          })
          await addImport({
            id: userId,
            server: serverIdOption,
            roles: '',
            type: typeOption,
            appealed: false,
            reason: reasonOption || 'No reason provided.',
          })
          return { outcome: 'added' as const, userId }
        }),
      )

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'fulfilled') {
          if (result.value.outcome === 'alreadyExists') alreadyExists.push(result.value.userId)
          else added.push(result.value.userId)
        } else {
          bot.logger.error(`Error processing user ${userIds[i]} in bulk add:`, result.reason)
          failed.push(userIds[i])
        }
      }

      const cacheKey = String(interaction.id)
      await set(
        `${ADDUSER_BULK_CACHE_PREFIX}${cacheKey}`,
        JSON.stringify({
          added,
          alreadyExists,
          failed,
          type: typeOption,
          status: statusOption,
          reason: reasonOption || 'No reason provided.',
        }),
        ADDUSER_BULK_CACHE_TTL,
      )
      await addUserBulkMessage(interaction as Interaction, 0, cacheKey, true)
    }
  },
})
