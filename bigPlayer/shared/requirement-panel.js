(() => {
  if (document.getElementById('spec-fab')) return;
  const config = window.requirementPanelConfig || {};

  const style = document.createElement('style');
  style.textContent = `
    #spec-fab{position:fixed;right:24px;bottom:36px;z-index:9999;width:44px;height:44px;border-radius:50%;background:#0061a4;box-shadow:0 4px 16px rgba(0,97,164,.40);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s,box-shadow .18s;}
    #spec-fab:hover{transform:scale(1.08);box-shadow:0 6px 22px rgba(0,97,164,.50);}
    #spec-fab:focus-visible,#spec-panel-close:focus-visible{outline:3px solid #8ed2ff;outline-offset:3px;}
    #spec-fab svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
    #spec-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9998;opacity:0;pointer-events:none;transition:opacity .22s;}
    #spec-overlay.open{opacity:1;pointer-events:auto;}
    #spec-panel{position:fixed;top:0;right:-560px;width:540px;max-width:90vw;height:100vh;background:#fff;z-index:9999;box-shadow:-4px 0 32px rgba(0,0,0,.18);display:flex;flex-direction:column;transition:right .26s cubic-bezier(.4,0,.2,1);}
    #spec-panel.open{right:0;}
    #spec-panel-head{display:flex;align-items:center;justify-content:space-between;padding:18px 24px 16px;border-bottom:1px solid #e1e9ee;flex-shrink:0;}
    #spec-panel-title{font-family:Manrope,system-ui,sans-serif;font-size:16px;font-weight:800;color:#0061a4;margin:0;}
    #spec-panel-ver{font-size:11px;font-weight:600;color:#a9b4b9;margin-left:8px;}
    #spec-panel-close{width:32px;height:32px;border-radius:50%;border:none;background:#f0f4f7;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    #spec-panel-close svg{width:16px;height:16px;stroke:#566166;stroke-width:2.5;stroke-linecap:round;fill:none;}
    #spec-body{flex:1;overflow-y:auto;padding:20px 24px 32px;font-family:Inter,system-ui,sans-serif;font-size:13px;color:#2a3439;line-height:1.7;}
    #spec-body h2{font-family:Manrope,sans-serif;font-size:15px;font-weight:800;color:#0061a4;margin:24px 0 8px;border-bottom:2px solid #e8eff3;padding-bottom:6px;}
    #spec-body h3{font-family:Manrope,sans-serif;font-size:13px;font-weight:700;color:#2a3439;margin:16px 0 6px;}
    #spec-body h4{font-size:12px;font-weight:700;color:#566166;margin:12px 0 4px;}
    #spec-body p{margin:4px 0 8px;}
    #spec-body ul{padding-left:22px;margin:4px 0 8px;}
    #spec-body li{margin-bottom:3px;}
    #spec-body table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:12px;}
    #spec-body th{background:#f0f4f7;color:#566166;font-weight:700;padding:6px 8px;text-align:left;border:1px solid #e1e9ee;}
    #spec-body td{padding:5px 8px;border:1px solid #e8eff3;color:#2a3439;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;}
    #spec-body tr:nth-child(even) td{background:#f7f9fb;}
    #spec-body code{background:#f0f4f7;padding:1px 5px;border-radius:4px;font-size:11.5px;font-family:Consolas,monospace;color:#0061a4;}
    @media (max-width:430px){#spec-fab{right:16px;bottom:72px;}#spec-panel{width:100%;max-width:100%;right:-100%;}#spec-panel-head{padding:16px 20px 14px;}#spec-body{padding:18px 20px 28px;}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.innerHTML = `
    <button id="spec-fab" type="button" aria-label="打开需求说明" title="需求说明">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    </button>
    <div id="spec-overlay" aria-hidden="true"></div>
    <aside id="spec-panel" aria-label="需求说明" aria-hidden="true">
      <header id="spec-panel-head">
        <div><span id="spec-panel-title">${config.title || '需求说明'}</span>${config.version ? `<span id="spec-panel-ver">${config.version}</span>` : ''}</div>
        <button id="spec-panel-close" type="button" aria-label="关闭需求说明">
          <svg viewBox="0 0 16 16" aria-hidden="true"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
        </button>
      </header>
      <div id="spec-body"></div>
    </aside>
  `;
  document.body.appendChild(panel);

  const fab = document.getElementById('spec-fab');
  const overlay = document.getElementById('spec-overlay');
  const drawer = document.getElementById('spec-panel');
  const closeButton = document.getElementById('spec-panel-close');
  if (config.html) document.getElementById('spec-body').innerHTML = config.html;

  function openSpecPanel() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    closeButton.focus();
  }

  function closeSpecPanel() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    fab.focus();
  }

  fab.addEventListener('click', openSpecPanel);
  closeButton.addEventListener('click', closeSpecPanel);
  overlay.addEventListener('click', closeSpecPanel);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drawer.classList.contains('open')) closeSpecPanel();
  });
})();
