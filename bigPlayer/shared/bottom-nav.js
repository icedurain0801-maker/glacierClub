class BottomNav extends HTMLElement {
  connectedCallback() {
    this.style.display = 'contents';
    const active = this.getAttribute('active') || 'home';
    const base = this.getAttribute('base') || '';

    const tabs = [
      { id: 'home',    icon: 'home',        label: '首页',   href: `${base}home/home.html`,        fill: true },
      { id: 'news',    icon: 'explore',     label: '资讯',   href: `${base}news/news_post.html`,   fill: true },
      { id: 'post',    icon: 'add',         label: 'Post',   href: null,                            fill: false, fab: true },
      { id: 'chat',    icon: 'mood',        label: '动态',   href: `${base}news/news_feed.html`,    fill: true },
      { id: 'profile', icon: 'person',      label: '我的',   href: `${base}profile/profile.html`,   fill: true,  badge: true },
    ];

    this.innerHTML = `
      <nav class="flex-shrink-0 w-full z-50 bg-white border-t border-slate-100 flex items-center justify-around px-2 h-14">
        ${tabs.map(t => {
          const isActive = t.id === active;
          const color = isActive ? 'text-primary' : 'text-slate-400';
          const fillVal = (isActive && t.fill) ? 1 : 0;
          const wght = (isActive && t.fill) ? 500 : 400;
          const onclick = t.href ? `onclick="location.href='${t.href}'"` : '';

          if (t.fab) {
            return `
              <button onclick="if(typeof togglePostMenu==='function')togglePostMenu()" class="flex flex-col items-center -mt-5 flex-1 transition-all">
                <span id="post-btn-circle" class="flex items-center justify-center w-12 h-12 rounded-full bg-primary shadow-lg shadow-primary/30 transition-transform duration-300">
                  <span class="material-symbols-outlined text-white text-2xl" style="font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24">add</span>
                </span>
                <span class="text-[10px] font-medium text-slate-400 mt-0.5">Post</span>
              </button>`;
          }

          return `
            <button ${onclick} class="flex flex-col items-center gap-0.5 flex-1 active:scale-95 transition-all relative">
              <span class="material-symbols-outlined text-2xl ${color}" style="font-variation-settings:'FILL' ${fillVal},'wght' ${wght},'GRAD' 0,'opsz' 24">${t.icon}</span>
              <span class="text-[10px] font-medium ${color}">${t.label}</span>
              ${t.badge ? `<div class="absolute top-0 right-3 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold border-2 border-white">2</div>` : ''}
            </button>`;
        }).join('')}
      </nav>`;
  }
}

customElements.define('bottom-nav', BottomNav);
