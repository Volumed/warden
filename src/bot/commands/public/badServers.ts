import { type Interaction, MessageComponentTypes, MessageFlags } from '@discordeno/bot'
import { ApplicationCommandTypes } from '@discordeno/types'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { type BadServer, getAllBadServers } from '../../postgresql/db.js'
import { get, set } from '../../redis/redis.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'
import { serverTypeMap } from '../../utils/server.js'

const MAX_SERVERS_PER_PAGE = 10
const BAD_SERVERS_CACHE_KEY = 'badservers:list'

const pager = async (page: number): Promise<{ servers: BadServer[]; hasMore: boolean; totalPages: number }> => {
  const cached = await get(BAD_SERVERS_CACHE_KEY)
  let result: BadServer[]
  if (cached) {
    result = JSON.parse(cached) as BadServer[]
  } else {
    const resultFetch = await getAllBadServers()
    result = resultFetch.sort((a, b) => b.createdat.getTime() - a.createdat.getTime())
    await set(BAD_SERVERS_CACHE_KEY, JSON.stringify(result), 1200)
  }

  const startIndex = page * MAX_SERVERS_PER_PAGE
  const endIndex = startIndex + MAX_SERVERS_PER_PAGE
  return {
    servers: result.slice(startIndex, endIndex),
    hasMore: result.length > endIndex,
    totalPages: Math.ceil(result.length / MAX_SERVERS_PER_PAGE),
  }
}

export const badServersMessage = async (interaction: Interaction, page: number, newMessage: boolean) => {
  try {
    const { servers, hasMore, totalPages } = await pager(page)

    const serverComponents =
      servers.length > 0
        ? servers.flatMap((s: BadServer, i: number) => [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [
                `**${s.name}**`,
                `-# ID: ${s.id} · Type: ${serverTypeMap({ type: s.type }).label}\nDate Added: <t:${Math.floor(new Date(s.createdat).getTime() / 1000)}:f>`,
              ].join('\n'),
            },
            ...(i < servers.length - 1 ? [{ type: MessageComponentTypes.Separator as const }] : []),
          ])
        : [{ type: MessageComponentTypes.TextDisplay as const, content: 'No servers found.' }]

    const components = [
      ...serverComponents,
      {
        type: MessageComponentTypes.Separator as const,
      },
      {
        type: MessageComponentTypes.ActionRow as const,
        components: [
          {
            type: MessageComponentTypes.Button as const,
            label: '❮',
            customId: `badservers-previous-${String(page)}`,
            style: 1,
            disabled: servers.length > 0 ? page === 0 : true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: '❮❮',
            customId: `badservers-first-${String(0)}`,
            style: 2,
            disabled: servers.length > 0 ? page === 0 : true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: `${page + 1} / ${servers.length > 0 ? totalPages : 1}`,
            customId: `badservers-page-indicator`,
            style: 2,
            disabled: true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: '❯❯',
            customId: `badservers-last-${String(totalPages - 1)}`,
            style: 2,
            disabled: servers.length > 0 ? page === totalPages - 1 : true,
          },
          {
            type: MessageComponentTypes.Button as const,
            label: '❯',
            customId: `badservers-next-${String(page)}`,
            style: 1,
            disabled: servers.length > 0 ? !hasMore : true,
          },
        ],
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
    bot.logger.error('Error in badServersMessage:', error)
    const response = commonComponent({
      color: 'red',
      content: 'An error occurred while fetching the bad servers. Please try again later.',
    })
    if (newMessage) {
      await interaction.respond(response)
    } else {
      await interaction.edit(response)
    }
  }
}

createCommand({
  name: 'badservers',
  description: 'Get a list of all blacklisted servers.',
  type: ApplicationCommandTypes.ChatInput,
  async run(interaction) {
    await interaction.defer()
    await badServersMessage(interaction as Interaction, 0, true)
  },
})
