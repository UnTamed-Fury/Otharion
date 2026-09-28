export interface ParsedCommand {
  commandName: string;
  args: string[];
  rawArgs: string;
}

export function parseCommand(content: string, prefix: string, botMentions: string[] = []): ParsedCommand | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  let matchedPrefix: string | null = null;
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    matchedPrefix = prefix;
  } else {
    for (const mention of botMentions) {
      if (trimmed.startsWith(mention)) {
        matchedPrefix = mention;
        break;
      }
    }
  }

  if (!matchedPrefix) return null;

  const withoutPrefix = trimmed.slice(matchedPrefix.length).trim();
  if (!withoutPrefix) return null;

  const parts = withoutPrefix.split(/\s+/);
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);
  const rawArgs = withoutPrefix.slice(commandName.length).trim();

  return {
    commandName,
    args,
    rawArgs,
  };
}
