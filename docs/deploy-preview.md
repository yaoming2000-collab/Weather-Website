# 测试环境部署说明

目的：把新天气站部署到一个测试网址，让大家用手机直接打开、点击、滑动，体验真实的交互效果。
测试环境使用**模拟天气数据**，不需要 Foreca 密钥，不影响线上的 weather.itsfunmag.com。

预计用时：首次 15 分钟左右；之后每次更新 1 分钟。

---

## 需要准备

| 项目 | 说明 |
| --- | --- |
| Cloudflare 账号 | 公司的账号即可。免费套餐就够用。 |
| Node.js 22 | 运行 `node -v` 确认，显示 v22 开头即可。 |
| Git | 能拉取 GitHub 仓库 `yaoming2000-collab/Weather-Website`。 |

---

## 第 1 步：拉取代码

```bash
git clone https://github.com/yaoming2000-collab/Weather-Website.git
cd Weather-Website
git checkout step-2-pages
```

**为什么用 step-2-pages 分支**：开发按步骤分支进行，这个分支包含第 1、2 步的全部内容。以后有新的分支，Claude 会告诉你部署哪一个。

## 第 2 步：安装依赖

```bash
npm install
```

**为什么**：安装 Cloudflare 的部署工具（wrangler）和打包工具。只需要第一次执行，以后 `package.json` 有变化时再执行。

## 第 3 步：登录 Cloudflare

```bash
npx wrangler login
```

浏览器会打开 Cloudflare 的授权页面，点 **Allow** 即可。

**为什么**：部署工具需要以你的账号身份把程序上传到 Cloudflare。

## 第 4 步：部署

```bash
npx wrangler deploy --env preview
```

**为什么加 `--env preview`**：这会部署成一个独立的测试程序（名字是 `weather-itsfunmag-preview`），使用模拟数据。不加这个参数会尝试部署正式版，正式版目前还缺少配置，会失败。

部署完成后，命令行最后会显示测试网址，形如：

```
https://weather-itsfunmag-preview.<你的账号子域名>.workers.dev
```

**第一次使用 Workers 时**，Cloudflare 可能提示你先选一个账号子域名（`xxx.workers.dev` 里的 `xxx`），按提示填写即可。

## 第 5 步：检查

用手机打开测试网址，确认以下几点：

- [ ] 打开后自动跳转到离你最近的城市（模拟数据只有 7 个城市：伦敦、美国 Cheney、伊斯坦布尔、利雅得、河内、上海、莫斯科，会跳到其中最近的一个）
- [ ] 页面顶部有黄色提示条"开发预览 · 模拟数据"
- [ ] 点"逐小时详情""查看 15 天""空气质量"能进入子页，子页左上角能返回
- [ ] 点右上角星标收藏，再点列表图标进入"我的城市"，能看到收藏的城市
- [ ] 在"我的城市"搜索框输入 `is`，能搜到伊斯坦布尔
- [ ] 点右上角 °C 能切换成 °F
- [ ] 把网址里的 `/en/` 改成 `/ar/`，页面变成阿拉伯语、从右到左排列

把测试网址发给 Darren 即可。

---

## 以后怎么更新

Claude 每完成一步会通知你新的分支名，然后执行：

```bash
git fetch
git checkout <新的分支名>
npm install
npx wrangler deploy --env preview
```

测试网址不变，刷新页面就能看到最新版本。

---

## 可选：使用公司域名

如果 itsfunmag.com 托管在 Cloudflare，可以给测试环境配一个好记的地址，例如 `weather-next.itsfunmag.com`：

1. 打开 `wrangler.toml`，找到最后三行，去掉前面的 `#`：
   ```toml
   [[env.preview.routes]]
   pattern = "weather-next.itsfunmag.com"
   custom_domain = true
   ```
2. 再执行一次 `npx wrangler deploy --env preview`。

**为什么是可选的**：workers.dev 地址已经能完整测试所有功能；公司域名只是更好记。注意不要用 `weather.itsfunmag.com`，那是线上正式地址。

---

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `wrangler login` 后浏览器没有反应 | 换一个浏览器，或把命令行里显示的链接手动复制到浏览器打开 |
| 部署时报错提到 `KV namespace` 或 `REPLACE_WITH_KV_NAMESPACE_ID` | 忘了加 `--env preview`，加上后重新执行 |
| 部署时报错提到 `node` 版本 | 升级到 Node.js 22 |
| 打开网址显示 "Weather unavailable" | 把截图和网址发给 Claude 排查 |

## 说明

- 测试环境不会被搜索引擎收录（所有页面都带 noindex）。
- 测试环境没有接入广告；页面上的虚线框是广告位的位置预览。
- 测试环境与正式环境完全独立，删除方法：Cloudflare 控制台 → Workers & Pages → `weather-itsfunmag-preview` → Settings → Delete。
