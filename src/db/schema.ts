import { bigint, bigserial, boolean, pgSchema, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

const warden = pgSchema('warden')

const badserversTypeEnum = warden.enum('badservers_type', ['CHEATING', 'LEAKING', 'RESELLING', 'ADVERTISING', 'OTHER'])
const importsTypeEnum = warden.enum('imports_type', ['OTHER', 'LEAKER', 'CHEATER', 'SUPPORTER', 'OWNER', 'BOT'])
const punishmentsOwnerEnum = warden.enum('punishments_owner', ['ROLE', 'WARN', 'KICK', 'BAN'])
const punishmentsSupporterEnum = warden.enum('punishments_supporter', ['ROLE', 'WARN', 'KICK', 'BAN'])
const punishmentsLeakerEnum = warden.enum('punishments_leaker', ['ROLE', 'WARN', 'KICK', 'BAN'])
const punishmentsCheaterEnum = warden.enum('punishments_cheater', ['ROLE', 'WARN', 'KICK', 'BAN'])
const punishmentsOtherEnum = warden.enum('punishments_other', ['ROLE', 'WARN', 'KICK', 'BAN'])
const usersTypeEnum = warden.enum('users_type', ['OTHER', 'LEAKER', 'CHEATER', 'SUPPORTER', 'OWNER', 'BOT'])
const usersStatusEnum = warden.enum('users_status', ['APPEALED', 'BLACKLISTED', 'PERM_BLACKLISTED', 'WHITELISTED'])

const badservers = pgTable('badservers', {
  id: varchar('id', { length: 32 }).notNull(),
  name: varchar('name', { length: 191 }).notNull(),
  oldnames: text('oldnames'),
  type: badserversTypeEnum('type').notNull(),
  addedby: varchar('addedby', { length: 191 }).notNull(),
  invite: varchar('invite', { length: 191 }),
  reason: varchar('reason', { length: 256 }),
  createdat: timestamp('createdat', { withTimezone: true, precision: 3 }).notNull(),
  updatedat: timestamp('updatedat', { withTimezone: true, precision: 3 }).notNull(),
})

const bans = pgTable('bans', {
  id: varchar('id', { length: 32 }).notNull(),
  guild: varchar('guild', { length: 32 }).notNull(),
})

const guild = pgTable('guild', {
  id: varchar('id', { length: 32 }).notNull(),
  name: varchar('name', { length: 191 }).notNull(),
  logchannel: varchar('logchannel', { length: 191 }).notNull(),
  createdat: timestamp('createdat', { withTimezone: true, precision: 3 }).notNull(),
  updatedat: timestamp('updatedat', { withTimezone: true, precision: 3 }).notNull(),
})

const imports = pgTable('imports', {
  id: varchar('id', { length: 32 }).notNull(),
  server: varchar('server', { length: 191 }).notNull(),
  roles: text('roles').notNull(),
  type: importsTypeEnum('type').notNull(),
  appealed: boolean('appealed').notNull().default(false),
  reason: varchar('reason', { length: 256 }).default('Unspecified'),
  createdat: timestamp('createdat', { withTimezone: true, precision: 3 }).notNull(),
  updatedat: timestamp('updatedat', { withTimezone: true, precision: 3 }).notNull(),
})

const notes = pgTable('notes', {
  nid: bigserial('nid', { mode: 'number' }).notNull(),
  id: varchar('id', { length: 32 }).notNull(),
  note: text('note').notNull(),
  addedby: varchar('addedby', { length: 191 }).notNull(),
  createdat: timestamp('createdat', { withTimezone: true, precision: 3 }).notNull(),
})

const punishments = pgTable('punishments', {
  id: varchar('id', { length: 32 }).notNull(),
  owner: punishmentsOwnerEnum('owner').notNull().default('BAN'),
  supporter: punishmentsSupporterEnum('supporter').notNull().default('KICK'),
  leaker: punishmentsLeakerEnum('leaker').notNull().default('WARN'),
  cheater: punishmentsCheaterEnum('cheater').notNull().default('WARN'),
  other: punishmentsOtherEnum('other').notNull().default('WARN'),
  enabled: boolean('enabled').notNull().default(false),
  unban: boolean('unban').notNull().default(false),
  globalcheck: boolean('globalcheck').notNull().default(false),
  roleid: varchar('roleid', { length: 32 }),
  banappeal: boolean('banappeal').notNull().default(false),
  unbanother: boolean('unbanother').notNull().default(true),
  unbanleaker: boolean('unbanleaker').notNull().default(true),
  unbancheater: boolean('unbancheater').notNull().default(true),
  unbansupporter: boolean('unbansupporter').notNull().default(true),
  unbanowner: boolean('unbanowner').notNull().default(true),
})

const roles = pgTable('roles', {
  id: varchar('id', { length: 32 }).notNull(),
  roles: text('roles').notNull(),
  guild: varchar('guild', { length: 32 }).notNull(),
})

const users = pgTable('users', {
  id: varchar('id', { length: 32 }).notNull(),
  last_username: varchar('last_username', { length: 191 }).notNull(),
  avatar: varchar('avatar', { length: 191 }).notNull(),
  type: usersTypeEnum('type').notNull(),
  status: usersStatusEnum('status').notNull().default('BLACKLISTED'),
  appeals: bigint('appeals', { mode: 'number' }).notNull().default(0),
  reason: varchar('reason', { length: 191 }),
  appealedfirst: timestamp('appealedfirst', { withTimezone: true, precision: 3 }),
  appealedlast: timestamp('appealedlast', { withTimezone: true, precision: 3 }),
})

export {
  badservers,
  badserversTypeEnum,
  bans,
  guild,
  imports,
  importsTypeEnum,
  notes,
  punishments,
  punishmentsCheaterEnum,
  punishmentsLeakerEnum,
  punishmentsOtherEnum,
  punishmentsOwnerEnum,
  punishmentsSupporterEnum,
  roles,
  users,
  usersStatusEnum,
  usersTypeEnum,
}
