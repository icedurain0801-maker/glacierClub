'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { grantsAreIsolated } = require('../src/lastNightIsolatedStore');

const user = 'po_lastnight_writer_fixture@127.0.0.1';
const account = "'po_lastnight_writer_fixture'@'127.0.0.1'";
const rows = grants => grants.map((grant, index) => ({ [`Grants for ${index}`]: grant }));
const usage = `GRANT USAGE ON *.* TO ${account} IDENTIFIED BY PASSWORD '*ABCD1234'`;
const writer = `GRANT SELECT, INSERT, UPDATE, DELETE ON \`ln_last_night\`.* TO ${account}`;

test('only isolated database DML grants are accepted', () => {
  assert.equal(grantsAreIsolated(rows([usage, writer]), user), true);
  assert.equal(grantsAreIsolated(rows([
    usage.replace(account, '`po_lastnight_writer_fixture`@`127.0.0.1`'),
    writer.replace(account, '`po_lastnight_writer_fixture`@`127.0.0.1`')
  ]), user), true);
  assert.equal(grantsAreIsolated(rows([usage, `${writer} IDENTIFIED BY PASSWORD '*ABCD1234'`]), user), true);
  for (const extra of [
    `GRANT SELECT ON other_db.* TO ${account}`,
    `GRANT ALL PRIVILEGES ON *.* TO ${account}`,
    `${writer} WITH GRANT OPTION`,
    `${writer} IDENTIFIED BY 'plaintext'`
  ]) assert.equal(grantsAreIsolated(rows([usage, writer, extra]), user), false);
});
