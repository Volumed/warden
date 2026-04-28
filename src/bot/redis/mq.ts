import { Queue, Worker } from 'bullmq'
import { REDIS_HOST, REDIS_PORT } from '../../config.js'
import { bot } from '../bot.js'

export const redisConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
}

export const createQueue = <T = unknown>(name: string): Queue<T> => {
  bot.logger.info(`Creating Redis queue: ${name}`)
  return new Queue<T>(name, { connection: redisConnection })
}

export const createWorker = <T = unknown>(
  name: string,
  processor: ConstructorParameters<typeof Worker<T>>[1],
): Worker<T> => {
  bot.logger.info(`Creating Redis worker: ${name}`)
  return new Worker<T>(name, processor, { connection: redisConnection })
}
