-- PR #6：Foreca 调用统计（按 UTC 日期）。用来估算每月调用量和费用。
-- 执行：npx wrangler d1 migrations apply weather-features --remote

-- 每天每类接口的调用次数。ok = 1 成功（计费），0 失败（不计费）。
CREATE TABLE IF NOT EXISTS usage_daily (
  date  TEXT NOT NULL,     -- UTC 日期 YYYY-MM-DD
  kind  TEXT NOT NULL,     -- cur 实况、hr 逐小时、day 15 天、aq 空气质量、clid/clim 往年、nc 降雨时间轴、loc/near 地点、search 搜索
  ok    INTEGER NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, kind, ok)
);

-- 每天有调用的不同城市（用来看"同时活跃多少个城市"）。保留 40 天。
CREATE TABLE IF NOT EXISTS usage_cities (
  date    TEXT NOT NULL,
  city_id TEXT NOT NULL,
  PRIMARY KEY (date, city_id)
);
