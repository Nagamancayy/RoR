import { loadMasterKey } from '../src/lib/crypto/secret-store';
import { openDatabase } from '../src/lib/db/client';
import { loadLabEnv } from './env';

loadLabEnv();
loadMasterKey();
const database = openDatabase();
database.sqlite.close();
console.log(
  'Local database and server master key are ready. Keep data/.master-key private and back it up with the database.',
);
