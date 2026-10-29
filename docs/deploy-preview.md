# 测试环境部署说明

测试环境：https://weather-next.itsfunmag.com（Cloudflare Worker `weather-itsfunmag-preview`），使用真实 Foreca 和 OpenWeather 数据，不影响线上的 weather.itsfunmag.com。
整体情况、正式环境和待办见 [`HANDOVER.md`](HANDOVER.md)。

## 已经配好的（不用再做）

- KV（`WEATHER_KV`）、定时任务、搜索频率限制、日志（observability）、域名 weather-next.itsfunmag.com 都已写在仓库的 `wrangler.toml` 里。
- 密钥 `FORECA_TOKEN`、`OWM_KEY` 已在测试环境设置。
  - 要换密钥时：`npx wrangler secret put FORECA_TOKEN --env preview`、`npx wrangler secret put OWM_KEY --env preview`。
- **不要再执行 `wrangler kv namespace create` 或 `wrangler d1 create`**（除非按 HANDOVER 第 6 节给测试环境单独建 KV）。

## 需要准备

| 项目 | 说明 |
| --- | --- |
| Cloudflare 账号 | itsfunmag 账号（已开通 Workers Paid） |
| Node.js 22 | `node -v` 显示 v22 开头 |
| Git | 能拉取 GitHub 仓库 `yaoming2000-collab/Weather-Website` |

第一次用这台电脑部署时，先执行一次 `npx wrangler login`，在浏览器里点 **Allow**。

## 每次部署

```bash
git checkout wrangler.toml    # 本地改过 wrangler.toml 的话先放弃（配置以仓库为准）
git checkout main             # 或者要测试的分支
git pull
npm ci
npx wrangler deploy --env preview
```

- **一定要带 `--env preview`**。不带的话会部署到正式 Worker `weather-itsfunmag`（顶层配置已经是真实的 KV 和 D1，不会报错）。
- 部署输出里应看到 `Uploaded weather-itsfunmag-preview`、`env.WEATHER_KV (a0300b…)`、`schedule: */10 * * * *`。
- 部署时会提示 `"d1_databases" exists at the top level, but not on "env.preview"`，可以忽略：测试环境故意不绑数据库。

## 部署后检查

用手机打开 https://weather-next.itsfunmag.com/wmi/ ：

- [ ] 跳转到上次看的城市（第一次按 IP 定位），显示真实天气
- [ ] 顶部：城市名 + 右边三个按钮，地区紧贴在城市名下面
- [ ] 首页胶囊"还记得去年今天的天气吗？猜一猜"；新城市第一次打开后约 10 分钟才出题
- [ ] 往年对比页：猜一猜、猜之前的连续天数、过去 7 天的图和降雨对比
- [ ] 明天、后天页没有猜一猜；日期胶囊点哪个显示哪个
- [ ] 我的城市：顶部"当前位置"；搜索 `ist` 能搜到伊斯坦布尔；搜"惠东"能找到惠东县
- [ ] 设置页能换语言、温度和风速单位
- [ ] 地址里的 `/zh/` 改成 `/ar/`，页面变成阿拉伯语、从右到左排列

## 看日志

Cloudflare 控制台 → Workers & Pages → `weather-itsfunmag-preview` → **Observability**。

- 定时任务有事可做时会记 `[history] prefetch {"fetched":…}`。
- 在中国大陆网络下 `wrangler tail` 连不上，请用控制台查看。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 输出里是 `Uploaded weather-itsfunmag`（没有 -preview） | 漏了 `--env preview`，加上重新部署；正式 Worker 目前没有域名，不影响线上 |
| `git pull` 提示本地 `wrangler.toml` 有改动 | 先 `git checkout wrangler.toml` 再 `git pull` |
| "和去年比"一直显示"正在准备" | 等过一个整 10 分钟；还不行就在 Observability 里搜 `[history]`，把内容发给后端 |
| 打开网址显示"天气暂时不可用" | 看 Observability 里的错误，常见原因是 `FORECA_TOKEN` 过期 |

## 删除测试环境

Cloudflare 控制台 → Workers & Pages → `weather-itsfunmag-preview` → Settings → Delete。
