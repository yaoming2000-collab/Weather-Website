-- 2026-10-28：往年对比改为"和去年同一天比"，并定下每个城市每天的答案（连续猜对天数用）
-- 执行：npx wrangler d1 migrations apply weather-features --remote

-- 每个城市每天第一次算出的对比结果（JSON，TodayComparison）。之后所有人都按这条判断猜对没有。保留 7 天。
CREATE TABLE IF NOT EXISTS daily_comparisons (
  city_id TEXT NOT NULL,
  date    TEXT NOT NULL,      -- 城市当地日期 YYYY-MM-DD
  data    TEXT NOT NULL,
  PRIMARY KEY (city_id, date)
);
CREATE INDEX IF NOT EXISTS daily_comparisons_date ON daily_comparisons (date);

-- 排行榜以前按"和 30 年平均比"算，口径不同，清空重新记录（avg_max_temp 列以后存的是去年同一天的最高温）
DELETE FROM anomalies;
