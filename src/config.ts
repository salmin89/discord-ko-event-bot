export interface Config {
  token: string;
  dbPath: string;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN is missing. Set it in the environment.');
  return { token, dbPath: env.DB_PATH || './data/ko-bot.db' };
}
