import { type Interaction, MessageComponentTypes, MessageFlags } from '@discordeno/bot'
import { type BadServer, getServersByImportId, getUserById, type User } from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'
import { serverTypeMap } from '../../utils/server.js'

const MAX_SERVERS_PER_PAGE = 6

const pager = async (
  userId: string,
  page: number,
): Promise<{ imports: BadServer[]; hasMore: boolean; totalPages: number }> => {
  const resultFetch = await getServersByImportId(userId)
  const result = resultFetch.sort((a, b) => b.createdat.getTime() - a.createdat.getTime())
  const startIndex = page * MAX_SERVERS_PER_PAGE
  const endIndex = startIndex + MAX_SERVERS_PER_PAGE
  return {
    imports: result.slice(startIndex, endIndex),
    hasMore: result.length > endIndex,
    totalPages: Math.ceil(result.length / MAX_SERVERS_PER_PAGE),
  }
}

export const checkSelfMessage = async (userId: string, interaction: Interaction, page: number, newMessage: boolean) => {
  try {
    const { imports, hasMore, totalPages } = await pager(userId, page)

    const checkSelfComponents =
      imports.length > 0
        ? imports.flatMap((s: BadServer, i: number) => [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [
                `**${s.name}**`,
                `-# ID: ${s.id} · Type: ${serverTypeMap({ type: s.type }).label}\nDate Added: <t:${Math.floor(new Date(s.createdat).getTime() / 1000)}:f>`,
              ].join('\n'),
            },
            ...(i < imports.length - 1 ? [{ type: MessageComponentTypes.Separator as const }] : []),
          ])
        : [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [
                'No servers found. This can happen for two reasons:',
                '- You were never added to the blacklist for any server;\n- You were previously added, but all associated servers have since been removed from the blacklist.',
              ].join('\n'),
            },
          ]

    const components = [
      {
        type: MessageComponentTypes.TextDisplay as const,
        content: `### You are blacklisted. Here are the servers you were added for:`,
      },
      {
        type: MessageComponentTypes.Separator as const,
      },
      ...checkSelfComponents,
      {
        type: MessageComponentTypes.Separator as const,
      },
      {
        type: MessageComponentTypes.ActionRow as const,
        components: [
          {
            type: MessageComponentTypes.Button as const,
            label: '❮',
            customId: `checkself-previous-${String(page)}`,
            style: 1,
            disabled: imports.length > 0 ? page === 0 : true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: '❮❮',
            customId: `checkself-first-${String(0)}`,
            style: 2,
            disabled: imports.length > 0 ? page === 0 : true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: `${page + 1} / ${imports.length > 0 ? totalPages : 1}`,
            customId: `checkself-page-indicator`,
            style: 2,
            disabled: true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: '❯❯',
            customId: `checkself-last-${String(totalPages - 1)}`,
            style: 2,
            disabled: imports.length > 0 ? page === totalPages - 1 : true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: '❯',
            customId: `checkself-next-${String(page)}`,
            style: 1,
            disabled: imports.length > 0 ? !hasMore : true,
          },
        ],
      },
      {
        type: MessageComponentTypes.Separator as const,
      },
      {
        type: MessageComponentTypes.TextDisplay as const,
        content:
          "**This doesn't mean you are currently in these servers, just that you were added to the blacklist for being in them at some point.**",
      },
    ]

    if (newMessage) {
      await interaction.respond({
        flags: MessageFlags.IsComponentsV2,
        components: [
          {
            type: MessageComponentTypes.Container,
            accentColor: componentColors.blue,
            components,
          },
        ],
      })
    } else {
      await interaction.edit({
        flags: MessageFlags.IsComponentsV2,
        components: [
          {
            type: MessageComponentTypes.Container,
            accentColor: componentColors.blue,
            components,
          },
        ],
      })
    }
  } catch (error) {
    bot.logger.error('Error in checkSelfMessage:', error)
    const response = commonComponent({
      color: 'red',
      content: 'An error occurred while fetching the imports. Please try again later.',
    })
    if (newMessage) {
      await interaction.respond(response)
    } else {
      await interaction.edit(response)
    }
  }
}

createCommand({
  name: 'checkself',
  description: 'Check if you are blacklisted.',
  async run(interaction) {
    const userId = interaction.user.id

    await interaction.defer(true)

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
      content: ['### You are not blacklisted.'].join('\n'),
    })

    if (!user || (user.status !== 'BLACKLISTED' && user.status !== 'PERM_BLACKLISTED')) {
      await interaction.respond(notBlacklistedResponse)
      return
    }

    await checkSelfMessage(userId.toString(), interaction as Interaction, 0, true)
  },
})
