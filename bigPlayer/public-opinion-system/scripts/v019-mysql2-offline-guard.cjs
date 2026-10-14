'use strict';
require('./v019-offline-network-guard.cjs');
const deny = () => { throw Object.assign(Error('V019_OFFLINE_DNS_DENIED'), { code: 'V019_OFFLINE_DNS_DENIED' }); };
for (const api of [require('node:dns'), require('node:dns/promises')]) {
  for (const key of Object.keys(api)) if (key === 'lookup' || key === 'lookupService' || key.startsWith('resolve') || key === 'reverse') Object.defineProperty(api, key, { value: deny, writable: false, configurable: false });
}
require('node:module').syncBuiltinESMExports();
