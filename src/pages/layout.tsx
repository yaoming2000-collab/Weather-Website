import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import type { Lang } from '../i18n/languages';
import { textDirection } from '../i18n/languages';
import { CLIENT_SCRIPT } from './clientScript';

const CSS = `
:root{--bg:#141a2e;--card:rgba(255,255,255,.07);--line:rgba(255,255,255,.12);--fg:#f3f5fb;--mut:#a9b1c7;--acc:#7aa7f5;--warm:#f59e5b;--cool:#6cb6ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans",sans-serif}
main{max-width:560px;margin:0 auto;padding:16px 16px 48px}
.dev{background:#3b2f12;color:#fbd38d;font-size:12px;padding:6px 16px;text-align:center}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:12px 0}
h1{font-size:22px;margin:8px 0 0}.sub{color:var(--mut);font-size:13px}
.hero{display:flex;align-items:center;gap:12px}.hero img{width:84px;height:84px}.temp{font-size:56px;font-weight:300;line-height:1}
.tag{display:inline-block;border-radius:999px;padding:3px 10px;font-size:13px;margin-top:8px;background:var(--line)}
.tag.warm{background:rgba(245,158,91,.2);color:#ffc89e}.tag.cool{background:rgba(108,182,255,.2);color:#b8dcff}
.h{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}.h div{min-width:52px;text-align:center;font-size:13px;border-radius:10px;padding:6px 2px}
.h img{width:32px;height:32px}.h [data-now]{background:var(--line)}
.d{display:grid;grid-template-columns:4.5em 36px 1fr auto;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--line)}
.d:first-of-type{border-top:0}.d img{width:30px;height:30px}.d[data-today] .wd{font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.grid div{background:var(--card);border-radius:10px;padding:8px 10px}
.grid b{display:block;font-size:18px;font-weight:600}.mut{color:var(--mut)}
.bars{display:flex;align-items:flex-end;gap:4px;height:48px}.bars span{flex:1;background:var(--acc);border-radius:3px 3px 0 0;min-height:2px}
h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin:0 0 8px}
a{color:var(--acc)}footer{color:var(--mut);font-size:12px;text-align:center;margin-top:24px}
`;

export function Layout(props: { lang: Lang; title: string; devNote?: string; children?: Child }) {
  return (
    <html lang={props.lang} dir={textDirection(props.lang)}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{props.title}</title>
        <style>{raw(CSS)}</style>
      </head>
      <body>
        {props.devNote ? <div class="dev">{props.devNote}</div> : null}
        <main>{props.children}</main>
        <script>{raw(CLIENT_SCRIPT)}</script>
      </body>
    </html>
  );
}
