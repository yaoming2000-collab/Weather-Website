/**
 * 往年对比的分享卡片：浏览器里用 canvas 画一张 1080×1350 的图，调用系统分享；不支持时下载图片。
 */

export interface ShareCard {
  city: string;
  /** 已经换算好单位、填好数字的结论，例如 "Today is 6° warmer than usual" */
  verdict: string;
  color: string;
  dateLabel: string;
  site: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  // 有空格的语言按词换行，中文、日文、泰文等按字换行
  const units = /\s/.test(text) ? text.split(/(\s+)/) : Array.from(text);
  const lines: string[] = [];
  let line = '';
  for (const u of units) {
    const test = line + u;
    if (ctx.measureText(test.trim()).width > maxWidth && line.trim()) {
      lines.push(line.trim());
      line = u.trimStart();
    } else {
      line = test;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export async function drawCard(card: ShareCard, rtl: boolean): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d3b74');
  bg.addColorStop(1, '#4f86d9');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 等级颜色的光晕
  const glow = ctx.createRadialGradient(W * 0.78, H * 0.22, 10, W * 0.78, H * 0.22, 620);
  glow.addColorStop(0, `${card.color}cc`);
  glow.addColorStop(1, `${card.color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const font = 'system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const x = rtl ? W - 96 : 96;

  ctx.globalAlpha = 0.8;
  ctx.font = `500 44px ${font}`;
  ctx.fillText(card.dateLabel, x, 120);
  ctx.globalAlpha = 1;
  ctx.font = `700 96px ${font}`;
  ctx.fillText(card.city, x, 186, W - 192);

  ctx.font = `600 84px ${font}`;
  const lines = wrap(ctx, card.verdict, W - 192).slice(0, 5);
  lines.forEach((l, i) => ctx.fillText(l, x, 520 + i * 104));

  // 底部色条 + 网站名
  ctx.fillStyle = card.color;
  ctx.fillRect(rtl ? W - 96 - 160 : 96, H - 210, 160, 14);
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.85;
  ctx.font = `500 40px ${font}`;
  ctx.fillText(card.site, x, H - 160);
  ctx.globalAlpha = 1;

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export async function shareOrDownload(blob: Blob, fileName: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
