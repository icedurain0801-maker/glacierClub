/* ===================== 单游戏 Mock 数据 ===================== */
// 规则二开启门槛：游戏累计总流水须超过此值才需要开启
const RULE2_THRESHOLD = 25000000; // 2500 万

const game = {
  name: "冰川大乱斗", id: "wx_glacier_01",
  r1Enable: true, scenes: ["search", "mini", "ad"], threshold: 500,
  coef: 0.025, period: 2, newRandom: true,
  androidFlow: 1200000, iosFlow: 160000,
  totalFlow: 32000000, // 累计总流水（达标演示值）
  actualRatio: 0.031,
  trend: [1.2, 1.8, 1.5, 2.2, 2.6, 2.4, 3.1], // 近7天 iOS官方占比(%)
};

const TIERS = [
  { name: "大R",  count: 320,   officialCount: 62  },
  { name: "中R",  count: 1480,  officialCount: 278 },
  { name: "小R",  count: 6200,  officialCount: 1163 },
  { name: "非R",  count: 38000, officialCount: 7125 },
];

/* ===================== 工具函数 ===================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmtMoney = (n) => "¥" + Number(n).toLocaleString("zh-CN");
const fmtPct = (n) => (n * 100).toFixed(1) + "%";

function calcRatioA(androidFlow, iosFlow, coef) {
  if (!iosFlow || iosFlow <= 0) return 0;
  return (androidFlow / iosFlow) * coef;
}
function nextEffectDate(periodWeeks) {
  const d = new Date(2026, 5, 16);
  d.setDate(d.getDate() + periodWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 2000);
}

/* ===================== 视图切换 ===================== */
const CRUMB = {
  stats:  "微信小游戏支付配置 / 切量数据统计",
  config: "微信小游戏支付配置 / 配置管理",
};
function showView(name) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  const el = $("#view-" + name);
  if (el) el.classList.remove("hidden");
  $("#crumb").textContent = CRUMB[name] || "";
  $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === name));
  if (name === "stats") renderStats();
  if (name === "config") { loadConfig(); recompute(); }
}

/* ===================== 统计页 ===================== */
function renderStats() {
  const coef = game.coef;
  const targetPct = coef * 100;
  const actualPct = game.actualRatio * 100;
  const A = calcRatioA(game.androidFlow, game.iosFlow, coef);
  const isOk = game.actualRatio >= coef;
  const isWarn = game.actualRatio >= coef * 0.85;
  const statusLabel = isOk ? "达标" : isWarn ? "临界" : "未达标";
  const statusColor = isOk ? "var(--ok)" : isWarn ? "var(--warn)" : "var(--danger)";

  // KPI 卡片
  $("#kpiRow").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-val" style="color:${statusColor}">${statusLabel}</div>
      <div class="kpi-label">当前达标状态</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${actualPct.toFixed(1)}%</div>
      <div class="kpi-label">iOS实际官方占比（近7天）</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${targetPct.toFixed(1)}%</div>
      <div class="kpi-label">目标线（极限系数）</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${fmtPct(A)}</div>
      <div class="kpi-label">切量比例 A（本周期）</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${fmtMoney(game.androidFlow)}</div>
      <div class="kpi-label">上周期安卓流水</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val">${fmtMoney(game.iosFlow)}</div>
      <div class="kpi-label">上周期iOS流水</div>
    </div>`;

  // 近7天趋势 SVG
  renderTrend(game.trend, targetPct);

  // 玩家支付方式分布
  const totPeople = TIERS.reduce((s, t) => s + t.count, 0);
  const offPeople = TIERS.reduce((s, t) => s + t.officialCount, 0);
  const webPeople = totPeople - offPeople;
  const offPct = (offPeople / totPeople) * 100;
  const webPct = 100 - offPct;
  $("#dist").innerHTML = `
    <div class="dist-item">
      <div class="dist-top"><span>玩家人数分布</span><span>官方 ${offPct.toFixed(1)}% · 网页 ${webPct.toFixed(1)}%</span></div>
      <div class="dist-bar">
        <i class="off" style="width:${offPct}%">${offPct > 8 ? "官方" : ""}</i>
        <i class="web" style="width:${webPct}%">${webPct > 8 ? "网页" : ""}</i>
      </div>
      <div class="dist-legend">
        <span class="lg-off">官方支付 ${offPeople.toLocaleString()} 人</span>
        <span class="lg-web">网页支付 ${webPeople.toLocaleString()} 人</span>
      </div>
    </div>`;

  // 分层切量明细
  const rows = TIERS.map(t => {
    const web = t.count - t.officialCount;
    const opct = (t.officialCount / t.count * 100).toFixed(1);
    const tgt = (A * 100).toFixed(1);
    const ok = parseFloat(opct) >= parseFloat(tgt);
    return `<tr>
      <td>${t.name}</td>
      <td>${t.count.toLocaleString()}</td>
      <td style="color:var(--official);font-weight:600">${t.officialCount.toLocaleString()}</td>
      <td>${web.toLocaleString()}</td>
      <td>${opct}%</td>
      <td>${tgt}%</td>
      <td><span class="badge ${ok?"badge-ok":"badge-warn"}">${ok?"达标":"偏低"}</span></td>
    </tr>`;
  }).join("");
  $("#statsTierBody").innerHTML = rows;
}

function renderTrend(trend, targetPct) {
  const W = 560, H = 120, pad = 20;
  const max = Math.max(...trend, targetPct + 1);
  const xStep = (W - pad * 2) / (trend.length - 1);
  const yScale = (v) => H - pad - (v / max) * (H - pad * 2);
  const days = ["周一","周二","周三","周四","周五","周六","周日"];

  const pts = trend.map((v, i) => `${pad + i * xStep},${yScale(v)}`).join(" ");
  const areaPath = `M${pad},${H - pad} ` + trend.map((v, i) => `L${pad + i * xStep},${yScale(v)}`).join(" ") + ` L${pad + (trend.length-1)*xStep},${H-pad} Z`;
  const targetY = yScale(targetPct);

  const labels = days.map((d, i) => `<text x="${pad + i*xStep}" y="${H-2}" text-anchor="middle" fill="#aaa" font-size="10">${d}</text>`).join("");
  const dots = trend.map((v, i) => `<circle cx="${pad + i*xStep}" cy="${yScale(v)}" r="3.5" fill="${v >= targetPct ? "var(--ok)" : "var(--danger)"}" />`).join("");

  $("#trendChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">
    <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity=".18"/><stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
    <path d="${areaPath}" fill="url(#tg)"/>
    <line x1="${pad}" y1="${targetY}" x2="${W-pad}" y2="${targetY}" stroke="var(--danger)" stroke-width="1.5" stroke-dasharray="5,3"/>
    <polyline points="${pts}" fill="none" stroke="var(--primary)" stroke-width="2"/>
    ${dots}
    ${labels}
    <text x="${W-pad+2}" y="${targetY+4}" fill="var(--danger)" font-size="9">目标 ${targetPct}%</text>
  </svg>`;
}

/* ===================== 配置管理 ===================== */
function loadConfig() {
  $("#r1Enable").checked = game.r1Enable;
  $$(".scene").forEach(c => c.checked = game.scenes.includes(c.value));
  $("#threshold").value = game.threshold;
  $("#coef").value = (game.coef * 100).toFixed(1);
  $("#period").value = game.period;
  $("#newRandom").checked = game.newRandom;
}

function readForm() {
  const scenes = $$(".scene").filter(c => c.checked).map(c => c.value);
  const coefPct = Number($("#coef").value);
  const coef = (isNaN(coefPct) ? 2.5 : Math.max(2.5, coefPct)) / 100;
  return {
    r1Enable: $("#r1Enable").checked, scenes,
    threshold: Number($("#threshold").value) || 0, coef,
    period: Math.max(2, Number($("#period").value) || 2),
    newRandom: $("#newRandom").checked,
    androidFlow: game.androidFlow,
    iosFlow: game.iosFlow,
  };
}

function renderRule2Gate() {
  const enabled = game.totalFlow >= RULE2_THRESHOLD;
  $("#gateTotal").textContent = fmtMoney(game.totalFlow);
  $("#gateBadge").textContent = enabled ? "已达标 · 已开启" : "未达标 · 未开启";
  $("#gateBadge").className = "gate-badge " + (enabled ? "ok" : "off");
  $("#gateSub").textContent = enabled
    ? "累计总流水已超过开启门槛，规则二生效。"
    : "累计总流水未超过开启门槛，规则二暂未开启。";
  $("#r2Gate").classList.toggle("gate-off", !enabled);
  $("#r2Body").classList.toggle("is-disabled", !enabled);
  return enabled;
}

function recompute() {
  renderRule2Gate();
  const f = readForm();
  const A = calcRatioA(f.androidFlow, f.iosFlow, f.coef);
  $("#resultA").textContent = fmtPct(A);
  $("#effectDate").textContent = nextEffectDate(f.period);
  const sceneNames = { search: "搜索栏", mini: "小程序搜索", ad: "广告搜索" };
  $("#flowScenes").textContent = f.scenes.length ? f.scenes.map(s => sceneNames[s]).join("/") : "（未选场景）";
  $("#flowThreshold").textContent = f.threshold;
  $("#flowA").textContent = fmtPct(A);
  $("#r1Body").style.opacity = f.r1Enable ? "1" : ".45";
  renderTiers(A);
}

function renderTiers(A) {
  const ratio = Math.min(1, Math.max(0, A));
  let tot = 0, off = 0;
  const rows = TIERS.map(t => {
    const o = Math.round(t.count * ratio);
    const w = t.count - o;
    tot += t.count; off += o;
    return `<tr><td>${t.name}</td><td>${t.count.toLocaleString()}</td><td><b style="color:var(--official)">${o.toLocaleString()}</b></td><td>${w.toLocaleString()}</td></tr>`;
  }).join("");
  $("#tierBody").innerHTML = rows;
  $("#tierTotal").textContent = tot.toLocaleString();
  $("#tierOfficial").textContent = off.toLocaleString();
  $("#tierWeb").textContent = (tot - off).toLocaleString();
}

function saveConfig() {
  const f = readForm();
  if (f.r1Enable && f.scenes.length === 0) { toast("规则一已启用，请至少选择一个命中场景"); return; }
  Object.assign(game, f);
  toast("配置已保存 · 下周期生效");
}

/* ===================== 事件绑定 ===================== */
function bindEvents() {
  $$(".nav-item").forEach(n => n.addEventListener("click", () => showView(n.dataset.view)));
  $("#btnSave").addEventListener("click", saveConfig);
  ["#r1Enable","#threshold","#coef","#period","#newRandom"]
    .forEach(sel => $(sel).addEventListener("input", recompute));
  $$(".scene").forEach(c => c.addEventListener("change", recompute));
}

bindEvents();
showView("stats");

