import { Redis } from 'ioredis'
import { REDIS_HOST, REDIS_PORT } from '../../config.js'

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT })

export const set = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  if (ttlSeconds !== undefined) {
    await redis.set(key, value, 'EX', ttlSeconds)
  } else {
    await redis.set(key, value)
  }
}

export const get = async (key: string): Promise<string | null> => {
  return redis.get(key)
}

export const del = async (key: string): Promise<void> => {
  await redis.del(key)
}

export const healthCheck = async (): Promise<boolean> => {
  try {
    const result = await redis.ping()
    return result === 'PONG'
  } catch {
    return false
  }
}
