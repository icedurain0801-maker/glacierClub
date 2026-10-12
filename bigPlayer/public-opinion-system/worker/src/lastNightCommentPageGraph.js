'use strict';
const fail=code=>{throw Object.assign(new Error(code),{code});};
function commentPageGraph({items,rootId,anchorId=null}){
 if(!Array.isArray(items)||!rootId)fail('LAST_NIGHT_COMMENT_GRAPH_INVALID');
 const nodes=new Map();
 const visit=(node,nestedParent=null)=>{
  if(!node?.externalId || nodes.has(String(node.externalId)) || String(node.externalId)===String(rootId))fail('LAST_NIGHT_COMMENT_GRAPH_INVALID');
  if(node.rootPlatformContentId!=null&&String(node.rootPlatformContentId)!==String(rootId))fail('LAST_NIGHT_COMMENT_GRAPH_INVALID');
  const parent=String(nestedParent??node.platformParentId??anchorId??rootId);
  if(nestedParent!=null&&node.platformParentId!=null&&String(node.platformParentId)!==String(nestedParent))fail('LAST_NIGHT_COMMENT_GRAPH_INVALID');
  const {replies,children,...plain}=node;
  nodes.set(String(node.externalId),{...plain,externalId:String(node.externalId),platformParentId:parent,rootPlatformContentId:String(rootId)});
  for(const child of [...(Array.isArray(replies)?replies:[]),...(Array.isArray(children)?children:[])])visit(child,String(node.externalId));
 };
 for(const item of items)visit(item);
 if(nodes.size>500)fail('LAST_NIGHT_COMMENT_GRAPH_INVALID');
 const ordered=[],pending=new Map(nodes),done=new Set();
 while(pending.size){let advanced=false;
  for(const [id,node] of pending){if(!nodes.has(node.platformParentId)||done.has(node.platformParentId)){ordered.push(node);done.add(id);pending.delete(id);advanced=true;}}
  if(!advanced)fail('LAST_NIGHT_COMMENT_GRAPH_CYCLE');
 }
 if(anchorId)for(const node of ordered){let parent=node.platformParentId;const seen=new Set([node.externalId]);
  while(nodes.has(parent)){if(seen.has(parent))fail('LAST_NIGHT_COMMENT_GRAPH_CYCLE');seen.add(parent);parent=nodes.get(parent).platformParentId;}
  // Existing descendants are validated by the writer's exact DB chain.
  if(parent===String(rootId))fail('LAST_NIGHT_REPLY_BRANCH_CONFLICT');
 }
 return ordered;
}
module.exports={commentPageGraph};
