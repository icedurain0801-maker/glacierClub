# News Carousel Autoplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 news_post.html 的静态三图轮播改为自动播放（3秒切换）、无缝循环的滑动轮播。

**Architecture:** 使用 transform: translateX 方案，在真实3张图前后各克隆一张（共5个节点），轨道整体移动；到达克隆节点时瞬间跳回对应真实节点实现无缝循环。分页点随当前索引高亮。

**Tech Stack:** 原生 HTML/CSS/JS，Tailwind CSS（已引入）

---

### Task 1: 重构轮播容器 HTML 结构

**Files:**
- Modify: `bigPlayer/client/news/news_post.html`（第50-72行，Hero Carousel 区域）

- [ ] **Step 1: 替换轮播容器 HTML**

将第50-72行的轮播区域替换为以下结构：

```html
<!-- Hero Carousel -->
<div class="mt-2 relative z-10 w-full overflow-hidden py-1" id="carousel-wrapper">
  <div class="flex items-center transition-transform duration-500 ease-in-out" id="carousel-track">
    <!-- 克隆末张（第3张）放最前，用于无缝回绕 -->
    <div class="carousel-slide shrink-0 px-1.5">
      <div class="w-full aspect-[21/9] rounded-2xl overflow-hidden opacity-70 scale-95 transition-all duration-500">
        <img alt="Hero Banner 3" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdGZ2hfRhEmXXMHL8oIuKCjYc126AqTSia2NZPOUj8GQ0Ty_UeIm2EDFtYDr0N_s5Ts4_wCJt8JgRPgfKwRfTHMTb_3uuyFeCDsGHk2VrI8-k_ebBTVGRfnjwldc85rXBYsxJbNTAm_wZhGq3_JTqHNA85DUrR4AqvAwqI2QMJOcp29dZNaNHvEzsTIq83k20HzQYu84QedYzKc8Jtn_DaVaaoV7NeJ8jrU2H62Xjg3oRvhVCXalSsOjBILx4BigK-8aOyWeCa3AM"/>
      </div>
    </div>
    <!-- 真实第1张 -->
    <div class="carousel-slide shrink-0 px-1.5">
      <div class="w-full aspect-[21/9] rounded-2xl overflow-hidden transition-all duration-500">
        <img alt="Hero Banner 1" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdGZ2hfRhEmXXMHL8oIuKCjYc126AqTSia2NZPOUj8GQ0Ty_UeIm2EDFtYDr0N_s5Ts4_wCJt8JgRPgfKwRfTHMTb_3uuyFeCDsGHk2VrI8-k_ebBTVGRfnjwldc85rXBYsxJbNTAm_wZhGq3_JTqHNA85DUrR4AqvAwqI2QMJOcp29dZNaNHvEzsTIq83k20HzQYu84QedYzKc8Jtn_DaVaaoV7NeJ8jrU2H62Xjg3oRvhVCXalSsOjBILx4BigK-8aOyWeCa3AM"/>
      </div>
    </div>
    <!-- 真实第2张 -->
    <div class="carousel-slide shrink-0 px-1.5">
      <div class="w-full aspect-[21/9] rounded-2xl overflow-hidden opacity-70 scale-95 transition-all duration-500">
        <img alt="Hero Banner 2" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdGZ2hfRhEmXXMHL8oIuKCjYc126AqTSia2NZPOUj8GQ0Ty_UeIm2EDFtYDr0N_s5Ts4_wCJt8JgRPgfKwRfTHMTb_3uuyFeCDsGHk2VrI8-k_ebBTVGRfnjwldc85rXBYsxJbNTAm_wZhGq3_JTqHNA85DUrR4AqvAwqI2QMJOcp29dZNaNHvEzsTIq83k20HzQYu84QedYzKc8Jtn_DaVaaoV7NeJ8jrU2H62Xjg3oRvhVCXalSsOjBILx4BigK-8aOyWeCa3AM"/>
      </div>
    </div>
    <!-- 真实第3张 -->
    <div class="carousel-slide shrink-0 px-1.5">
      <div class="w-full aspect-[21/9] rounded-2xl overflow-hidden opacity-70 scale-95 transition-all duration-500">
        <img alt="Hero Banner 3" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdGZ2hfRhEmXXMHL8oIuKCjYc126AqTSia2NZPOUj8GQ0Ty_UeIm2EDFtYDr0N_s5Ts4_wCJt8JgRPgfKwRfTHMTb_3uuyFeCDsGHk2VrI8-k_ebBTVGRfnjwldc85rXBYsxJbNTAm_wZhGq3_JTqHNA85DUrR4AqvAwqI2QMJOcp29dZNaNHvEzsTIq83k20HzQYu84QedYzKc8Jtn_DaVaaoV7NeJ8jrU2H62Xjg3oRvhVCXalSsOjBILx4BigK-8aOyWeCa3AM"/>
      </div>
    </div>
    <!-- 克隆首张（第1张）放最后，用于无缝向后循环 -->
    <div class="carousel-slide shrink-0 px-1.5">
      <div class="w-full aspect-[21/9] rounded-2xl overflow-hidden opacity-70 scale-95 transition-all duration-500">
        <img alt="Hero Banner 1" class="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdGZ2hfRhEmXXMHL8oIuKCjYc126AqTSia2NZPOUj8GQ0Ty_UeIm2EDFtYDr0N_s5Ts4_wCJt8JgRPgfKwRfTHMTb_3uuyFeCDsGHk2VrI8-k_ebBTVGRfnjwldc85rXBYsxJbNTAm_wZhGq3_JTqHNA85DUrR4AqvAwqI2QMJOcp29dZNaNHvEzsTIq83k20HzQYu84QedYzKc8Jtn_DaVaaoV7NeJ8jrU2H62Xjg3oRvhVCXalSsOjBILx4BigK-8aOyWeCa3AM"/>
      </div>
    </div>
  </div>
  <!-- 分页点 -->
  <div class="flex justify-center space-x-1.5 mt-2 pb-1" id="carousel-dots">
    <div class="w-4 h-1.5 rounded-full bg-white transition-all duration-300" data-dot="0"></div>
    <div class="w-1.5 h-1.5 rounded-full bg-white/50 transition-all duration-300" data-dot="1"></div>
    <div class="w-1.5 h-1.5 rounded-full bg-white/50 transition-all duration-300" data-dot="2"></div>
  </div>
</div>
```

- [ ] **Step 2: 在 `<style>` 块中添加轮播辅助样式**

在已有的 `<style>` 标签内末尾追加：

```css
/* 每个 slide 宽度 = wrapper 宽度的 84%，两侧各留 8% 供旁边 slide 漏出 */
.carousel-slide {
  width: 84%;
}
/* 中间激活 slide 的内层容器不缩放、不透明度降低 */
.carousel-slide.active > div {
  opacity: 1 !important;
  transform: scale(1) !important;
}
/* 非激活 slide */
.carousel-slide:not(.active) > div {
  opacity: 0.65;
  transform: scale(0.93);
}
```

- [ ] **Step 3: 浏览器打开 news_post.html，确认5个 slide 节点存在、分页点3个存在**

直接用浏览器 devtools 检查 `#carousel-track` 子节点数量为 5。

---

### Task 2: 添加轮播 JS 逻辑

**Files:**
- Modify: `bigPlayer/client/news/news_post.html`（在 `</body>` 前插入 `<script>` 块）

- [ ] **Step 1: 在 `</body>` 前插入以下脚本**

```html
<script>
(function () {
  const TOTAL = 3;           // 真实图片数量
  const INTERVAL = 3000;     // 自动播放间隔 ms
  const TRANSITION = 500;    // CSS transition 时长 ms（需与 duration-500 一致）

  const wrapper = document.getElementById('carousel-wrapper');
  const track = document.getElementById('carousel-track');
  const slides = track.querySelectorAll('.carousel-slide');
  const dots = document.querySelectorAll('#carousel-dots [data-dot]');

  // 真实 slide 索引 0-2，内部轨道索引 = realIndex + 1（因为前面有一个克隆末张）
  let realIndex = 0;   // 当前真实图片索引（0-based）
  let isTransitioning = false;

  function slideWidth() {
    return slides[0].getBoundingClientRect().width;
  }

  function goTo(trackIndex, animate) {
    if (!animate) {
      track.style.transition = 'none';
    } else {
      track.style.transition = `transform ${TRANSITION}ms ease-in-out`;
    }
    // wrapper 居中对准 trackIndex 这张 slide
    // 每张 slide 宽度 = 84% of wrapper，加上左右 padding 1.5px*2
    // 让中心 slide 居中：偏移 = -(trackIndex * slideWidth()) + (wrapper.width - slideWidth()) / 2
    const ww = wrapper.getBoundingClientRect().width;
    const sw = slideWidth();
    const offset = -(trackIndex * sw) + (ww - sw) / 2;
    track.style.transform = `translateX(${offset}px)`;
  }

  function updateDots(idx) {
    dots.forEach((d, i) => {
      if (i === idx) {
        d.classList.remove('bg-white/50', 'w-1.5');
        d.classList.add('bg-white', 'w-4');
      } else {
        d.classList.remove('bg-white', 'w-4');
        d.classList.add('bg-white/50', 'w-1.5');
      }
    });
  }

  function updateActiveSlide(trackIndex) {
    slides.forEach((s, i) => {
      if (i === trackIndex) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
  }

  function init() {
    // 初始定位到真实第1张（trackIndex = 1）
    goTo(1, false);
    updateActiveSlide(1);
    updateDots(0);
  }

  function next() {
    if (isTransitioning) return;
    isTransitioning = true;

    const nextReal = realIndex + 1;
    const nextTrack = nextReal + 1;  // +1 因为 track[0] 是克隆末张

    goTo(nextTrack, true);
    updateActiveSlide(nextTrack);

    setTimeout(() => {
      if (nextReal >= TOTAL) {
        // 已滑到克隆首张（trackIndex = 4），瞬间跳回真实首张（trackIndex = 1）
        goTo(1, false);
        updateActiveSlide(1);
        realIndex = 0;
      } else {
        realIndex = nextReal;
      }
      updateDots(realIndex);
      isTransitioning = false;
    }, TRANSITION + 50);
  }

  init();

  // 初始化后 requestAnimationFrame 确保 transition:none 生效后恢复
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      track.style.transition = `transform ${TRANSITION}ms ease-in-out`;
    });
  });

  setInterval(next, INTERVAL);
})();
</script>
```

- [ ] **Step 2: 浏览器刷新，观察轮播效果**

预期：
- 初始显示第1张居中，左右各漏出相邻 slide 约 8% 宽度
- 每3秒自动滑到下一张，动画流畅
- 第3张结束后无缝回到第1张（看不到跳帧）
- 分页点随当前张高亮（激活点更宽 `w-4`，其余 `w-1.5`）

---

### Task 3: 验证两侧漏出距离一致 & 收尾

**Files:**
- Modify: `bigPlayer/client/news/news_post.html`（如需微调 slide 宽度）

- [ ] **Step 1: 检查两侧漏出是否对称**

在浏览器 devtools 中测量：
- wrapper 宽度：W
- 激活 slide 宽度：S（预期 ≈ 0.84W）
- 左侧漏出 ≈ 右侧漏出 ≈ (W - S) / 2 - px-1.5 padding

如不对称，检查 `#carousel-wrapper` 是否有额外 padding 不对称，调整 wrapper 的 `px-*` 类为 `px-0`。

- [ ] **Step 2: 如需微调 slide 宽度，修改 CSS**

将 `.carousel-slide { width: 84%; }` 中的 `84%` 调整至视觉效果满意（两侧各露出约 8%）。通常 84% 在 375px 宽度下两侧各露出约 24px，符合设计截图效果。

- [ ] **Step 3: 提交**

```bash
git add bigPlayer/client/news/news_post.html
git commit -m "feat(news): add auto-play carousel with seamless loop"
```
