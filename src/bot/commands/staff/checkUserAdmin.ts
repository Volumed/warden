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
import {
  type BadServer,
  getImportHistoryWithServerByUserId,
  getImportsWithServerByUserId,
  getUserById,
  getUserImportsCountById,
  getUserImportsTypesById,
  type Import,
  type User,
} from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { get, set, ttl } from '../../redis/redis.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'
import { serverTypeMap } from '../../utils/server.js'
import { checkIfValidUserId, mapUserStatus, mapUserTypes } from '../../utils/user.js'

export const CHECK_USER_ADMIN_CACHE_PREFIX = 'checkuseradmin:'
export const CHECK_USER_ADMIN_CACHE_TTL = 300 // 5 minutes
export const BULK_CHECK_USERS_CACHE_PREFIX = 'bulkcheckuseradmin:'
export const BULK_CHECK_USERS_CACHE_TTL = 300 // 5 minutes

const MAX_SERVERS_PER_PAGE = 5
const CHECK_USER_ADMIN_CACHE_TTL_WARN = 30 // disable buttons when ≤30s remain
const sessionState = new Map<string, { page: number; view: 'main' | 'history' }>()

const MAX_BULK_USERS_PER_PAGE = 6
const BULK_CHECK_USERS_CACHE_TTL_WARN = 30
const bulkCheckUsersPage = new Map<string, number>()

export interface BulkCheckUsersResult {
  results: Array<{ userId: string; user: User | null; importCount: number; importTypes: Import['type'][] }>
}

const pushImportEntries = (
  containerComponents: Array<TextDisplayComponent | SeparatorComponent | ActionRow>,
  entries: (Import & { server: BadServer | null })[],
  page: number,
  cacheKey: string,
  rolesPrefix: string,
  disableButtons: boolean,
) => {
  for (let i = 0; i < entries.length; i++) {
    const imported = entries[i]
    const globalIndex = page * MAX_SERVERS_PER_PAGE + i
    const importRoles = imported.roles
      ? imported.roles
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : []
    containerComponents.push({
      type: MessageComponentTypes.TextDisplay as const,
      content: [
        `**${imported.server?.name ?? 'Unknown'}**`,
        `-# ID: ${imported.server?.id ?? 'Unknown'} · Type: ${serverTypeMap({ type: imported.server?.type ?? null }).label}`,
        `> **Type**: \`\`${mapUserTypes([imported.type])[0].label}\`\``,
        importRoles.length > 10
          ? '> **Roles**: *Too many to display — click the button below*'
          : importRoles.length > 0
            ? `> **Role${importRoles.length > 1 ? 's' : ''}**: \`\`${importRoles.join(', ')}\`\``
            : '> **Roles**: `N/A`',
        `> **First Seen**: <t:${Math.floor(new Date(imported.createdat).getTime() / 1000)}:f>`,
        imported.updatedat
          ? `> **Last Seen**: <t:${Math.floor(new Date(imported.updatedat).getTime() / 1000)}:f>`
          : '> **Last Seen**: `N/A`',
      ].join('\n'),
    })
    if (importRoles.length > 10) {
      containerComponents.push({
        type: MessageComponentTypes.ActionRow as const,
        components: [
          {
            type: MessageComponentTypes.Button as const,
            label: `View all ${importRoles.length} roles`,
            customId: `${rolesPrefix}-${globalIndex}-${cacheKey}`,
            style: 2,
            disabled: disableButtons,
          },
        ],
      })
    }
    if (i < entries.length - 1) {
      containerComponents.push({ type: MessageComponentTypes.Separator as const })
    }
  }
}

export const checkUserAdminMessage = async (
  interaction: Interaction,
  page: number,
  cacheKey: string,
  newMessage: boolean,
) => {
  const cached = await get(`${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`)

  if (!cached) {
    const response = commonComponent({
      color: 'orange',
      content: 'This check session has expired. Please run the command again.',
    })
    if (newMessage) await interaction.respond(response)
    else await interaction.edit(response)
    return
  }

  const remaining = await ttl(`${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`)
  const isExpiring = remaining >= 0 && remaining <= CHECK_USER_ADMIN_CACHE_TTL_WARN

  const { user, imports, history } = JSON.parse(cached) as {
    user: User
    imports: (Import & { server: BadServer | null })[]
    history: (Import & { server: BadServer | null })[]
  }
  const totalPages = Math.max(1, Math.ceil(imports.length / MAX_SERVERS_PER_PAGE))
  const isLastPage = page >= totalPages - 1
  const pageServers = imports.slice(page * MAX_SERVERS_PER_PAGE, (page + 1) * MAX_SERVERS_PER_PAGE)

  const containerComponents: Array<TextDisplayComponent | SeparatorComponent | ActionRow> = []

  const importTypes = imports.map((imp) => imp.type)
  const userTypeMapping = mapUserTypes([user.type, ...importTypes])

  containerComponents.push({
    type: MessageComponentTypes.TextDisplay as const,
    content: [
      `### <@${user.id}> is blacklisted!${imports.length !== 0 ? ` They have been seen in ${imports.length} server${imports.length === 1 ? '' : 's'}.` : ''}`,
      `> **Status**: \`\`${mapUserStatus(user.status)}\`\``,
      `> **Type${userTypeMapping.length > 1 ? 's' : ''}**: \`\`${userTypeMapping.map((type) => type?.label).join(', ')}\`\``,
    ].join('\n'),
  })

  if (history.length > 0) {
    containerComponents.push({
      type: MessageComponentTypes.ActionRow as const,
      components: [
        {
          type: MessageComponentTypes.Button as const,
          label: `View History (${history.length})`,
          customId: `checkuseradminhistory-first-0-${cacheKey}`,
          style: 2,
          disabled: isExpiring,
        },
      ],
    })
  }

  if (pageServers.length > 0) {
    containerComponents.push({ type: MessageComponentTypes.Separator as const })
    pushImportEntries(containerComponents, pageServers, page, cacheKey, 'checkuseradmin-roles', isExpiring)
  }

  if (totalPages > 1) {
    containerComponents.push({ type: MessageComponentTypes.Separator as const })
    containerComponents.push({
      type: MessageComponentTypes.ActionRow as const,
      components: [
        {
          type: MessageComponentTypes.Button as const,
          label: '❮',
          customId: `checkuseradmin-previous-${page}-${cacheKey}`,
          style: 1,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❮❮',
          customId: `checkuseradmin-first-0-${cacheKey}`,
          style: 2,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: `${page + 1} / ${totalPages}`,
          customId: 'checkuseradmin-page-indicator',
          style: 2,
          disabled: true,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯❯',
          customId: `checkuseradmin-last-${totalPages - 1}-${cacheKey}`,
          style: 2,
          disabled: isLastPage || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯',
          customId: `checkuseradmin-next-${page}-${cacheKey}`,
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
        accentColor: imports.length > 0 ? componentColors.blue : componentColors.orange,
        components: containerComponents,
      },
    ],
  }

  sessionState.set(cacheKey, { page, view: 'main' })

  if (newMessage) {
    await interaction.respond(response)
    // Proactively disable all buttons before the cache expires
    setTimeout(
      () => {
        const state = sessionState.get(cacheKey) ?? { page: 0, view: 'main' as const }
        const fn = state.view === 'history' ? checkUserAdminHistoryMessage : checkUserAdminMessage
        fn(interaction, state.page, cacheKey, false).catch(() => {})
        sessionState.delete(cacheKey)
      },
      (CHECK_USER_ADMIN_CACHE_TTL - CHECK_USER_ADMIN_CACHE_TTL_WARN) * 1000,
    )
  } else {
    await interaction.edit(response)
  }
}

export const showUserImportRoles = async (interaction: Interaction, importIndex: number, cacheKey: string) => {
  const cached = await get(`${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`)

  if (!cached) {
    return interaction.respond({
      ...commonComponent({ color: 'orange', content: 'This session has expired. Please run the command again.' }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    })
  }

  const { imports } = JSON.parse(cached) as { imports: (Import & { server: BadServer | null })[] }
  const imported = imports[importIndex]

  if (!imported) {
    return interaction.respond({
      ...commonComponent({ color: 'red', content: 'Could not find the import data.' }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    })
  }

  const roles = imported.roles
    ? imported.roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
        .sort()
    : []

  return interaction.respond({
    ...commonComponent({
      color: 'blue',
      content: `### Roles for ${imported.server?.name ?? 'Unknown'}\n${roles.join(', ')}`,
    }),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  })
}

export const checkUserAdminHistoryMessage = async (
  interaction: Interaction,
  page: number,
  cacheKey: string,
  newMessage: boolean,
  showBackButton = true,
) => {
  const cached = await get(`${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`)

  if (!cached) {
    return interaction.respond({
      ...commonComponent({ color: 'orange', content: 'This session has expired. Please run the command again.' }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    })
  }

  const remaining = await ttl(`${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`)
  const isExpiring = remaining >= 0 && remaining <= CHECK_USER_ADMIN_CACHE_TTL_WARN

  const { user, imports, history } = JSON.parse(cached) as {
    user: User
    imports: (Import & { server: BadServer | null })[]
    history: (Import & { server: BadServer | null })[]
  }
  const totalPages = Math.max(1, Math.ceil(history.length / MAX_SERVERS_PER_PAGE))
  const isLastPage = page >= totalPages - 1
  const pageEntries = history.slice(page * MAX_SERVERS_PER_PAGE, (page + 1) * MAX_SERVERS_PER_PAGE)

  const importTypes = imports.map((imp) => imp.type)
  const userTypeMapping = mapUserTypes([user.type, ...importTypes])
  const historyPrefix = showBackButton ? 'checkuseradminhistory' : 'checkuseradminhistorynb'

  const containerComponents: Array<TextDisplayComponent | SeparatorComponent | ActionRow> = []

  containerComponents.push({
    type: MessageComponentTypes.TextDisplay as const,
    content: [
      `### History of <@${user.id}> with a total of ${history.length} server${history.length === 1 ? '' : 's'}`,
      `> **Status**: \`\`${mapUserStatus(user.status)}\`\``,
      `> **Type${userTypeMapping.length > 1 ? 's' : ''}**: \`\`${userTypeMapping.map((type) => type?.label).join(', ')}\`\``,
    ].join('\n'),
  })

  if (showBackButton) {
    containerComponents.push({
      type: MessageComponentTypes.ActionRow as const,
      components: [
        {
          type: MessageComponentTypes.Button as const,
          label: '← Back',
          customId: `checkuseradmin-back-0-${cacheKey}`,
          style: 2,
          disabled: isExpiring,
        },
      ],
    })
  }

  if (pageEntries.length > 0) {
    containerComponents.push({ type: MessageComponentTypes.Separator as const })
    pushImportEntries(containerComponents, pageEntries, page, cacheKey, `${historyPrefix}-roles`, isExpiring)
  }

  if (totalPages > 1) {
    containerComponents.push({ type: MessageComponentTypes.Separator as const })
    containerComponents.push({
      type: MessageComponentTypes.ActionRow as const,
      components: [
        {
          type: MessageComponentTypes.Button as const,
          label: '❮',
          customId: `${historyPrefix}-previous-${page}-${cacheKey}`,
          style: 1,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❮❮',
          customId: `${historyPrefix}-first-0-${cacheKey}`,
          style: 2,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: `${page + 1} / ${totalPages}`,
          customId: `${historyPrefix}-page-indicator`,
          style: 2,
          disabled: true,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯❯',
          customId: `${historyPrefix}-last-${totalPages - 1}-${cacheKey}`,
          style: 2,
          disabled: isLastPage || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯',
          customId: `${historyPrefix}-next-${page}-${cacheKey}`,
          style: 1,
          disabled: isLastPage || isExpiring,
        },
      ],
    })
  }

  const response = {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [
      {
        type: MessageComponentTypes.Container as const,
        accentColor: componentColors.blue,
        components: containerComponents,
      },
    ],
  }

  sessionState.set(cacheKey, { page, view: 'history' })

  if (newMessage) await interaction.respond(response)
  else await interaction.edit(response)
}

export const showUserHistoryRoles = async (interaction: Interaction, importIndex: number, cacheKey: string) => {
  const cached = await get(`${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`)

  if (!cached) {
    return interaction.respond({
      ...commonComponent({ color: 'orange', content: 'This session has expired. Please run the command again.' }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    })
  }

  const { history } = JSON.parse(cached) as { history: (Import & { server: BadServer | null })[] }
  const imported = history[importIndex]

  if (!imported) {
    return interaction.respond({
      ...commonComponent({ color: 'red', content: 'Could not find the import data.' }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    })
  }

  const roles = imported.roles
    ? imported.roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
        .sort()
    : []

  return interaction.respond({
    ...commonComponent({
      color: 'blue',
      content: `### Roles for ${imported.server?.name ?? 'Unknown'}\n${roles.join(', ')}`,
    }),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  })
}

export const bulkCheckUsersMessage = async (
  interaction: Interaction,
  page: number,
  cacheKey: string,
  newMessage: boolean,
) => {
  const cached = await get(`${BULK_CHECK_USERS_CACHE_PREFIX}${cacheKey}`)

  if (!cached) {
    const response = commonComponent({
      color: 'orange',
      content: 'This bulk check session has expired. Please run the command again.',
    })
    if (newMessage) await interaction.respond(response)
    else await interaction.edit(response)
    return
  }

  const remaining = await ttl(`${BULK_CHECK_USERS_CACHE_PREFIX}${cacheKey}`)
  const isExpiring = remaining >= 0 && remaining <= BULK_CHECK_USERS_CACHE_TTL_WARN

  const { results } = JSON.parse(cached) as BulkCheckUsersResult
  const blacklistedCount = results.filter(
    (r) => r.user && (r.user.status === 'BLACKLISTED' || r.user.status === 'PERM_BLACKLISTED'),
  ).length
  const totalPages = Math.max(1, Math.ceil(results.length / MAX_BULK_USERS_PER_PAGE))
  const isLastPage = page >= totalPages - 1
  const pageResults = results.slice(page * MAX_BULK_USERS_PER_PAGE, (page + 1) * MAX_BULK_USERS_PER_PAGE)

  const containerComponents: Array<TextDisplayComponent | SeparatorComponent | ActionRow> = []

  containerComponents.push({
    type: MessageComponentTypes.TextDisplay as const,
    content: `### Bulk check — ${blacklistedCount} blacklisted of ${results.length}`,
  })

  if (pageResults.length > 0) {
    containerComponents.push({ type: MessageComponentTypes.Separator as const })
    for (let i = 0; i < pageResults.length; i++) {
      const { userId, user, importCount, importTypes } = pageResults[i]
      const userTypeMapping = user ? mapUserTypes([user.type, ...importTypes]) : null

      containerComponents.push({
        type: MessageComponentTypes.TextDisplay as const,
        content: [
          `<@${userId}>`,
          `-# ID: ${userId}${importCount ? ` · ${importCount} server${importCount === 1 ? '' : 's'}` : ''}`,
          `${user !== null ? `> **Status**: \`\`${mapUserStatus(user.status)}\`\`` : '> Not found'}`,
          userTypeMapping
            ? `> **Type${userTypeMapping.length > 1 ? 's' : ''}**: \`\`${userTypeMapping.map((type) => type?.label).join(', ')}\`\``
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      })
      if (i < pageResults.length - 1) {
        containerComponents.push({ type: MessageComponentTypes.Separator as const })
      }
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
          customId: `bulkcheckuseradmin-previous-${page}-${cacheKey}`,
          style: 1,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❮❮',
          customId: `bulkcheckuseradmin-first-0-${cacheKey}`,
          style: 2,
          disabled: page === 0 || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: `${page + 1} / ${totalPages}`,
          customId: 'bulkcheckuseradmin-page-indicator',
          style: 2,
          disabled: true,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯❯',
          customId: `bulkcheckuseradmin-last-${totalPages - 1}-${cacheKey}`,
          style: 2,
          disabled: isLastPage || isExpiring,
        },
        {
          type: MessageComponentTypes.Button as const,
          label: '❯',
          customId: `bulkcheckuseradmin-next-${page}-${cacheKey}`,
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
        accentColor: blacklistedCount > 0 ? componentColors.blue : componentColors.orange,
        components: containerComponents,
      },
    ],
  }

  bulkCheckUsersPage.set(cacheKey, page)

  if (newMessage) {
    await interaction.respond(response)
    // Proactively disable all buttons before the cache expires
    setTimeout(
      () => {
        bulkCheckUsersMessage(interaction, bulkCheckUsersPage.get(cacheKey) ?? page, cacheKey, false).catch(() => {})
        bulkCheckUsersPage.delete(cacheKey)
      },
      (BULK_CHECK_USERS_CACHE_TTL - BULK_CHECK_USERS_CACHE_TTL_WARN) * 1000,
    )
  } else {
    await interaction.edit(response)
  }
}

const checkUserAdminRun: Parameters<typeof createCommand>[0]['run'] = async (interaction, options) => {
  const typedOptions = options as {
    check?: { user?: { user: { id: bigint; toggles: { bitfield: number } } } }
    bulk?: { user_ids?: string }
  }

  if (typedOptions.bulk !== undefined) {
    const { user_ids: userIdsRaw } = typedOptions.bulk

    if (!userIdsRaw) {
      await interaction.respond(
        commonComponent({ color: 'orange', content: 'Please provide comma-separated user IDs.' }),
      )
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
      await interaction.respond(
        commonComponent({
          color: 'orange',
          content: `Invalid user IDs: ${invalidIds.map((id) => `\`${id}\``).join(', ')}`,
        }),
      )
      return
    }

    await interaction.defer()

    const results = await Promise.all(
      userIds.map(async (userId) => {
        const [user, importCount, importTypes] = await Promise.all([
          getUserById(userId).catch(() => null),
          getUserImportsCountById(userId).catch(() => 0),
          getUserImportsTypesById(userId).catch(() => []),
        ])
        return { userId, user, importCount, importTypes }
      }),
    )

    const cacheKey = String(interaction.id)
    await set(`${BULK_CHECK_USERS_CACHE_PREFIX}${cacheKey}`, JSON.stringify({ results }), BULK_CHECK_USERS_CACHE_TTL)

    await bulkCheckUsersMessage(interaction as Interaction, 0, cacheKey, true)
    return
  }

  // check subcommand
  const { user: userOption } = (typedOptions.check ?? {}) as {
    user?: { user: { id: bigint; toggles: { bitfield: number } } }
  }
  const userId = userOption?.user?.id

  if (!userId) {
    const response = commonComponent({
      color: 'orange',
      content: 'Please provide a user ID.',
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

  const isBot = userOption?.user?.toggles?.bitfield === 1
  const botResponse = commonComponent({
    color: 'orange',
    content: `<@${userId}> is a bot. Bots are not subject to blacklisting.`,
  })

  if (isBot) {
    await interaction.respond(botResponse)
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

  const notBlacklistedResponse = commonComponent({
    color: 'blue',
    content: [`### User <@${userId}> is not blacklisted.`].join('\n'),
  })

  let history: (Import & { server: BadServer | null })[] = []

  try {
    history = await getImportHistoryWithServerByUserId(userId.toString())
  } catch (err) {
    bot.logger.error(`Error fetching imports for user with ID ${userId}:`, err)
    const response = commonComponent({
      color: 'red',
      content: 'An error occurred while fetching user imports. Please try again later.',
    })
    await interaction.respond(response)
    return
  }

  if (!user || (user.status !== 'BLACKLISTED' && user.status !== 'PERM_BLACKLISTED')) {
    if (user && history.length > 0) {
      const cacheKey = String(interaction.id)
      await set(
        `${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`,
        JSON.stringify({ user, imports: [], history }),
        CHECK_USER_ADMIN_CACHE_TTL,
      )
      await interaction.respond({
        flags: MessageFlags.IsComponentsV2,
        components: [
          {
            type: MessageComponentTypes.Container as const,
            accentColor: componentColors.blue,
            components: [
              {
                type: MessageComponentTypes.TextDisplay as const,
                content: [
                  `### User <@${userId}> is not blacklisted.`,
                  `They have ${history.length} historical entr${history.length === 1 ? 'y' : 'ies'}.`,
                ].join('\n'),
              },
              {
                type: MessageComponentTypes.ActionRow as const,
                components: [
                  {
                    type: MessageComponentTypes.Button as const,
                    label: `View History (${history.length})`,
                    customId: `checkuseradminhistorynb-first-0-${cacheKey}`,
                    style: 2,
                  },
                ],
              },
            ],
          },
        ],
      })
      return
    }
    await interaction.respond(notBlacklistedResponse)
    return
  }

  if (user.type === 'BOT') {
    await interaction.respond(botResponse)
    return
  }

  let imports: (Import & { server: BadServer | null })[] = []
  try {
    imports = await getImportsWithServerByUserId(userId.toString())
  } catch (err) {
    bot.logger.error(`Error fetching imports for user with ID ${userId}:`, err)
    const response = commonComponent({
      color: 'red',
      content: 'An error occurred while fetching user imports. Please try again later.',
    })
    await interaction.respond(response)
    return
  }

  if (imports.length === 0) {
    const response = commonComponent({
      color: 'blue',
      content: [
        `### User <@${userId}> is blacklisted, but no imports were found.`,
        'User has been added to the appeal queue.',
      ].join('\n'),
    })
    // TODO: Implement appeal queue and logic to handle the appeal process
    await interaction.respond(response)
    return
  }

  const cacheKey = String(interaction.id)
  await set(
    `${CHECK_USER_ADMIN_CACHE_PREFIX}${cacheKey}`,
    JSON.stringify({ user, imports, history }),
    CHECK_USER_ADMIN_CACHE_TTL,
  )

  await checkUserAdminMessage(interaction as Interaction, 0, cacheKey, true)
}

const checkUserAdminCommandOptions = {
  options: [
    {
      name: 'check',
      description: 'Check a single user by ID.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user',
          description: 'The user to check.',
          type: ApplicationCommandOptionTypes.User,
          required: true,
        },
      ],
    },
    {
      name: 'bulk',
      description: 'Check multiple users at once via comma-separated IDs.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user_ids',
          description: 'Comma-separated user IDs to check.',
          type: ApplicationCommandOptionTypes.String,
          required: false,
        },
      ],
    },
  ],
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  run: checkUserAdminRun,
}

createCommand({ name: 'checkuseradmin', description: 'Check user as admin.', ...checkUserAdminCommandOptions })
createCommand({ name: 'cua', description: 'Alias for /checkuseradmin.', ...checkUserAdminCommandOptions })
