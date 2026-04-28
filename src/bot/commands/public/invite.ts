import { MessageComponentTypes, MessageFlags } from '@discordeno/bot'
import createCommand from '../../commands.js'
import { en } from '../../locales/index.js'
import { componentColors } from '../../utils/colors.js'

createCommand({
  name: 'invite',
  description: 'Get invite link for the bot.',
  async run(interaction) {
    const response = {
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: MessageComponentTypes.Container as const,
          accentColor: componentColors.blue,
          components: [
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [en['invite.title'], en['invite.description']].join('\n'),
            },
            {
              type: MessageComponentTypes.ActionRow as const,
              components: [
                {
                  type: MessageComponentTypes.Button as const,
                  label: en['invite.link.label'],
                  url: 'https://discord.com/api/oauth2/authorize?client_id=874059310869655662&permissions=8&scope=bot%20applications.commands',
                  style: 5,
                },
              ],
            },
          ],
        },
      ],
    }

    await interaction.respond(response)
  },
})
