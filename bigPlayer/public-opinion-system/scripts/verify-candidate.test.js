'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrationEnv } = require('./verify-candidate');

test('migration subprocess always targets its isolated database, overriding inherited or explicit URLs', () => {
  const original = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'mysql://fixture:fixture@127.0.0.1/never_migrate';
    for (const args of [{}, { 'db-url': 'mysql://fixture:fixture@127.0.0.1/never_migrate' }]) {
      const env = migrationEnv(args, 'candidate_verify_fixture');
      assert.equal(new URL(env.DATABASE_URL).pathname, '/candidate_verify_fixture');
      assert.equal(env.DB_NAME, 'candidate_verify_fixture');
    }
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});
