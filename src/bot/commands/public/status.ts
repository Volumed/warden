import { MessageComponentTypes, MessageFlags, snowflakeToTimestamp } from '@discordeno/bot'
import { checkConnection, getTotalBadServers, getTotalBlacklistedUsers } from '../../../db/index.js'
import { bot, getShardInfoFromGuild } from '../../bot.js'
import createCommand from '../../commands.js'
import { get, healthCheck, set } from '../../redis/redis.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'

const GUILD_COUNT_CACHE_KEY = 'status:totalGuilds'
const GUILD_COUNT_TTL = 60 * 20 // 20 minutes
const TOTAL_BAD_SERVERS_CACHE_KEY = 'status:totalBadServers'
const TOTAL_BAD_SERVERS_TTL = 60 * 20 // 20 minutes
const TOTAL_BLACKLISTED_USERS_CACHE_KEY = 'status:totalBlacklistedUsers'
const TOTAL_BLACKLISTED_USERS_TTL = 60 * 20 // 20 minutes

const allGuilds = async (): Promise<number> => {
  const cached = await get(GUILD_COUNT_CACHE_KEY)
  if (cached !== null) return Number(cached)

  let count = 0
  let after: bigint | undefined

  while (true) {
    const guilds = await bot.helpers.getGuilds(bot.rest.token, { limit: 200, after })
    count += guilds.length
    if (guilds.length < 200) break
    after = guilds[guilds.length - 1].id
  }

  await set(GUILD_COUNT_CACHE_KEY, String(count), GUILD_COUNT_TTL)
  return count
}

const totalBadServers = async (): Promise<number> => {
  const cached = await get(TOTAL_BAD_SERVERS_CACHE_KEY)
  if (cached !== null) return Number(cached)

  const count = await getTotalBadServers()
  await set(TOTAL_BAD_SERVERS_CACHE_KEY, String(count), TOTAL_BAD_SERVERS_TTL)
  return count
}

const totalBlacklistedUsers = async (): Promise<number> => {
  const cached = await get(TOTAL_BLACKLISTED_USERS_CACHE_KEY)
  if (cached !== null) return Number(cached)

  const count = await getTotalBlacklistedUsers()
  await set(TOTAL_BLACKLISTED_USERS_CACHE_KEY, String(count), TOTAL_BLACKLISTED_USERS_TTL)
  return count
}

createCommand({
  name: 'status',
  description: "Check the bot's status and latency",
  async run(interaction) {
    try {
      const ping = Date.now() - snowflakeToTimestamp(interaction.id)
      const shardInfo = await getShardInfoFromGuild(interaction.guildId)
      const shardPing = shardInfo.rtt === -1 ? '*Not yet available*' : `${shardInfo.rtt}ms`
      const totalShards = bot.gateway.totalShards || 1
      const totalGuilds = await allGuilds()
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024
      const redisHealthy = await healthCheck()
      const dbHealthy = await checkConnection(true)
      const totalBadServersCount = await totalBadServers()
      const totalBlacklistedUsersCount = await totalBlacklistedUsers()

      const response = {
        flags: MessageFlags.IsComponentsV2,
        components: [
          {
            type: MessageComponentTypes.Container as const,
            accentColor: componentColors.blue,
            components: [
              {
                type: MessageComponentTypes.TextDisplay as const,
                content: '## Warden Status',
              },
              {
                type: MessageComponentTypes.Separator as const,
              },
              {
                type: MessageComponentTypes.TextDisplay as const,
                content: [
                  '### General',
                  `> **Total Shards**: \`\`${totalShards}\`\``,
                  `> **Current Shard**: \`\`${shardInfo.shardId}\`\``,
                  `> **Total Protected Servers**: \`\`${totalGuilds}\`\``,
                  `> **Gateway Latency**: \`\`${shardPing}\`\``,
                  `> **Roundtrip Latency**: \`\`${ping}ms\`\``,
                  `> **Memory Usage**: \`\`${memoryUsage.toFixed(2)} MB\`\``,
                ].join('\n'),
              },
              {
                type: MessageComponentTypes.TextDisplay as const,
                content: ['### Redis', `> **Status**: \`\`${redisHealthy ? 'Connected' : 'Disconnected'}\`\``].join(
                  '\n',
                ),
              },
              {
                type: MessageComponentTypes.TextDisplay as const,
                content: [
                  '### Database',
                  `> **Status**: \`\`${dbHealthy ? 'Connected' : 'Disconnected'}\`\``,
                  `> **Total Bad Servers**: \`\`${totalBadServersCount}\`\``,
                  `> **Total Blacklisted Users**: \`\`${totalBlacklistedUsersCount}\`\``,
                ].join('\n'),
              },
              {
                type: MessageComponentTypes.Separator as const,
              },
              {
                type: MessageComponentTypes.TextDisplay as const,
                content: 'Status information is cached for 20 minutes.\nNot all data reflect real-time information.',
              },
            ],
          },
        ],
      }

      await interaction.respond(response)
    } catch (error) {
      bot.logger.error('Error handling status command:', error)
      const result = await commonComponent({
        color: 'red',
        content: 'An error occurred while processing your status command. Please try again later.',
      })
      await interaction.respond(result)
    }
  },
})
