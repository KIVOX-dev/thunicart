// migrate-mongo is used for DATA migrations (backfills, renames). Index changes are synced from code by `pnpm migrate`.
module.exports = {
  mongodb: { url: process.env.MONGODB_URI, databaseName: process.env.MONGODB_DB_NAME || 'thunikart', options: {} },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.cjs',
  useFileHash: false,
};
