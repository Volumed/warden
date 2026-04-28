import { snowflakeToTimestamp } from '@discordeno/bot'
import { bot, getShardInfoFromGuild } from '../../bot.js'
import createCommand from '../../commands.js'
import { commonComponent } from '../../utils/components.js'

createCommand({
  name: 'ping',
  description: 'Check whether the bot is online and responsive.',
  async run(interaction) {
    try {
      const ping = Date.now() - snowflakeToTimestamp(interaction.id)
      const shardInfo = await getShardInfoFromGuild(interaction.guildId)

      const shardPing = shardInfo.rtt === -1 ? '*Not yet available*' : `${shardInfo.rtt}ms`

      const result = await commonComponent({
        color: 'blue',
        content: [
          `🏓 Pong! Gateway Latency: ${shardPing}, Roundtrip Latency: ${ping}ms.`,
          `-# Shard ID: ${shardInfo.shardId}`,
        ].join('\n'),
      })

      await interaction.respond(result)
    } catch (error) {
      bot.logger.error('Error handling ping command:', error)
      const result = await commonComponent({
        color: 'red',
        content: 'An error occurred while processing your ping command. Please try again later.',
      })
      await interaction.respond(result)
    }
  },
})
