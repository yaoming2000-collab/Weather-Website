# weather.itsfunmag.com（重建版）

天气站重建项目。运行在 Cloudflare Workers 上，天气数据来自 Foreca。
需求文档：<https://claude.ai/artifact/MBdsveGySxK9XyHFmtnEbK>

## 进度

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| 1 | 骨架：渠道和语言路由、旧网址兼容、天气数据模块、两层缓存、页面缓存、时区逻辑、自动化测试 | ✅ PR #1 |
| 2 | 首页和子页（逐小时、15 天、空气质量）的正式界面、°C/°F 换算、我的城市（含旧数据迁移）、城市搜索 | ✅ PR #2 |
| 3a | 往年对比、猜一猜计数、排行榜、降雨时间轴、生活指数的**计算规则和接口**（不含界面） | ✅ 本分支 |
| 3b | 上述功能的界面、"预报准吗"投票（等 UI 意见定稿后做） | 待开始 |
| 4 | 27 种语言文案、城市名对照表、阿拉伯语和希伯来语排版 | 待开始 |
| 5 | 广告瀑布流迁移、广告位、性能优化 | 待开始 |
| 6 | 部署说明、验收 | 待开始 |

## 本地运行

需要 Node.js 22。

```bash
npm install
cp .dev.vars.example .dev.vars   # 默认使用模拟数据，不需要 Foreca 密钥
npm run dev                      # 自动打包浏览器脚本，打开 http://127.0.0.1:8787/
npm test                         # 自动化测试
npm run typecheck                # 类型检查
```

用真实数据：在 `.dev.vars` 里设置 `WEATHER_PROVIDER=foreca` 和 `FORECA_TOKEN=你的密钥`。

## 网址

| 网址 | 说明 |
| --- | --- |
| `/`、`/{渠道}/` | 按访客位置跳转到最近的城市 |
| `/{渠道}/{语言}/w/{城市ID}` | 城市天气页（城市 ID 为 Foreca 地点 ID） |
| `/{渠道}/{语言}/w/geo/{纬度},{经度}` | 自有产品按坐标跳转 |
| `/{渠道}/{语言}/w/{城市ID}/hourly`、`/15day`、`/air` | 逐小时、15 天、空气质量子页 |
| `/{渠道}/{语言}/cities` | 我的城市和城市搜索 |
| `/api/w/{城市ID}/now` | 当前天气 JSON，前端补刷新用 |
| `/api/search?q=&lang=`、`/api/near?lat=&lon=`、`/api/cities?ids=` | 城市搜索、按坐标找城市、我的城市卡片 |
| `GET /api/w/{城市ID}/guess?date=`、`POST /api/w/{城市ID}/guess` | 猜一猜：读取计数 / 投票（body：`{"date":"YYYY-MM-DD","choice":"colder\|same\|warmer"}`） |
| `/api/ranking` | 今天全球最反常的城市（暖、冷各前 10） |

渠道：`wmi`（默认）、`mi`、`wme`、`wchyin`、`wxiaomi`、`wsearch-mi`。语言：27 种，见 `src/i18n/languages.ts`。

旧网址（`/?city=&lat=&lon=`、`/{渠道}/city/{id}`、`/{渠道}/cities`、`/en/*.html` 法律页面）全部兼容。
站内跳转始终保留 `session`、`uid`、`locale` 参数。

## 代码结构

```
src/
  app.tsx               路由、页面缓存
  config/               渠道、阈值和缓存时长、雷达国家
  i18n/languages.ts     27 种语言及判断规则（移植自旧站）
  routing/urls.ts       网址生成、统计参数保留
  geo/visitor.ts        访客位置（Cloudflare request.cf）
  time/cityTime.ts      城市时区计算（星期、日期、当地时间）
  weather/
    provider.ts         天气供应商接口 —— 换供应商只需实现这个接口
    foreca/             Foreca 客户端和数据转换
    mock.ts             模拟数据（开发、预览）
    icons.ts            天气代码 → 我们的图标（需求文档的映射表）
    service.ts          天气数据模块：缓存、合并并发请求、出错时用旧数据
  cache/store.ts        缓存（Cache API + KV 两层）
  i18n/t.ts, locales/   界面文案（27 种语言沿用旧站翻译；新增文案先写英文，第 4 步补齐）
  weather/derive.ts     等级、描述、颜色（AQI、紫外线、湿度等）
  pages/                页面（服务器生成 HTML）
  config/features.ts    第 3 步功能的可调规则：往年对比分级、猜一猜、排行榜、降雨时间轴、生活指数阈值
  features/
    climate.ts          今天比往年热还是冷：偏差、分级、用词、15 天对比、降水对比、首页标签
    nowcast.ts          降雨时间轴的结论（有雷达精确到分钟，无雷达只说小时）
    life.ts             生活指数：跑步、晾衣、洗车、穿衣、防晒
    store.ts            猜一猜计数和排行榜存储（D1；没有 D1 时用内存）
    index.ts            从城市数据算出页面需要的全部功能数据
migrations/             D1 建表语句
client/                 浏览器脚本（Vite 打包为 public/static/app.js，约 9 KB）
public/                 静态文件：图标、法律页面、ads.txt、robots.txt
test/                   自动化测试
```

## 缓存设计

- **天气数据**：按城市缓存，与语言、单位无关。两层：Cloudflare Cache API（每个机房）+ Workers KV（全球一份）。
  只用第一层的话，同一城市的访客分布在多个机房时会重复请求 Foreca。缓存时长见 `src/config/thresholds.ts`。
- **页面**：整页按网址（不含查询参数）缓存 5 分钟，过期后先返回旧页面、后台重新生成。
  `session`、`uid` 因人而异，不进缓存 key；页面里的站内链接由浏览器脚本补上这些参数。
- **和时间有关的显示**（"今天"、"现在"、"X 分钟前"）在浏览器里按城市时区计算，不写死在缓存的页面里。

## 部署（第 6 步会补充完整说明）

```bash
npx wrangler kv namespace create WEATHER_KV                     # 把输出的 id 填进 wrangler.toml
npx wrangler d1 create weather-features                         # 把输出的 database_id 填进 wrangler.toml
npx wrangler d1 migrations apply weather-features --remote      # 建表
npx wrangler secret put FORECA_TOKEN
npx wrangler deploy
```

测试环境（`--env preview`）不需要 KV 和 D1，见 `docs/deploy-preview.md`。

## 第 3 步的存储为什么用 D1

- **猜一猜计数**：投票是"读出来加一再写回去"。KV 在多人同时投票时会丢票，同一个键每秒也只能写一次；
  D1（Cloudflare 的 SQLite 数据库）一条 SQL 就能原子地加一。数据保留 7 天，每天的定时任务清理。
- **排行榜**：每次生成城市页面时顺便记录这个城市今天的偏差（同一城市每小时最多写一次），
  排行榜从这张表里取最近 24 小时的数据，结果缓存 1 小时。不额外调用 Foreca。
- 用量：每个城市每小时最多写一次排行榜，每次投票写一次。Workers 付费套餐（每月 5 美元）含每月 5,000 万行写入，这点用量可以忽略。

## 待核实（Foreca 试用期内）

- 缓存时长是否符合 Foreca 条款；带广告的网站是否属于允许的商业用途
- 地点接口返回的英文国家名写法，用于判断雷达覆盖（`src/config/radar.ts`）
- 日预报 `dataset=full` 是否包含日出日落等字段
