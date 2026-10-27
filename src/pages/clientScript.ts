/**
 * 页面内联的小脚本（第 1 步骨架用；第 2 步会改为 Vite 打包的前端代码）。
 *
 * 做三件事，都是因为页面会被 CDN 缓存、同一份 HTML 给所有访客：
 * 1. 把当前网址里的 session / uid / locale 补到所有站内链接上（旧站 syncNavigationLinks 的做法）。
 * 2. 按城市时区标出"今天"那一行和"现在"那一小时（不能由服务器写死，跨零点、整点会错）。
 * 3. 显示"更新于 X 分钟前"。
 */
export const CLIENT_SCRIPT = `
(function () {
  var nav = ['session', 'uid', 'locale'];
  var here = new URLSearchParams(location.search);
  document.querySelectorAll('a[data-nav]').forEach(function (a) {
    var url = new URL(a.getAttribute('href'), location.origin);
    nav.forEach(function (k) { var v = here.get(k); if (v && !url.searchParams.has(k)) url.searchParams.set(k, v); });
    a.setAttribute('href', url.pathname + (url.search || '') + url.hash);
  });

  var root = document.querySelector('[data-tz]');
  if (!root) return;
  var tz = root.getAttribute('data-tz');
  var now = Date.now();
  var parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  document.querySelectorAll('[data-date]').forEach(function (el) {
    if (el.getAttribute('data-date') === parts) el.setAttribute('data-today', '');
  });
  var hours = document.querySelectorAll('[data-time]');
  for (var i = 0; i < hours.length; i++) {
    var t = Date.parse(hours[i].getAttribute('data-time'));
    if (t + 3600000 > now) { hours[i].setAttribute('data-now', ''); break; }
  }
  document.querySelectorAll('[data-fetched]').forEach(function (el) {
    var mins = Math.max(0, Math.round((now - Number(el.getAttribute('data-fetched'))) / 60000));
    el.textContent = mins < 1 ? 'just now' : mins + ' min ago';
  });
})();
`;
