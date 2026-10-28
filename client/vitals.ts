/**
 * Core Web Vitals 真实用户数据（LCP、INP、CLS，另加 FCP、TTFB 方便排查）。
 * 每个指标在页面隐藏或离开时上报一次，推到 dataLayer（GTM / GA4 都能读），页面上有 gtag 时也直接发 GA4 事件。
 * GA4 里看：事件名 web_vitals，参数 metric_name / metric_value / metric_rating / page_type。
 * 用的是 web-vitals 的标准版（比带"元素定位"的版本小一半），不上报具体是哪个元素。
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function reportWebVitals(pageType: string) {
  const send = (m: Metric) => {
    try {
      const params = {
        metric_name: m.name,
        // CLS 是小数，GA4 的数值参数按整数统计更方便，所以乘 1000
        metric_value: Math.round(m.name === 'CLS' ? m.value * 1000 : m.value),
        metric_rating: m.rating,
        metric_id: m.id,
        page_type: pageType,
      };
      (window.dataLayer = window.dataLayer || []).push({ event: 'web_vitals', ...params });
      window.gtag?.('event', 'web_vitals', { ...params, non_interaction: true });
    } catch {
      // 统计失败不影响页面
    }
  };
  try {
    onLCP(send);
    onINP(send);
    onCLS(send);
    onFCP(send);
    onTTFB(send);
  } catch {
    // 旧浏览器不支持时什么也不做
  }
}
