import { and, count, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { bot } from '../bot/bot.js'
import { badservers, imports, users } from './schema.js'

export type BadServer = typeof badservers.$inferSelect
export type User = typeof users.$inferSelect
export type Import = typeof imports.$inferSelect

const db = drizzle(process.env.DATABASE_URL || '')

const checkConnection = async (health?: boolean): Promise<boolean | undefined> => {
  try {
    await db.execute(sql`SELECT 1`)
    if (health) return true
    bot.logger.info('PostgreSQL connected successfully')
  } catch (err) {
    bot.logger.error('PostgreSQL connection failed:', err)
    if (health) return false
  }
}

// Bad server functions
const getAllBadServers = async (): Promise<BadServer[]> => {
  try {
    return await db.select().from(badservers)
  } catch (err) {
    bot.logger.error('Error fetching bad servers:', err)
    return []
  }
}

const getBadServerById = async (id: string): Promise<BadServer | null> => {
  try {
    const result = await db.select().from(badservers).where(eq(badservers.id, id)).limit(1)
    return result[0] ?? null
  } catch (err) {
    bot.logger.error(`Error fetching bad server with ID ${id}:`, err)
    return null
  }
}

const getTotalBadServers = async (): Promise<number> => {
  try {
    const result = await db.select({ count: count() }).from(badservers)
    return result[0].count
  } catch (err) {
    bot.logger.error('Error fetching total bad servers count:', err)
    return 0
  }
}

const addBadServer = async (
  badServer: Omit<typeof badservers.$inferInsert, 'createdat' | 'updatedat'>,
): Promise<void> => {
  try {
    const now = new Date()
    await db.insert(badservers).values({ ...badServer, createdat: now, updatedat: now })
    bot.logger.info(`Bad server with ID ${badServer.id} added successfully`)
  } catch (err) {
    bot.logger.error(`Error adding bad server with ID ${badServer.id}:`, err)
  }
}

// User functions
const getUserById = async (id: string): Promise<User | null> => {
  try {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1)
    return result[0] ?? null
  } catch (err) {
    bot.logger.error(`Error fetching user with ID ${id}:`, err)
    return null
  }
}

const getTotalBlacklistedUsers = async (): Promise<number> => {
  try {
    const result = await db
      .select({ count: count() })
      .from(users)
      .where(inArray(users.status, ['BLACKLISTED', 'PERM_BLACKLISTED']))
    return result[0].count
  } catch (err) {
    bot.logger.error('Error fetching total blacklisted users count:', err)
    return 0
  }
}

// User functions
const addUser = async (user: typeof users.$inferInsert): Promise<void> => {
  try {
    await db.insert(users).values(user)
    bot.logger.info(`User with ID ${user.id} added successfully`)
  } catch (err) {
    bot.logger.error(`Error adding user with ID ${user.id}:`, err)
  }
}

// Import functions
const getUserImportsCountById = async (id: string): Promise<number> => {
  try {
    const result = await db
      .select({ count: count() })
      .from(imports)
      .where(and(eq(imports.id, id), eq(imports.appealed, false)))
    return result[0].count
  } catch (err) {
    bot.logger.error(`Error fetching import count for ID ${id}:`, err)
    return 0
  }
}

const getUserImportsTypesById = async (id: string): Promise<Import['type'][]> => {
  try {
    const result = await db
      .select({ type: imports.type })
      .from(imports)
      .where(and(eq(imports.id, id), eq(imports.appealed, false)))
    return result.map((r) => r.type)
  } catch (err) {
    bot.logger.error(`Error fetching import types for ID ${id}:`, err)
    return []
  }
}

const getUserImportsById = async (id: string): Promise<Import[]> => {
  try {
    return await db
      .select()
      .from(imports)
      .where(and(eq(imports.id, id), eq(imports.appealed, false)))
  } catch (err) {
    bot.logger.error(`Error fetching imports for ID ${id}:`, err)
    return []
  }
}

const addImport = async (importData: Omit<typeof imports.$inferInsert, 'createdat' | 'updatedat'>): Promise<void> => {
  try {
    const now = new Date()
    await db.insert(imports).values({ ...importData, createdat: now, updatedat: now })
    bot.logger.info(`Import for ID ${importData.id} added successfully`)
  } catch (err) {
    bot.logger.error(`Error adding import for ID ${importData.id}:`, err)
  }
}

const getServerRoleImportsById = async (
  id: string,
): Promise<{ type: Import['type']; server_type: BadServer['type'] | null }[]> => {
  try {
    return await db
      .select({ type: imports.type, server_type: badservers.type })
      .from(imports)
      .leftJoin(badservers, eq(badservers.id, imports.server))
      .where(and(eq(imports.id, id), eq(imports.appealed, false), inArray(imports.type, ['SUPPORTER', 'OWNER'])))
  } catch (err) {
    bot.logger.error(`Error fetching supporter/owner imports for ID ${id}:`, err)
    return []
  }
}

const getServersByImportId = async (id: string): Promise<BadServer[]> => {
  try {
    const result = await db
      .select(getTableColumns(badservers))
      .from(imports)
      .leftJoin(badservers, eq(badservers.id, imports.server))
      .where(and(eq(imports.id, id), eq(imports.appealed, false)))
    return result.filter((r): r is BadServer => r.id !== null)
  } catch (err) {
    bot.logger.error(`Error fetching servers for import ID ${id}:`, err)
    return []
  }
}

const getImportsWithServerByUserId = async (id: string): Promise<(Import & { server: BadServer | null })[]> => {
  try {
    const result = await db
      .select({ ...getTableColumns(imports), server: badservers })
      .from(imports)
      .leftJoin(badservers, eq(badservers.id, imports.server))
      .where(and(eq(imports.id, id), eq(imports.appealed, false)))
    return result.map((r) => ({ ...r, server: r.server?.id ? r.server : null })) as (Import & {
      server: BadServer | null
    })[]
  } catch (err) {
    bot.logger.error(`Error fetching imports with server for user ID ${id}:`, err)
    return []
  }
}

const getImportHistoryWithServerByUserId = async (id: string): Promise<(Import & { server: BadServer | null })[]> => {
  try {
    const result = await db
      .select({ ...getTableColumns(imports), server: badservers })
      .from(imports)
      .leftJoin(badservers, eq(badservers.id, imports.server))
      .where(and(eq(imports.id, id), eq(imports.appealed, true)))
    return result.map((r) => ({ ...r, server: r.server?.id ? r.server : null })) as (Import & {
      server: BadServer | null
    })[]
  } catch (err) {
    bot.logger.error(`Error fetching import history with server for user ID ${id}:`, err)
    return []
  }
}

export {
  addBadServer,
  addImport,
  addUser,
  checkConnection,
  db,
  getAllBadServers,
  getBadServerById,
  getImportHistoryWithServerByUserId,
  getImportsWithServerByUserId,
  getServerRoleImportsById,
  getServersByImportId,
  getTotalBadServers,
  getTotalBlacklistedUsers,
  getUserById,
  getUserImportsById,
  getUserImportsCountById,
  getUserImportsTypesById,
}
