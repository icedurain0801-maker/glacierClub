'use strict';
const core = require('./v019-seven-read-license');
const fail = code => { throw Object.assign(Error(code), { code }); };
function runIsolatedMysql2(input) { return core.runIsolatedMysql2(input); }
function runProductionMysql2() { fail('REAL_MYSQL2_EXECUTOR_DISABLED'); }
function readProductionConfiguration() { fail('REAL_CONFIGURATION_READER_DISABLED'); }
async function runAuthorizedMysql2() { fail('PERMIT_CAPABILITY_REJECTED'); }
module.exports = Object.freeze({ runIsolatedMysql2, runAuthorizedMysql2, runProductionMysql2, readProductionConfiguration });
if (require.main === module) runProductionMysql2();
