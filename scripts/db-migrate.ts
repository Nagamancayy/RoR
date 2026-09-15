import { openDatabase } from '../src/lib/db/client';
import { loadLabEnv } from './env';

loadLabEnv();
const database = openDatabase();
database.sqlite.close();
console.log('SQLite migrations are up to date.');
