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
import { getUserById, type User, updateUserStatus } from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { get, set, ttl } from '../../redis/redis.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'
import { checkIfValidUserId, mapUserStatus, mapUserTypes } from '../../utils/user.js'

export const UPSTATUS_BULK_CACHE_PREFIX = 'upstatusmulti:'
export const UPSTATUS_BULK_CACHE_TTL = 300 // 5 minutes

const UPSTATUS_BULK_PER_PAGE = 10
const UPSTATUS_BULK_CACHE_TTL_WARN = 30 // disable buttons when ≤30s remain
const upStatusMultiPage = new Map<string, number>()

export interface UpStatusMultiResult {
  updated: string[]
  notFound: string[]
  failed: string[]
  type: User['type']
  status: User['status']
  reason: string
}

export const upStatusMultiMessage = async (
  interaction: Interaction,
  page: number,
  cacheKey: string,
  newMessage: boolean,
) => {
  const cached = await get(`${UPSTATUS_BULK_CACHE_PREFIX}${cacheKey}`)
  if (!cached) {
    const response = commonComponent({
      color: 'orange',
      content: 'This multi update session has expired. Please run the command again.',
    })
    if (newMessage) await interaction.respond(response)
    else await interaction.edit(response)
    return
  }

  const remaining = await ttl(`${UPSTATUS_BULK_CACHE_PREFIX}${cacheKey}`)
  const isExpiring = remaining >= 0 && remaining <= UPSTATUS_BULK_CACHE_TTL_WARN

  const { updated, notFound, failed, type, status, reason } = JSON.parse(cached) as UpStatusMultiResult
  const totalPages = Math.max(1, Math.ceil(updated.length / UPSTATUS_BULK_PER_PAGE))
  const isLastPage = page >= totalPages - 1
  const pageUsers = updated.slice(page * UPSTATUS_BULK_PER_PAGE, (page + 1) * UPSTATUS_BULK_PER_PAGE)

  const containerComponents: Array<TextDisplayComponent | SeparatorComponent | ActionRow> = []

  containerComponents.push({
    type: MessageComponentTypes.TextDisplay as const,
    content: [
      `### Multi update — ${updated.length} updated, ${notFound.length} not found${failed.length > 0 ? `, ${failed.length} failed` : ''}`,

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
    if (notFound.length > 0) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const, divider: true })
      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: ['**Not found:**', notFound.map((id) => `- \`${id}\``).join('\n')].join('\n'),
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
          customId: `upstatusmulti-previous-${page}-${cacheKey}`,
          style: 1,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❮❮',
          customId: `upstatusmulti-first-0-${cacheKey}`,
          style: 2,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: `${page + 1} / ${totalPages}`,
          customId: 'upstatusmulti-page-indicator',
          style: 2,
          disabled: true,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯❯',
          customId: `upstatusmulti-last-${totalPages - 1}-${cacheKey}`,
          style: 2,
          disabled: isLastPage || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯',
          customId: `upstatusmulti-next-${page}-${cacheKey}`,
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
        accentColor: updated.length > 0 ? componentColors.blue : componentColors.orange,
        components: containerComponents,
      },
    ],
  }

  upStatusMultiPage.set(cacheKey, page)

  if (newMessage) {
    await interaction.respond(response)
    // Proactively disable all buttons before the cache expires
    setTimeout(
      () => {
        upStatusMultiMessage(interaction, upStatusMultiPage.get(cacheKey) ?? page, cacheKey, false).catch(() => {})
        upStatusMultiPage.delete(cacheKey)
      },
      (UPSTATUS_BULK_CACHE_TTL - UPSTATUS_BULK_CACHE_TTL_WARN) * 1000,
    )
  } else {
    await interaction.edit(response)
  }
}

createCommand({
  name: 'upstatus',
  description: 'Update the status of a user in the database.',
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  options: [
    {
      name: 'single',
      description: 'Update the status of a single user in the database.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user',
          description: 'The user to update.',
          type: ApplicationCommandOptionTypes.User,
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
          description: 'The reason for updating the user.',
          type: ApplicationCommandOptionTypes.String,
          required: false,
        },
      ],
    },
    {
      name: 'multi',
      description: 'Update multiple users at once with the same server, type, status, and reason.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user_ids',
          description: 'Comma-separated Discord user IDs to update.',
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
          description: 'The reason that will be added to all users when updating.',
          type: ApplicationCommandOptionTypes.String,
          required: false,
        },
      ],
    },
  ],
  async run(interaction, options) {
    const typedOptions = options as {
      single?: {
        user?: { user: { id: bigint; toggles: { bitfield: number } } }
        type?: User['type']
        status?: User['status']
        reason?: string
      }
      multi?: {
        user_ids?: string
        type?: User['type']
        status?: User['status']
        reason?: string
      }
    }

    if (typedOptions.single !== undefined) {
      const { user: userOption, type: typeOption, status: statusOption, reason: reasonOption } = typedOptions.single

      const userId = userOption?.user?.id

      if (!userId || !typeOption || !statusOption) {
        const response = commonComponent({
          color: 'orange',
          content: `Please provide all required options.\nMissing options: ${!userId ? 'user ' : ''}${!typeOption ? 'type ' : ''}${!statusOption ? 'status' : ''}`,
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

      if (!user) {
        const response = commonComponent({
          color: 'orange',
          content: `### User <@${userId}> was not found in the database.`,
        })
        await interaction.respond(response)
        return
      }

      try {
        await updateUserStatus(userId.toString(), typeOption, statusOption, reasonOption || 'No reason provided.')
      } catch (err) {
        bot.logger.error(`Error updating user with ID ${userId}:`, err)
        const response = commonComponent({
          color: 'red',
          content: 'An error occurred while updating the user. Please try again later.',
        })
        await interaction.respond(response)
        return
      }

      const response = commonComponent({
        color: 'blue',
        content: `### User <@${userId}> updated to status \`\`${mapUserStatus(statusOption)}\`\` and type \`\`${mapUserTypes([typeOption])[0].label}\`\`.\n**Reason:** ${reasonOption || 'No reason provided.'}`,
      })
      await interaction.respond(response)
      return
    }

    if (typedOptions.multi !== undefined) {
      const { user_ids: userIdsRaw, type: typeOption, status: statusOption, reason: reasonOption } = typedOptions.multi

      if (!userIdsRaw || !typeOption || !statusOption) {
        const response = commonComponent({
          color: 'orange',
          content: `Please provide all required options.\nMissing options: ${!userIdsRaw ? 'user_ids ' : ''}${!typeOption ? 'type ' : ''}${!statusOption ? 'status' : ''}`,
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

      const updated: string[] = []
      const notFound: string[] = []
      const failed: string[] = []

      const results = await Promise.allSettled(
        userIds.map(async (userId) => {
          const existing = await getUserById(userId)
          if (!existing) return { outcome: 'notFound' as const, userId }
          await updateUserStatus(userId, typeOption, statusOption, reasonOption || 'No reason provided.')
          return { outcome: 'updated' as const, userId }
        }),
      )

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        if (result.status === 'fulfilled') {
          if (result.value.outcome === 'notFound') notFound.push(result.value.userId)
          else updated.push(result.value.userId)
        } else {
          bot.logger.error(`Error processing user ${userIds[i]} in multi update:`, result.reason)
          failed.push(userIds[i])
        }
      }

      const cacheKey = String(interaction.id)
      await set(
        `${UPSTATUS_BULK_CACHE_PREFIX}${cacheKey}`,
        JSON.stringify({
          updated,
          notFound,
          failed,
          type: typeOption,
          status: statusOption,
          reason: reasonOption || 'No reason provided.',
        }),
        UPSTATUS_BULK_CACHE_TTL,
      )
      await upStatusMultiMessage(interaction as Interaction, 0, cacheKey, true)
    }
  },
})
