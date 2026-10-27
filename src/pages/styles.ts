/**
 * 页面样式（内联在 HTML 里，省掉一次请求）。
 *
 * 设计要点：
 * - 背景是"此刻这座城市的天空"：按当地时间（黎明、白天、金光、黄昏、夜晚）和天气（晴、云、雨、雷、雪、雾）变化，
 *   太阳和月亮按真实时间停在弧线上（见 src/pages/sky.ts）。这是页面唯一"抢眼"的地方，其余保持安静。
 * - 卡片是带天空色调的磨砂玻璃，标题用小号常规大小写，不用全大写。
 * - 字体用系统字体：27 种语言（含阿拉伯文、泰文、印地文）都能正确显示，而且不用下载字体文件。
 * - 动画只用 CSS；系统开启"减少动态效果"时全部停止。
 */
export const CSS = `
:root{
  --fg:#fff;--mut:rgba(255,255,255,.78);--faint:rgba(255,255,255,.56);
  --glass:rgba(16,42,96,.24);--glass-hi:rgba(255,255,255,.10);--line:rgba(255,255,255,.14);--chip:rgba(255,255,255,.16);
  --rain:#9bd4ff;--link:#fff;
  --sky1:#2f6fd6;--sky2:#5d9ef0;--sky3:#a9d2fb;
  --r-lg:22px;--r-md:16px;--r-sm:12px;
  --ease:cubic-bezier(.2,.7,.2,1);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:#1b2a4a}
body{margin:0;min-height:100vh;color:var(--fg);background:var(--sky3);
  font:15px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans","Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid #fff;outline-offset:2px;border-radius:8px}
bdi{unicode-bidi:isolate}
[hidden]{display:none!important}
.wrap{position:relative;z-index:1;max-width:560px;margin:0 auto;padding:max(10px,env(safe-area-inset-top)) 16px 40px}

/* ---------- 天空：天色 ---------- */
.sky-day{--sky1:#2f6fd6;--sky2:#5d9ef0;--sky3:#a9d2fb;--glass:rgba(18,58,140,.24)}
.sky-dawn{--sky1:#3e4c8c;--sky2:#9a7fb5;--sky3:#f3b48a;--glass:rgba(48,40,96,.26)}
.sky-golden{--sky1:#3c6cc4;--sky2:#8ea7d9;--sky3:#f6c78a;--glass:rgba(30,52,120,.26)}
.sky-dusk{--sky1:#1c295c;--sky2:#5f4a8a;--sky3:#d9826a;--glass:rgba(24,20,60,.30)}
.sky-night{--sky1:#060d26;--sky2:#0f1f4a;--sky3:#22386e;--glass:rgba(255,255,255,.07);--glass-hi:rgba(255,255,255,.06)}
.sky-twilight{--sky1:#474d6c;--sky2:#7a7891;--sky3:#c4a497;--glass:rgba(30,30,50,.24)}
/* 天气覆盖天色 */
.wx-cloudy.sky-day{--sky1:#5a6d8f;--sky2:#8193ad;--sky3:#b3bfcf;--glass:rgba(30,44,70,.30)}
.wx-cloudy.sky-night{--sky1:#11192b;--sky2:#1e293f;--sky3:#333f59}
.wx-rain.sky-day{--sky1:#384760;--sky2:#55647d;--sky3:#7d8ba0;--glass:rgba(14,22,40,.26)}
.wx-rain.sky-twilight{--sky1:#383b53;--sky2:#56586d;--sky3:#8a8092}
.wx-rain.sky-night{--sky1:#0b111f;--sky2:#162032;--sky3:#26324a}
.wx-storm.sky-day,.wx-storm.sky-twilight{--sky1:#21263f;--sky2:#393a5a;--sky3:#575678;--glass:rgba(8,8,24,.30)}
.wx-storm.sky-night{--sky1:#090a15;--sky2:#161529;--sky3:#292640}
.wx-snow.sky-day{--sky1:#7a93b5;--sky2:#a4b8d1;--sky3:#d9e3ef;--glass:rgba(28,46,84,.36)}
.wx-snow.sky-twilight{--sky1:#6c7594;--sky2:#a0a3bd;--sky3:#d6cbd3;--glass:rgba(40,40,70,.34)}
.wx-snow.sky-night{--sky1:#192337;--sky2:#2d3c5a;--sky3:#495b7d}
.wx-fog.sky-day{--sky1:#78818f;--sky2:#a0a7b1;--sky3:#ccd1d7;--glass:rgba(30,36,48,.34)}
.wx-fog.sky-twilight{--sky1:#6a6976;--sky2:#97929e;--sky3:#c8bcba;--glass:rgba(40,36,48,.34)}
.wx-fog.sky-night{--sky1:#1b1f27;--sky2:#2c313b;--sky3:#454b57}

/* ---------- 天空：图层 ----------
 * 动画规则（2026-10-27 检查后重做）：
 * 1. 只动 transform 和 opacity：由显卡合成，不触发重绘，低端手机也不掉帧。
 *    之前的雨、雪是移动背景图案（background-position），每帧重绘，而且图案循环衔接不上，每 0.5 秒跳一下，看起来在抖。
 * 2. 天空层高度用 100vh 而不是"铺满可视区"：手机浏览器地址栏收起/展开时可视区高度会变，
 *    铺满可视区会让整个天空和粒子跟着伸缩、跳动；100vh 在手机上是固定的最大高度，不会变。
 * 3. 位置用百分比、距离用 vh，不同尺寸、横竖屏的手机效果一致。
 * 4. 不用 filter: blur（模糊滤镜很耗性能），柔和效果靠渐变本身。
 * 5. 系统开启"减少动态效果"时，所有动画停止，雨雪粒子隐藏。
 */
.sky{position:fixed;left:0;top:0;width:100%;height:100vh;z-index:0;pointer-events:none;overflow:hidden;contain:strict;
  background:linear-gradient(180deg,var(--sky1) 0%,var(--sky2) 48%,var(--sky3) 100%)}
.sky>*{position:absolute}
.sun{left:var(--sx);top:var(--sy);width:0;height:0}
.sun::before{content:"";position:absolute;width:520px;height:520px;left:-260px;top:-260px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.95) 0,rgba(255,250,230,.8) 4.5%,rgba(255,244,214,.3) 11%,rgba(255,240,210,.1) 28%,transparent 60%)}
/* 光芒：静止不转（细线旋转会闪烁），只缓慢明暗变化 */
.sun::after{content:"";position:absolute;width:820px;height:820px;left:-410px;top:-410px;border-radius:50%;opacity:.4;
  background:repeating-conic-gradient(from 7deg,rgba(255,255,255,.14) 0 2.4deg,transparent 2.4deg 11deg);
  -webkit-mask:radial-gradient(circle,#000 6%,transparent 52%);mask:radial-gradient(circle,#000 6%,transparent 52%);
  animation:breathe 9s ease-in-out infinite alternate}
.sky-dawn .sun::before,.sky-golden .sun::before,.sky-dusk .sun::before{
  background:radial-gradient(circle,rgba(255,250,235,.95) 0,rgba(255,214,150,.8) 6%,rgba(255,180,120,.35) 16%,rgba(255,160,110,.12) 34%,transparent 64%)}
.wx-cloudy .sun{opacity:.42}.wx-cloudy .sun::after{display:none}
.moon{left:var(--sx);top:var(--sy);width:0;height:0}
.moon::before{content:"";position:absolute;width:420px;height:420px;left:-210px;top:-210px;border-radius:50%;
  background:radial-gradient(circle,rgba(235,240,255,.55) 0,rgba(210,222,255,.22) 6%,rgba(170,190,255,.09) 22%,transparent 58%)}

.stars{inset:0}
.stars i{position:absolute;left:var(--x);top:var(--y);width:var(--s);height:var(--s);border-radius:50%;background:#fff;opacity:var(--o)}
.stars i.tw{animation:twinkle 4.5s ease-in-out var(--d) infinite alternate}

/* 云：两层慢慢平移；颜色随天色变化（夜里暗、雨天灰） */
body{--cl:255,255,255}
.wx-rain,.wx-storm,.wx-snow{--cl:200,207,222}
.sky-night{--cl:120,132,165}
.clouds{left:-30%;width:160%;top:2%;height:50%;opacity:0;will-change:transform;animation:drift var(--drift,120s) ease-in-out infinite alternate;
  background:radial-gradient(70px 38px at 12% 30%,rgba(var(--cl),.75),transparent),radial-gradient(110px 52px at 18% 36%,rgba(var(--cl),.6),transparent),
    radial-gradient(80px 40px at 46% 18%,rgba(var(--cl),.7),transparent),radial-gradient(130px 58px at 54% 26%,rgba(var(--cl),.55),transparent),
    radial-gradient(90px 44px at 80% 40%,rgba(var(--cl),.7),transparent),radial-gradient(140px 62px at 88% 46%,rgba(var(--cl),.5),transparent)}
.clouds.c2{top:22%;animation-duration:calc(var(--drift,120s) * 1.5);animation-direction:alternate-reverse;transform:scale(1.4)}
.wx-some .clouds{opacity:.6}.wx-some .clouds.c2{opacity:.35}
.wx-cloudy .clouds{opacity:.8}.wx-cloudy .clouds.c2{opacity:.6}
.wx-rain .clouds,.wx-storm .clouds,.wx-snow .clouds{opacity:.4}

/* 雨：每一滴一个元素，斜向下落 */
.rain{inset:0}
.rain i{position:absolute;top:0;left:var(--x);width:1.5px;height:var(--l);border-radius:1px;
  background:linear-gradient(rgba(225,236,255,0),rgba(225,236,255,var(--o)));
  transform:translate3d(0,-20vh,0) rotate(var(--rot,12deg));will-change:transform;
  animation:drop var(--t) linear var(--d) infinite}
/* 倾斜角度和横向距离随风变化（--rot、--dx 由 sky.ts 按风速、风向算出） */
@keyframes drop{from{transform:translate3d(0,-20vh,0) rotate(var(--rot,12deg))}to{transform:translate3d(var(--dx,-28vh),112vh,0) rotate(var(--rot,12deg))}}

/* 雪：外层下落，内层左右飘 */
.snow{inset:0}
.snow i{position:absolute;top:0;left:var(--x);opacity:var(--o);transform:translate3d(0,-6vh,0);will-change:transform;
  animation:fall var(--t) linear var(--d) infinite}
.snow b{display:block;width:var(--s);height:var(--s);border-radius:50%;background:#fff;box-shadow:0 0 4px rgba(255,255,255,.8);
  animation:sway var(--w) ease-in-out infinite alternate}
@keyframes fall{from{transform:translate3d(0,-6vh,0)}to{transform:translate3d(var(--sdx,0),106vh,0)}}
@keyframes sway{from{transform:translateX(-12px)}to{transform:translateX(12px)}}

/* 沙尘：昏黄的天色 + 一层雾霾 + 顺着风横穿的细颗粒 */
.wx-dust.sky-day,.wx-dust.sky-twilight,.wx-dust.sky-dawn,.wx-dust.sky-golden,.wx-dust.sky-dusk{--sky1:#8c7656;--sky2:#b9935f;--sky3:#d8b37c;--glass:rgba(74,52,28,.32)}
.wx-dust2.sky-day,.wx-dust2.sky-twilight,.wx-dust2.sky-dawn,.wx-dust2.sky-golden,.wx-dust2.sky-dusk{--sky1:#7a573a;--sky2:#a8794b;--sky3:#c99a63;--glass:rgba(64,40,20,.36)}
.wx-dust.sky-night{--sky1:#211b14;--sky2:#382c1f;--sky3:#56432d}
.wx-dust .sun{opacity:.55}.wx-dust .sun::after{display:none}
.wx-dust .sun::before{background:radial-gradient(circle,rgba(255,236,200,.9) 0,rgba(255,214,160,.55) 5%,rgba(240,190,120,.2) 16%,transparent 50%)}
.haze{inset:0;background:linear-gradient(rgba(214,176,120,.18),rgba(196,150,90,.32) 55%,rgba(180,130,70,.4));animation:breathe 12s ease-in-out infinite alternate}
.dust{inset:0}
.dust i{position:absolute;top:var(--y);left:0;width:var(--s);height:var(--s);border-radius:50%;background:rgba(246,222,180,var(--o));will-change:transform;
  transform:translate3d(calc(var(--ws,-1) * -55vw + 50vw),0,0);animation:blow var(--t) linear var(--d) infinite}
@keyframes blow{from{transform:translate3d(calc(50vw - var(--ws,-1) * 60vw),0,0)}to{transform:translate3d(calc(50vw + var(--ws,-1) * 60vw),3vh,0)}}

/* 大风：几条很淡的细线快速掠过 */
.gusts{inset:0}
.gusts i{position:absolute;top:var(--y);left:0;width:var(--w);height:1px;border-radius:1px;opacity:0;will-change:transform,opacity;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,var(--o)),rgba(255,255,255,0));
  animation:gust var(--t) ease-in-out var(--d) infinite}
@keyframes gust{0%{opacity:0;transform:translate3d(calc(50vw - var(--ws,-1) * 65vw),0,0)}20%,70%{opacity:1}100%{opacity:0;transform:translate3d(calc(50vw + var(--ws,-1) * 65vw),0,0)}}

/* 雷暴：每 11 秒一次柔和的亮光（不连续闪烁，避免刺眼） */
.flash{inset:0;background:radial-gradient(ellipse at 60% 8%,rgba(220,225,255,.5),transparent 62%);opacity:0;animation:flash 11s ease-out infinite}

/* 雾：两条很宽的柔和雾带缓慢平移 */
.fog{left:-25%;width:150%;top:18%;height:40%;will-change:transform;animation:drift 70s ease-in-out infinite alternate;
  background:linear-gradient(rgba(255,255,255,0),rgba(255,255,255,.22) 35%,rgba(255,255,255,.26) 50%,rgba(255,255,255,.22) 65%,rgba(255,255,255,0))}
.fog.f2{top:55%;opacity:.75;animation-duration:100s;animation-direction:alternate-reverse}

/* 有雨雪粒子时，卡片不用毛玻璃模糊：后面的粒子每帧都在动，模糊要跟着每帧重算，低端手机会卡；改用更不透明的底色 */
.wx-rain,.wx-storm{--glass-wet:rgba(34,44,64,.72)}
.wx-snow{--glass-wet:rgba(44,62,96,.66)}
.sky-night.wx-rain,.sky-night.wx-storm,.sky-night.wx-snow{--glass-wet:rgba(12,18,32,.74)}
:is(.wx-rain,.wx-storm,.wx-snow) :is(.card,.tile){-webkit-backdrop-filter:none;backdrop-filter:none;background:var(--glass-wet)}
:is(.wx-rain,.wx-storm,.wx-snow) :is(.btn,.jump a:not([aria-current]),.vs,.search input){-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(255,255,255,.2)}

/* 顶部压暗一点，保证城市名在亮的天空上也看得清 */
.sky::after{content:"";position:absolute;inset:0 0 auto;height:150px;background:linear-gradient(rgba(0,0,0,.14),transparent)}
@keyframes breathe{from{opacity:.28}to{opacity:.5}}
@keyframes twinkle{from{opacity:var(--o)}to{opacity:.15}}
@keyframes drift{to{transform:translate3d(-10%,0,0)}}
@keyframes flash{0%,93%,100%{opacity:0}94.5%{opacity:1}97%{opacity:0}}
@media (prefers-reduced-motion:reduce){
  .sky *,.sky *::after{animation:none!important}
  .rain,.snow,.dust,.gusts{display:none}
}

/* ---------- 顶部 ---------- */
.top{display:flex;align-items:center;gap:8px;min-height:52px;text-shadow:0 1px 10px rgba(0,0,0,.18)}
.place{flex:1;min-width:0}
.place h1{display:flex;align-items:center;gap:6px;margin:0;font-size:22px;font-weight:650;letter-spacing:-.01em;line-height:1.2}
.place h1 span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.place h1 svg{flex:none;width:18px;height:18px;opacity:.9}
.region{margin-top:1px;font-size:13px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:40px;height:40px;padding:0 11px;border-radius:999px;border:0;
  background:var(--chip);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);font-size:14px;font-weight:600;cursor:pointer;transition:background .2s}
.btn:active{background:rgba(255,255,255,.28)}
.btn svg{width:20px;height:20px}
.btn[aria-pressed="true"] svg{fill:#ffd36b;stroke:#ffd36b}
.back{display:inline-flex;align-items:center;gap:4px;font-size:14px;color:var(--mut)}
.back svg{width:16px;height:16px}
[dir=rtl] .flip{transform:scaleX(-1)}

/* 明天、后天、一周 */
.jump{display:flex;gap:8px;margin:6px -16px 0;padding:2px 16px;overflow-x:auto;scrollbar-width:none}
.jump::-webkit-scrollbar{display:none}
.jump a{flex:none;display:flex;align-items:center;gap:8px;height:40px;padding:0 12px 0 14px;border-radius:999px;background:var(--chip);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);font-size:14px;white-space:nowrap}
.jump a:active{background:rgba(255,255,255,.28)}
.jump img{width:24px;height:24px}
.jump .hl{color:var(--mut);font-variant-numeric:tabular-nums}
.jump .chev{width:14px;height:14px;opacity:.7}

/* ---------- 当前天气 ---------- */
.hero{text-align:center;padding:26px 0 18px;text-shadow:0 1px 18px rgba(0,0,0,.12)}
.now{display:inline-flex;align-items:flex-start;position:relative;line-height:1}
.now .t{font-size:clamp(96px,31vw,136px);font-weight:200;letter-spacing:-.045em;font-variant-numeric:lining-nums}
.now .deg{font-size:.42em;font-weight:200;margin-top:.12em;letter-spacing:0}
.now img{position:absolute;inset-inline-start:100%;top:52%;width:62px;height:62px;margin-inline-start:-10px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.15))}
.cond{margin:4px 0 0;font-size:21px;font-weight:500;letter-spacing:-.01em}
.hl-line{margin:4px 0 0;font-size:16px;color:var(--mut);font-variant-numeric:tabular-nums}
.hl-line b{font-weight:500;color:var(--fg)}
.feels{margin:2px 0 0;font-size:14px;color:var(--faint)}
.upd{margin:10px 0 0;font-size:12px;color:var(--faint)}
.vs{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:7px 12px 7px 10px;border-radius:999px;font-size:14px;font-weight:550;text-shadow:none;
  background:rgba(255,255,255,.16);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.vs i{width:10px;height:10px;border-radius:50%;background:var(--lv);box-shadow:0 0 0 3px color-mix(in srgb,var(--lv) 35%,transparent)}
.vs svg{width:14px;height:14px;opacity:.75}

/* ---------- 卡片 ---------- */
.card{display:block;margin:12px 0;padding:14px 16px 16px;border-radius:var(--r-lg);background:var(--glass);
  box-shadow:inset 0 1px 0 var(--glass-hi);-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%)}
.sec{display:flex;align-items:center;gap:7px;margin:0 0 10px;font-size:13px;font-weight:600;color:var(--mut)}
.sec svg{width:15px;height:15px;opacity:.85}
.sec .go{margin-inline-start:auto;display:inline-flex;align-items:center;gap:2px;font-weight:500;color:var(--fg);opacity:.92}
.sec .go svg{width:14px;height:14px}
a.card:active,.tile:active{transform:scale(.99)}
a.card,.tile{transition:transform .15s var(--ease)}

/* 降雨时间轴 */
.nc-msg{font-size:17px;font-weight:550;line-height:1.35}
.nc-bars{display:grid;grid-template-columns:repeat(8,1fr);align-items:end;gap:5px;height:56px;margin:14px 0 6px;padding-bottom:1px;border-bottom:1px solid var(--line)}
.nc-bars span{display:block;border-radius:5px 5px 2px 2px;background:var(--rain);min-height:3px;opacity:.95}
.nc-bars span[data-i="0"]{background:rgba(255,255,255,.25)}
.nc-axis{display:flex;justify-content:space-between;font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.nc-note{margin-top:8px;font-size:12px;color:var(--faint)}

/* 逐小时 */
.hours{display:flex;gap:2px;margin:0 -10px;padding:0 10px 2px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity}
.hours::-webkit-scrollbar{display:none}
.hour{flex:none;width:54px;padding:8px 0 6px;border-radius:14px;text-align:center;scroll-snap-align:start}
.hour[data-now]{background:rgba(255,255,255,.14)}
.hour .t{font-size:13px;color:var(--mut);font-variant-numeric:tabular-nums}
.hour[data-now] .t{color:var(--fg);font-weight:650}
.hour img,.hour .sunico{display:block;width:34px;height:34px;margin:5px auto 3px}
.hour .p{height:15px;font-size:11px;font-weight:600;color:var(--rain)}
.hour .v{font-size:17px;font-weight:550}
.hour.sunev .v{font-size:13px;font-weight:500;color:var(--mut)}
.sunico{color:#ffd36b}

/* 多日 */
.day{display:grid;grid-template-columns:minmax(3.2em,auto) 38px 2.4em 1fr 2.4em;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
.day:first-of-type{border-top:0}
.day .wd{font-weight:550;font-size:16px;white-space:nowrap}
.day[data-today] .wd{font-weight:700}
.day .ic{position:relative;text-align:center;line-height:0}
.day .ic img{width:30px;height:30px}
.day .ic small{display:block;margin-top:1px;font-size:10.5px;font-weight:650;line-height:1.1;color:var(--rain)}
.day .lo{color:var(--faint);text-align:end;font-size:16px}
.day .hi{text-align:end;font-size:16px;font-weight:600}
.bar{position:relative;height:5px;border-radius:5px;background:rgba(0,0,0,.16)}
.bar i{position:absolute;top:0;bottom:0;border-radius:5px}
.bar b{position:absolute;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.18)}

/* 生活指数：每项一行，标题 + 理由 + 结论 */
.life{display:flex;flex-direction:column}
.life a{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}
.life a:first-child{border-top:0}
.life .ico{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,.12)}
.life svg{width:21px;height:21px}
.life .n{min-width:0}
.life .n b{display:block;font-size:15px;font-weight:600}
.life .n span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.3;color:var(--mut)}
.life .r{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;white-space:nowrap}
.life .r svg{width:14px;height:14px;opacity:.6}
.dot{flex:none;width:8px;height:8px;border-radius:50%;background:#cbd5e1}
.dot.good{background:#4ade80}.dot.fair{background:#facc15}.dot.poor{background:#fb7185}

/* 空气质量 */
.aq{display:flex;align-items:baseline;gap:10px}
.aq .v{font-size:40px;font-weight:300;line-height:1.05}
.aq .l{font-size:17px;font-weight:550}
.meter{position:relative;height:6px;border-radius:6px;margin:12px 0 4px;background:linear-gradient(90deg,#4ade80,#facc15,#fb923c,#f43f5e,#a855f7)}
.meter b{position:absolute;top:50%;width:14px;height:14px;margin-top:-7px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.2);transform:translateX(-50%)}
[dir=rtl] .meter{background:linear-gradient(-90deg,#4ade80,#facc15,#fb923c,#f43f5e,#a855f7)}
[dir=rtl] .meter b{transform:translateX(50%)}

/* 详情方块 */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.tile{display:flex;flex-direction:column;min-height:150px;padding:13px 15px 14px;border-radius:var(--r-lg);background:var(--glass);
  box-shadow:inset 0 1px 0 var(--glass-hi);-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%)}
.tile .sec{margin-bottom:8px}
.tile .big{font-size:32px;font-weight:400;line-height:1.1;letter-spacing:-.01em}
.tile .big small{font-size:16px;font-weight:500;margin-inline-start:2px}
.tile .note{margin-top:auto;padding-top:8px;font-size:13px;line-height:1.35;color:var(--mut)}
.tile .viz{display:flex;justify-content:center;margin:2px 0}
.uvm{background:linear-gradient(90deg,#4ade80,#facc15,#fb923c,#f43f5e,#a855f7)}
.sunarc{display:block;width:100%;height:auto;margin-top:4px}

/* 预报准吗 */
.vote{display:flex;align-items:center;gap:10px}
.vote p{flex:1;margin:0;font-size:15px;font-weight:550}
.vote button{width:46px;height:40px;border:0;border-radius:999px;background:rgba(255,255,255,.14);cursor:pointer;transition:background .2s,transform .15s}
.vote button:active{transform:scale(.94)}
.vote button svg{width:20px;height:20px;vertical-align:middle}
.vote button[aria-pressed=true]{background:#fff;color:#1d3b74}
.vote[data-done] p{color:var(--mut)}

/* ---------- 子页通用 ---------- */
.jump a[aria-current]{background:#fff;color:#1b2a4a;text-shadow:none}
.jump a[aria-current] .hl{color:#475569}
.lead{margin:0;font-size:16px;font-weight:550;line-height:1.4}
.note{margin:10px 0 0;font-size:13px;color:var(--mut)}
.base-note{margin:18px 4px 0;font-size:12px;color:var(--faint);text-align:center}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:12px;color:var(--mut)}
.legend>span{display:inline-flex;align-items:center;gap:6px}
.sw{display:inline-block;width:14px;height:8px;border-radius:4px;background:#fff}
.sw.usual{background:rgba(255,255,255,.3)}.sw.lo{background:#9bd4ff}.sw.line{height:2px;border-radius:1px}
.pill-btn{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 15px;border:0;border-radius:999px;background:rgba(255,255,255,.16);font-size:14px;font-weight:600;cursor:pointer}
.pill-btn svg{width:17px;height:17px}
.pill-btn:active{background:rgba(255,255,255,.28)}

/* 明天、后天 */
.day-hero{padding-top:18px}
.day-hero .date{margin:0;font-size:15px;color:var(--mut)}
.big-ico{display:block;width:96px;height:96px;margin:6px auto 0;filter:drop-shadow(0 8px 18px rgba(0,0,0,.16))}
.range{display:flex;align-items:baseline;justify-content:center;gap:10px;margin:2px 0 0;font-size:56px;font-weight:250;letter-spacing:-.03em;line-height:1.05}
.range .sep{font-size:.6em;color:var(--faint)}
.range>bdi:last-child{color:var(--mut)}
.week-hero .range{font-size:72px}
.tile.short{min-height:118px}
.wk{display:block;border-top:1px solid var(--line)}
.wk:first-of-type{border-top:0}
.wk .day{border-top:0;padding-bottom:2px}
.wk-facts{display:flex;flex-wrap:wrap;gap:4px 14px;padding:0 0 10px;font-size:12.5px;color:var(--mut)}
.wk-facts span{display:inline-flex;align-items:center;gap:4px}
.wk-facts svg{width:13px;height:13px;opacity:.75}
a.wk:active{background:rgba(255,255,255,.06)}

/* 往年对比 */
.guess .q{margin:2px 0 14px;font-size:20px;font-weight:600;line-height:1.3;letter-spacing:-.01em}
.choices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ch{min-height:52px;padding:4px 6px;border:0;border-radius:16px;background:rgba(255,255,255,.16);font-size:14.5px;line-height:1.2;font-weight:650;cursor:pointer;transition:transform .15s var(--ease),background .2s}
.ch:active{transform:scale(.96)}
.ch-colder{box-shadow:inset 0 -3px 0 #7dd3fc}.ch-same{box-shadow:inset 0 -3px 0 #cbd5e1}.ch-warmer{box-shadow:inset 0 -3px 0 #fb923c}
.ch[aria-pressed=true]{background:#fff;color:#1b2a4a}
.guess[data-done] .choices{pointer-events:none}
.guess[data-done] .ch:not([aria-pressed=true]){opacity:.55}
.reveal{display:none}
.reveal.on{display:block;animation:rise .45s var(--ease)}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.reveal.on{animation:none}}
.res{margin:0;font-size:14px;font-weight:650;color:var(--mut)}
.res:empty{display:none}
.verdict{margin:4px 0 0;font-size:26px;font-weight:600;line-height:1.25;letter-spacing:-.015em}
.verdict span[data-dca]{color:var(--lv)}
.pc{margin:6px 0 0;font-size:14px;color:var(--mut)}
.pc:empty{display:none}
.thermo{margin:18px 0 4px}
.track{position:relative;height:12px;border-radius:6px;background:rgba(0,0,0,.18)}
.track .usual{position:absolute;top:0;bottom:0;border-radius:6px;background:rgba(255,255,255,.32)}
.track .pt{position:absolute;top:50%;width:18px;height:18px;margin-top:-9px;border-radius:50%;transform:translateX(-50%);box-shadow:0 0 0 3px rgba(255,255,255,.9)}
[dir=rtl] .track .pt{transform:translateX(50%)}
.track .pt.hi{background:var(--lv)}.track .pt.lo{background:#9bd4ff}
.marks{position:relative;height:22px;margin-top:12px;font-size:13px;font-weight:600}
.marks>span{position:absolute;transform:translateX(-50%);color:var(--mut)}
[dir=rtl] .marks>span{transform:translateX(50%)}
.marks .strong{color:var(--fg)}
.share-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.series{display:block;width:100%;height:auto;margin-top:4px}
.cmp-bars{display:grid;gap:10px;margin-top:4px}
.cmp-bars div{display:grid;grid-template-columns:6.5em 1fr 2em;align-items:center;gap:10px;font-size:13px;color:var(--mut)}
.cmp-bars i{display:block;height:10px;min-width:4px;border-radius:5px;background:var(--rain)}
.cmp-bars i.usual{background:rgba(255,255,255,.35)}
.cmp-bars b{font-size:17px;color:var(--fg);text-align:end}

/* 排行榜 */
.rank{display:grid;grid-template-columns:1.6em 1fr auto 2.6em;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
.rank:first-of-type{border-top:0}
.rank .no{font-size:15px;font-weight:700;color:var(--faint);text-align:center;font-variant-numeric:tabular-nums}
.rank .who{min-width:0}
.rank .who b{display:block;font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank .who span{display:block;font-size:12px;color:var(--mut)}
.rank .d{padding:3px 9px;border-radius:999px;background:var(--lv);color:#fff;font-size:15px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.2)}
.rank .hi{text-align:end;color:var(--mut)}
.card .ad{margin:10px auto}

/* 生活指数详情 */
.life-hero{display:flex;align-items:center;gap:16px;padding:18px}
.life-hero .ico{flex:none;display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:20px;background:rgba(255,255,255,.16)}
.life-hero .ico svg{width:36px;height:36px}
.life-hero .verdict{display:flex;align-items:center;gap:8px;margin:0;font-size:24px}
.life-hero .dot{width:11px;height:11px}
.life-hero .why{margin:4px 0 0;color:var(--mut);font-size:15px}
.tl{margin-top:12px}
.tl-bars{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px}
.tl-bars span{height:26px;border-radius:6px;background:#cbd5e1}
.tl-bars span.good{background:#4ade80}.tl-bars span.fair{background:#facc15}.tl-bars span.poor{background:#fb7185}
.tl-axis{display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--faint)}
.fact{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);font-size:15px}
.fact:first-of-type{border-top:0}
.fact>span{color:var(--mut)}
.fact b{font-weight:600}
.day-fact{display:grid;grid-template-columns:1fr 30px 6em;justify-items:start}
.day-fact b{justify-self:end}
.day-fact.hot>span{color:var(--fg);font-weight:600}
.bands{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.bands span{padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.1);font-size:12.5px;color:var(--mut)}
.bands span.on{background:#fff;color:#1b2a4a;font-weight:650}
.tip{margin:10px 0 0;font-size:14px;line-height:1.45;color:var(--mut)}

/* ---------- 列表页（子页） ---------- */
.row{display:grid;grid-template-columns:3.4em 34px 1fr auto;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}
.row img{width:32px;height:32px}
.row .main{min-width:0}.row .main div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .sub{font-size:12px;color:var(--mut)}
.row .v{text-align:end;font-size:17px;font-weight:600}
details.dd{border-top:1px solid var(--line)}details.dd:first-of-type{border-top:0}
details.dd summary{list-style:none;cursor:pointer}details.dd summary::-webkit-details-marker{display:none}
details.dd .day{border-top:0}
details.dd .more{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;padding:0 0 12px;font-size:13px;color:var(--mut)}
details.dd .more b{color:var(--fg);font-weight:600}
.aqbars{display:flex;align-items:flex-end;gap:3px;height:90px;margin-top:8px}
.aqbars span{flex:1;min-height:3px;border-radius:3px 3px 0 0}
.axis{display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--faint)}
.pollutants{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.pollutants div{padding:8px 10px;border-radius:var(--r-sm);background:rgba(255,255,255,.1)}
.pollutants b{display:block;font-size:18px}

/* 我的城市 */
.search{display:flex;gap:8px;margin:8px 0}
.search input{flex:1;height:46px;padding:0 16px;border:0;border-radius:14px;background:rgba(255,255,255,.16);color:var(--fg);font:inherit;font-size:16px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.search input::placeholder{color:var(--faint)}
.city{display:flex;align-items:center;gap:4px;border-top:1px solid var(--line)}
.city:first-child{border-top:0}
.city a{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:10px 0}
.city img{width:40px;height:40px}
.city .n{flex:1;min-width:0}.city .sub{font-size:12px;color:var(--mut)}.city .n div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.city .v{font-size:24px;font-weight:400}
.city button{padding:4px 8px;border:0;background:none;color:var(--mut);font-size:20px;cursor:pointer}
.empty{padding:16px 0;text-align:center;color:var(--mut)}

/* 广告位：预留高度，广告加载前后页面不跳动 */
.ad{position:relative;display:flex;align-items:center;justify-content:center;max-width:336px;margin:14px auto;border-radius:var(--r-sm)}
.ad::before{content:attr(data-label);position:absolute;top:4px;font-size:10px;color:var(--faint)}
.ad.preview{border:1px dashed rgba(255,255,255,.35);background:rgba(255,255,255,.05)}
.ad.preview::after{content:attr(data-slot);font-size:12px;color:var(--faint)}

footer{margin-top:28px;text-align:center;font-size:12px;color:var(--mut)}
footer nav{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 14px;margin-bottom:8px}
footer a{text-decoration:underline;text-underline-offset:2px;text-decoration-color:rgba(255,255,255,.35)}
.dev{position:relative;z-index:2;padding:6px 16px;background:#3b2f12;color:#fbd38d;font-size:12px;text-align:center}
.msg{padding:48px 0;text-align:center}
.msg h1{font-size:22px}
`;
