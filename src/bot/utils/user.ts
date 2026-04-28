import { en } from '../locales/index.js'
import type { User } from '../postgresql/db'

export const typeHierarchy = ['OWNER', 'SUPPORTER', 'CHEATER', 'LEAKER', 'OTHER', 'BOT']

export const checkIfValidUserId = (userId: bigint): boolean => {
  const snowflakeRegex = /^\d{17,19}$/
  return snowflakeRegex.test(userId.toString())
}

// 'APPEALED' | 'BLACKLISTED' | 'PERM_BLACKLISTED' | 'WHITELISTED'
export const mapUserStatus = (status: User['status']): string => {
  switch (status) {
    case 'APPEALED':
      return 'Appealed'
    case 'BLACKLISTED':
      return 'Blacklisted'
    case 'PERM_BLACKLISTED':
      return 'Permanently Blacklisted'
    case 'WHITELISTED':
      return 'Whitelisted'
    default:
      return status
  }
}

const userTypes = {
  OWNER: {
    label: 'Owner',
    description: en['user.type.owner'],
  },
  SUPPORTER: {
    label: 'Supporter',
    description: en['user.type.supporter'],
  },
  CHEATER: {
    label: 'Cheater',
    description: en['user.type.cheater'],
  },
  LEAKER: {
    label: 'Leaker',
    description: en['user.type.leaker'],
  },
  OTHER: {
    label: 'Other',
    description: en['user.type.other'],
  },
  BOT: {
    label: 'Bot',
    description: en['user.type.bot'],
  },
} as const

export const mapUserTypes = (types: User['type'][]): (typeof userTypes)[keyof typeof userTypes][] => {
  const uniqueTypes = Array.from(new Set(types))
  const sortedTypes = uniqueTypes.sort((a, b) => typeHierarchy.indexOf(a) - typeHierarchy.indexOf(b))
  return sortedTypes.map((type) => userTypes[type])
}
