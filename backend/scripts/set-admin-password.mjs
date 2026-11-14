// Sets one user's password in the local database and clears the failed-login lock.
// Run it yourself from the backend folder so the password stays in your terminal:
//   PowerShell:  $env:NEW_PASSWORD = 'choose-a-strong-password'; node scripts/set-admin-password.mjs you@example.com
import argon2 from 'argon2';
import mongoose from 'mongoose';

const { MongoClient } = mongoose.mongo; // mongoose ships the MongoDB driver

const [email] = process.argv.slice(2);
const pw = process.env.NEW_PASSWORD;
if (!email || !pw) { console.error('Give the email as an argument and set NEW_PASSWORD first.'); process.exit(1); }
if (pw.length < 8) { console.error('Use at least 8 characters.'); process.exit(1); }

const client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27019/?replicaSet=rs0', { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const r = await client.db(process.env.MONGODB_DB_NAME ?? 'thunikart').collection('users')
    .updateOne({ email: email.toLowerCase() }, { $set: { passwordHash: await argon2.hash(pw), failedLogins: 0, lockedUntil: null } });
  console.log(r.matchedCount ? 'Password updated.' : 'No user with that email.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
