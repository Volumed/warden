import { ApplicationCommandOptionTypes, BitwisePermissionFlags } from '@discordeno/bot'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { addImport, addUser, getUserById, type User } from '../../postgresql/db.js'
import { commonComponent } from '../../utils/components.js'
import { checkIfValidServerId } from '../../utils/server.js'
import { checkIfValidUserId } from '../../utils/user.js'

createCommand({
  name: 'adduser',
  description: 'Add a user to the database.',
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
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
  async run(interaction, options) {
    const {
      user: userOption,
      server_id: serverIdOption,
      type: typeOption,
      status: statusOption,
      reason: reasonOption,
    } = options as {
      user: { user: { id: bigint; toggles: { bitfield: number } } }
      server_id: string
      type: User['type']
      status: User['status']
      reason: string
    }
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

    if (user) {
      const response = commonComponent({
        color: 'blue',
        content: `### User <@${userId}> already exists in the database.\nUse \`\`/upstatus\`\` to update the user.`,
      })

      await interaction.respond(response)
      return
    }

    try {
      await Promise.all([
        addUser({
          id: userId.toString(),
          last_username: 'EMPTY',
          avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
          type: typeOption,
          status: statusOption,
          appeals: 0,
          reason: reasonOption || 'No reason provided.',
          appealedfirst: undefined,
          appealedlast: undefined,
        }),
        addImport({
          id: userId.toString(),
          server: serverIdOption,
          roles: '',
          type: typeOption,
          appealed: false,
          reason: reasonOption || 'No reason provided.',
        }),
      ])
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
      content: `### User <@${userId}> is added to the database with status \`\`${statusOption}\`\` and type \`\`${typeOption}\`\`.\n**Reason:** ${reasonOption || 'No reason provided.'}`,
    })

    await interaction.respond(response)
  },
})
