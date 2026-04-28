import { MAIN_GUILD_ID } from '../../config.js'
import { bot } from '../bot.js'

export const updateCommands = async (): Promise<void> => {
  bot.logger.info('Updating commands')

  const userCommands = bot.commands.filter((x) => !x.mainGuild).array()
  await bot.helpers.upsertGlobalApplicationCommands(userCommands)

  if (MAIN_GUILD_ID) {
    bot.logger.info('Updating main guild commands')

    const mainGuildCommands = bot.commands.filter((x) => x.mainGuild ?? false).array()
    await bot.helpers.upsertGuildApplicationCommands(MAIN_GUILD_ID, mainGuildCommands)
  }
}
