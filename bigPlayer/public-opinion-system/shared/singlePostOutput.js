(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PublicOpinionSinglePostOutput=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
function outputFormat(requirement = '') {
 const text=String(requirement);
 const matches=[...text.matchAll(/excel|xlsx?|html?|word|docx?/gi)];
 const value=matches.at(-1)?.[0].toLowerCase();
 return /^(excel|xlsx?)$/.test(value)?'xlsx':/^(word|docx?)$/.test(value)?'docx':'html';
}
function metadataOnly(requirement='') {
 const text=String(requirement).toLowerCase();
 if(!/(id|编号)/i.test(text))return false;
 const rest=text.replace(/抓取|提取|输出|导出|获取|列出|所有|全部|本次|对应|的|评论区|评论|发布人|用户|账号|作者|平台|帖子|及|和|与|并|id|编号|excel|xlsx?|html?|word|docx?|报告|格式|为|成|表格|文件|保存|下载|请|仅|只|要|[\s，。、“”"':：;；()（）/\-]/g,'');
 return !rest;
}

function fields(row,result){
 if(metadataOnly(result.requirement)){
  const author=/(发布人|作者|用户|账号)/.test(result.requirement),comment=/(评论|帖子)(?:的)?\s*(?:id|编号)/i.test(result.requirement);
  return [...(!author||comment?[{name:'评论ID',value:row.id}]:[]),...(author||!comment?[{name:'发布人平台ID',value:row.authorId||'原平台未提供'}]:[])];
 }
 return row.fields||[{name:'评论原文',value:row.body||''},{name:'原文依据',value:row.quote||''}];
}
function reportTable(result){
 const rows=result.mode==='specified'?(result.rows||[]).filter(r=>metadataOnly(result.requirement)||r.match):(result.rows||[]);
 if(result.mode==='specified'){
  const names=[...new Set(rows.flatMap(row=>fields(row,result).map(f=>f.name)))];
  const headers=metadataOnly(result.requirement)?names:['来源评论ID',...names];
  return {headers:headers.length?headers:['提取结果'],rows:rows.map(row=>[...(metadataOnly(result.requirement)?[]:[row.id]),...names.map(name=>fields(row,result).filter(f=>f.name===name).map(f=>f.value).join('\n'))])};
 }
 return {headers:['评论ID','发布人平台ID','发布人','发布时间','原文','情感','议题','分析依据'],rows:rows.map(r=>[r.id,r.authorId,r.author,r.publishedAt,r.body,({positive:'正面',neutral:'中性',negative:'负面'})[r.sentiment]||'',r.topic,r.reason])};
}
return {outputFormat,metadataOnly,reportTable};
});
