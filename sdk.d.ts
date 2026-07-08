// Glacier BaaS SDK — TypeScript 类型声明
// 用法：
//   <script src> 全局：tsconfig 引入本文件即可获得 window.GlacierBaaS 类型
//   ESM/打包器：import GlacierBaaS from '.../glacier-baas-sdk.esm.js'
// 单一来源运行时为 glacier-baas-sdk.js（UMD）/ glacier-baas-sdk.esm.js（ESM 封装）。

export interface InitOptions {
  /** 公开密钥 pk_...；省略则取宿主页注入的 window.GLACIER_APP_KEY */
  appKey?: string;
  /** 后端地址；省略则取 window.GLACIER_BASE_URL 或脚本来源 */
  baseUrl?: string;
  /** app.ai.* 默认模型（可在每次调用 opts.model 覆盖），默认 gpt-5.4-mini */
  aiModel?: string;
}

export interface User {
  end_user_id: string;
  display_name: string;
  is_anonymous: boolean;
}

export interface Doc<T = any> {
  id: string;
  data: T;
  owner_end_user_id?: string;
  acl?: string;
  locked?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** 摊平后的文档：data 字段提到顶层，并带 id（贴合 .find()/.get() 返回） */
export type FlatDoc<T = any> = T & {
  id: string;
  _id: string;
  created_at?: string;
  updated_at?: string;
};

export interface ListResult<T = any> {
  docs: Doc<T>[];
  count: number;
}

export interface ListQuery<T = any> {
  where?: Partial<T> | Record<string, any>;
  limit?: number;
  offset?: number;
  orderBy?: string;
  desc?: boolean;
}

export interface DocChange<T = any> {
  type: 'doc_change';
  action: 'created' | 'updated' | 'deleted';
  collection: string;
  doc?: Doc<T>;
}

export interface Auth {
  register(p: { email?: string; phone?: string; password: string; display_name?: string }): Promise<User>;
  login(p: { email?: string; phone?: string; password: string }): Promise<User>;
  anonymous(): Promise<User>;
  /** SSO：用宿主签发的断言换 token（内部应用复用宿主登录） */
  exchangeSso(assertion: string): Promise<User>;
  /** 自动 SSO：向 window.GLACIER_SSO_ENDPOINT 取断言再换 token。
   *  redirectOnGuest=true 时未登录自动跳宿主登录页并回跳本页。 */
  sso(opts?: { redirectOnGuest?: boolean }): Promise<User>;
  /** 宿主登录地址（带回跳），默认 /login?redirect_url=<当前页>，可由 window.GLACIER_LOGIN_URL 覆盖 */
  loginUrl(returnTo?: string): string;
  /** 跳转宿主登录页（登录后回跳当前页） */
  gotoLogin(returnTo?: string): void;
  /** 直接以已签发 token 建会话（SSO 桥 / 演示切换身份） */
  useToken(token: string, user?: User): Promise<User>;
  logout(): void;
  currentUser(): User | null;
  isLoggedIn(): boolean;
  me(): Promise<any>;
  roles(): Promise<string[]>;
}

/** 链式查询（Firebase/Mongo 风格）。find()/get() 返回摊平数组。 */
export interface Query<T = any> {
  where(cond: Partial<T> | Record<string, any>): Query<T>;
  orderBy(field: string, desc?: boolean): Query<T>;
  order(field: string, desc?: boolean): Query<T>;
  limit(n: number): Query<T>;
  offset(n: number): Query<T>;
  /** 返回原始 { docs, count } */
  list(): Promise<ListResult<T>>;
  /** 返回摊平数组 [{...data, id}] */
  find(): Promise<FlatDoc<T>[]>;
  get(): Promise<FlatDoc<T>[]>;
  toArray(): Promise<FlatDoc<T>[]>;
}

export interface UpdateOptions {
  /** 是否浅合并，默认 true */
  merge?: boolean;
  /** 锁定后更正所需的原因 */
  reason?: string;
}

export interface Collection<T = any> {
  create(data: T, id?: string): Promise<Doc<T>>;
  get(id: string): Promise<Doc<T>>;
  list(q?: ListQuery<T>): Promise<ListResult<T>>;
  update(id: string, data: Partial<T>, opts?: UpdateOptions): Promise<Doc<T>>;
  remove(id: string, reason?: string): Promise<{ ok: boolean }>;
  /** 提交锁定（写一次） */
  submit(id: string, reason?: string): Promise<Doc<T>>;
  /** 变更时间线（审计） */
  audit(opts?: { docId?: string; limit?: number }): Promise<{ items: any[] }>;
  /** 订阅集合文档变更（实时）。返回取消订阅函数。 */
  subscribe(cb: (change: DocChange<T>) => void): () => void;
  // 链式查询
  where(cond: Partial<T> | Record<string, any>): Query<T>;
  orderBy(field: string, desc?: boolean): Query<T>;
  /** 取全部（摊平数组） */
  find(): Promise<FlatDoc<T>[]>;
}

export interface RoomMessage<P = any> {
  type: 'message';
  room: string;
  payload: P;
  from?: string;
}

export interface Room {
  on(event: 'message', cb: (m: RoomMessage) => void): Room;
  on(event: 'presence', cb: (m: any) => void): Room;
  on(event: 'joined', cb: (m: { members: any[] }) => void): Room;
  send(payload: any): boolean;
  leave(): void;
  members: any[];
}

export interface Realtime {
  join(roomName: string): Room;
}

export interface WorkflowInstance {
  instance_id: string;
  flow_key: string;
  title: string;
  data: any;
  status: 'running' | 'approved' | 'rejected' | 'withdrawn';
  current_step: number;
  current_step_key?: string | null;
  current_step_name?: string | null;
  current_approvers: string[];
  initiator: string;
  history?: any[];
  can_act?: boolean;
}

export interface Workflow {
  list(): Promise<{ workflows: any[] }>;
  start(flowKey: string, payload: { title?: string; data?: any; comment?: string }): Promise<WorkflowInstance>;
  get(instanceId: string): Promise<WorkflowInstance>;
  act(instanceId: string, action: string, comment?: string, extra?: Record<string, any>): Promise<WorkflowInstance>;
  approve(id: string, comment?: string): Promise<WorkflowInstance>;
  reject(id: string, comment?: string): Promise<WorkflowInstance>;
  withdraw(id: string, comment?: string): Promise<WorkflowInstance>;
  resubmit(id: string, comment?: string): Promise<WorkflowInstance>;
  addsign(id: string, target: string | string[], comment?: string): Promise<WorkflowInstance>;
  todo(): Promise<{ todo: WorkflowInstance[]; count: number }>;
  instances(q?: { flowKey?: string; status?: string; mine?: boolean }): Promise<{ instances: WorkflowInstance[]; count: number }>;
}

/** 成员（含角色），由 admin.listMembers() 返回 */
export interface Member {
  end_user_id: string;
  display_name?: string;
  external_id?: string;
  dept?: string;
  is_anonymous?: boolean;
  role?: string;
  roles: string[];
  joined_at?: string;
}

/** 角色字典里的一个角色定义 */
export interface Role {
  role_key: string;
  label: string;
  description: string;
  builtin: boolean;
  sort: number;
}

/** app 自治管理：owner 或 admin 角色可在前端管成员角色与角色字典。
 *  鉴权用现有 app_key + 登录 token，无需平台 admin key。
 *  两级防提权：仅 owner 可授予/变更 admin 角色，admin 只能管业务角色、且不能改 owner 本人。 */
export interface Admin {
  /** 列出本 app 成员及角色 */
  listMembers(opts?: { q?: string; role?: string; limit?: number; offset?: number }): Promise<{ members: Member[]; count: number }>;
  /** 覆盖式设置某成员角色（按 end_user_id 或 external_id 定位） */
  setMemberRoles(p: { end_user_id?: string; external_id?: string; roles: string[] }): Promise<{ ok: boolean; end_user_id: string; roles: string[] }>;
  /** 当前登录者是否为本 app 管理员（owner 或持 admin 角色） */
  isAdmin(): Promise<boolean>;
  /** 列角色字典 + 模板场景（任意登录用户可读，用于渲染角色中文名 / 分配下拉 / 选场景导入） */
  listRoles(): Promise<{ roles: Role[]; template_sets: { key: string; label: string; roles: Role[] }[] }>;
  /** 创建/更新一个角色定义（owner/admin） */
  createRole(def: { role_key: string; label?: string; description?: string; sort?: number }): Promise<{ ok: boolean; role_key: string }>;
  /** 删除一个角色定义（不影响成员已分配的角色）（owner/admin） */
  deleteRole(roleKey: string): Promise<{ ok: boolean }>;
  /** 按场景导入角色模板（owner/admin）。template: 'general'|'ipd'|'oa'，默认 general */
  importRoleTemplates(template?: 'general' | 'ipd' | 'oa' | string): Promise<{ ok: boolean; imported: number; template: string }>;
  /** 列某角色的成员（从角色视角看人） */
  listRoleMembers(roleKey: string): Promise<{ members: Member[]; count: number }>;
  /** 给某角色批量加/移除成员（id 为 end_user_id 或 external_id）（owner/admin） */
  setRoleMembers(roleKey: string, p: { add?: string[]; remove?: string[] }): Promise<{ ok: boolean; role_key: string; changed: number }>;
  /** 列集合及完整 ACL（owner/admin） */
  listCollections(): Promise<{ collections: any[]; acl_choices: string[] }>;
  /** 批量设集合 ACL（owner/admin） */
  setCollectionAcl(cols: Array<{ collection: string; acl?: string; read_roles?: string[]; create_roles?: string[]; write_roles?: string[]; correct_roles?: string[]; author_only?: boolean; append_only?: boolean; lock_after_submit?: boolean; audit?: boolean }>): Promise<{ ok: boolean; updated: number }>;
  /** 列流程定义（含完整 definition）（owner/admin） */
  listWorkflowDefs(): Promise<{ workflows: Array<{ flow_key: string; name: string; definition: any }> }>;
  /** 定义/更新流程（owner/admin） */
  defineWorkflow(def: { flow_key: string; name?: string; definition: any }): Promise<{ ok: boolean; flow_key: string; steps: number }>;
  /** 删除流程定义（owner/admin） */
  deleteWorkflow(flowKey: string): Promise<{ ok: boolean }>;
}

/** AI 能力（文本；暂需 SSO 登录 + 与冰川同域，用登录 cookie 调用，计费走当前用户） */
export interface Ai {
  /** 通用多轮对话，返回回复文本 */
  chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, opts?: { model?: string; temperature?: number; max_tokens?: number; json?: boolean }): Promise<string>;
  /** 单轮：给 prompt 返回回复 */
  complete(prompt: string, opts?: { model?: string; temperature?: number; max_tokens?: number }): Promise<string>;
  /** 摘要 */
  summarize(text: string, opts?: { model?: string }): Promise<string>;
  /** 翻译到目标语言（默认 English） */
  translate(text: string, targetLang?: string, opts?: { model?: string }): Promise<string>;
  /** 润色 / 改写 */
  polish(text: string, opts?: { model?: string }): Promise<string>;
  /** 起标题 */
  title(text: string, opts?: { model?: string }): Promise<string>;
  /** 分类（归入 labels 之一，返回类别名） */
  classify(text: string, labels: string[], opts?: { model?: string }): Promise<string>;
  /** 内容审核，返回 { flagged, reason } */
  moderate(text: string, opts?: { model?: string }): Promise<{ flagged: boolean; reason?: string; raw?: string }>;
  /** 文本转语音 → { url, blob }（url 优先 OSS 直链） */
  tts(text: string, opts?: { model?: string; voice?: string; format?: string; speed?: number }): Promise<{ url: string; blob: Blob }>;
  /** 文本朗读：TTS 后直接播放 */
  speak(text: string, opts?: { model?: string; voice?: string; format?: string; speed?: number }): Promise<{ url: string; blob: Blob; audio?: HTMLAudioElement }>;
  /** 文生图 → 图片 URL（n>1 返回数组） */
  image(prompt: string, opts?: { model?: string; size?: string; n?: number }): Promise<string | string[]>;
  /** 创建有状态对话智能体（人设 + 多轮 + 可选把历史存进集合），撑聊天/陪伴/NPC/客服 */
  agent(cfg?: { system?: string; model?: string; historyCollection?: string; sessionId?: string; maxTurns?: number }): AiAgent;
}

/** 对话智能体（app.ai.agent 返回） */
export interface AiAgent {
  /** 内存多轮历史 */
  history: Array<{ role: string; content: string }>;
  /** 发一句，返回回复（自动带人设+历史；配了 historyCollection 则每轮写入集合） */
  send(text: string): Promise<string>;
  /** 清空内存历史 */
  reset(): AiAgent;
  /** 从集合加载本 session 历史（需配 historyCollection） */
  load(): Promise<Array<{ role: string; content: string }>>;
}

/** 上传结果 */
export interface UploadedFile { file_id: string; url: string; name: string; size: number; mime: string; }

/** 文件上传（OSS，Bearer token 鉴权，任意来源可用；支持图片/视频/音频/office/文本/zip，≤100MB） */
export interface Files {
  /** 上传浏览器 File/Blob → 直链 URL */
  upload(file: File | Blob, filename?: string): Promise<UploadedFile>;
  /** 列出本用户在本 app 上传的文件 */
  list(): Promise<{ files: Array<{ file_id: string; url: string; size: number; mime: string; created_at?: string }> }>;
  /** 删除文件记录（仅本人） */
  remove(fileId: string): Promise<{ ok: boolean }>;
}

export interface GlacierApp {
  appKey: string;
  baseUrl: string;
  auth: Auth;
  realtime: Realtime;
  workflow: Workflow;
  admin: Admin;
  ai: Ai;
  files: Files;
  collection<T = any>(name: string): Collection<T>;
  onAuthChange(cb: (user: User | null) => void): GlacierApp;
}

export interface GlacierBaaSStatic {
  version: string;
  init(opts?: InitOptions): GlacierApp;
}

declare const GlacierBaaS: GlacierBaaSStatic;
export default GlacierBaaS;
export { GlacierBaaS };

declare global {
  interface Window {
    GlacierBaaS: GlacierBaaSStatic;
    GLACIER_APP_KEY?: string;
    GLACIER_BASE_URL?: string;
    GLACIER_SSO_ENDPOINT?: string;
    GLACIER_LOGIN_URL?: string;
  }
  // 全局 <script> 用法下可直接使用 GlacierBaaS
  const GlacierBaaS: GlacierBaaSStatic;
}
