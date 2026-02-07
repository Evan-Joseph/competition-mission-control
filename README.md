# 竞赛作战面板

本仓库用于实现团队内部的“竞赛作战面板”（甘特图 + 规划助手 + AI 助手）。

## 原型

Stitch 导出的原型已解压在 `prototype/stitch/`（含 3 个页面的 `code.html` 与 `screen.png`）。

## 前端（Vite + React + TS）

当前实现采用 Vite + React + TypeScript + Tailwind（审美参考 Stitch）。

本地开发：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

产物目录：`dist/`（不会提交到 git）。

提示：这是单页应用（SPA），已通过 `public/_redirects` 配置路由回退。

## Cloudflare Pages（前端 + Functions）部署要点

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`（默认）

## D1 数据库初始化

本项目默认使用 D1（SQLite）做共享存储（成员/竞赛/进展）。你需要在 Cloudflare 创建 D1 并绑定为 `DB`。

推荐用 `wrangler` 初始化：

```bash
# 安装（仓库内已包含 wrangler 依赖）
npm install

# 1) 建表
npx wrangler d1 execute <你的DB名> --file=db/schema.sql

# 2) 种子数据：成员（默认 5 人）
npx wrangler d1 execute <你的DB名> --file=db/seed_members.sql

# 3) 种子数据：竞赛（由 CSV 生成）
npx wrangler d1 execute <你的DB名> --file=db/seed_competitions.sql
```

## 竞赛数据更新

源数据：`竞赛候选清单_满足条件.csv`

重新生成竞赛种子数据与站点预览 JSON：

```bash
python3 scripts/build_competitions_seed.py
```

产物：
- `db/seed_competitions.sql`
- `public/data/competitions.seed.preview.json`（仅用于前端离线/无 DB 时的兜底展示）

## AI 助手配置（GLM）

Pages 环境变量/密钥：
- `GLM_API_KEY`（必填）
- `GLM_MODEL`（默认：`glm-4.7-flash`）
- `GLM_API_BASE_URL`（默认：`https://open.bigmodel.cn/api/paas/v4/chat/completions`）

可选（联网搜索，供 AI 引用）：
- `BOCHA_API_KEY`（博查搜索 Bocha Web Search）

## 数据

当前竞赛数据（CSV）在仓库根目录，后续会根据选定技术栈迁移成可维护的数据源与同步流程。
