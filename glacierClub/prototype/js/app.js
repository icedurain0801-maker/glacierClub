// 应用核心逻辑
class CommunityApp {
  constructor() {
    this.currentPage = 'home';
    this.user = mockData.currentUser;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.renderPage('home');
  }

  setupEventListeners() {
    // 侧边栏导航
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const pageId = item.dataset.page;
        this.renderPage(pageId);
      });
    });
  }

  renderPage(pageId) {
    this.currentPage = pageId;

    // 更新导航激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

    // 更新页面标题和面包屑
    const titles = {
      'home': '首页',
      'news': '资讯',
      'posts': '玩家圈',
      'publish': '发布帖子',
      'profile': '我的'
    };
    
    document.querySelector('.content-title').textContent = titles[pageId] || '页面';

    // 隐藏所有页面，显示当前页面
    document.querySelectorAll('.page-container').forEach(page => {
      page.classList.remove('active');
    });

    // 根据页面ID渲染不同内容
    const contentBody = document.querySelector('.content-body');
    
    switch(pageId) {
      case 'home':
        this.renderHomePage(contentBody);
        break;
      case 'news':
        this.renderNewsPage(contentBody);
        break;
      case 'posts':
        this.renderPostsPage(contentBody);
        break;
      case 'publish':
        this.renderPublishPage(contentBody);
        break;
      case 'profile':
        this.renderProfilePage(contentBody);
        break;
    }
  }

  renderHomePage(container) {
    let html = '';

    // 统计数据
    html += '<div class="stats-grid">';
    mockData.homepage.stats.forEach(stat => {
      html += `
        <div class="stat-card">
          <div class="stat-icon">${stat.icon}</div>
          <div class="stat-value">${stat.value}</div>
          <div class="stat-label">${stat.label}</div>
        </div>
      `;
    });
    html += '</div>';

    // 热门话题
    html += '<div style="margin-bottom: 30px;"><h2 style="margin-bottom: 16px; font-size: 20px; color: #2c3e50;">热门话题</h2>';
    html += '<div class="topic-grid">';
    mockData.homepage.hotTopics.forEach(topic => {
      html += `
        <div class="topic-card" onclick="app.viewPostDetail('${topic.id}')">
          <img src="${topic.cover}" class="topic-image" alt="${topic.title}">
          <div class="topic-info">
            <div class="topic-title">${topic.title}</div>
            <div class="topic-meta">
              <img src="${mockData.posts[0].avatar}" class="topic-avatar" alt="${topic.author}">
              <span>${topic.author}</span>
              <span class="author-level">Lv.${topic.level}</span>
            </div>
            <div class="topic-stats">
              <div class="stat-item">👍 ${topic.likes}</div>
              <div class="stat-item">💬 ${topic.comments}</div>
              <div class="stat-item">👀 ${topic.views}</div>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div></div>';

    // 频道导航
    html += '<div style="margin-bottom: 30px;"><h2 style="margin-bottom: 16px; font-size: 20px; color: #2c3e50;">频道入口</h2>';
    html += '<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;">';
    const channels = [
      { name: '每日签到', icon: '📅', color: '#667eea' },
      { name: '礼包中心', icon: '🎁', color: '#f093fb' },
      { name: '积分商城', icon: '💰', color: '#4facfe' },
      { name: '装备强化', icon: '🔧', color: '#fa709a' },
      { name: '等级冲刺', icon: '⭐', color: '#30cfd0' }
    ];
    
    channels.forEach(channel => {
      html += `
        <div style="background: linear-gradient(135deg, ${channel.color} 0%, rgba(255,255,255,0.1) 100%); 
                    color: white; 
                    padding: 20px; 
                    border-radius: 8px; 
                    text-align: center; 
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
             onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.15)';"
             onmouseout="this.style.transform='none'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)';">
          <div style="font-size: 32px; margin-bottom: 8px;">${channel.icon}</div>
          <div style="font-size: 13px; font-weight: 600;">${channel.name}</div>
        </div>
      `;
    });
    html += '</div></div>';

    container.innerHTML = html;
  }

  renderNewsPage(container) {
    let html = '';

    // 分类过滤
    html += '<div class="filter-bar">';
    const categories = ['全部', '官方公告', '版本更新', '攻略分享'];
    categories.forEach(cat => {
      const isActive = cat === '全部' ? 'active' : '';
      html += `<button class="filter-btn ${isActive}">${cat}</button>`;
    });
    html += '</div>';

    // 资讯列表
    html += '<div class="item-list">';
    mockData.news.forEach(news => {
      html += `
        <div class="item-card" onclick="app.viewNewsDetail('${news.id}')">
          <div class="item-header">
            <img src="${news.avatar}" class="item-avatar" alt="${news.author}">
            <div class="item-author">
              <div class="author-name">${news.author} <span class="author-level">Lv.${news.authorLevel}</span></div>
              <div class="author-meta">${news.date}</div>
            </div>
          </div>
          <div class="item-body">
            <div class="item-title">${news.title}</div>
            <div class="item-desc">${news.content}</div>
            <img src="${news.cover}" class="item-image" alt="${news.title}">
          </div>
          <div class="item-footer">
            <div>👍 ${news.likes}</div>
            <div>💬 ${news.comments}</div>
            <div>👀 ${news.views}</div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  renderPostsPage(container) {
    let html = '';

    // 过滤和发帖按钮
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #ecf0f1;">';
    html += '<div class="filter-bar" style="margin: 0; border: none; flex: 1;">';
    const categories = ['全部', '攻略', '讨论', '分享', '二次创作'];
    categories.forEach(cat => {
      const isActive = cat === '全部' ? 'active' : '';
      html += `<button class="filter-btn ${isActive}">${cat}</button>`;
    });
    html += '</div>';
    html += '<button class="btn btn-primary" onclick="app.renderPage(\'publish\')">+ 发布帖子</button>';
    html += '</div>';

    // 帖子列表
    html += '<div class="item-list">';
    mockData.posts.forEach(post => {
      html += `
        <div class="item-card" onclick="app.viewPostDetail('${post.id}')">
          <div class="item-header">
            <img src="${post.avatar}" class="item-avatar" alt="${post.author}">
            <div class="item-author">
              <div class="author-name">${post.author} <span class="author-level">Lv.${post.authorLevel}</span></div>
              <div class="author-meta">${post.date}</div>
            </div>
          </div>
          <div class="item-body">
            <div class="item-title">${post.title}</div>
            <div class="item-desc">${post.content}</div>
            ${post.cover ? `<img src="${post.cover}" class="item-image" alt="${post.title}">` : ''}
            <div class="tag-list">
              ${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          </div>
          <div class="item-footer">
            <div>👍 ${post.likes}</div>
            <div>💬 ${post.comments}</div>
            <div>👀 ${post.views}</div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  renderPublishPage(container) {
    let html = `
      <form onsubmit="app.handlePublishSubmit(event)" style="max-width: 800px; margin: 0 auto;">
        <div class="form-group">
          <label class="form-label">帖子标题 *</label>
          <input type="text" class="form-input" placeholder="输入帖子标题，不超过100字" maxlength="100" required>
        </div>

        <div class="form-group">
          <label class="form-label">分类 *</label>
          <select class="form-select" required>
            <option value="">选择分类</option>
            <option value="攻略">攻略</option>
            <option value="讨论">讨论</option>
            <option value="分享">分享</option>
            <option value="二次创作">二次创作</option>
            <option value="其他">其他</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">帖子内容 *</label>
          <textarea class="form-textarea" placeholder="分享你的想法、攻略、二创作品等..." required></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">添加标签（最多5个）</label>
          <input type="text" class="form-input" placeholder="输入标签，用空格或逗号隔开">
        </div>

        <div class="form-group">
          <label class="form-label">上传图片（最多9张）</label>
          <button type="button" class="btn btn-secondary btn-block">选择图片</button>
          <input type="file" multiple accept="image/*" style="display: none;">
        </div>

        <div style="display: flex; gap: 12px;">
          <button type="reset" class="btn btn-secondary" style="flex: 1;">清空</button>
          <button type="submit" class="btn btn-primary" style="flex: 1;">发布</button>
        </div>
      </form>
    `;

    container.innerHTML = html;
  }

  renderProfilePage(container) {
    const user = this.user;
    
    let html = `
      <div class="user-profile">
        <img src="${user.avatar}" class="user-avatar-large" alt="${user.username}">
        <div class="user-name">${user.username}</div>
        <div class="user-level">Lv. ${user.level}</div>
        <div class="user-bio">${user.bio}</div>
        <div class="user-stats">
          <div class="user-stat">
            <div class="user-stat-value">${user.fans}</div>
            <div class="user-stat-label">粉丝</div>
          </div>
          <div class="user-stat">
            <div class="user-stat-value">${user.following}</div>
            <div class="user-stat-label">关注</div>
          </div>
          <div class="user-stat">
            <div class="user-stat-value">${user.posts}</div>
            <div class="user-stat-label">发帖</div>
          </div>
        </div>
      </div>

      <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #2c3e50;">资产</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px;">
            <div style="color: #7f8c8d; font-size: 12px; margin-bottom: 8px;">积分</div>
            <div style="font-size: 28px; font-weight: bold; color: #667eea;">${user.points}</div>
          </div>
          <div style="background: #f9fafb; padding: 16px; border-radius: 6px;">
            <div style="color: #7f8c8d; font-size: 12px; margin-bottom: 8px;">红钻</div>
            <div style="font-size: 28px; font-weight: bold; color: #f5576c;">${user.rubies}</div>
          </div>
        </div>
      </div>

      <div style="background: white; border-radius: 8px; padding: 20px;">
        <h3 style="font-size: 16px; margin-bottom: 16px; color: #2c3e50;">我的内容</h3>
        <button class="btn btn-secondary btn-block">我的发帖 (${user.posts})</button>
        <button class="btn btn-secondary btn-block">我的评论 (124)</button>
        <button class="btn btn-secondary btn-block">我的收藏 (56)</button>
        <button class="btn btn-secondary btn-block">账号设置</button>
      </div>
    `;

    container.innerHTML = html;
  }

  viewNewsDetail(newsId) {
    const news = mockData.news.find(n => n.id === newsId);
    if (!news) return;

    const container = document.querySelector('.content-body');
    let html = `
      <button class="btn btn-secondary" style="margin-bottom: 20px;" onclick="app.renderPage('news')">← 返回</button>
      
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 800px;">
        <h1 style="font-size: 28px; margin-bottom: 20px; color: #2c3e50;">${news.title}</h1>
        
        <div class="item-header">
          <img src="${news.avatar}" class="item-avatar" alt="${news.author}">
          <div class="item-author">
            <div class="author-name">${news.author} <span class="author-level">Lv.${news.authorLevel}</span></div>
            <div class="author-meta">${news.date}</div>
          </div>
        </div>

        <img src="${news.cover}" style="width: 100%; margin: 20px 0; border-radius: 8px;" alt="${news.title}">
        
        <div style="line-height: 1.8; color: #555; margin: 20px 0; font-size: 16px;">${news.content}</div>

        <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #ecf0f1;">
          <div class="item-footer">
            <div>👍 ${news.likes}</div>
            <div>💬 ${news.comments}</div>
            <div>👀 ${news.views}</div>
          </div>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 6px;">
          <div style="font-weight: 600; margin-bottom: 12px; color: #2c3e50;">评论</div>
          ${mockData.comments.map(comment => `
            <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #ecf0f1;">
              <div class="item-header" style="margin-bottom: 8px;">
                <img src="${comment.avatar}" class="item-avatar" alt="${comment.author}">
                <div class="item-author">
                  <div class="author-name">${comment.author} <span class="author-level">Lv.${comment.authorLevel}</span></div>
                  <div class="author-meta">${comment.date}</div>
                </div>
              </div>
              <div style="color: #555;">${comment.content}</div>
              <div style="font-size: 12px; color: #7f8c8d; margin-top: 8px;">👍 ${comment.likes}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  viewPostDetail(postId) {
    const post = mockData.posts.find(p => p.id === postId);
    if (!post) return;

    const container = document.querySelector('.content-body');
    let html = `
      <button class="btn btn-secondary" style="margin-bottom: 20px;" onclick="app.renderPage('posts')">← 返回</button>
      
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 800px;">
        <h1 style="font-size: 28px; margin-bottom: 20px; color: #2c3e50;">${post.title}</h1>
        
        <div class="item-header">
          <img src="${post.avatar}" class="item-avatar" alt="${post.author}">
          <div class="item-author">
            <div class="author-name">${post.author} <span class="author-level">Lv.${post.authorLevel}</span></div>
            <div class="author-meta">${post.date}</div>
          </div>
        </div>

        ${post.cover ? `<img src="${post.cover}" style="width: 100%; margin: 20px 0; border-radius: 8px;" alt="${post.title}">` : ''}
        
        <div style="line-height: 1.8; color: #555; margin: 20px 0; font-size: 16px;">${post.content}</div>

        <div class="tag-list" style="margin: 20px 0;">
          ${post.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>

        <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #ecf0f1;">
          <div class="item-footer">
            <div>👍 ${post.likes}</div>
            <div>💬 ${post.comments}</div>
            <div>👀 ${post.views}</div>
          </div>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 6px;">
          <div style="font-weight: 600; margin-bottom: 12px; color: #2c3e50;">评论</div>
          ${mockData.comments.map(comment => `
            <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #ecf0f1;">
              <div class="item-header" style="margin-bottom: 8px;">
                <img src="${comment.avatar}" class="item-avatar" alt="${comment.author}">
                <div class="item-author">
                  <div class="author-name">${comment.author} <span class="author-level">Lv.${comment.authorLevel}</span></div>
                  <div class="author-meta">${comment.date}</div>
                </div>
              </div>
              <div style="color: #555;">${comment.content}</div>
              <div style="font-size: 12px; color: #7f8c8d; margin-top: 8px;">👍 ${comment.likes}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 30px;">
          <form onsubmit="event.preventDefault(); alert('评论成功！'); return false;">
            <input type="text" class="form-input" placeholder="说点什么..." style="margin-bottom: 10px;" required>
            <button type="submit" class="btn btn-primary">发送评论</button>
          </form>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  handlePublishSubmit(event) {
    event.preventDefault();
    alert('帖子发布成功！');
    this.renderPage('posts');
  }
}

// 初始化应用
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new CommunityApp();
});
