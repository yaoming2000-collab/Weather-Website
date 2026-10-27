-- PR #6：排行榜按城市当地日期过滤（以前只按写入时间，昨天的城市最多会在"今天"榜上多挂 24 小时）
-- 执行：npx wrangler d1 migrations apply weather-features --remote
ALTER TABLE anomalies ADD COLUMN valid_until INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS anomalies_valid ON anomalies (valid_until);
