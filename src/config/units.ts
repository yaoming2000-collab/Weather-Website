/** 单位设置在浏览器里的存储键，以及默认用华氏度的地区（client/lib/units.ts 和首屏内联脚本共用） */
export const UNITS_KEY = 'weather.units.v2';
/** 旧版设置（metric / imperial） */
export const UNITS_KEY_LEGACY = 'weather.units';

/** 默认使用华氏度的国家和地区（美国及少数几个使用美制单位的地区） */
export const FAHRENHEIT_REGIONS: readonly string[] = ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'PR', 'GU', 'VI', 'AS'];

/**
 * 首屏内联脚本：华氏度用户在页面画出来之前就把已经解析到的温度换成 °F，
 * 避免 app.js 加载后数字变宽、首屏跳动（CLS）。app.js 之后会按同样的规则再换算一遍全部数值。
 * 规则和 client/lib/units.ts 的 currentUnits/defaultUnits 一致（只看温度）。
 */
export const EARLY_UNITS_SCRIPT = `(function(){try{var f=false,s=null,l=null;try{s=localStorage.getItem(${JSON.stringify(UNITS_KEY)});l=localStorage.getItem(${JSON.stringify(UNITS_KEY_LEGACY)})}catch(e){}
if(s){f=JSON.parse(s).temp==='f'}else if(l==='imperial'||l==='metric'){f=l==='imperial'}else{var L=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];
for(var i=0;i<L.length;i++){var m=/[-_]([A-Za-z]{2})(?=[-_]|$)/.exec(L[i]);if(m){f=${JSON.stringify(FAHRENHEIT_REGIONS)}.indexOf(m[1].toUpperCase())>=0;break}}}
if(!f)return;var n=document.querySelectorAll('[data-c]');for(var j=0;j<n.length;j++)n[j].textContent=String(Math.round(Number(n[j].getAttribute('data-c'))*9/5+32));
var b=document.querySelectorAll('[data-units-toggle]');for(var k=0;k<b.length;k++)b[k].textContent='\\u00b0F'}catch(e){}})()`;

/**
 * 首屏内联脚本：页面是缓存的（最多半小时前生成），在首次绘制前先把已经过去的小时藏起来、
 * 把"现在"标到正确的一格，避免 app.js 加载后逐小时列表整体左移/上移（CLS）。
 * 规则和 client/main.ts 的 applyTime 一致；app.js 之后会再处理一遍（结果相同）。
 */
export const EARLY_TIME_SCRIPT = `(function(){try{var now=Date.now();
function run(list){var l0=list[0].querySelector('[data-hour-label]'),label=l0?l0.textContent:'',past=0;for(var i=0;i<list.length;i++){var t=Date.parse(list[i].getAttribute('data-time')||'');if(isNaN(t)||t+36e5>now)break;past++}
if(!past)return null;for(var j=0;j<past;j++)list[j].hidden=true;var cur=list[past];
if(cur&&Date.parse(cur.getAttribute('data-time')||'')<=now){cur.setAttribute('data-now','');var el=cur.querySelector('[data-hour-label]');if(el&&label)el.textContent=label}
if(label){var f=list[0].querySelector('[data-hour-label]');if(f)f.textContent=f.getAttribute('data-hour-label')}
return cur?(cur.getAttribute('data-time')||'').slice(0,16):null}
var strips=document.querySelectorAll('.hours');for(var k=0;k<strips.length;k++){var hs=strips[k].querySelectorAll('.hour:not(.sunev)');if(!hs.length)continue;
var first=run(hs);
if(first){var ev=strips[k].querySelectorAll('.hour.sunev');for(var m=0;m<ev.length;m++)if((ev[m].getAttribute('data-time')||'')<first)ev[m].hidden=true}}
var rows=document.querySelectorAll('.row[data-time]');if(rows.length)run(rows)}catch(e){}})()`;
