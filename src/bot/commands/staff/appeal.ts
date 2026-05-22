import { ApplicationCommandOptionTypes, BitwisePermissionFlags } from '@discordeno/bot'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { getUserById, type User } from '../../postgresql/db.js'
import { commonComponent } from '../../utils/components.js'
import { checkIfValidUserId } from '../../utils/user.js'

createCommand({
  name: 'appeal',
  description: "Appeal a user's blacklist status.",
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  options: [
    {
      name: 'user',
      description: 'The user to appeal.',
      type: ApplicationCommandOptionTypes.User,
      required: true,
    },
  ],
  async run(interaction, options) {
    const { user: userOption } = options as {
      user: { user: { id: bigint; toggles: { bitfield: number } } }
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

    if (!user) {
      const response = commonComponent({
        color: 'blue',
        content: `### User <@${userId}> does not exist in the database.`,
      })
      await interaction.respond(response)
      return
    }

    if (user.status !== 'BLACKLISTED' && user.status !== 'PERM_BLACKLISTED') {
      const response = commonComponent({
        color: 'blue',
        content: `### User <@${userId}> is not blacklisted.`,
      })
      await interaction.respond(response)
      return
    }

    // TODO: Implement appeal queue and logic to handle the appeal process

    const response = commonComponent({
      color: 'blue',
      content: `### PLACEHOLDER`,
    })
    await interaction.respond(response)
  },
})
