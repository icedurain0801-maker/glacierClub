'use strict';
function enforceStrictTls(env=process.env) {
  const corrected=env.NODE_TLS_REJECT_UNAUTHORIZED==='0';
  // Only this CLI process: never persist env or disable certificate validation.
  env.NODE_TLS_REJECT_UNAUTHORIZED='1';
  return {certificateVerification:'strict',inheritedDisableCorrected:corrected};
}
const codes=new Set(['ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','EPIPE',
  'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER','ERR_TLS_HANDSHAKE_TIMEOUT','ABORT_ERR']);
const names=new Set(['Error','TypeError','AbortError','TimeoutError','SyntaxError']);
function transportDiagnostic(error) {
  return {code:codes.has(error?.code)?error.code:'UNCLASSIFIED',
    name:names.has(error?.name)?error.name:'UNCLASSIFIED',
    causeCode:codes.has(error?.cause?.code)?error.cause.code:'UNCLASSIFIED'};
}
module.exports={enforceStrictTls,transportDiagnostic};
