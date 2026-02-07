# 竞赛规划看板（V2）

目标：在可免费部署到 Cloudflare Pages 的前提下，将竞赛统一为「时间点里程碑」，并提供两种视图：
- 列表视图（议程事件流）
- 日历视图（仅 月/周）

## 原型

- V2 Stitch 原型（从 `看板原型V2.zip` 提取）：`prototype/v2/`
- 旧原型：`prototype/stitch/`

## 本地开发

### 1) 仅前端（推荐，离线种子数据）

```bash
npm install
npm run build:seed
npm run dev
```

说明：
- `npm run dev` 不依赖 Pages Functions；会自动读取 `public/data/competitions.seed.json` 作为离线兜底数据。
- 在无 `/api/*` 的情况下，编辑保存会写入本地 `localStorage`（仅本机有效）。

### 2) 带 Pages Functions + D1（可选）

1. 初始化 D1 表

```bash
npx wrangler d1 execute <你的DB名> --file=db/schema.sql
```

2. 生成并导入竞赛种子

```bash
npm run build:seed
npx wrangler d1 execute <你的DB名> --file=db/seed_competitions.sql
```

3. 本地跑 Pages（Functions + 静态站点）

```bash
npm run build
npx wrangler pages dev dist --d1 DB=<你的DB名>
```

提示：`npm run dev`(Vite) 和 `wrangler pages dev` 是两条不同的本地开发路径。

## 数据模型（前后端一致）

每条竞赛字段：
- `id` (string)
- `name` (string)
- `registration_deadline_at` (`YYYY-MM-DD`，必填)
- `submission_deadline_at` (`YYYY-MM-DD | null`)
- `result_deadline_at` (`YYYY-MM-DD | null`)
- `included_in_plan` (boolean)
- `registered` (boolean)
- `status_text` (string，可空)
- `team_members` (string[]，JSON 数组)
- `links` (`{title:string,url:string}`[]，JSON 数组，可为空)

派生（不入库）：
- `is_missed_registration`: `registration_deadline_at < today` 且 `registered=false`

## CSV 清洗/导入

输入（仓库根目录，文件名以 `final` 结尾）：
- `active_competitions_final.csv`
- `archive_missed_competitions_final.csv`

运行：

```bash
npm run build:seed
```

输出：
- `public/data/competitions.seed.json`（前端离线兜底）
- `db/seed_competitions.sql`（D1 种子）
- `reports/competitions.import.report.json`（清洗/修正/跳过/冲突报告）

导入规则摘要：
- 日期统一为 `YYYY-MM-DD`（若是 ISO datetime，会截取前 10 位）
- 若报名截止缺失，会回退到提交截止/结果公布；三者全缺失则跳过并记录在报告
- 去重：按 `sha1(name|registration_deadline_at)` 生成稳定 `id`，重复会合并并记录

## AI 助手（GLM）

Pages 环境变量/密钥：
- `GLM_API_KEY`（必填）
- `GLM_MODEL`（默认：`glm-4.7-flash`）
- `GLM_API_BASE_URL`（默认：`https://open.bigmodel.cn/api/paas/v4/chat/completions`）

可选（联网搜索）：
- `BOCHA_API_KEY`

说明：
- 默认上下文仅包含「有效竞赛」（排除 missed）；可在面板中切换“包含已错过”
- AI 返回“行动卡片”，用户确认后才会写入看板（调用 `/api/competitions/:id`）
- AI 不会真实报名/提交

## 部署到 Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`
- D1 binding: `DB`（见 `wrangler.toml`）

## 自测清单

1. `npm run dev`：能展示离线种子数据，不是空白页
2. 响应式：任意宽度无控件溢出；主内容区域内滚动；页面不无限变长
3. 视图：仅列表 + 日历（月/周），切换正常
4. missed：`报名截止 < 今天 && registered=false` 被判定为 missed，默认隐藏，可切换显示
5. 列表分组：overdue/today/this week/this month/later
6. 抽屉：打开/关闭（Esc、遮罩点击）、`?open=<id>` 深链接；编辑校验与保存
7. 日历：月格点击进入周视图；周视图 7 列全天事件
8. AI：可发送消息；能展示行动卡片；确认后更新 UI（有 Functions+D1 时写入 DB）
9. `npm run build`：构建通过

