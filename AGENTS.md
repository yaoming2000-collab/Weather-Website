# AGENTS.md — weather.itsfunmag.com 重建版

天气站：Cloudflare Workers + Hono JSX 服务端渲染，天气数据来自 Foreca，去年同一天的数据来自 OpenWeather One Call 4.0。
项目背景、当前状态和待办见 `docs/HANDOVER.md`；各项设计的原因见 `README.md`。代码注释和文档用中文，和团队沟通也用中文。

## 命令（都在仓库根目录执行，Node.js 22）

```bash
npm ci                 # 安装依赖
npm run check          # 类型检查 + 全部测试；提交前必须通过
npm run typecheck      # 只做类型检查（src、test、client 三套 tsconfig）
npm test               # 只跑测试（Vitest，模拟数据，不需要网络和密钥）
npm run build:client   # 打包浏览器脚本到 public/static/app.js（dev 和 deploy 会自动执行）
npm run dev            # 本地运行 http://127.0.0.1:8787/（先 cp .dev.vars.example .dev.vars）
```

- 不要执行会改线上环境的命令：`wrangler deploy`、`npm run deploy`、`wrangler secret …`、`wrangler login`、
  `wrangler kv namespace create`、`wrangler kv … --remote`、`wrangler d1 create`、`wrangler d1 … --remote`。
  部署由人来做，命令写进 PR 说明里。
- 分支名**不要用 `step-` 开头**（例如用 `codex/…`）：推送 `step-*` 分支在配置了 Cloudflare 密钥后会自动部署测试环境。
- 测试都是离线的。需要真实数据的问题，请在 PR 说明里写明，交给人来验证。

## 目录结构

```
src/index.ts            Worker 入口：fetch + 定时任务（每 10 分钟取回去年数据；每天清理）
src/app.tsx             路由、页面缓存（整页 CDN 缓存）、首页跳转、接口 /api/*
src/env.ts              环境变量和绑定的类型（WEATHER_KV、DB、SEARCH_LIMITER、FORECA_TOKEN、OWM_KEY…）
src/weather/            天气数据：service.ts（缓存、并发合并、出错兜底、去年数据、待取队列处理）、
                        foreca/（Foreca 客户端）、history.ts（OpenWeather 历史）、historyQueue.ts（KV 队列）、
                        wikidata.ts（城市名、县区搜索）、mock.ts（模拟数据）、icons.ts（天气代码 → 图标）
src/features/           往年对比（climate.ts）、生活指数、降雨时间轴、D1 存储（store.ts）、调用统计（usage.ts）
src/cache/store.ts      两层缓存：Cache API（本机房）+ KV（全球）
src/config/             可调参数：thresholds.ts（缓存时长、页面缓存、非必需数据的等待时间）、features.ts（分级、猜一猜、排行榜）、渠道、单位
                        （OpenWeather 超时在 src/weather/history.ts，定时任务的批量和并发在 src/weather/service.ts HISTORY_DRAIN，运行时长在 src/index.ts）
src/pages/              页面 JSX；styles.ts 是全站 CSS（模板字符串，内联进页面）；glyphs.tsx 是 SVG 图标
src/i18n/locales/*.json 28 种语言文案（en.json 是基准）
client/                 浏览器脚本（原生 TS，无框架）；client/lib/ 是可单测的纯函数
public/                 静态文件（图标、法律页面、sw.js、ads.txt）；public/static/ 是打包产物，不提交
migrations/             D1 建表和改表，按编号执行，已发布的文件不要改，只新增
test/                   Vitest 测试
```

## 必须遵守的规则

### 缓存和页面
- **城市页 HTML 会被整页缓存，所有访客共用一份**（按部署版本区分，渠道写成占位符 `__ch__`）。
  - 服务端渲染里不能出现因人而异的内容，比如收藏、猜过的答案、单位、上次的城市、语言 Cookie 的结果等。
  - 这些都在浏览器里处理：用 localStorage、Cookie、`data-*` 属性和 `#page-data` JSON。
- **页面不能跳动（CLS = 0）**：
  - 首次绘制前就要确定的显示，用紧跟元素的小段内联脚本完成，参考 `GUESS_TAG_SCRIPT`（src/pages/home.tsx）、`STREAK_PRE_SCRIPT()`（src/pages/climate.tsx）、`EARLY_UNITS_SCRIPT`（src/config/units.ts）。
  - 不要等 `client/main.ts` 加载后再插入会改变高度的内容。
- **缺数据时**：区块照常显示、数值用 `--`（`DASH`），不隐藏、不显示 0。临时缺数据要推进 `bundle.missing`，页面只缓存 60 秒。
- 点按区域至少 44px；改界面后要在 360px 和 375px 宽、长城市名、阿拉伯语（从右到左）下检查。

### 天气数据和计费
- Foreca 和 OpenWeather 都**按次计费**：
  - 新的数据请求必须走 `WeatherService.cached()`，或者经过队列。
  - 不要在页面路径上直接调用供应商。
- OpenWeather 4.0 一次要 40 多秒，**页面永远不等它**：只读缓存，缺的进 KV 队列，由定时任务（`drainHistoryQueue`）去取。
- 非必需数据最多等 `OPTIONAL_DATA_BUDGET_MS`（3 秒），超时先出页面。

### 猜一猜：不能泄漏答案
- 今天的答案 = 今天预报最高温 vs 去年同一天实际最高温。
- 猜之前任何可见的地方都不能显示：
  - 去年今天或以后日子的温度；
  - 今天或以后日子的"冷暖"结论。
- 往年对比页的图和降雨只用**过去 7 天**。排行榜用**昨天**。明天、后天页不放猜一猜。
- 每天的答案在 D1 `daily_comparisons` 里定下来（`freezeComparison`），之后都按它判断。不要绕开它。

### 多语言
- 新增或修改文案时，**28 个 locale 文件要同时改**，占位符（`{n}`、`{city}`…）要一致。`test/i18n.test.ts` 会检查。
- 浏览器脚本要用的文案，要加进 `src/pages/components.tsx` 的 `clientStrings`。
- 不要硬编码中文或英文的界面文字。

### 配置和密钥
- **密钥只能通过 `wrangler secret put` 设置**，比如 `FORECA_TOKEN`、`OWM_KEY`。
  - 不能写进代码、wrangler.toml、测试、文档或提交信息。
  - 日志里不要打印密钥和带密钥的网址。
- `wrangler.toml` 里 D1 的绑定名必须是 `DB`。KV、D1 的 id 不是密钥，可以提交。
- 测试环境是 `[env.preview]`（Worker `weather-itsfunmag-preview`）。绑定不会从顶层继承，要在 env 里单独写。

### 代码风格
- TypeScript 严格模式。小函数配中文注释，注释写"为什么"和业务规则，必要时注明日期和是谁定的（例如"Darren 2026-10-29"）。
- 纯计算放在 `src/features/`、`client/lib/`，方便单测；改了行为要补测试。
- 不引入新的前端框架或 CSS 框架。新增依赖前先在 PR 里说明理由。

## 不要碰

- 旧仓库 `umetech/weather-v3`（只读参考）。
- `migrations/` 里已经存在的文件（只新增）。
- `public/ads.txt`、广告位占位的 `data-slot` 名字（广告由 Darren 自己接入，改名会影响他的配置）。

## PR 约定

- 每项工作一个分支、一个 PR，合并用 "Create a merge commit"，分支保留。
- PR 说明用中文，写清楚三件事：
  - 改了什么、为什么；
  - 怎么测的（测试项数、在哪些屏幕宽度和语言下检查过）；
  - 部署命令。有新 migration 时要写 `npx wrangler d1 migrations apply weather-features --remote`。
- 涉及界面的改动附截图（手机宽度）。
