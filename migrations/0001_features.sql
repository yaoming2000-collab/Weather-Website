-- 第 3 步：猜一猜计数和排行榜数据（Cloudflare D1）
-- 执行：npx wrangler d1 migrations apply weather-features --remote

-- 猜一猜：按"城市 + 当地日期"计数，三个计数器。保留 7 天（定时任务每天清理）。
CREATE TABLE IF NOT EXISTS guesses (
  city_id TEXT NOT NULL,
  date    TEXT NOT NULL,          -- 城市当地日期 YYYY-MM-DD
  colder  INTEGER NOT NULL DEFAULT 0,
  same    INTEGER NOT NULL DEFAULT 0,
  warmer  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (city_id, date)
);
CREATE INDEX IF NOT EXISTS guesses_date ON guesses (date);

-- 全球最反常城市：每个城市一行，记录最近一次算出的今日偏差。
-- 只记录有人访问过的城市（生成页面时顺便写入），不额外调用 Foreca。
CREATE TABLE IF NOT EXISTS anomalies (
  city_id      TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  country      TEXT,
  date         TEXT NOT NULL,     -- 城市当地日期
  delta_max    REAL NOT NULL,     -- 今天预报最高温 − 往年同日平均最高温（°C）
  max_temp     REAL NOT NULL,
  avg_max_temp REAL NOT NULL,
  level        TEXT NOT NULL,
  updated_at   INTEGER NOT NULL   -- 写入时间（毫秒）
);
CREATE INDEX IF NOT EXISTS anomalies_updated ON anomalies (updated_at);
