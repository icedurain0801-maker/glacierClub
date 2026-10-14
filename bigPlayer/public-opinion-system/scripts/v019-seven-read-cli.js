'use strict';
const license = require('./v019-seven-read-license');
function decodeArguments(args) {
  if (!Array.isArray(args) || args.length !== 3 || args[0] !== '--execute' || args[1] !== '--permit-base64' || typeof args[2] !== 'string' || args[2].length > 32768 || !/^[A-Za-z0-9+/]+={0,2}$/.test(args[2])) throw Object.assign(Error('PERMIT_CLI_REJECTED'), { code: 'PERMIT_CLI_REJECTED' });
  const bytes = Buffer.from(args[2], 'base64'); if (bytes.toString('base64') !== args[2]) throw Object.assign(Error('PERMIT_CLI_REJECTED'), { code: 'PERMIT_CLI_REJECTED' });
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw Object.assign(Error('PERMIT_CLI_REJECTED'), { code: 'PERMIT_CLI_REJECTED' }); }
}
async function main(args) {
  try { const r = await license.executeProduction(decodeArguments(args)); console.log(JSON.stringify(r)); return r.status === 'SEVEN_READ_COMPLETED' ? 0 : 2; }
  catch (err) { console.log(JSON.stringify({ status: 'HOLD', errorCode: /^(PERMIT|TRUST_ANCHOR)_[A-Z_]+$/.test(err.code || '') ? err.code : 'PERMIT_ENTRY_FAILED' })); return 2; }
}
module.exports = { decodeArguments, main };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
