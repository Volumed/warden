import { Collection, createBot } from '@discordeno/bot'
import { createProxyCache } from 'dd-cache-proxy'
import {
  DISCORD_TOKEN,
  GATEWAY_AUTHORIZATION,
  GATEWAY_INTENTS,
  GATEWAY_URL,
  REST_AUTHORIZATION,
  REST_URL,
} from '../config.js'
import type {
  ManagerGetShardInfoFromGuildId,
  ShardInfo,
  WorkerPresencesUpdate,
  WorkerShardPayload,
} from '../gateway/worker/types.js'
import type { Command } from './commands.js'

const rawBot = createBot({
  token: DISCORD_TOKEN,
  intents: GATEWAY_INTENTS,
  desiredProperties: {
    interaction: {
      id: true,
      type: true,
      data: true,
      token: true,
      guildId: true,
      member: true,
      user: true,
    },
    guild: {
      id: true,
      name: true,
      roles: true,
      ownerId: true,
      members: true,
    },
    role: {
      id: true,
      guildId: true,
      permissions: true,
    },
    member: {
      id: true,
      roles: true,
      guildId: true,
    },
    channel: {
      id: true,
    },
    message: {
      id: true,
      channelId: true,
    },
    user: {
      id: true,
      username: true,
      discriminator: true,
      toggles: true,
    },
  },
  rest: {
    token: DISCORD_TOKEN,
    proxy: {
      baseUrl: REST_URL,
      authorization: REST_AUTHORIZATION,
    },
  },
})

const _proxyCacheBot = createProxyCache(rawBot, {
  desiredProps: {
    interaction: ['id', 'type', 'data', 'token', 'guildId', 'member', 'user'],
    guild: ['id', 'name', 'ownerId', 'roles', 'members'],
    role: ['id', 'guildId', 'permissions'],
    member: ['id', 'roles', 'guildId'],
    channel: ['id'],
    message: ['id', 'channelId'],
    user: ['id', 'username', 'discriminator', 'toggles'],
  },
  cacheInMemory: {
    interaction: true,
    guild: true,
    role: true,
    member: true,
    channel: true,
    message: true,
    user: true,
  },
})

export type CustomBot = typeof _proxyCacheBot & {
  commands: Collection<string, Command>
}

export const bot = _proxyCacheBot as unknown as CustomBot

bot.commands = new Collection()

// Override the default gateway functions to allow the methods on the gateway object to proxy the requests to the gateway proxy
const overrideGatewayImplementations = (bot: CustomBot): void => {
  bot.gateway.sendPayload = async (shardId, payload) => {
    await fetch(GATEWAY_URL, {
      method: 'POST',
      body: JSON.stringify({
        type: 'ShardPayload',
        shardId,
        payload,
      } satisfies WorkerShardPayload),
      headers: {
        'Content-Type': 'application/json',
        Authorization: GATEWAY_AUTHORIZATION,
      },
    })
  }

  bot.gateway.editBotStatus = async (payload) => {
    await fetch(GATEWAY_URL, {
      method: 'POST',
      body: JSON.stringify({
        type: 'EditShardsPresence',
        payload,
      } satisfies WorkerPresencesUpdate),
      headers: {
        'Content-Type': 'application/json',
        Authorization: GATEWAY_AUTHORIZATION,
      },
    })
  }
}

overrideGatewayImplementations(bot)

export const getShardInfoFromGuild = async (guildId?: bigint): Promise<Omit<ShardInfo, 'nonce'>> => {
  const req = await fetch(GATEWAY_URL, {
    method: 'POST',
    body: JSON.stringify({
      type: 'ShardInfoFromGuild',
      guildId: guildId?.toString(),
    } as ManagerGetShardInfoFromGuildId),
    headers: {
      'Content-Type': 'application/json',
      Authorization: GATEWAY_AUTHORIZATION,
    },
  })

  const res = await req.json()

  if (req.ok) return res

  throw new Error(`There was an issue getting the shard info: ${res.error}`)
}
