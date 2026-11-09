import { config } from './config/env';
import { connectDb, disconnectDb } from './db';
import { buildApp } from './app';

async function main() {
  const cfg = config(); // throws in production if any variable is still REPLACE_ME
  const app = await buildApp();
  for (const w of cfg.warnings) app.log.warn(w);
  await connectDb();
  // AppSail requires listening on its own port within 10 seconds, on all interfaces.
  await app.listen({ port: cfg.port, host: '0.0.0.0' });

  const stop = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
