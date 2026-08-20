import { ApplicationCommandOptionTypes, MessageComponentTypes, MessageFlags } from '@discordeno/bot'
import {
  type BadServer,
  getServerRoleImportsById,
  getUserById,
  getUserImportsCountById,
  getUserImportsTypesById,
  type User,
} from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'
import { serverTypeMap } from '../../utils/server.js'
import { checkIfValidUserId, mapUserStatus, mapUserTypes } from '../../utils/user.js'

interface ExtraDetails {
  type: User['type']
  server_type: BadServer['type'] | null
}

createCommand({
  name: 'checkuser',
  description: 'Check if a user is blacklisted.',
  options: [
    {
      name: 'user',
      description: 'The user to check.',
      type: ApplicationCommandOptionTypes.User,
      required: true,
    },
  ],
  async run(interaction, options) {
    const { user: userOption } = options as { user: { user: { id: bigint; toggles: { bitfield: number } } } }
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
      content: `<@${userId}> is a bot. Bots are not subject to blacklisting. If you believe this is incorrect, please submit a support ticket.`,
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
      content: [
        `### User <@${userId}> is not blacklisted.`,
        `They are either fine or not yet listed. If you believe this is incorrect, please submit a report ticket.`,
      ].join('\n'),
    })

    if (!user) {
      await interaction.respond(notBlacklistedResponse)
      return
    }

    if (user.type === 'BOT') {
      await interaction.respond(botResponse)
      return
    }

    if (user.status !== 'BLACKLISTED' && user.status !== 'PERM_BLACKLISTED') {
      await interaction.respond(notBlacklistedResponse)
      return
    }

    let countImports: number
    try {
      countImports = await getUserImportsCountById(userId.toString())
    } catch (err) {
      bot.logger.error(`Error fetching import count for user ID ${userId}:`, err)
      const response = commonComponent({
        color: 'red',
        content: 'An error occurred while fetching import count. Please try again later.',
      })
      await interaction.respond(response)
      return
    }

    let userTypes: User['type'][] = []
    try {
      userTypes = await getUserImportsTypesById(userId.toString())
    } catch (err) {
      bot.logger.error(`Error fetching import types for user ID ${userId}:`, err)
      const response = commonComponent({
        color: 'red',
        content: 'An error occurred while fetching import types. Please try again later.',
      })
      await interaction.respond(response)
      return
    }

    userTypes.push(user.type)

    const userTypeMapping = mapUserTypes(userTypes)

    let extraDetials

    if (userTypes.includes('SUPPORTER') || userTypes.includes('OWNER')) {
      try {
        extraDetials = await getServerRoleImportsById(userId.toString())
      } catch (err) {
        bot.logger.error(`Error fetching supporter/owner imports for user ID ${userId}:`, err)
        const response = commonComponent({
          color: 'red',
          content: 'An error occurred while fetching supporter/owner import details. Please try again later.',
        })
        await interaction.respond(response)
        return
      }
    }

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
                `### <@${userId}> is blacklisted!${countImports !== 0 ? ` They have been seen in ${countImports} server${countImports === 1 ? '' : 's'}.` : ''}`,
                `> **Status**: \`\`${mapUserStatus(user.status)}\`\``,
                `> **Type${userTypeMapping.length > 1 ? 's' : ''}**: \`\`${userTypeMapping.map((type) => type?.label).join(', ')}\`\``,
              ].join('\n'),
            },
            {
              type: MessageComponentTypes.Separator as const,
            },
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: `${userTypeMapping.map((type) => `**${type?.label}** \`\`\`${type?.description}\`\`\``).join('\n')}`,
            },
            ...(extraDetials && extraDetials.length > 0
              ? [
                  {
                    type: MessageComponentTypes.Separator as const,
                  },
                  {
                    type: MessageComponentTypes.TextDisplay as const,
                    content: `### Extra Details\n${extraDetials
                      .filter(
                        (detail, index, self) =>
                          index ===
                          self.findIndex((d) => d.type === detail.type && d.server_type === detail.server_type),
                      )
                      .map(
                        (detail: ExtraDetails) =>
                          `User is \`${mapUserTypes([detail.type])
                            .map((t) => t?.label)
                            .join(
                              ', ',
                            )}\` in a \`${detail.server_type ? serverTypeMap({ type: detail.server_type })?.label : 'Unknown'}\` server.`,
                      )
                      .join('\n')}`,
                  },
                ]
              : []),
          ],
        },
      ],
    }

    await interaction.respond(response)
  },
})
