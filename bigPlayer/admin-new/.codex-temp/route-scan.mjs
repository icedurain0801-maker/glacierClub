import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const baseUrl = 'http://127.0.0.1:5173'
const outputDir = path.resolve('.codex-temp', 'route-scan')
fs.mkdirSync(outputDir, { recursive: true })

const routes = [
  '/club/appearance',
  '/club/badge/list',
  '/club/badge/category',
  '/club/banner',
  '/club/board',
  '/club/content/post',
  '/club/content/comment',
  '/club/content/coordinator',
  '/club/content/recycle',
  '/club/creator',
  '/club/creator/task',
  '/club/emotions',
  '/club/encyclopedia',
  '/club/log/report',
  '/club/lottery',
  '/club/lottery/log',
  '/club/lottery/create',
  '/club/push/message',
  '/club/push/create',
  '/club/statistics',
  '/club/topic',
  '/club/user',
  '/club/user/avatar',
  '/club/user/nickname',
  '/club/user/tag',
  '/club/user/tag-setting',
  '/club/user/ai-quality',
  '/club/user/ai-message',
  '/club/user/large-model',
]

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1600, height: 920 } })
const page = await context.newPage()

const results = []

for (const route of routes) {
  const consoleErrors = []
  const pageErrors = []

  const consoleHandler = (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  }
  const pageErrorHandler = (err) => {
    pageErrors.push(String(err))
  }

  page.on('console', consoleHandler)
  page.on('pageerror', pageErrorHandler)

  let metrics = {}
  let addCheck = { hasAddButton: false, addInteractive: null, addButtonLabel: '' }

  try {
    await page.goto(`${baseUrl}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForSelector('.admin-content', { timeout: 12000 })
    await page.waitForTimeout(900)

    metrics = await page.evaluate(() => {
      const content = document.querySelector('.admin-content')
      const toolbar = document.querySelector('.admin-toolbar')

      const textLen = (content?.textContent || '').replace(/\s+/g, '').length
      const nodeCount = content?.querySelectorAll('*').length || 0
      const coreNodeCount = content?.querySelectorAll(
        '.ant-card,.ant-form,.ant-tabs,.ant-table,.q1-table,.ant-list,.ant-empty,.ant-spin,.ant-alert'
      ).length || 0
      const hasRuntimeErrorBanner =
        !!document.querySelector('.vite-error-overlay') || !!document.querySelector('[data-nextjs-dialog-overlay]')

      let overlap = false
      if (content && toolbar) {
        const contentTop = content.getBoundingClientRect().top
        const toolbarBottom = toolbar.getBoundingClientRect().bottom
        overlap = contentTop + 1 < toolbarBottom
      }

      const horizontalOverflow = Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      )

      return {
        textLen,
        nodeCount,
        coreNodeCount,
        overlap,
        horizontalOverflow,
        hasRuntimeErrorBanner,
      }
    })

    const addButton = page
      .locator(
        'button:has-text("新增"),button:has-text("新建"),button:has-text("创建"),button:has-text("批量新增"),button:has-text("添加")'
      )
      .first()

    const addCount = await addButton.count()
    if (addCount > 0) {
      addCheck.hasAddButton = true
      addCheck.addButtonLabel = (await addButton.innerText().catch(() => '')) || ''
      const disabled = await addButton.isDisabled().catch(() => false)
      if (!disabled) {
        const beforeUrl = page.url()
        await addButton.click({ timeout: 4000 }).catch(() => {})
        await page.waitForTimeout(700)
        const hasLayer = await page
          .locator('.ant-drawer-open,.ant-modal-wrap:not([style*="display: none"])')
          .count()
        const afterUrl = page.url()
        addCheck.addInteractive = hasLayer > 0 || afterUrl !== beforeUrl
        if (hasLayer > 0) {
          await page.keyboard.press('Escape').catch(() => {})
          await page.waitForTimeout(200)
        }
      } else {
        addCheck.addInteractive = false
      }
    }

    const routeFile = route.replace(/[\/:]/g, '_').replace(/^_+/, '')
    const screenshotPath = path.join(outputDir, `${routeFile || 'root'}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })

    const isBlank = metrics.coreNodeCount === 0 && metrics.textLen < 8 && metrics.nodeCount < 20

    results.push({
      route,
      isBlank,
      ...metrics,
      ...addCheck,
      consoleErrors,
      pageErrors,
      screenshotPath,
    })
  } catch (error) {
    results.push({
      route,
      isBlank: true,
      textLen: 0,
      nodeCount: 0,
      coreNodeCount: 0,
      overlap: false,
      horizontalOverflow: -1,
      hasRuntimeErrorBanner: true,
      hasAddButton: false,
      addInteractive: null,
      addButtonLabel: '',
      consoleErrors,
      pageErrors: [...pageErrors, String(error)],
      screenshotPath: '',
    })
  } finally {
    page.off('console', consoleHandler)
    page.off('pageerror', pageErrorHandler)
  }
}

const summary = {
  timestamp: new Date().toISOString(),
  total: results.length,
  blankRoutes: results.filter((x) => x.isBlank).map((x) => x.route),
  overlapRoutes: results.filter((x) => x.overlap).map((x) => x.route),
  overflowRoutes: results.filter((x) => x.horizontalOverflow > 16).map((x) => ({
    route: x.route,
    overflow: x.horizontalOverflow,
  })),
  addFailedRoutes: results
    .filter((x) => x.hasAddButton && x.addInteractive === false)
    .map((x) => ({ route: x.route, button: x.addButtonLabel })),
  routesWithErrors: results
    .filter((x) => x.consoleErrors.length > 0 || x.pageErrors.length > 0 || x.hasRuntimeErrorBanner)
    .map((x) => ({
      route: x.route,
      consoleErrors: x.consoleErrors.slice(0, 6),
      pageErrors: x.pageErrors.slice(0, 6),
      runtimeOverlay: x.hasRuntimeErrorBanner,
    })),
  results,
}

const reportPath = path.join(outputDir, 'report.json')
fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2))
console.log(reportPath)
console.log(JSON.stringify({
  total: summary.total,
  blank: summary.blankRoutes.length,
  overlap: summary.overlapRoutes.length,
  overflow: summary.overflowRoutes.length,
  addFailed: summary.addFailedRoutes.length,
  errors: summary.routesWithErrors.length,
}, null, 2))

await browser.close()
