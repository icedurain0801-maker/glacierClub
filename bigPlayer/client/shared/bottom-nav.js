/**
 * <bottom-nav active="home" base="../"></bottom-nav>
 *
 * active: home | news | post | chat | profile
 * base:   relative path from current page to module root (e.g. "../")
 *
 * Uses inline styles only — no Tailwind dependency.
 */
class BottomNav extends HTMLElement {
  connectedCallback() {
    this.style.display = 'contents';
    const active = this.getAttribute('active') || 'home';
    const base   = this.getAttribute('base')   || '';

    const PRIMARY   = '#0061a4';
    const INACTIVE  = '#94a3b8';

    const tabs = [
      { id: 'home',    icon: 'home',    label: '首页', href: `${base}home/home.html` },
      { id: 'news',    icon: 'explore', label: '资讯', href: `${base}news/news_post.html` },
      { id: 'post',    icon: 'add',     label: 'Post', href: null, fab: true },
      { id: 'chat',    icon: 'mood',    label: '动态', href: `${base}news/news_feed.html` },
      { id: 'profile', icon: 'person',  label: '我的', href: `${base}profile/profile.html`, badge: true },
    ];

    const items = tabs.map(t => {
      if (t.fab) {
        return `
          <button onclick="if(typeof togglePostMenu==='function')togglePostMenu()"
            style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:none;border:none;cursor:pointer;padding:0;margin-top:-20px;">
            <span id="post-btn-circle"
              style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:${PRIMARY};box-shadow:0 4px 12px rgba(0,97,164,0.35);">
              <span class="material-symbols-outlined"
                style="font-size:22px;color:#fff;font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;">add</span>
            </span>
            <span style="font-size:10px;font-weight:500;color:${INACTIVE};margin-top:2px;">Post</span>
          </button>`;
      }

      const isActive = t.id === active;
      const color    = isActive ? PRIMARY : INACTIVE;
      const fillVal  = isActive ? 1 : 0;
      const wght     = isActive ? 500 : 400;
      const click    = (!isActive && t.href) ? `onclick="location.href='${t.href}'"` : '';
      const badge    = t.badge ? `<div style="position:absolute;top:0;right:6px;width:16px;height:16px;background:#ef4444;border-radius:50%;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;">2</div>` : '';

      return `
        <button ${click}
          style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative;background:none;border:none;cursor:${isActive?'default':'pointer'};padding:4px 0 0;">
          <span class="material-symbols-outlined"
            style="font-size:24px;color:${color};font-variation-settings:'FILL' ${fillVal},'wght' ${wght},'GRAD' 0,'opsz' 24;">${t.icon}</span>
          <span style="font-size:10px;font-weight:${isActive?700:500};color:${color};">${t.label}</span>
          ${badge}
        </button>`;
    }).join('');

    this.innerHTML = `
      <nav style="flex-shrink:0;width:100%;height:56px;background:#fff;border-top:1px solid #f1f5f9;display:flex;align-items:stretch;z-index:50;">
        ${items}
      </nav>`;
  }
}

customElements.define('bottom-nav', BottomNav);
