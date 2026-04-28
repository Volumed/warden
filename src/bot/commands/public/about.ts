import { MessageComponentTypes, MessageFlags } from '@discordeno/bot'
import createCommand from '../../commands.js'
import { en } from '../../locales/index.js'
import { componentColors } from '../../utils/colors.js'

createCommand({
  name: 'about',
  description: 'Get information about the bot.',
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
              content: [
                en['about.title'],
                en['about.description'],
                en['about.features'],
                en['about.officialDiscord'],
              ].join('\n'),
            },
            {
              type: MessageComponentTypes.ActionRow as const,
              components: [
                {
                  type: MessageComponentTypes.Button as const,
                  label: en['about.link.label'],
                  url: 'https://discord.com/invite/MVNZR73Ghf',
                  style: 5,
                },
              ],
            },
            {
              type: MessageComponentTypes.TextDisplay as const,
              content: [en['about.sourceCode']].join('\n'),
            },
            {
              type: MessageComponentTypes.ActionRow as const,
              components: [
                {
                  type: MessageComponentTypes.Button as const,
                  label: en['about.link.sourceCode'],
                  url: 'https://github.com/volumed/warden',
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
