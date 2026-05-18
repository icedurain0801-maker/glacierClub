# SDK 管理工作台 - 新手教程使用说明

## 概述

在 `sdkSchemeManagement.html` 中集成了一套完整的新手教程系统，帮助首次用户快速上手创建 SDK 方案的流程。

## 教程流程（3步）

### 第1步：欢迎 & SDK类型选择
- **触发时机**：页面首次加载时自动弹出
- **内容**：欢迎对话框 + 4种SDK类型选择
- **选项**：
  - 📱 移动端
  - 🌐 H5
  - 🖥️ Windows
  - ⚙️ 小游戏
- **操作**：选择一个类型后点击【下一步】按钮进入第2步，或点击【跳过教程】关闭

### 第2步：高亮【新建通用方案】
- **内容**：蒙层+聚光灯高亮"新建通用方案"按钮
- **显示**：气泡提示，说明该按钮的作用
- **操作**：
  - 点击【模拟创建】按钮进入第3步
  - 点击【跳过】关闭教程
- **进度指示**：显示"第1/3步"

### 第3步：创建后的下一步指引
- **内容**：方案创建成功提示 + 两个操作选项
- **选项**：
  1. **📦 包体映射配置**
     - 描述：将方案绑定到渠道包体，指定哪个包用这个配置
     - 点击后：提示用户已引导到该功能
  
  2. **⚙️ 配置中心 - 新建**
     - 描述：进入侧边栏配置中心，为方案填写具体参数配置
     - 点击后：提示用户已引导到该功能

- **完成教程**：点击【完成教程】按钮关闭教程并标记为已完成

## 测试使用

### 在浏览器中测试

打开 `sdkSchemeManagement.html`，浏览器控制台运行以下命令：

```javascript
// 查看教程状态
console.log('首次访问:', TutorialSystem.isFirstVisit());

// 重置教程（再次显示）
TutorialSystem.resetTutorial();

// 手动启动教程
TutorialSystem.show();

// 查看用户选择的SDK类型
console.log('选择的SDK:', TutorialSystem.selectedSDK);

// 关闭教程
TutorialSystem.close();
```

### 当前配置

- **测试模式**：`show()` 方法中已改为每次都弹出（正式上线改回首次访问判断）
- **存储方式**：使用 `localStorage` 记录教程完成状态
- **键名**：`sdkSchemeManagement_tutorial_completed`

## UI设计特性

### 蒙层效果
- 半透明深色背景（`rgba(11,18,32,.65)`）
- 高斯模糊效果
- 点击蒙层可关闭教程（可选）

### 聚光灯效果
- 圆角矩形框高亮目标元素
- 有阴影投影强调
- 平滑过渡动画

### 气泡提示
- 自动判断屏幕位置避免溢出
- 白色底色，阴影投影
- 包含：徽章 | 标题 | 描述 | 操作按钮 | 进度指示

### 对话框样式
- 屏幕中心显示
- 渐变背景强调
- 按钮组件（主操作/次操作）
- 左上角关闭按钮

## 样式覆盖

所有教程样式都以 `.tut-` 前缀隔离，避免与现有样式冲突。完整样式类包括：

| 类名 | 用途 |
|------|------|
| `.tut-overlay` | 蒙层背景 |
| `.tut-spotlight` | 聚光灯边框 |
| `.tut-tooltip` | 气泡提示框 |
| `.tut-modal` | 对话框 |
| `.tut-modal-backdrop` | 对话框背景 |
| `.tut-cta-primary` | 主操作按钮 |
| `.tut-cta-secondary` | 次操作按钮 |
| `.tut-progress` | 进度指示器 |

## JavaScript API

### TutorialSystem 对象

```javascript
// 核心方法
TutorialSystem.show()                 // 启动教程
TutorialSystem.close()                // 关闭教程
TutorialSystem.isFirstVisit()         // 检查是否首次访问
TutorialSystem.markAsCompleted()      // 标记教程已完成
TutorialSystem.resetTutorial()        // 重置教程状态

// 流程方法（内部使用）
TutorialSystem.step1_welcome()        // 欢迎对话框
TutorialSystem.step2_highlightNewScheme()  // 高亮新建方案
TutorialSystem.step3_selectType()     // 方案创建成功
TutorialSystem.step4_packageMapping() // 包体映射引导
TutorialSystem.step4_configCenter()   // 配置中心引导

// 工具方法
TutorialSystem.highlightElement(el)   // 高亮元素
TutorialSystem.showTooltip(el, config) // 显示气泡
TutorialSystem.getSDKTypeLabel(type)  // 获取类型标签
TutorialSystem.selectSDK(type)        // 选择SDK类型
TutorialSystem.confirmSDKSelection()  // 确认SDK选择
```

## 集成要点

1. **样式**：教程样式已添加到 `<style>` 中
2. **脚本**：教程脚本已添加到 `<head>` 的 `<script>` 中
3. **自动触发**：`DOMContentLoaded` 事件时自动启动
4. **非侵入式**：教程使用固定定位，不破坏现有布局

## 正式上线调整

上线前需要做以下调整：

```javascript
// 改回首次访问判断
show() {
  if (!this.isFirstVisit()) return;  // 取消注释这行
  this.initOverlay();
  setTimeout(() => this.step1_welcome(), 100);
}
```

同时可选项：
- 调整蒙层透明度和模糊程度
- 修改气泡提示文案和提示时机
- 添加分析埋点记录用户行为
- 添加"再看一遍"按钮让用户重新查看教程

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

（需要支持 `backdrop-filter: blur()` 和 CSS Grid）
