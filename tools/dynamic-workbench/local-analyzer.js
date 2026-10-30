/* 本地规则整理：不联网、不调用模型；不确定信息交由用户核对。 */
(function(root){
 'use strict';
 const numeral='〇一二三四五六七八九';
 function chineseNumber(value){
  if(/^\d+$/.test(value))return Number(value);
  if(value.includes('十')){const [a,b]=value.split('十');return (a?numeral.indexOf(a):1)*10+(b?numeral.indexOf(b):0);}
  return Number([...value].map(c=>c==='零'?'0':String(numeral.indexOf(c))).join(''));
 }
 function normalize(text){return String(text||'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/\r/g,'').replace(/[\t ]+/g,' ').trim();}
 function dateInfo(text){
  const n='[0-9〇零一二三四五六七八九十]+';
  let m=text.match(new RegExp('(?:('+n+')年)?('+n+')月('+n+')[日号](?:\\s*(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚间))?'));
  if(!m){m=text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s*(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚间))?/);}
  if(!m)return {value:'待确认',raw:''};
  const year=m[1]?chineseNumber(m[1]):null,month=chineseNumber(m[2]),day=chineseNumber(m[3]);
  const check=new Date(year||2000,month-1,day);
  if((year!==null&&(year<1000||year>9999))||month<1||month>12||day<1||check.getMonth()!==month-1||check.getDate()!==day)return {value:'待确认（日期无效）',raw:m[0]};
  return {value:(year?year+'年':'')+month+'月'+day+'日'+(m[4]||''),raw:m[0]};
 }
 function stripDate(text,raw){let value=text;if(raw&&value.startsWith(raw))value=value.slice(raw.length);return value.replace(/^[\s，,、：:]+/,'').replace(/^(?:近日|日前|当天|当日|昨日|今天)[，,\s]*/,'');}
 function compact(text){return text.replace(/党组成员[、，,]/g,'').replace(/党委委员[、，,]/g,'').replace(/带队走访/g,'走访').replace(/相关负责同志/g,'相关负责人').replace(/同志/g,'').replace(/\s+/g,'').trim();}
 function firstSentence(text){return text.split(/[。！？\n]/).map(s=>s.trim()).find(Boolean)||'';}
 function extractPosition(text){
  const lead=stripDate(firstSentence(text),dateInfo(text).raw).replace(/\s+/g,'');
  // 保留机构及并列职务，到首个主职务结束，不把姓名、动作或参会名单带入。
  const role=/(?:[一二三四]级调研员|[一二]级巡视员|[一二三四]级主任科员|副局长|局长|副市长|市长|副区长|区长|副县长|县长|副书记|书记|副主任|主任|副科长|科长|副处长|处长)/.exec(lead);
  if(!role)return '未识别（待确认）';
  const prefix=lead.slice(0,role.index+role[0].length);
  if(prefix.length>65||/带队|走访|调研(?!员)|参加|陪同|出席|召开|主持/.test(prefix))return role[0]+'（单位待确认）';
  return prefix.replace(/^(?:由我局|我局邀请|由)/,'');
 }
 function extractLevel(text){
  // 只判断首个活动句中的领导，避免把参会名单或后文市区要求当成带队领导。
  const lead=extractPosition(text);
  // 用户指定的整理标签：调研员等非领导职务按所属机构地域，不推算法定行政级别。
  if(/调研员|巡视员|主任科员/.test(lead)){
   if(/区/.test(lead))return '区级';
   if(/县/.test(lead))return '县级';
   if(/市/.test(lead))return '市级';
   if(/省/.test(lead))return '省级';
   return '待确认';
  }
  const roles=[
   [/市委(?:副)?书记|(?:副)?市长/,'市级'],
   [/区委(?:副)?书记|(?:副)?区长/,'区级'],
   [/县委(?:副)?书记|(?:副)?县长/,'县级'],
   [/街道(?:党工委|办事处)?(?:副)?(?:书记|主任)/,'街道级']
  ];
  const explicit=roles.map(([re,label])=>({match:re.exec(lead),label})).filter(x=>x.match).sort((a,b)=>a.match.index-b.match.index);
  const department=/(副局长|局长|副主任|主任)/.exec(lead);
  if(explicit.length&&(!department||explicit[0].match.index<=department.index))return explicit[0].label;
  if(department){
   if(/局长/.test(department[0]))return '局级';
   return '待确认';
  }
  if(/社区[^。；]{0,16}(?:党委|党总支|党支部)?(?:副)?书记/.test(lead))return '社区级';
  if(/(?:副)?科长/.test(lead))return '科级';
  if(/(?:副)?处长/.test(lead))return '处级';
  return '未识别（待确认）';
 }
 const topicLexicon=[
  {re:/欠薪|工资支付|劳动报酬/g,label:'欠薪治理'},
  {re:/校园安全|学校安全|校园隐患/g,label:'校园安全'},
  {re:/消防|火灾|防火/g,label:'消防安全'},
  {re:/安全生产|生产安全/g,label:'安全生产'},
  {re:/食品安全|食药安全/g,label:'食品安全'},
  {re:/防汛|防洪|汛期|排涝/g,label:'防汛工作'},
  {re:/就业|招聘|求职/g,label:'就业服务'},
  {re:/营商环境|助企|惠企|企业服务/g,label:'企业服务'},
  {re:/环境卫生|垃圾分类|人居环境/g,label:'环境整治'},
  {re:/养老|老年人|适老/g,label:'养老服务'},
  {re:/信访|矛盾纠纷|纠纷化解/g,label:'矛盾纠纷化解'},
  {re:/党建|党组织建设|党员教育/g,label:'党建工作'}
 ];
 function subjectOf(lead){
  // 只从主活动句取机构，不能把后面的参会单位当成主办单位。
  const boundary=lead.search(/带队|率队|前往|走访|调研|检查|召开|组织|开展|赴|到|主持/);
  const prefix=boundary>=0?lead.slice(0,boundary):lead;
  const found=prefix.match(/^(?:(?:[\u4e00-\u9fff]{0,12}?)(?:市政府|区政府|县政府|市委|区委|县委)|[\u4e00-\u9fff]{1,22}?(?:委员会|办事处|人力资源局|局|街道|社区|中心))/);
  if(found)return found[0];
  return '';
 }
 function chooseTopic(text,lead){
  // 去除参会名单，按首句、反复出现的议题和工作要求加权，避免只看开头。
  const clauses=text.split(/[。！？\n；]/).filter(s=>!/(?:参加|陪同|出席)[。\s]*$/.test(s.trim()));
  const corpus=clauses.join('。');
  const scored=topicLexicon.map((topic,index)=>{
   const hits=[...corpus.matchAll(topic.re)];
   const inLead=[...lead.matchAll(topic.re)].length;
   return {topic,index,hits,score:hits.length*2+(inLead?7:0)};
  }).filter(x=>x.hits.length).sort((a,b)=>b.score-a.score||a.index-b.index);
  if(scored.length){
   const best=scored[0];let label=best.topic.label;
   if(label==='欠薪治理'){
    if(/源头治理欠薪|欠薪源头治理|从源头[^。]{0,18}欠薪/.test(corpus))label='欠薪源头治理';
    else if(/欠薪线索减量提质/.test(corpus))label='欠薪线索减量提质';
    else if(/欠薪纠纷/.test(corpus))label='欠薪纠纷治理';
   }
   // 第二议题必须同时在活动首句或同一部署句中出现，且有足够证据，最多保留两项。
   const second=scored[1];
   if(second&&second.score>=best.score*.65&&lead.match(second.topic.re)&&lead.match(best.topic.re)&&label.length+second.topic.label.length<=18)label+='及'+second.topic.label;
   return label;
  }
  // 未覆盖的领域使用原文议题短语，不编造一个预设主题。
  const phrases=[];
  const patterns=[/(?:围绕|聚焦|针对|就)([^，。；：\n]{2,26}?)(?:开展|进行|召开|作出|提出|进行了|情况|问题|工作|座谈|调研|[，。；])/g,/(?:研究部署|研究推进|部署|推进|做好|加强|落实)([^，。；：\n]{2,22}?)(?:工作|问题|情况|建设|治理|服务)(?=[，。；\n]|$)/g];
  for(const re of patterns)for(const m of corpus.matchAll(re)){
   const value=m[1].replace(/^(?:了|今年以来|下一步|当前|有关|相关|进一步)+/,'');
   if(value.length>=2&&value.length<=22&&!/同志|负责|带队|一是|二是|要|会议精神/.test(value))phrases.push(value.replace(/的$/,''));
  }
  return phrases[0]||'';
 }
 function buildTitle(text){
  const lead=stripDate(firstSentence(text),dateInfo(text).raw).replace(/\s+/g,'');
  const subject=subjectOf(lead);
  // 原文已给出具体会议名称时，保留名称中的地区、主题和会议性质，优先于泛化主题。
  const namedMeeting=lead.match(/(?:主持召开|组织召开|召开|主持)([^，。；]{2,45}?(?:会议|座谈会|推进会|宣贯会|培训会|动员会|交流会))(?=[，。；]|$)/);
  if(namedMeeting){
   const name=namedMeeting[1];
   const generic=/^(?:工作|专题|相关工作|有关工作|专题工作)?(?:会议|座谈会|推进会|交流会)$/;
   if(!generic.test(name)&&name.length>=6)return subject+'召开'+name;
  }
  const topic=chooseTopic(text,lead);
  const deployment=/(?:部署|一是|二是|要求|强调|提出[^。]{0,12}措施)/.test(text);
  let action='';
  if(/培训|授课/.test(lead))action='开展培训';
  else if(/宣讲|宣传|宣贯/.test(lead))action='开展宣传';
  else if(/检查|督查|巡查|排查/.test(lead))action='开展检查';
  else if(/座谈|会议|召开|主持|研究/.test(lead))action=deployment?'研究部署':'专题研究';
  else if(/调研/.test(lead))action='调研';
  else if(/走访/.test(lead))action='走访';
  else if(/开展|举办|组织/.test(lead))action='开展';
  let location='';
  const place=lead.match(/(?:赴|前往|走访|深入|到)([\u4e00-\u9fff]{2,12}?(?:社区|街道|学校|园区|企业|商圈|中心))(?=座谈|开展|进行|调研|走访|检查|了解|研究|[，、]|$)/);
  if(place)location='赴'+place[1];
  if(topic&&action){
   // 避免“开展培训消防安全”“走访欠薪治理”等倒装，把活动对象放在自然位置。
   let body;
   if(action==='开展培训')body='开展'+topic.replace(/工作$/,'')+'培训';
   else if(action==='开展宣传')body='开展'+topic.replace(/工作$/,'')+'宣传';
   else if(action==='开展检查')body='开展'+topic.replace(/工作$/,'')+'检查';
   else if(action==='走访')body=location?'走访调研'+topic:'走访了解'+topic;
   else body=action+topic;
   if(/研究|调研|了解/.test(body)&&!/(工作|服务|建设|整治|培训|检查)$/.test(body))body+='工作';
   let title=subject+location+body;
   if(title.length>42&&location)title=subject+body;
   return title;
  }
  // 证据不足只返回原文中的活动短语，不制造主题或成果。
  const activity=lead.match(/(?:开展|举办|召开|组织|调研|走访|检查|研究|推进)([^，。；]{2,40})/);
  if(activity){const body=compact(activity[0]);return subject&&body.includes(subject)?body:subject+body;}
  return '待确认（未识别明确活动及议题）';
 }
 function analyze(input){
  const original=String(input||'');
  const text=normalize(input);
  if(!text)throw Error('请填写动态正文。');
  if(!/[\p{L}\p{N}]/u.test(text))throw Error('未识别到有效正文，请粘贴动态文字。');
  if(original.length>30000)throw Error('单条动态最多支持3万字，请拆分后整理。');
  if(/^https?:\/\/\S+$/i.test(text))return {date:'待确认',title:'待确认（未提供动态正文）',content:original,position:'未识别（待确认）',level:'未识别（待确认）'};
  const date=dateInfo(text);
  const title=buildTitle(text);
  const content=original;
  return {date:date.value,title,content,position:extractPosition(text),level:extractLevel(text)};
 }
 root.DynamicLocalAnalyzer=Object.freeze({analyze,dateInfo,extractLevel});
 if(typeof module!=='undefined'&&module.exports)module.exports=root.DynamicLocalAnalyzer;
})(typeof window!=='undefined'?window:globalThis);
