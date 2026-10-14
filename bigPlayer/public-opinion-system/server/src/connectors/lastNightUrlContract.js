'use strict';
function assertLastNightSiteUrl(value) {
  const url=new URL(value);
  const expected={env:'web',gameId:'2177',gameVersion:'2177-US-ZS',lang:'en-US'};
  const keys=[...url.searchParams.keys()];
  if(url.origin!=='https://club-en.q1.com'||url.pathname!=='/'||url.username||url.password||url.hash
    ||new Set(keys).size!==keys.length||keys.some(key=>![...Object.keys(expected),'languageId'].includes(key))
    ||Object.entries(expected).some(([key,value])=>url.searchParams.get(key)!==value)
    ||!['2','9','16'].includes(url.searchParams.get('languageId'))) {
    throw Object.assign(new Error('LAST_NIGHT_SITE_SCOPE_MISMATCH'),{code:'LAST_NIGHT_SITE_SCOPE_MISMATCH'});
  }
  return url;
}
module.exports={assertLastNightSiteUrl};
