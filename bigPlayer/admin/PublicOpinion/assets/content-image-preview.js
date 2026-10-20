(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PublicOpinionContentImages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const imagePattern = /https?:\/\/[^\s"'<>()]+\.(?:jpe?g|png|gif|webp|bmp)(?:\?[^\s"'<>()]*)?/gi;
  const safeUrl = value => {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  };
  function images(item) {
    let media = item.media;
    if (typeof media === 'string') { try { media = JSON.parse(media); } catch { media = []; } }
    return [...new Set([...(Array.isArray(media) ? media.filter(value => typeof value === 'string') : []),
      ...[item.title, item.body].flatMap(value => String(value || '').match(imagePattern) || [])].map(safeUrl).filter(Boolean))];
  }
  function hasText(item) {
    return [item.title, item.body].some(value => String(value || '').replace(imagePattern, '').trim());
  }
  function markup(item, esc) {
    const urls = images(item);
    if (hasText(item) || !urls.length) return '';
    return `<button type="button" class="content-image-trigger" data-image-preview aria-label="查看图片，共${urls.length}张" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg>${urls.length > 1 ? `<span>${esc(urls.length)} 张</span>` : ''}</button>`;
  }
  function bind(container, items, { resolve } = {}) {
    let disposed = false, active, popup, hideTimer;
    const observers = [];
    const hide = () => {
      clearTimeout(hideTimer); popup?.remove(); popup = null;
      active?.setAttribute('aria-expanded', 'false'); active?.removeAttribute('aria-controls'); active = null;
    };
    const later = () => { hideTimer = setTimeout(hide, 120); };
    const position = () => {
      if (!popup || !active) return;
      const rect = active.getBoundingClientRect(), width = popup.offsetWidth, height = popup.offsetHeight;
      popup.style.left = `${Math.max(12, Math.min(rect.right + 12, innerWidth - width - 12))}px`;
      popup.style.top = `${Math.max(12, Math.min(rect.top, innerHeight - height - 12))}px`;
    };
    const wire = (cell, item) => {
      const button = cell.querySelector('[data-image-preview]');
      if (!button) return;
      const show = () => {
        clearTimeout(hideTimer); if (active === button) return;
        hide(); active = button; button.setAttribute('aria-expanded', 'true');
        button.setAttribute('aria-controls', 'contentImagePreview');
        popup = document.createElement('div'); popup.id = 'contentImagePreview'; popup.className = 'content-image-popover';
        popup.setAttribute('role', 'region'); popup.setAttribute('aria-label', '内容图片预览');
        const heading = document.createElement('div'); heading.className = 'content-image-popover-title'; heading.textContent = `图片预览 · ${images(item).length} 张`;
        popup.append(heading);
        images(item).forEach((url, index) => {
          const image = document.createElement('img'); image.alt = `内容图片 ${index + 1}`; image.referrerPolicy = 'no-referrer';
          image.onload = position;
          image.onerror = () => { const hint = document.createElement('div'); hint.className = 'content-image-preview-error'; hint.textContent = '图片加载失败，请在详情中查看'; image.replaceWith(hint); position(); };
          image.src = url; popup.append(image);
        });
        popup.onmouseenter = () => clearTimeout(hideTimer); popup.onmouseleave = later;
        document.body.append(popup); position();
      };
      button.onmouseenter = show; button.onmouseleave = later; button.onfocus = show; button.onblur = later;
      button.onclick = show;
    };
    const cells = [...container.querySelectorAll('[data-content-cell]')];
    cells.forEach((cell, index) => wire(cell, items[index]));
    // Older cloud list projections omit media. Resolve only visible empty rows,
    // after the table renders, with at most two scoped detail reads in flight.
    const queue = []; let running = 0;
    const pump = () => {
      while (!disposed && running < 2 && queue.length) {
        const { cell, item } = queue.shift(); running++;
        Promise.resolve().then(() => resolve(item)).then(detail => {
          if (disposed || !cell.isConnected) return;
          const content = detail?.content || detail;
          if (!content || String(content.id) !== String(item.id)) return;
          const full = { ...item, ...content }, html = markup(full, value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])));
          if (html) { cell.innerHTML = html; wire(cell, full); }
        }).catch(() => { /* A preview lookup must not break the list. */ }).finally(() => { running--; pump(); });
      }
    };
    if (resolve) {
      const observer = new IntersectionObserver(entries => {
        entries.filter(entry => entry.isIntersecting).forEach(entry => {
          observer.unobserve(entry.target); const index = cells.indexOf(entry.target);
          queue.push({ cell: entry.target, item: items[index] });
        }); pump();
      });
      observers.push(observer);
      cells.forEach((cell, index) => { if (!hasText(items[index]) && items[index].media == null) observer.observe(cell); });
    }
    const escape = event => { if (event.key === 'Escape') hide(); };
    const scroll = event => { if (!popup?.contains(event.target)) hide(); };
    document.addEventListener('keydown', escape); window.addEventListener('resize', hide); window.addEventListener('scroll', scroll, true);
    return () => { disposed = true; queue.length = 0; observers.forEach(observer => observer.disconnect()); hide(); document.removeEventListener('keydown', escape); window.removeEventListener('resize', hide); window.removeEventListener('scroll', scroll, true); };
  }
  return { images, hasText, markup, bind };
});
