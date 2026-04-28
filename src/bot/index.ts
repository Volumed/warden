import { join as joinPath } from 'node:path'
import type { DiscordGatewayPayload, GatewayDispatchEventNames } from '@discordeno/bot'
import { EVENT_HANDLER_HOST, EVENT_HANDLER_PORT, MESSAGEQUEUE_ENABLE } from '../config.js'
import { getDirnameFromFileUrl } from '../util.js'
import { bot } from './bot.js'
import { buildFastifyApp } from './fastify.js'
import { checkConnection } from './postgresql/db.js'
import { createWorker } from './redis/mq.js'
import importDirectory from './utils/loader.js'

interface GatewayEvent {
  payload: DiscordGatewayPayload
  shardId: number
}

// The importDirectory function uses 'readdir' that requires either a relative path compared to the process CWD or an absolute one, so to get one relative we need to use import.meta.url
const currentDirectory = getDirnameFromFileUrl(import.meta.url)

await importDirectory(joinPath(currentDirectory, './commands'))
await importDirectory(joinPath(currentDirectory, './events'))

if (MESSAGEQUEUE_ENABLE) {
  createWorker<GatewayEvent>('gatewayMessage', async (job) => {
    bot.logger.debug(
      `Received a new message from the gatewayMessage queue with shardId ${job.data.shardId} and event ${job.data.payload.t}`,
    )
    await handleGatewayEvent(job.data.payload, job.data.shardId)
  })
}

const app = buildFastifyApp()

app.get('/timecheck', async (_req, res) => {
  res.status(200).send({ message: Date.now() })
})

app.post('/', async (req, res) => {
  const body = req.body as GatewayEvent

  try {
    handleGatewayEvent(body.payload, body.shardId)

    res.status(200).send()
  } catch (error) {
    bot.logger.error('There was an error handling the incoming gateway command', error)
    res.status(500).send()
  }
})

await app.listen({
  host: EVENT_HANDLER_HOST,
  port: EVENT_HANDLER_PORT,
})

bot.logger.info(`Bot event handler is listening on port ${EVENT_HANDLER_PORT}`)

const handleGatewayEvent = async (payload: DiscordGatewayPayload, shardId: number): Promise<void> => {
  bot.events.raw?.(payload, shardId)

  // If we don't have the event type we don't process it further
  if (!payload.t) return

  // Run the dispatch check
  await bot.events.dispatchRequirements?.(payload, shardId)

  bot.handlers[payload.t as GatewayDispatchEventNames]?.(bot, payload, shardId)
}

await checkConnection()
