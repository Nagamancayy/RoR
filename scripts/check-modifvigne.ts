import { checkModifvigne } from '../src/lib/oracle/modifvigne-check';
import { loadLabEnv } from './env';
loadLabEnv();
const report = checkModifvigne();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.cases.some((item) => !item.bytesMatch || !item.tagVerified)) process.exitCode = 1;
