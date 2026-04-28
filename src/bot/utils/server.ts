import { bot } from '../bot.js'
import { en } from '../locales/index.js'

export const checkIfValidServerId = ({ serverId }: { serverId: string }): boolean => {
  const discordIdRegex = /^\d{17,19}$/
  return discordIdRegex.test(serverId)
}

export const checkIfValidInvite = ({ invite }: { invite: string }): boolean => {
  const inviteCodeRegex = /^[a-zA-Z0-9-]{2,255}$/
  const inviteLinkRegex =
    /^(?:https?:\/\/)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,255})(?:\?[^\s]*)?$/
  return inviteCodeRegex.test(invite) || inviteLinkRegex.test(invite)
}

export const getInviteCode = ({ invite }: { invite: string }): string => {
  const extractInviteCode = ({ invite }: { invite: string }): string | null => {
    const inviteLinkRegex =
      /^(?:https?:\/\/)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,255})(?:\?[^\s]*)?$/
    const match = invite.match(inviteLinkRegex)
    return match ? match[1] : null
  }

  if (checkIfValidInvite({ invite })) {
    const extractedCode = extractInviteCode({ invite })
    return extractedCode ? extractedCode : invite
  }
  return invite
}

export const fetchInviteInfo = async (inviteCode: string) => {
  try {
    const inviteInfo = await bot.rest.getInvite(inviteCode)
    return inviteInfo
  } catch (err) {
    bot.logger.error(`Error fetching invite info for code "${inviteCode}":`, err)
    return null
  }
}

const serverTypes = {
  CHEATING: {
    label: 'Cheating',
    description: en['server.type.cheating'],
  },
  LEAKING: {
    label: 'Leaking',
    description: en['server.type.leaking'],
  },
  RESELLING: {
    label: 'Reselling',
    description: en['server.type.reselling'],
  },
  ADVERTISING: {
    label: 'Advertising',
    description: en['server.type.advertising'],
  },
  OTHER: {
    label: 'Other',
    description: en['server.type.other'],
  },
} as const

export type ServerType = keyof typeof serverTypes

export const serverTypeMap = ({ type }: { type: ServerType }) => serverTypes[type]
