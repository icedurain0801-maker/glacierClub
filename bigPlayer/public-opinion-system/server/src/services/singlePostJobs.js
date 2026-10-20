const crypto = require('node:crypto');
const fail = (message, status=400) => Object.assign(new Error(message), { code:'SINGLE_POST_INVALID', status });
const parse = value => typeof value==='string' ? JSON.parse(value) : value;
const platforms = region => region==='domestic' ? ['bigplayer_h5','taptap'] : region==='overseas' ? ['bigplayer_h5','facebook'] : [];
function validateInput(body) {
 if (!body || !platforms(body.regionCode).includes(body.platform) || !body.communityId) throw fail('请选择有效的区域、社区和平台');
 const inputType=body.inputType;
 if (!(body.platform==='bigplayer_h5'?['id','title']:['url','title']).includes(inputType)) throw fail('该平台不支持此帖子输入方式');
 const query=String(body.query||'').trim();
 if (!query || query.length>1000 || inputType==='id'&&!/^[1-9]\d{0,29}$/.test(query)) throw fail('请填写有效的帖子ID、标题或链接');
 if (inputType==='url') parsePostUrl(body.platform,query);
 if (!['detail','specified'].includes(body.mode)) throw fail('请选择分析类型');
 const requirement=String(body.requirement||'').trim();
 if (requirement.length>2000 || body.mode==='specified'&&!requirement) throw fail('请填写本次抓取要求（最多2000字）');
 return {regionCode:body.regionCode,communityId:String(body.communityId),platform:body.platform,inputType,query,mode:body.mode,requirement:body.mode==='specified'?requirement:''};
}
function parsePostUrl(platform,value) {
 let u; try {u=new URL(value);} catch {throw fail('请输入完整的HTTPS帖子链接');}
 if(u.protocol!=='https:'||u.username||u.password||u.port) throw fail('请输入平台官方HTTPS帖子链接');
 const host=u.hostname.toLowerCase(); let id;
 if(platform==='taptap'&&['www.taptap.cn','taptap.cn','www.taptap.com','taptap.com'].includes(host)) id=u.pathname.match(/^\/moment\/(\d+)\/?$/)?.[1];
 if(platform==='facebook'&&['www.facebook.com','m.facebook.com','facebook.com'].includes(host)) id=u.searchParams.get('story_fbid')||u.pathname.match(/\/(?:posts|permalink)\/([A-Za-z0-9_]+)\/?$/)?.[1];
 if(!id||!/^[A-Za-z0-9_]{1,150}$/.test(id)) throw fail('无法识别帖子链接，请使用帖子完整永久链接（不支持分享短链）');
 return id;
}
class SinglePostJobs {
 constructor(repo){this.repo=repo;}
 async get(id){const rows=await this.repo.query('SELECT * FROM po_single_post_jobs WHERE id=?',[id]);const r=rows[0];return r?{...r,input:parse(r.input_json),result:r.result_json?parse(r.result_json):null,progress:r.progress_json?parse(r.progress_json):null}:null;}
 async create(owner,source,input,kind='search') {
  const [count]=await this.repo.query("SELECT COUNT(*) AS n FROM po_single_post_jobs WHERE owner_id=? AND status IN ('queued','running')",[owner]);
  if(Number(count.n)>=3)throw fail('已有3个任务正在执行，请等待完成',429);
  const id=crypto.randomUUID();
  await this.repo.query('INSERT INTO po_single_post_jobs (id,owner_id,community_id,source_id,platform,kind,input_json) VALUES (?,?,?,?,?,?,?)',[id,owner,source.community_id,source.id,source.platform,kind,JSON.stringify(input)]);
  return {id,status:'queued',kind};
 }
 async progress(id,value){await this.repo.query('UPDATE po_single_post_jobs SET progress_json=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[JSON.stringify(value),id]);}
 async finish(id,result){await this.repo.query("UPDATE po_single_post_jobs SET status='completed',result_json=?,updated_at=UTC_TIMESTAMP() WHERE id=?",[JSON.stringify(result),id]);}
 async failed(id,code){await this.repo.query("UPDATE po_single_post_jobs SET status='failed',error_code=?,updated_at=UTC_TIMESTAMP() WHERE id=?",[String(code||'SINGLE_POST_FAILED').replace(/[^A-Z0-9_]/g,'').slice(0,80),id]);}
}
module.exports={SinglePostJobs,validateInput,parsePostUrl,platforms,fail};
