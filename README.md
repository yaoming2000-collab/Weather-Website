# weather.itsfunmag.com（重建版）

天气站重建项目。运行在 Cloudflare Workers 上，天气数据来自 Foreca。
需求文档：<https://claude.ai/artifact/MBdsveGySxK9XyHFmtnEbK>

## 进度

| 步骤 | 内容 | 状态 |
| --- | --- | --- |
| 1 | 骨架：渠道和语言路由、旧网址兼容、天气数据模块、两层缓存、页面缓存、时区逻辑、自动化测试 | ✅ PR #1 |
| 2 | 首页和子页（逐小时、15 天、空气质量）的正式界面、°C/°F 换算、我的城市（含旧数据迁移）、城市搜索 | ✅ PR #2 |
| 3a | 往年对比、猜一猜计数、排行榜、降雨时间轴、生活指数的**计算规则和接口**（不含界面） | ✅ PR #3 |
| 3b | 新视觉（随时间和天气变化的天空）、明天/后天/7 天页、往年对比页（猜一猜、分享卡片）、排行榜、生活指数页、"预报准吗" | ✅ PR #4 |
| — | 缓存和数据获取修正、调用统计 | ✅ PR #5、#6 |
| 4 | 28 种语言文案（去掉希伯来语，新增保加利亚语、罗马尼亚语）、城市名本地化、阿拉伯语排版、温度和风速单位分开设置、定位失败时用所在国首都 | ✅ PR #7 |
| 4b | 手机端细节：缺数据显示 "--" 不隐藏区块、出错重试和离线兜底、Core Web Vitals、点按区域 ≥ 44px | ✅ PR #8 |
| 4c | 往年对比改为和去年同一天比（OpenWeather）、连续猜对天数、设置页（语言、单位）、县区名搜索、首页不提前揭晓答案、iPhone 逐小时滑动 | ✅ 本分支 |
| 5 | 广告：Darren 自己接入代码，新站只保留广告位占位（`data-slot`） | — |
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
| `/{渠道}/{语言}/w/{城市ID}/tomorrow`、`/day-after`、`/week` | 明天、后天、7 天总览 |
| `/{渠道}/{语言}/w/{城市ID}/climate` | 今天和去年同一天比（猜一猜、连续猜对天数、温度计图、15 天对比、降水对比、分享卡片） |
| `/{渠道}/{语言}/settings` | 设置：语言、温度单位、风速单位 |
| `/{渠道}/{语言}/w/{城市ID}/life/{running\|laundry\|carwash\|clothing\|sunscreen}` | 生活指数详情 |
| `/{渠道}/{语言}/ranking` | 今天全球最反常的城市 |
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
    sky.ts              背景天空：按城市当地时间（黎明、白天、金光、黄昏、夜晚）和天气选择天色，太阳按真实时间走弧线
    styles.ts           全部样式（内联）；改颜色、圆角、字号都在这里
    glyphs.tsx          界面小图标（线条 SVG）
    home.tsx day.tsx climate.tsx life.tsx subpages.tsx  各页面
  config/features.ts    第 3 步功能的可调规则：往年对比分级、猜一猜、排行榜、降雨时间轴、生活指数阈值
  features/
    climate.ts          今天比去年同一天热还是冷：偏差、分级、用词、15 天对比、降水对比、首页标签
    nowcast.ts          降雨时间轴的结论（有雷达精确到分钟，无雷达只说小时）
    life.ts             生活指数：跑步、晾衣、洗车、穿衣、防晒
    store.ts            猜一猜计数和排行榜存储（D1；没有 D1 时用内存）
    index.ts            从城市数据算出页面需要的全部功能数据
migrations/             D1 建表语句
client/                 浏览器脚本（Vite 打包为 public/static/app.js，约 15 KB）：单位换算、"现在"、我的城市、猜一猜、预报准吗、分享卡片
public/                 静态文件：图标、法律页面、ads.txt、robots.txt
test/                   自动化测试
```

## 多语言和单位（第 4 步）

- **语言**：28 种，文案在 `src/i18n/locales/`。希伯来语已去掉，旧的 `/he/`、`/iw/` 网址 301 跳到英文；新增保加利亚语（bg）、罗马尼亚语（ro）；白俄罗斯语浏览器显示俄语。
- **城市名**：Foreca 支持的 15 种语言（含巴西葡语、拉美西语）向 Foreca 要本地名字，缓存 30 天；
  日语、阿拉伯语、印地语、印尼语、越南语、丹麦语、挪威语、希腊语、乌克兰语、保加利亚语、罗马尼亚语从 Wikidata 查（Foreca 城市 ID = 100000000 + GeoNames ID），
  国家名用 `Intl.DisplayNames` 翻译，缓存 90 天。查询最多等 1.5 秒，没查到先显示英文。排行榜数据库里存英文名，显示时再换。
- **单位**：温度 °C/°F、风速 km/h、m/s、mph 分开设置（点右上角 °C/°F 按钮）。默认按浏览器语言的地区：
  美国 °F + mph，英国 °C + mph，北欧、俄罗斯、乌克兰、日本、韩国等 m/s，其他 km/h。降水和能见度跟随温度：°F 用英寸、英里。
- **定位失败**：访客所在国家的首都（`src/config/capitals.ts`），其次按浏览器语言推断，最后伦敦。

## 缓存设计

- **天气数据**：按城市缓存，与语言、单位无关。两层：Cloudflare Cache API（每个机房各一份）+ Workers KV（全球一份）。
  - 本机房只存"还新鲜"的数据，过期就落到 KV：其他机房刚取过的新数据直接用，不再请求 Foreca。6 小时的旧数据兜底只放在 KV。
  - 错开刷新：各机房的数据同时过期，过期后每个机房按机房代码再等一小段（最多新鲜期的 1/4、不超过 5 分钟）才去 Foreca 取，
    期间先看 KV 里有没有别的机房刚取的。热门城市因此大多只请求一次；只有一个机房的城市不会多请求。
  - 取不到的数据也记下来：城市不存在 1 天（全球）；密钥或套餐问题 15 分钟、限流和超时 2 分钟（没有旧数据时 20 秒），只记本机房，期间照常用旧数据。
  - 缓存时长、每次取多少个时间点、时限见 `src/config/thresholds.ts`。
- **页面**：整页按网址缓存 5 分钟，**不分渠道**（生成时渠道写成占位符，返回前换成访客的渠道）。
  过期后 30 分钟内先返回旧页面、后台重新生成，同一页面同一时间只重做一次。
  有数据因临时原因没取到时只缓存 1 分钟。`session`、`uid` 不进缓存 key，由浏览器脚本补到链接上。
- **浏览器**：页面开着超过 20 分钟时，重新取一次本页，把实况、逐小时、7 天、空气质量、指标和背景整块换新（广告位不动）。
- **和时间有关的显示**（"今天"、"现在"、"X 分钟前"）在浏览器里按城市时区计算，不写死在缓存的页面里。

## Foreca 调用统计

线上（有 D1 时）按 UTC 日期记录每类接口的调用次数（成功才计费）和有调用的不同城市数。查询：

```bash
# 最近 31 天每天的计费调用次数
npx wrangler d1 execute weather-features --remote --command "SELECT date, SUM(calls) AS calls FROM usage_daily WHERE ok = 1 GROUP BY date ORDER BY date DESC LIMIT 31"
# 按接口拆分（某一天）
npx wrangler d1 execute weather-features --remote --command "SELECT kind, ok, calls FROM usage_daily WHERE date = '2026-11-01' ORDER BY calls DESC"
# 每天有多少个不同城市
npx wrangler d1 execute weather-features --remote --command "SELECT date, COUNT(*) AS cities FROM usage_cities GROUP BY date ORDER BY date DESC LIMIT 31"
```

月费估算：把最近 7 天的日均计费调用 × 30，超过 1,000 万的部分每千次 0.09 €。
测试环境没有 D1，不统计。

## 部署（第 6 步会补充完整说明）

```bash
npx wrangler kv namespace create WEATHER_KV                     # 把输出的 id 填进 wrangler.toml
npx wrangler d1 create weather-features                         # 把输出的 database_id 填进 wrangler.toml
npx wrangler d1 migrations apply weather-features --remote      # 建表（migrations/ 下的全部文件，含 0002–0004）
npx wrangler secret put FORECA_TOKEN
npx wrangler secret put OWM_KEY        # OpenWeather One Call API（去年同一天的天气）
npx wrangler deploy
```

测试环境（`--env preview`）需要一个 KV（去年数据由定时任务存进 KV），不需要 D1，见 `docs/deploy-preview.md`。

## 第 3 步的存储为什么用 D1

- **猜一猜计数**：投票是"读出来加一再写回去"。KV 在多人同时投票时会丢票，同一个键每秒也只能写一次；
  D1（Cloudflare 的 SQLite 数据库）一条 SQL 就能原子地加一。数据保留 7 天，每天的定时任务清理。
- **排行榜**：每次生成城市页面时顺便记录这个城市今天的偏差（同一城市每小时最多写一次），
  排行榜只取城市当地"今天"还没结束的记录（最近 24 小时内写入），结果缓存 1 小时。不额外调用 Foreca。
- 用量：每个城市每小时最多写一次排行榜，每次投票写一次。Workers 付费套餐（每月 5 美元）含每月 5,000 万行写入，这点用量可以忽略。

## 待核实（Foreca 试用期内）

- 缓存时长是否符合 Foreca 条款；带广告的网站是否属于允许的商业用途
- 地点接口返回的英文国家名写法，用于判断雷达覆盖（`src/config/radar.ts`）
- 日预报 `dataset=full` 是否包含日出日落等字段

## 和去年同一天比（2026-10-28 起）

- 比的是"今天的预报最高温"和"去年同一天的实际最高温"。去年数据来自 OpenWeather One Call API 4.0 的逐日时间线
  （`src/weather/history.ts`），一次取 10 天，按 10 天一块永久缓存，同一城市大约每 10 天才请求一次；不再请求 Foreca 的 30 年平均。
- 没配置 `OWM_KEY` 时不报错，"和去年比"显示 "--"。
- 每个城市每天第一次算出的结果存进 D1 的 `daily_comparisons`（迁移 0004），之后所有人都按它判断猜对没有，答案不会中途变。
- 首页标签猜之前只显示"猜一猜"，猜过后显示结果；往年对比页的 15 天对比图里"今天"的点猜完才显示。
- 连续猜对天数存在浏览器（`client/lib/streak.ts`），按城市算：猜错或漏一天断，没出题的日子不算断。
- OpenWeather 的调用也记在调用统计里（kind 为 `owm-ly`）。
- **定时预取（2026-10-29）**：OpenWeather 4.0 一次要 40 多秒，页面等不起（`waitUntil` 约 30 秒就被取消，数据永远存不进缓存）。
  页面只读缓存，缺的 10 天块放进 KV 队列（`src/weather/historyQueue.ts`，键 `q:ly:<城市>:<日期>`），
  每 10 分钟的定时任务取回（同时 4 个请求、单次最多 90 秒、开始 8 分钟后不再开始新的）。
  某块试 6 次还取不到：12 小时内不再排队，页面显示"没有数据"、不出题；密钥或额度出问题（401/403/429）：这一轮停下，任务留着下次再取。
  等待期间往年对比页显示"正在准备"，今天不出题、连续猜对不算断。新城市第一次打开后大约 10 分钟内就有数据；
  15 天窗口总是跨两块，下一块会提前 5 天以上排队，老城市不会再遇到等待。没有 KV 时（本地开发）页面直接请求。

## 首页去哪个城市（2026-10-29）

1. 链接里带了坐标（锁屏、旧链接 `?lat=&lon=`）：按坐标
2. 上次看的城市：浏览器在城市页写 Cookie `wcity`（一年），首页直接去这个城市
3. 按 IP 定位

"我的城市"页最上面有"当前位置"（`/{渠道}/?here=1`），按 IP 定位、不用上次看的城市；左上角返回到进来之前的城市页。

## 缺数据和出错时的表现

原则（Darren 2026-10-28）：区块一律保留，没有的数值显示 `--`（不显示 0），页面高度不因数据有无而变化。

| 情况 | 页面表现 |
| --- | --- |
| 逐小时 / 每日预报没取到 | 用占位数据（`src/pages/placeholders.ts`）：图标位留空，数值 `--`；页面只缓存 60 秒 |
| 降雨时间轴 | 一直显示：没去请求时"未来 2 小时无雨"，取不到时"暂无数据" |
| 去年数据 | 首页标签显示"今天 vs 去年 --"；往年对比页区分"暂时取不到，请稍后再试"和"没有去年同一天的数据"，图表和降雨对比保留位置 |
| 当前天气取不到（整页 503） | 出错页：重试按钮，10 秒后自动重试一次；回首页保留渠道、语言、session |
| 数据是旧的（接口故障时用了 6 小时内的旧数据） | "N 小时前更新"，超过 1 小时显示黄色 |
| 断网 / 服务器 5xx | Service Worker（`public/sw.js`）显示该城市上次看过的页面，底部提示"当前没有网络" |
| 浏览器不能保存设置（隐私模式等） | 收藏或改单位时提示一次 |

**Service Worker 紧急关闭**：把 `client/main.ts` 里的 `SERVICE_WORKER_ENABLED` 改成 `false` 再部署，
已经安装的会在用户下次打开页面时注销。副本只在 12 小时内有效，超过就不用。

## 天气图标

`public/img/weather/*.png` 是原图（320 像素）。页面用 128、256 像素的 WebP（`srcset`，浏览器按屏幕密度选）。
原图有改动时运行 `python3 scripts/icons-webp.py` 重新生成（需要 Pillow）。

## 广告位

广告代码由 Darren 接入。每个广告位是一个带 `data-slot` 的占位元素（`src/pages/components.tsx` 的 `AdSlot`），
已预留高度，广告加载前后页面不会跳动。页面数据里有 `channel`，可按渠道选择广告单元。

| 页面 | 广告位 |
| --- | --- |
| 城市主页 | `home_1`（逐小时之后）、`home_2`（生活指数之后）、`home_3`（详情卡片之后） |
| 明天、后天 | `day_1`、`day_2` |
| 7 天 | `week_1`、`week_2` |
| 往年对比 | `climate_1`（揭晓结果正下方）、`climate_2`（15 天对比图之后） |
| 排行榜 | `ranking_1`（两个榜单之间）、`ranking_w_1`、`ranking_c_1`（每 5 条之后） |
| 生活指数 | `life_1`、`life_2` |
| 逐小时、15 天、空气质量 | `sub_1`、`sub_2` |
| 我的城市 | `cities_1` |

## 统计事件

- `forecast_feedback`（预报准吗）：参数 `city_id`、`value`（`up` / `down`）
- `climate_share`（往年对比分享）：参数 `city_id`、`method`（`shared` / `downloaded`）

- `web_vitals`（Core Web Vitals 真实用户数据，`client/vitals.ts`）：参数 `metric_name`（LCP / INP / CLS / FCP / TTFB）、
  `metric_value`（毫秒；CLS 乘以 1000）、`metric_rating`（good / needs-improvement / poor）、`page_type`

页面上有 `gtag` 时直接发送；没有时写入 `window.dataLayer`。
GA4 里要按指标看分布，需要在"自定义定义"里把 `metric_name`、`metric_rating`、`page_type` 注册为维度，`metric_value` 注册为指标。
