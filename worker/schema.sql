-- 云端采集 Worker 的 D1 schema
-- 应用：npx wrangler d1 execute mnemo --remote --file=worker/schema.sql
-- 词典数据由 scripts/sync-dict.ts 导入（不要手写 dict 行）。

CREATE TABLE IF NOT EXISTS dict (
  word        TEXT PRIMARY KEY,
  phonetic    TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL,
  -- JSON 数组：ECDICT 的变形（concerns → concern），用于反查
  forms       TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS dict_forms (
  form TEXT PRIMARY KEY,
  word TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dict_forms_word ON dict_forms (word);

-- 待收录内容：Mnemo 拉到并写入本地后立即删除，不做云端留档
CREATE TABLE IF NOT EXISTS inbox (
  id        TEXT PRIMARY KEY,
  word      TEXT,
  meaning   TEXT,
  sentence  TEXT,
  createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS inbox_created ON inbox (createdAt);
