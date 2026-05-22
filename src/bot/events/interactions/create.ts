import {
  commandOptionsParser,
  type Interaction,
  InteractionTypes,
  LogLevels,
  type logger,
  MessageComponentTypes,
} from '@discordeno/bot'
import chalk from 'chalk'
import { bot } from '../../bot.js'
import { badServersMessage } from '../../commands/public/badServers.js'
import { checkSelfMessage } from '../../commands/public/checkSelf.js'
import { bulkCheckServersMessage } from '../../commands/staff/checkserveradmin.js'
import { commonComponent } from '../../utils/components.js'

const logCommand = (
  interaction: typeof bot.transformers.$inferredTypes.interaction,
  type: 'Failure' | 'Success' | 'Trigger' | 'Missing',
  commandName: string,
  logLevel: LogLevels = LogLevels.Info,
  ...restArgs: unknown[]
): void => {
  const typeColor = ['Failure', 'Missing'].includes(type)
    ? chalk.red(type)
    : type === 'Success'
      ? chalk.green(type)
      : chalk.white(type)

  const autocomplete = interaction.type === InteractionTypes.ApplicationCommandAutocomplete ? ' (AutoComplete) ' : ''
  const command = `Command${autocomplete}: ${chalk.bgYellow.black(commandName || 'Unknown')} - ${chalk.bgBlack(typeColor)}`
  const user = chalk.bgGreen.black(`@${interaction.user.username} (${interaction.user.id})`)
  const guild = chalk.bgMagenta.black(interaction.guildId ? `guildId: ${interaction.guildId}` : 'DM')
  ;(bot.logger as typeof logger).log(logLevel, `${command} - By ${user} in ${guild}`, ...restArgs)
}

bot.events.interactionCreate = async (interaction) => {
  if (
    interaction.type === InteractionTypes.MessageComponent &&
    interaction.data?.componentType === MessageComponentTypes.Button
  ) {
    if (!interaction.guildId || !interaction.member) return

    if (interaction.data?.customId?.startsWith('badservers-')) {
      const direction = interaction.data.customId.split('-')[1]
      let page = Number(interaction.data.customId.split('-')[2])

      if (direction === 'previous') {
        page = Math.max(page - 1, 0)
      } else if (direction === 'next') {
        page = page + 1
      } else if (direction === 'first') {
        page = 0
      } else if (direction === 'last') {
        page = page
      }

      try {
        return await badServersMessage(interaction as Interaction, page, false)
      } catch (error: any) {
        if (error?.cause?.body?.code === 10062) return
        logCommand(interaction, 'Failure', `Bad servers (Page ${page})`, LogLevels.Error, error)
        const response = commonComponent({
          color: 'red',
          content: 'Something went wrong while fetching the bad servers list.',
        })
        await interaction.respond(response)
      }
    }

    if (interaction.data?.customId?.startsWith('checkself-')) {
      const userId = interaction.user.id
      const direction = interaction.data.customId.split('-')[1]
      let page = Number(interaction.data.customId.split('-')[2])

      if (direction === 'previous') {
        page = Math.max(page - 1, 0)
      } else if (direction === 'next') {
        page = page + 1
      } else if (direction === 'first') {
        page = 0
      } else if (direction === 'last') {
        page = page
      }

      try {
        return await checkSelfMessage(userId.toString(), interaction as Interaction, page, false)
      } catch (error: any) {
        if (error?.cause?.body?.code === 10062) return
        logCommand(interaction, 'Failure', `Check self (Page ${page})`, LogLevels.Error, error)
        const response = commonComponent({
          color: 'red',
          content: 'Something went wrong while fetching the check self information.',
        })
        await interaction.respond(response)
      }
    }

    if (
      interaction.data?.customId?.startsWith('bulkcheckservers-') &&
      !interaction.data.customId.startsWith('bulkcheckservers-page-')
    ) {
      const parts = interaction.data.customId.split('-')
      const direction = parts[1]
      let page = Number(parts[2])
      const cacheKey = parts[3]

      if (direction === 'previous') {
        page = Math.max(page - 1, 0)
      } else if (direction === 'next') {
        page = page + 1
      } else if (direction === 'first') {
        page = 0
      } else if (direction === 'last') {
        page = page
      }

      try {
        return await bulkCheckServersMessage(interaction as Interaction, page, cacheKey, false)
      } catch (error: any) {
        if (error?.cause?.body?.code === 10062) return
        logCommand(interaction, 'Failure', `Bulk check (Page ${page})`, LogLevels.Error, error)
        const response = commonComponent({
          color: 'red',
          content: 'Something went wrong while fetching the bulk check results.',
        })
        await interaction.respond(response)
      }
    }

    const response = commonComponent({
      color: 'orange',
      content: 'This button is not functional.',
    })

    return interaction.respond(response)
  }

  const isAutocomplete = interaction.type === InteractionTypes.ApplicationCommandAutocomplete
  const isCommandOrAutocomplete = interaction.type === InteractionTypes.ApplicationCommand || isAutocomplete

  if (!interaction.data || !isCommandOrAutocomplete) return

  const command = bot.commands.get(interaction.data.name)

  if (!command) {
    logCommand(interaction, 'Missing', interaction.data.name)
    const response = commonComponent({
      color: 'orange',
      content: 'Something went wrong. I was not able to find this command.',
    })
    await interaction.respond(response)
    return
  }

  logCommand(interaction, 'Trigger', interaction.data.name)

  const options = commandOptionsParser(interaction)

  try {
    if (isAutocomplete) {
      await command.autoComplete?.(interaction, options)
    } else {
      await command.run(interaction, options)
    }

    logCommand(interaction, 'Success', interaction.data.name)
  } catch (error) {
    logCommand(interaction, 'Failure', interaction.data.name, LogLevels.Error, error)
    const response = commonComponent({
      color: 'red',
      content: 'Something went wrong. The command execution has thrown an error.',
    })
    await interaction.respond(response)
  }
}
