/**
 * Core Web Vitals 真实用户数据（LCP、INP、CLS，另加 FCP、TTFB 方便排查）。
 * 每个指标在页面隐藏或离开时上报一次，推到 dataLayer（GTM / GA4 都能读），页面上有 gtag 时也直接发 GA4 事件。
 * GA4 里看：事件名 web_vitals，参数 metric_name / metric_value / metric_rating / metric_target / page_type。
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function targetOf(m: Metric): string {
  const a = (m as { attribution?: object }).attribution as { target?: string; largestShiftTarget?: string; interactionTarget?: string };
  return (a.target ?? a.largestShiftTarget ?? a.interactionTarget ?? '').slice(0, 100);
}

export function reportWebVitals(pageType: string) {
  const send = (m: Metric) => {
    const params = {
      metric_name: m.name,
      // CLS 是小数，GA4 的数值参数按整数统计更方便，所以乘 1000
      metric_value: Math.round(m.name === 'CLS' ? m.value * 1000 : m.value),
      metric_rating: m.rating,
      metric_id: m.id,
      metric_target: targetOf(m),
      page_type: pageType,
    };
    try {
      (window.dataLayer = window.dataLayer || []).push({ event: 'web_vitals', ...params });
      window.gtag?.('event', 'web_vitals', { ...params, non_interaction: true });
    } catch {
      // 统计失败不影响页面
    }
  };
  onLCP(send);
  onINP(send);
  onCLS(send);
  onFCP(send);
  onTTFB(send);
}
