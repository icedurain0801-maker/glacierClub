'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {inventory}=require('./lastnight-runtime-inventory');
const {newFiles}=require('./lastnight-forward-resume');
const root=path.resolve(__dirname,'../../..','.temp/bigplayer-recovery-20261009');
const output=fs.mkdtempSync(path.join(root,'lastnight-forward-'));fs.mkdirSync(path.join(output,'protected'));fs.mkdirSync(path.join(output,'public'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const common={approved:false,authorizationMode:'lastnight-forward-resume-v1',nodeVersion:process.version,files:inventory(),forwardFiles:newFiles(),
 forwardCliSha256:sha(path.join(__dirname,'lastnight-forward-resume.js')),accountId:'75c8205f-37eb-4bdf-b6a4-f4f502e35658',expectedIdentity:null,
 envFile:'C:/ProgramData/PublicOpinion/config/public-opinion.env',evidenceDirectory:path.join(output,'protected'),publicDirectory:path.join(output,'public'),
 baseJournalFile:null,baseJournalSha256:null,sessionJournalFile:null,sessionJournalSha256:null,failurePostcheckFile:null,failurePostcheckSha256:null,diagnosticFile:null,diagnosticSha256:null,snapshotHash:null,ownerId:null};
for(const stage of ['inspect-forward-resume','execute-forward-resume','inspect-detail-shape','execute-detail-shape','inspect-rich-detail','execute-rich-detail'])fs.writeFileSync(path.join(output,`${stage}.unapproved.json`),JSON.stringify({...common,stage,output:path.join(output,`${stage}-result.json`)},null,2)+'\n',{flag:'wx'});
const manifest=path.join(output,'manifest.json');fs.writeFileSync(manifest,JSON.stringify({...common,status:'QA_PENDING_NOT_EXECUTED'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,manifest,manifestSha256:sha(manifest),files:common.files.length,forwardFiles:common.forwardFiles.length,cliSha256:common.forwardCliSha256}));
