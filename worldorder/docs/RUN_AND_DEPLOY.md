# 本地运行、验证与部署交接

Steam 最新实现、启动和验证边界见 [Steam 四人客户端](steam-networking-2026-09-17.md)。

## 便携入口：无需安装依赖

使用 Node.js 24，在项目根目录运行：

```sh
node --version
npm run dev:local
```

`--version` 显示 Node 版本。浏览器访问终端打印的 `http://127.0.0.1:8787`。该启动器使用 Node 自带 SQLite 和现有生产房间 API；不需要 Steam、云服务授权或 npm 依赖。SQLite 实验特性提示不等于启动失败。

创建房间后，用大厅中另外三个势力的链接打开独立标签页入座，房主开始。每个标签页固定扮演自己的势力；本地热座的势力切换不等于房间席位。刷新会恢复，关闭标签页不会自动释放席位；显式接管会使原标签页失去席位。

本地房间位于 `.local/rooms.sqlite`。按 Ctrl+C 停止，重启后保留；备份时先停止服务，再复制整个 `.local/`。本包不含现有数据库、测试局面或个人存档。

端口占用时，Bash 使用 `WORLD_ORDER_PORT=8788 npm run dev:local`。PowerShell 中先执行 `$env:WORLD_ORDER_PORT=8788`，再运行启动命令。这是设置本次服务端口；始终使用终端给出的 `127.0.0.1` 地址。

## Vite 开发入口

v26 已提供常规 Vite 开发服务：

```sh
npm ci
npm run dev
```

`npm ci` 按锁文件安装依赖。随后打开终端给出的本机地址。Vite 直接服务手写 `dist/` 源码，房间中间件仍调用 `server/index.js`，本地数据库适配在 `scripts/development-db.mjs`。它和便携入口使用相同开发身份、迁移和本地数据库；选择一种入口运行即可。不同端口属于不同浏览器来源，席位令牌不会自动共享。

若在受管 Sites 环境开发，遵守该环境的 Sites 技能与预览入口，不绕开其受监督服务启动流程。包内便携入口用于普通本机/Codex 工作区。

页面不能通过 `file://` 或只有静态文件的服务器完整使用，因为联机房间需要同源 `/api/rooms`。

## 选择必要检查

| 命令 | 范围 |
| --- | --- |
| `npm run test:local` | 便携 HTTP 服务、四席、并行开局、隐私和 SQLite 重启恢复 |
| `npm run test:rooms` | 房间处理器、API/SQLite、四份客户端、并发/去重/席位权限 |
| `npm run test:room-game` | 基础版与扩展版完整六轮房间命令与四方视图 |
| `npm run test:flow` | 六轮纯状态流程 |
| `npm test` | 早期状态回归，并非全部规则总集 |

上述检查使用 Node.js 24 内建能力，无需先装 npm 包；按修改范围选择，不需要每次全部运行。各专用卡牌/机制脚本在 `scripts/`。

需要本地第三/六轮计分前的复核局面时，可运行 `node scripts/check-room-game.mjs .local/review-positions`；位置参数指定输出目录。它只生成独立状态文件，不会自动修改任何房间，也不代替真实浏览器验收。

## 构建与原托管

```sh
npm ci
npm run build
```

生产构建使用 `scripts/build.mjs`，不是 Vite build；生成 `dist/client/`、`dist/server/index.js` 和 `dist/.openai/`。**`dist/` 根目录及素材是源码，不能先清空。**

- 原站点：[World Order 联机桌面](https://world-order-table.dtyppp.chatgpt.site)
- Sites 项目：`appgprj_6aa685cfed148191a0adfd291d4cb2d5`
- 最近发布：v26；完整提交 `24578a87a22068ead4a97eeddd7746e99d51ce38`
- 生产入口：`server/index.js`；静态绑定 `ASSETS`，数据库绑定 `DB`
- 托管配置保留同一项目身份；现有访问范围保持不变。

压缩包不授予云端访问权限，也不携带凭据。要更新原站点，使用有该项目权限的 Sites 环境与既有发布流程；本次整理没有重新部署。换平台需要适配可信身份、静态托管、持久数据库和迁移，直接上传静态目录不能代替房间服务。

只有数据库结构实际变化时才运行 `npm run db:generate` 生成新迁移。不要改写已用于原站点的 `0000_nebulous_mercury.sql`；本地启动器按迁移日志应用新迁移，生产迁移遵循原托管流程。

两个本地入口使用固定开发账号，保留令牌、席位、Origin、版本和规则验证，仅用于开发。便携入口只监听 `127.0.0.1` 并校验 Host。生产仍由可信托管层提供身份，不可相信浏览器提交的用户 ID。

## 常见接手问题

| 现象 | 处理 |
| --- | --- |
| 找不到 `node:sqlite` / 不支持 JSON import | 使用 Node.js 24 |
| 便携服务拒绝 localhost | 用打印出的 `127.0.0.1` 地址，Host 校验按该地址执行 |
| 房间接口返回 HTML / 404 | 启动上述任一完整入口，不能只有静态服务 |
| 某标签页不能操作 | 核对当前行动/回应玩家，以及是否已被接管 |
| 看不到他人手牌或目标 | 正常信息隔离；已选战略资产应公开 |
| 旧记录说未联网或无浏览器检查 | 阅读最新 `HANDOFF_STATUS.md` 和浏览器记录 |
| 素材导入缺 audit.json | 现有素材已齐，勿重新导入覆盖手工数据 |
