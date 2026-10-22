/**
 * 页面样式（内联在 HTML 里，省掉一次请求）。
 * 延续现网的视觉：天气背景 + 半透明卡片。
 * 字体用系统字体，不再加载 Inter（现网字体约 560KB，是首屏慢的主要原因）。
 * 背景动画只用 CSS，不再加载动画库；系统开启"减少动态效果"时自动关闭。
 */
export const CSS = `
:root{--fg:#fff;--mut:rgba(255,255,255,.72);--faint:rgba(255,255,255,.5);--card:rgba(15,23,42,.32);--line:rgba(255,255,255,.16);--chip:rgba(255,255,255,.14);--acc:#9cc3ff;--warm:#ffb37a;--cool:#9fd2ff;--radius:18px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;color:var(--fg);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Helvetica Neue",Arial,sans-serif;background:#1b2a4a;background-attachment:fixed}
a{color:inherit}
.wrap{position:relative;z-index:1;max-width:600px;margin:0 auto;padding:12px 16px 40px}
.sky{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}

/* 背景：按天气类型 */
body.bg-sunny{background:linear-gradient(180deg,#2c6bd6 0%,#4f97ea 55%,#8ec2f5 100%)}
body.bg-cloudy{background:linear-gradient(180deg,#4b5b78 0%,#6b7b98 60%,#8f9bb1 100%)}
body.bg-rainy{background:linear-gradient(180deg,#26334b 0%,#3c4b66 60%,#56657f 100%)}
body.bg-rainy-freezing{background:linear-gradient(180deg,#30455f 0%,#4f6a86 60%,#7d93ab 100%)}
body.bg-stormy{background:linear-gradient(180deg,#1b1f2e 0%,#2e2f48 60%,#45425f 100%)}
body.bg-snowy{background:linear-gradient(180deg,#5e7698 0%,#8099bb 60%,#a8bdd8 100%)}
body.bg-foggy{background:linear-gradient(180deg,#5d6676 0%,#7d8695 60%,#a0a7b2 100%)}
body.bg-night{background:linear-gradient(180deg,#070d24 0%,#111d42 60%,#1f2e5c 100%)}
body.bg-night-cloudy{background:linear-gradient(180deg,#10172a 0%,#1f2840 60%,#323c56 100%)}
body.bg-night-rainy,body.bg-night-rainy-freezing{background:linear-gradient(180deg,#0d1322 0%,#1b2437 60%,#2b3650 100%)}
body.bg-night-stormy{background:linear-gradient(180deg,#0b0c16 0%,#1b1a2e 60%,#2c2944 100%)}
body.bg-night-snowy{background:linear-gradient(180deg,#1b2539 0%,#334360 60%,#4f6283 100%)}
body.bg-night-foggy{background:linear-gradient(180deg,#1a1f29 0%,#2f3542 60%,#474e5c 100%)}

/* 背景动画 */
.fx-rain{position:absolute;inset:-20% 0 0;background-image:repeating-linear-gradient(105deg,transparent 0 22px,rgba(255,255,255,.16) 22px 23px,transparent 23px 46px);background-size:46px 120px;animation:rain .6s linear infinite;opacity:.7}
.fx-snow{position:absolute;inset:-20% 0 0;background-image:radial-gradient(2px 2px at 20px 30px,#fff 50%,transparent 51%),radial-gradient(3px 3px at 80px 90px,rgba(255,255,255,.9) 50%,transparent 51%),radial-gradient(2px 2px at 140px 50px,#fff 50%,transparent 51%);background-size:180px 140px;animation:snow 9s linear infinite;opacity:.8}
.fx-stars{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 30px 40px,#fff 50%,transparent 51%),radial-gradient(1px 1px at 120px 90px,#fff 50%,transparent 51%),radial-gradient(1.2px 1.2px at 200px 20px,rgba(255,255,255,.8) 50%,transparent 51%);background-size:240px 160px;opacity:.55;animation:twinkle 4s ease-in-out infinite alternate}
.fx-fog{position:absolute;inset:0;background:linear-gradient(0deg,rgba(255,255,255,.18),transparent 60%)}
@keyframes rain{to{background-position:-30px 120px}}
@keyframes snow{to{background-position:40px 140px}}
@keyframes twinkle{from{opacity:.35}to{opacity:.7}}
@media (prefers-reduced-motion:reduce){.fx-rain,.fx-snow,.fx-stars{animation:none}}

/* 顶部 */
.top{display:flex;align-items:center;gap:8px;min-height:48px}
.top .place{flex:1;min-width:0}
.top h1{font-size:20px;font-weight:700;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.top .region{font-size:13px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.btn{display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:40px;padding:0 10px;border-radius:999px;border:1px solid var(--line);background:var(--chip);color:var(--fg);font:inherit;font-size:14px;cursor:pointer;text-decoration:none}
.btn svg{width:20px;height:20px}
.btn[aria-pressed="true"] svg{fill:#ffd166;stroke:#ffd166}
.back{display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:var(--mut);font-size:14px}

/* 当前天气 */
.hero{text-align:center;padding:18px 0 10px}
.hero .icon{width:112px;height:112px;margin:0 auto;display:block}
.hero .temp{font-size:84px;font-weight:200;line-height:1;margin-top:4px;letter-spacing:-2px}
.hero .cond{font-size:18px;margin-top:6px}
.hero .hl{color:var(--mut);margin-top:2px}
.hero .upd{color:var(--faint);font-size:12px;margin-top:8px}
.tag{display:inline-block;margin-top:10px;border-radius:999px;padding:4px 12px;font-size:13px;background:var(--chip)}
.tag.warm{background:rgba(255,140,60,.25);color:#ffe0c8}.tag.cool{background:rgba(80,160,255,.25);color:#d9ecff}

/* 卡片 */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;margin:12px 0;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.card h2{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin:0 0 10px}
.card h2 a{font-size:12px;letter-spacing:0;text-transform:none;color:var(--acc);text-decoration:none}

/* 逐小时 */
.hours{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;margin:0 -6px;padding:0 6px}
.hours::-webkit-scrollbar{display:none}
.hour{flex:0 0 auto;width:56px;text-align:center;border-radius:14px;padding:8px 0}
.hour[data-now]{background:var(--chip)}
.hour .t{font-size:13px;color:var(--mut)}.hour[data-now] .t{color:var(--fg);font-weight:600}
.hour img{width:34px;height:34px;display:block;margin:4px auto}
.hour .v{font-size:16px;font-weight:600}
.hour .p{font-size:11px;color:var(--acc);min-height:15px}

/* 多日 */
.day{display:grid;grid-template-columns:3.6em 34px 2.6em 2.4em 1fr 2.4em;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line)}
.day:first-of-type{border-top:0}
.day .wd{font-weight:500}.day[data-today] .wd{font-weight:700}
.day img{width:30px;height:30px}
.day .p{font-size:12px;color:var(--acc)}
.day .lo{color:var(--mut);text-align:end}.day .hi{text-align:end;font-weight:600}
.bar{position:relative;height:5px;border-radius:5px;background:rgba(255,255,255,.18)}
.bar i{position:absolute;top:0;bottom:0;border-radius:5px}

/* 详情网格 */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;min-height:132px;display:flex;flex-direction:column;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.tile h3{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin:0 0 6px}
.tile .big{font-size:30px;font-weight:500;line-height:1.1}
.tile .note{margin-top:auto;font-size:12px;color:var(--mut)}
.tile svg{display:block}
.meter{position:relative;height:6px;border-radius:6px;margin:10px 0 6px;background:linear-gradient(90deg,#22c55e,#facc15,#f97316,#ef4444,#a855f7)}
.meter b{position:absolute;top:-3px;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,.25);transform:translateX(-50%)}
.aqv{font-size:34px;font-weight:500;line-height:1.1}
a.card{display:block;text-decoration:none}
.card h2 .more{font-size:12px;letter-spacing:0;text-transform:none;color:var(--acc)}
.uvm{background:linear-gradient(90deg,#22c55e,#facc15,#f97316,#ef4444,#a855f7)}

/* 列表页 */
.row{display:grid;grid-template-columns:3.4em 34px 1fr auto;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}
.row img{width:32px;height:32px}
.row .main{min-width:0}.row .main div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .sub{font-size:12px;color:var(--mut)}
.row .v{text-align:end;font-weight:600}
details.dd{border-top:1px solid var(--line)}details.dd:first-of-type{border-top:0}
details.dd summary{list-style:none;cursor:pointer}details.dd summary::-webkit-details-marker{display:none}
details.dd .day{border-top:0}
details.dd .more{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;padding:0 0 12px;font-size:13px;color:var(--mut)}
details.dd .more b{color:var(--fg);font-weight:600}
.aqbars{display:flex;align-items:flex-end;gap:3px;height:90px;margin-top:8px}
.aqbars span{flex:1;border-radius:3px 3px 0 0;min-height:3px}
.axis{display:flex;justify-content:space-between;font-size:11px;color:var(--faint);margin-top:4px}
.pollutants{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.pollutants div{background:var(--chip);border-radius:12px;padding:8px 10px}
.pollutants b{display:block;font-size:18px}

/* 城市列表 */
.search{display:flex;gap:8px;margin:8px 0}
.search input{flex:1;height:44px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.12);color:var(--fg);padding:0 14px;font:inherit;font-size:16px}
.search input::placeholder{color:var(--faint)}
.city{display:flex;align-items:center;gap:4px;border-top:1px solid var(--line)}
.city:first-child{border-top:0}
.city a{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:10px 0;text-decoration:none}
.city img{width:40px;height:40px}
.city .n{flex:1;min-width:0}.city .sub{font-size:12px;color:var(--mut)}.city .n div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.city .v{font-size:22px;font-weight:500}
.city button{background:none;border:0;color:var(--mut);font-size:20px;cursor:pointer;padding:4px 8px}
.empty{color:var(--mut);text-align:center;padding:16px 0}

/* 广告位：固定高度占位，避免页面跳动（第 5 步接入广告代码） */
.ad{position:relative;margin:12px auto;display:flex;align-items:center;justify-content:center;border-radius:12px;max-width:336px}
.ad::before{content:attr(data-label);position:absolute;top:4px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.ad.preview{border:1px dashed rgba(255,255,255,.35);background:rgba(255,255,255,.05)}
.ad.preview::after{content:attr(data-slot);font-size:12px;color:var(--faint)}

footer{margin-top:28px;text-align:center;font-size:12px;color:var(--mut)}
footer nav{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 14px;margin-bottom:8px}
footer a{color:var(--mut)}
.dev{position:relative;z-index:2;background:#3b2f12;color:#fbd38d;font-size:12px;padding:6px 16px;text-align:center}
.msg{text-align:center;padding:48px 0}
.msg h1{font-size:22px}
bdi{unicode-bidi:isolate}
`;
