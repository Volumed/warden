import postgres from 'postgres'
import { POSTGRES_URL } from '../../config.js'
import { bot } from '../bot.js'

const sql = postgres(POSTGRES_URL)

export interface userTypes {
  OTHER: 'OTHER'
  LEAKER: 'LEAKER'
  CHEATER: 'CHEATER'
  SUPPORTER: 'SUPPORTER'
  OWNER: 'OWNER'
  BOT: 'BOT'
}

export interface BadServer {
  id: string
  name: string
  oldnames?: string
  type: 'CHEATING' | 'LEAKING' | 'RESELLING' | 'ADVERTISING' | 'OTHER'
  addedby: string
  invite?: string
  createdat: Date
  updatedat: Date
  reason: string
}

export interface User {
  id: string
  last_username: string
  avatar: string
  type: userTypes[keyof userTypes]
  status: 'APPEALED' | 'BLACKLISTED' | 'PERM_BLACKLISTED' | 'WHITELISTED'
  appeals: number
  reason?: string
  appealedfirst?: Date
  appealedlast?: Date
}

export interface Import {
  id: string
  server: string
  roles: string
  type: userTypes[keyof userTypes]
  appealed: boolean
  createdat: Date
  updatedat: Date
  reason: string
}

// Connection check
export const checkConnection = async (): Promise<void> => {
  try {
    await sql`SELECT 1`
    bot.logger.info(`PostgreSQL connected successfully`)
  } catch (err) {
    bot.logger.error('PostgreSQL connection failed:', err)
  }
}

// Connection latency check
export const dbHealthCheck = async (): Promise<boolean> => {
  try {
    await sql`SELECT 1`
    return true
  } catch (err) {
    bot.logger.error('PostgreSQL connection failed:', err)
    return false
  }
}

// Bad servers functions
const toBadServer = (row: Record<string, unknown>): BadServer => ({
  id: row.id as string,
  name: row.name as string,
  oldnames: row.oldnames as string | undefined,
  type: row.type as BadServer['type'],
  addedby: row.addedby as string,
  invite: row.invite as string | undefined,
  createdat: new Date(row.createdat as string),
  updatedat: new Date(row.updatedat as string),
  reason: row.reason as string,
})

export const getAllBadServers = async () => {
  try {
    const badServers = await sql`SELECT * FROM badservers`
    return badServers.map(toBadServer)
  } catch (err) {
    bot.logger.error('Error fetching bad servers:', err)
    return []
  }
}

export const getBadServerById = async (id: string) => {
  try {
    const badServer = await sql`SELECT * FROM badservers WHERE id = ${id} LIMIT 1`
    if (badServer.length === 0) return null
    return toBadServer(badServer[0])
  } catch (err) {
    bot.logger.error(`Error fetching bad server with ID ${id}:`, err)
    return null
  }
}

export const getTotalBadServers = async (): Promise<number> => {
  try {
    const count = await sql`SELECT COUNT(*) FROM badservers`
    return Number(count[0].count)
  } catch (err) {
    bot.logger.error('Error fetching total bad servers count:', err)
    return 0
  }
}

// Users functions
const toUser = (row: Record<string, unknown>): User => ({
  id: row.id as string,
  last_username: row.last_username as string,
  avatar: row.avatar as string,
  type: row.type as User['type'],
  status: row.status as User['status'],
  appeals: row.appeals as number,
  reason: row.reason as string | undefined,
  appealedfirst: row.appealedfirst ? new Date(row.appealedfirst as string) : undefined,
  appealedlast: row.appealedlast ? new Date(row.appealedlast as string) : undefined,
})

export const getUserById = async (id: string) => {
  try {
    const user = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`
    if (user.length === 0) return null
    return toUser(user[0])
  } catch (err) {
    bot.logger.error(`Error fetching user with ID ${id}:`, err)
    return null
  }
}

export const getTotalBlacklistedUsers = async (): Promise<number> => {
  try {
    const count = await sql`SELECT COUNT(*) FROM users WHERE status IN ('BLACKLISTED', 'PERM_BLACKLISTED')`
    return Number(count[0].count)
  } catch (err) {
    bot.logger.error('Error fetching total blacklisted users count:', err)
    return 0
  }
}

export const addUser = async (user: User) => {
  try {
    await sql`
      INSERT INTO users (id, last_username, avatar, type, status, appeals, reason, appealedfirst, appealedlast)
      VALUES (${user.id}, ${user.last_username}, ${user.avatar}, ${user.type}, ${user.status}, ${user.appeals}, ${user.reason ?? null}, ${user.appealedfirst ?? null}, ${user.appealedlast ?? null})
    `
    bot.logger.info(`User with ID ${user.id} added successfully`)
  } catch (err) {
    bot.logger.error(`Error adding user with ID ${user.id}:`, err)
  }
}

// Imports functions
const toImport = (row: Record<string, unknown>): Import => ({
  id: row.id as string,
  server: row.server as string,
  roles: row.roles as string,
  type: row.type as Import['type'],
  appealed: row.appealed as boolean,
  createdat: new Date(row.createdat as string),
  updatedat: new Date(row.updatedat as string),
  reason: row.reason as string,
})

export const getUserImportsCountById = async (id: string) => {
  try {
    const count = await sql`SELECT COUNT(*) FROM imports WHERE id = ${id} AND appealed = false`
    return Number(count[0].count)
  } catch (err) {
    bot.logger.error(`Error fetching import count for ID ${id}:`, err)
    return 0
  }
}

export const getUserImportsTypesById = async (id: string) => {
  try {
    const types = await sql`SELECT type FROM imports WHERE id = ${id} AND appealed = false`
    return types.map((row) => row.type as Import['type'])
  } catch (err) {
    bot.logger.error(`Error fetching import types for ID ${id}:`, err)
    return []
  }
}

export const getUserImportsById = async (id: string) => {
  try {
    const imports = await sql`SELECT * FROM imports WHERE id = ${id} AND appealed = false`
    return imports.map(toImport)
  } catch (err) {
    bot.logger.error(`Error fetching imports for ID ${id}:`, err)
    return []
  }
}

export const addImport = async (importData: Omit<Import, 'createdat' | 'updatedat'>) => {
  try {
    const now = new Date()
    await sql`
      INSERT INTO imports (id, server, roles, type, appealed, reason, createdat, updatedat)
      VALUES (${importData.id}, ${importData.server}, ${importData.roles}, ${importData.type}, ${importData.appealed}, ${importData.reason}, ${now}, ${now})
    `
    bot.logger.info(`Import for ID ${importData.id} added successfully`)
  } catch (err) {
    bot.logger.error(`Error adding import for ID ${importData.id}:`, err)
  }
}

// function to get supporter/owner imports with server type
export const getServerRoleImportsById = async (id: string) => {
  try {
    const imports =
      await sql`SELECT i.server, i.type, b.type AS server_type FROM imports i LEFT JOIN badservers b ON b.id = i.server WHERE i.id = ${id} AND i.appealed = false AND (i.type = 'SUPPORTER' OR i.type = 'OWNER')`
    return imports.map((row) => ({
      type: row.type as Import['type'],
      server_type: row.server_type as BadServer['type'] | null,
    }))
  } catch (err) {
    bot.logger.error(`Error fetching supporter/owner imports for ID ${id}:`, err)
    return []
  }
}

// function to get servers by imports user id
export const getServersByImportId = async (id: string) => {
  try {
    const servers =
      await sql`SELECT b.* FROM imports i LEFT JOIN badservers b ON b.id = i.server WHERE i.id = ${id} AND i.appealed = false`
    return servers.map(toBadServer)
  } catch (err) {
    bot.logger.error(`Error fetching servers for import ID ${id}:`, err)
    return []
  }
}
