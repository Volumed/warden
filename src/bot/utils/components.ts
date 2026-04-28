import { MessageComponentTypes, MessageFlags } from '@discordeno/bot'
import { componentColors } from './colors.js'

export const commonComponent = ({
  color,
  content,
}: {
  color: keyof typeof componentColors
  content: string | string[]
}) => ({
  flags: MessageFlags.IsComponentsV2,
  components: [
    {
      type: MessageComponentTypes.Container as const,
      accentColor: componentColors[color],
      components: [
        {
          type: MessageComponentTypes.TextDisplay as const,
          content: Array.isArray(content) ? content.join('\n') : content,
        },
      ],
    },
  ],
})
