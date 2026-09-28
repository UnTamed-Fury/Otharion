import { config } from '../config.js';
import type { Command, CommandContext } from './types.js';

export function createHelpCommand(getCommands: () => Command[]): Command {
  return {
    name: 'help',
    aliases: ['commands', 'h'],
    description: 'Display list of available commands and usage instructions',
    usage: 'o.help [command]',
    async execute(ctx: CommandContext, args: string[]): Promise<void> {
      const commands = getCommands();

      if (args.length > 0) {
        const query = args[0].toLowerCase();
        const found = commands.find((c) => c.name === query || c.aliases.includes(query));

        if (!found) {
          await ctx.reply({
            title: 'Command Not Found',
            description: `No command found matching \`${query}\`. Run \`${config.prefix}help\` for a list of commands.`,
          });
          return;
        }

        const aliasList = found.aliases.length > 0 ? found.aliases.map((a) => `\`${a}\``).join(', ') : 'None';
        await ctx.reply({
          title: `Help • ${config.prefix}${found.name}`,
          description:
            `**Description**: ${found.description}\n\n` +
            `• **Usage**: \`${found.usage}\`\n` +
            `• **Aliases**: ${aliasList}`,
        });
        return;
      }

      const commandList = commands
        .map((c) => `• \`${config.prefix}${c.name}\` — ${c.description}`)
        .join('\n');

      await ctx.reply({
        title: 'Otharion Commands',
        description:
          `Dual-Platform Middleman Bot Engine. Prefix: \`${config.prefix}\`\n\n` +
          `${commandList}\n\n` +
          `Use \`${config.prefix}help <command>\` for detailed parameter specifications.`,
      });
    },
  };
}
