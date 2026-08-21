import {
  ApplicationCommandOptionTypes,
  BitwisePermissionFlags,
  type Interaction,
  MessageComponentTypes,
  MessageFlags,
} from '@discordeno/bot'
import { addNote, getNotesByUserId, type Note, removeNote } from '../../../db/index.js'
import { bot } from '../../bot.js'
import createCommand from '../../commands.js'
import { componentColors } from '../../utils/colors.js'
import { commonComponent } from '../../utils/components.js'

const MAX_NOTES_PER_PAGE = 6

const pager = async (
  userId: string,
  page: number,
): Promise<{ notes: Note[]; hasMore: boolean; totalPages: number }> => {
  const resultFetch = await getNotesByUserId(userId)
  const result = resultFetch.sort((a, b) => b.createdat.getTime() - a.createdat.getTime())
  const startIndex = page * MAX_NOTES_PER_PAGE
  const endIndex = startIndex + MAX_NOTES_PER_PAGE
  return {
    notes: result.slice(startIndex, endIndex),
    hasMore: result.length > endIndex,
    totalPages: Math.ceil(result.length / MAX_NOTES_PER_PAGE),
  }
}

export const notesMessage = async (userId: string, interaction: Interaction, page: number, newMessage: boolean) => {
  try {
    const { notes, hasMore, totalPages } = await pager(userId, page)

    const notesComponents =
      notes.length > 0
        ? notes.flatMap((s: Note, i: number) => [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [
                `**Note ID: ${s.nid}**`,
                `> Note: \`\`${s.note}\`\``,
                `-# Date Added: <t:${Math.floor(new Date(s.createdat).getTime() / 1000)}:f> · Added By: <@${s.addedby}>`,
              ].join('\n'),
            },
            ...(i < notes.length - 1 ? [{ type: MessageComponentTypes.Separator as const }] : []),
          ])
        : [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [`No notes found for user <@${userId}>.`].join('\n'),
            },
          ]

    const components = [
      {
        type: MessageComponentTypes.TextDisplay as const,
        content: `### Notes for user <@${userId}>`,
      },
      {
        type: MessageComponentTypes.Separator as const,
      },
      ...notesComponents,
      ...(totalPages > 1
        ? [
            { type: MessageComponentTypes.Separator as const },
            {
              type: MessageComponentTypes.ActionRow as const,
              components: [
                {
                  type: MessageComponentTypes.Button as const,
                  label: '❮',
                  customId: `notes-previous-${String(page)}-${userId}`,
                  style: 1,
                  disabled: page === 0,
                },
                {
                  type: MessageComponentTypes.Button as const,
                  label: '❮❮',
                  customId: `notes-first-0-${userId}`,
                  style: 2,
                  disabled: page === 0,
                },
                {
                  type: MessageComponentTypes.Button as const,
                  label: `${page + 1} / ${totalPages}`,
                  customId: `notes-page-indicator-${userId}`,
                  style: 2,
                  disabled: true,
                },
                {
                  type: MessageComponentTypes.Button as const,
                  label: '❯❯',
                  customId: `notes-last-${String(totalPages - 1)}-${userId}`,
                  style: 2,
                  disabled: page === totalPages - 1,
                },
                {
                  type: MessageComponentTypes.Button as const,
                  label: '❯',
                  customId: `notes-next-${String(page)}-${userId}`,
                  style: 1,
                  disabled: !hasMore,
                },
              ],
            },
          ]
        : []),
    ]

    if (newMessage) {
      await interaction.respond({
        flags: MessageFlags.IsComponentsV2,
        components: [
          {
            type: MessageComponentTypes.Container,
            accentColor: componentColors.blue,
            components,
          },
        ],
      })
    } else {
      await interaction.edit({
        flags: MessageFlags.IsComponentsV2,
        components: [
          {
            type: MessageComponentTypes.Container,
            accentColor: componentColors.blue,
            components,
          },
        ],
      })
    }
  } catch (error) {
    bot.logger.error('Error in notesMessage:', error)
    const response = commonComponent({
      color: 'red',
      content: 'An error occurred while fetching the notes. Please try again later.',
    })
    if (newMessage) {
      await interaction.respond(response)
    } else {
      await interaction.edit(response)
    }
  }
}

createCommand({
  name: 'note',
  description: 'View or manage notes for a user.',
  defaultMemberPermissions: String(BitwisePermissionFlags.ADMINISTRATOR),
  mainGuild: true,
  options: [
    {
      name: 'view',
      description: 'View notes for a user.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user',
          description: 'The user to check.',
          type: ApplicationCommandOptionTypes.User,
          required: true,
        },
      ],
    },
    {
      name: 'add',
      description: 'Add a note for a user.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'user',
          description: 'The user to add a note for.',
          type: ApplicationCommandOptionTypes.User,
          required: true,
        },
        {
          name: 'note',
          description: 'The note to add.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'remove',
      description: 'Remove a note for a user.',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'noteid',
          description: 'The ID of the note to remove.',
          type: ApplicationCommandOptionTypes.Integer,
          required: true,
        },
      ],
    },
  ],
  async run(interaction, options) {
    const typedOptions = options as {
      view?: { user?: { user: { id: bigint } } }
      add?: { user?: { user: { id: bigint } }; note?: string }
      remove?: { noteid: number }
    }

    if (typedOptions.view !== undefined) {
      const userId = typedOptions.view.user?.user?.id

      if (!userId) {
        await interaction.respond(commonComponent({ color: 'orange', content: 'Please provide a user.' }))
        return
      }

      await interaction.defer()
      await notesMessage(userId.toString(), interaction as Interaction, 0, true)
      return
    }

    if (typedOptions.add !== undefined) {
      const userId = typedOptions.add.user?.user?.id
      const noteText = typedOptions.add.note

      if (!userId || !noteText) {
        await interaction.respond(commonComponent({ color: 'orange', content: 'Please provide all required options.' }))
        return
      }

      await interaction.defer()

      const note = await addNote({
        id: userId.toString(),
        note: noteText,
        addedby: interaction.user.id.toString(),
      })

      if (!note) {
        await interaction.respond(commonComponent({ color: 'red', content: 'Failed to add note. Please try again.' }))
        return
      }

      await interaction.respond(
        commonComponent({
          color: 'blue',
          content: `### Note \`#${note.nid}\` added for <@${userId}>.\n${noteText}`,
        }),
      )
      return
    }

    if (typedOptions.remove !== undefined) {
      const { noteid } = typedOptions.remove

      await interaction.defer()

      const removed = await removeNote(noteid)

      if (!removed) {
        await interaction.respond(
          commonComponent({ color: 'orange', content: `No note found with ID \`#${noteid}\`.` }),
        )
        return
      }

      await interaction.respond(commonComponent({ color: 'blue', content: `Note \`#${noteid}\` has been removed.` }))
    }
  },
})
