# 交接文档：weather.itsfunmag.com 重建版

> 写于 2026-10-29，交给接手的前端、后端工程师。
> 产品负责人：Darren。之前的开发方式：Darren 提需求和验收，Claude 写代码、开 PR，开发同事负责部署。
> 这份文档讲"现在是什么状态、为什么这样做、接下来做什么"。业务规则以代码为准，`README.md` 里有各项设计的详细说明；**部署和配置以本文为准**。
> 给 Codex 的工作说明在仓库根目录的 `AGENTS.md`。

---

## 1. 一句话概括

旧站（Go + Vite，服务器 34.143.194.131）重写成 **Cloudflare Workers + Hono 服务端渲染**的新站，天气数据从 OpenWeather 换成 **Foreca**，
增加了"今天比去年同一天热还是冷"的猜一猜玩法、生活指数、降雨时间轴等，目标是提高停留和广告表现。
新站已在测试环境运行，**还没有接管正式域名**。

| | 地址 | Cloudflare Worker | 状态 |
| --- | --- | --- | --- |
| 测试环境 | https://weather-next.itsfunmag.com | `weather-itsfunmag-preview`（`--env preview`） | 运行中，真实 Foreca + OpenWeather 数据 |
| 正式环境 | 计划先用 weather-new.itsfunmag.com，最后接管 weather.itsfunmag.com | `weather-itsfunmag` | 只部署过一次 workers.dev 地址，**配置未完成**（见第 6 节） |
| 旧站 | https://weather.itsfunmag.com | —（旧服务器） | 照常运行；切换后保留 4 周用于回滚 |

- 代码仓库：https://github.com/yaoming2000-collab/Weather-Website（`main` 是最新的已验收代码）
- 旧代码（只读参考，不要改）：`umetech/weather-v3`
- 需求文档：https://claude.ai/artifact/MBdsveGySxK9XyHFmtnEbK
- 正式环境部署方案（早期版本，部分已过时，以本文为准）：https://claude.ai/artifact/QtKxNsS3vxjxZ98QPnLjfD

---

## 2. 技术栈和本地开发

- **运行环境**：Cloudflare Workers（账号 itsfunmag，**已开通 Workers Paid**）；域名 itsfunmag.com 是 Cloudflare Business 套餐
- **服务端**：TypeScript + [Hono](https://hono.dev) JSX，服务端直接生成 HTML（没有 React、没有前端框架）
- **浏览器脚本**：`client/`，原生 TypeScript，Vite 打包成 `public/static/app.js`（约 33 KB，gzip 12 KB）
- **存储**：Workers KV（天气数据缓存、待取队列）、D1（猜一猜计数、排行榜、调用统计、每天定下的答案）、Cache API（各机房页面和数据缓存）
- **测试**：Vitest（约 300 项），不需要网络和密钥（用模拟数据）
- **Node.js 22**（`.nvmrc`）

```bash
npm ci
cp .dev.vars.example .dev.vars    # 默认模拟数据，不需要任何密钥
npm run dev                       # http://127.0.0.1:8787/
npm run check                     # 类型检查 + 测试（提交前必须通过）
```

本地用真实数据：`.dev.vars` 里设 `WEATHER_PROVIDER=foreca`、`FORECA_TOKEN=…`、`OWM_KEY=…`（`.dev.vars` 不进仓库）。
去年数据只由定时任务取回，`wrangler dev` 不会自动跑定时任务，本地"和去年比"会一直显示"正在准备"。要手动触发：

```bash
npx wrangler dev --test-scheduled
curl "http://127.0.0.1:8787/__scheduled?cron=*/10+*+*+*+*"    # 等 1 分钟左右（OpenWeather 一次 40 多秒）
```

---

## 3. 分工建议：前端和后端各看哪里

| 前端 | 后端 |
| --- | --- |
| `src/pages/`：各页面 JSX、`styles.ts`（全部 CSS，内联在页面里）、`glyphs.tsx`（SVG 图标）、`sky.ts`（天空背景） | `src/app.tsx`：路由、页面缓存、跳转、接口 |
| `client/`：单位换算、我的城市、猜一猜、连续猜对、分享卡片、Web Vitals、Service Worker 注册 | `src/weather/`：Foreca 客户端、天气数据模块（缓存、并发合并、出错兜底）、OpenWeather 历史、待取队列、Wikidata 城市名 |
| `public/sw.js`（离线兜底）、`public/` 静态文件、图标 | `src/features/`：往年对比、生活指数、降雨时间轴、D1 存储、调用统计 |
| `src/i18n/locales/*.json`（28 种语言文案） | `src/cache/`、`src/index.ts`（定时任务）、`migrations/`、`wrangler.toml` |

交界处：页面上的数据都来自 `CityBundle`（`src/weather/service.ts`）和 `CityFeatures`（`src/features/index.ts`）；
页面和浏览器脚本之间通过 `data-*` 属性和页面里的 `#page-data` JSON 交换信息。

---

## 4. 关键设计（改之前请先了解原因）

详细说明见 `README.md` 对应章节。

1. **整页 CDN 缓存，不按人区分**
   - 城市页 HTML 在每个机房缓存：5 分钟内算新鲜（缺数据时 60 秒），过期后 30 分钟内先给访客旧页面、后台重新生成（`PAGE_STALE_WHILE_REVALIDATE`）。
   - 缓存按部署版本区分，不同渠道共用一份（渠道先写成占位符 `__ch__`，返回前替换）。
   - 所以**服务端渲染的 HTML 里不能有任何因人而异的内容**（已收藏、已猜过、单位、上次的城市……）。这些都由浏览器脚本根据 localStorage / Cookie 处理。
2. **两层数据缓存，尽量少调 Foreca**（按次计费）：本机房 Cache API → 全球 KV；过期后各机房错开刷新；失败时用旧数据；不存在的城市记 1 天。
3. **"和去年同一天比"**（2026-10-28 起，替代 Foreca 的 30 年平均）
   - 比"今天预报最高温"和"去年同一天实际最高温"。差值四舍五入到 0.1°，绝对值**小于** 2° 算"差不多"，正好 2.0° 算更热或更冷（`src/config/features.ts`）。
   - 每个城市每天第一次算出的结果存进 D1（`daily_comparisons`），之后都按它判断猜对没有，答案不会中途变。
4. **去年数据由定时任务预取**
   - OpenWeather One Call 4.0 一次要 46–49 秒，页面等不起，`waitUntil` 约 30 秒就被取消。
   - 所以页面只读缓存，缺的 10 天块放进 KV 队列（键 `q:ly:<Foreca 城市 ID>:<块的第一天 YYYY-MM-DD>`）。
   - 每 10 分钟的定时任务取回：每轮最多 60 块、同时 4 个、单次 90 秒超时、8 分钟后不再开始新的。并发 4 是因为 Workers 同时只能开 6 个连接。
   - 等待期间页面显示"正在准备"、今天不出题、连续猜对不算断。新城市第一次打开后约 10 分钟出题。
5. **不泄漏答案**（2026-10-29）
   - 往年对比页的图和降雨只比**过去 7 天**（今年实际 vs 去年同一天，到昨天）。
   - 明天/后天页不显示去年温度、也不放猜一猜。
   - 排行榜是**昨天**最反常的城市。
   - 首页标签猜之前只显示"还记得去年今天的天气吗？猜一猜"，猜过才显示结果。
6. **手机体验规则**（2026-10-28）
   - 缺数据显示 `--`，区块不隐藏，页面不跳动（CLS = 0）；点按区域 ≥ 44px。
   - 出错重试、离线时用 Service Worker 保存的副本。
   - 需要在首次绘制前完成的显示（单位换算、已猜结果、连续天数、日期胶囊位置）都用页面里的小段内联脚本做，避免跳动。
7. **首页去哪个城市**：链接带坐标（锁屏）> 上次看的城市（Cookie `wcity`）> IP 定位。"我的城市"顶部的"当前位置"用 `?here=1` 跳过上次的城市。
8. **语言**
   - 共 28 种。优先级：设置页选的（Cookie `wlang`）> 锁屏传来的 `locale` > 浏览器语言。
   - 城市名：Foreca 支持的 15 种语言用 Foreca，其他用 Wikidata。
   - 阿拉伯语从右到左排版。
9. **旧网址全部兼容**：`/?city=&lat=&lon=`、`/{渠道}/city/{id}`、`/{渠道}/cities`、`/en/*.html`。统计参数 `session`、`uid`、`locale` 在站内跳转时保留。
10. **广告**：Darren 自己接入广告代码；新站只放广告位占位（`data-slot`，位置见 README"广告位"）。

---

## 5. 环境、配置和密钥

### wrangler.toml（已提交到仓库）

| 绑定 | 正式环境 | 测试环境（`[env.preview]`） |
| --- | --- | --- |
| `WEATHER_KV` | `a0300b21fc444a73a0e6e3a045ee9d32` | **暂时共用同一个**（正式上线前要分开，见第 6 节） |
| `DB`（D1 `weather-features`） | `8db7179d-bdb0-4410-844e-64650952b298` | 不绑（猜一猜、排行榜退回内存，测试够用） |
| `SEARCH_LIMITER` | 每 IP 每 60 秒 30 次 | 同 |
| 定时任务 | `17 3 * * *`（每天清理）、`*/10 * * * *`（取回去年数据） | 同 |
| 日志（observability） | 未开 | 已开 |
| 域名 | 未配置（只有 workers.dev） | weather-next.itsfunmag.com |

> **D1 的绑定名必须是 `DB`**。代码读的是 `env.DB`，名字不对时会静默退回内存存储，不报错。
> 部署测试环境要带 `--env preview`；不带就会部署到正式 Worker。

### 密钥（只能用 `wrangler secret put`，绝不进仓库）

| 名称 | 用途 | 测试环境 | 正式环境 |
| --- | --- | --- | --- |
| `FORECA_TOKEN` | Foreca 天气数据（当前是 Cirrus 试用密钥） | 已设置 | **待设置** |
| `OWM_KEY` | OpenWeather One Call API 4.0（去年数据） | 已设置 | **待设置** |

- **OpenWeather 的 key 已经多次出现在聊天记录和附件里，正式上线后必须重新生成。**
- GitHub Actions（`.github/workflows/deploy-preview.yml`）：
  - 合到 main 的 PR 和推送 `step-*` 分支时跑类型检查和测试。
  - 现在 GitHub 里没有配置 Cloudflare 密钥，所以不会自动部署。
  - **注意**：一旦在 GitHub 仓库里加上 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`，以后每次推送 `step-*` 分支都会自动部署到测试环境。

### 部署命令

```bash
# 测试环境
git checkout main && git pull && npm ci
npx wrangler deploy --env preview          # 输出里应是 weather-itsfunmag-preview

# 正式环境（完成第 6 节的配置之后）
npx wrangler d1 migrations apply weather-features --remote   # 每次有新的 migrations/ 文件时
npx wrangler deploy                         # 输出里应是 weather-itsfunmag
```

- 在中国大陆网络下 `wrangler tail` 连不上（workers.dev 解析被干扰），看日志请用 Cloudflare 控制台的 Observability（目前只有测试环境开了）。
- 定时任务有事可做时会记一行 `[history] prefetch {"fetched":…,"dropped":…,"retried":…,"left":…}`；队列是空的时候不记。
- `docs/deploy-preview.md` 是给开发同事的测试环境部署步骤，以本节为准。

---

## 6. 待办（按优先级）

### A. 正式上线前必须做

1. **测试环境单独建 KV**：`npx wrangler kv namespace create WEATHER_KV --env preview`，把 id 换到 `[[env.preview.kv_namespaces]]`。
   - 现在两个环境共用一个，待取队列也共用，两边的定时任务都会处理它。
2. **正式 D1 执行迁移**：`npx wrangler d1 migrations apply weather-features --remote`（0001–0004；0004 会清空旧排行榜，正式库目前没有真实数据，没关系）。
3. **正式环境设置密钥**：`npx wrangler secret put FORECA_TOKEN`、`npx wrangler secret put OWM_KEY`。
4. **正式环境开启 observability**：在 wrangler.toml 顶层（`[env.preview]` 之前）加两行：
   ```toml
   [observability]
   enabled = true
   ```
5. **重新部署正式 Worker**：之前同事用本地改过的配置部署过一次，D1 绑定名是错的 `weather_features`。
6. **临时域名 weather-new.itsfunmag.com 上验收**：在 wrangler.toml 顶层加
   ```toml
   [[routes]]
   pattern = "weather-new.itsfunmag.com"
   custom_domain = true
   ```
   部署后做真机测试（iPhone、Android、小屏 320px），检查广告位、GA4。
7. **GA4**
   - 代码里没有加载 GA4 的部分。页面上有 `gtag` 时直接发事件，没有时写进 `window.dataLayer`。
   - 要有人把 GA4（gtag.js）或 GTM 的代码加进页面头部。可以和广告代码一起由 Darren 接入，也可以放在 `src/pages/components.tsx` 的 `Layout` 里。
   - 把 `metric_name`、`metric_rating`、`page_type` 注册为自定义维度，`metric_value` 注册为自定义指标。事件说明见 README"统计事件"。
8. **Foreca 正式订阅**，换掉试用密钥。
   - Cirrus：449 €/月，含 1,000 万次，超出每千次 0.09 €，每秒上限 50 次，只计成功的请求。
9. **译文审核**：28 种语言的新文案大多是机器起草的，请母语同事看一遍（重点：猜一猜、往年对比、设置页、胶囊文案）。
10. **其他语言的法律页面**：目前只有英文和阿拉伯文，在 `public/en/`、`public/ar/`。

### B. 切换正式域名

11. Worker 接管 weather.itsfunmag.com：把上面的 `pattern` 换成（或再加一条）`weather.itsfunmag.com`。
    - 用 custom_domain 时，Cloudflare 会要求先去掉现在指向旧服务器的 A 记录，所以要选低峰时段操作。
    - 回滚办法：在 Cloudflare 控制台（Worker → Settings → Domains & Routes）移除 weather.itsfunmag.com，恢复原来的 A 记录，再把 wrangler.toml 里的这条 route 删掉。
12. 旧服务器（A 记录 34.143.194.131）保留 4 周用于回滚。
13. 4 周后停掉 OpenWeather Professional 订阅。旧站靠它取数据，回滚期间不能停。One Call API 4.0 是单独的订阅，要保留。

### C. 上线后

14. **看调用统计算月费**：Foreca 和 OpenWeather 都按次计费，查询方法见 README"Foreca 调用统计"；OpenWeather 的调用记为 kind `owm-ly`。
    - OpenWeather 每天前 1,000 次免费，超出每次 0.0015 美元。按设计，每个活跃城市每天约 1–1.4 次。
    - 定时任务每天大约能处理 5,500 次（约 4,000 个活跃城市；每轮上限 60 块，一天最多 8,640 次）。
    - 超过这个量时，先调大 `HISTORY_DRAIN.limit` 或提高定时任务频率；并发受 6 个连接的限制，基本不能再加。
15. **（可选）上线前预热热门城市的去年数据**，减少用户看到"正在准备"。
16. **（可选）问 OpenWeather**：4.0 为什么一次要 46–49 秒，偶尔还会 504。
17. **（想法，未定）**：猜完后提示"明天再来猜"，提高回访。

### 已知、已接受的问题

- 不存在的城市 ID 在真实 Foreca 下显示"天气暂时不可用"（503），而不是 404。影响小，Darren 同意暂不修。
- 首次打开冷门城市偏慢（要等 Foreca），在合理范围内，不处理。
- 320px 宽的小屏手机上，14 种语言的首页胶囊文案仍放不下，会在胶囊里滚动（兜底设计）。

---

## 7. 工作方式（Darren 的习惯）

- **沟通**：中文。先给明确建议，再说理由；发现需求有问题要直说。
- **改动前**：Darren 说"只分析"时只出方案、不改代码；确认后再改。
- **分支和 PR**：每项工作一个分支、一个 PR。合并时用 **Create a merge commit**，分支保留不删。
  - Darren 自己合并。合并后给开发同事的部署命令要写完整。
- **提交前**：`npm run check` 必须通过；改界面时在手机尺寸下截图确认，宽度 360px 和 375px，长城市名也要看。
- **不要碰**：旧仓库 `umetech/weather-v3`；Darren 现有的 n8n 工作流（和本项目无关，但他特别交代过）。
- **安全**：密钥只用 `wrangler secret put`；文档、提交、日志里不出现密钥。

---

## 8. 文件索引

| 文件 | 内容 |
| --- | --- |
| `AGENTS.md` | 给 Codex 的工作说明（命令、结构、规则、边界） |
| `README.md` | 设计说明（缓存、往年对比、多语言、缺数据表现、广告位、统计事件、调用统计查询） |
| `docs/deploy-preview.md` | 测试环境部署步骤（面向开发同事，和第 5 节一致） |
| `docs/HANDOVER.md` | 本文 |
| `scripts/codex-setup.sh` | Codex 云端环境的初始化脚本 |
| `migrations/` | D1 建表和改表（按编号顺序执行） |
