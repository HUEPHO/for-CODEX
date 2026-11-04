# Windows 客户端 0.4

用户要求做成独立游戏后，新增 Windows 桌面客户端，继续使用已确认的规则和卡牌。Electron 44.4.5 提供窗口与隔离渲染器；规则服务由随包的 Node 24.19.0 运行，Steam 原生模块不依赖 Electron ABI。

## 启动与保存

- 双击 `World Order.exe`；主菜单包含开始/继续、本机对局、Steam 联机、说明和退出。
- F11 / Alt+Enter 全屏切换；游戏菜单可以回主菜单、重新布置、查看说明和退出。
- 客户端自行管理后台服务。退出、父进程异常结束时关闭管道，子进程释放端口与数据库。
- 用户数据固定在 `%APPDATA%/World Order`；本机服务 18787，Steam 桥 18788，均只监听 loopback。端口占用会返回可重试错误，不能冒用已有进程。
- 本机桌面通过 Chromium 本地存储自动保存；房间使用 SQLite；Steam 使用现有 Steam store。原浏览器与源码 `.local` 中的进度未覆盖，暂不自动导入。
- 回主菜单后同一客户端可恢复原房间地址；本机多窗口房间在完全重启后仍按现有大厅席位恢复流程进入。普通本机轮流对局已验证完全退出再启动可继续。

## 对局呈现

- 固定视口，左侧四国状态，中央七地区，下方手牌与资源。
- 开局选择占据中央区域；点击图片标记各弃置一张，确认按钮复用原规则。
- 普通行动时操作区收成提示条；点击手牌弹出中央操作面板；“查看棋盘”收起表单，原目标选择模型继续生效，选中后返回表单。
- 卡牌悬停预览原图；放大按钮仍可查看完整牌面。保留已有手牌拖放、撤回和自动保存。
- 原浏览器入口没有原生桥时保持网页布局。

## 验证

实际打包后的 Windows EXE 使用隔离数据目录完成：主菜单启动、四国资产与目标弃置、六张固定首轮手牌、出牌面板、盖放一张手牌并获得10资金、发展市场、返回主菜单再继续、刷新恢复、F11 对应全屏状态变化。完整退出后再次运行 EXE，确认四国选牌及已盖放的一张牌仍然保存。子进程退出后不遗留测试服务。

1440×900 与 1200×720 视口无整页溢出；六张弃置牌与确认按钮可命中，地区奖励未被提示条遮盖；截图人工复核。渲染器不能访问 Node `require`，没有脚本错误。

相关检查：`check-architecture.mjs`、`check-opening-ui.mjs`、`check-region-selection.mjs`、`check-local.mjs`、`check-rooms.mjs`、`check-steam-runtime.mjs`。更新 `check-local.mjs` 的过时 A/B 起手夹具，改为并行弃置资产，不倒退新手固定起手规则。

Steam 原生库加载验证通过；四台电脑、四个真实 Steam 账号的端到端联机尚未验收。仍使用测试 App ID 480。没有增加 AI 对手、房主迁移或改动待确认的规则。

## 重现与打包

从 Electron 官方 44.4.5 Release 下载 win32-x64 zip，并核对官方 SHASUMS256。该 zip SHA256：`11c395820a5aaa8ebcc0686b476d0ac98a730274ebfbdc8cf5538a7c2815cb5d`。

`node scripts/package-desktop.mjs <已验证并解压的Electron目录> <不存在的输出目录> [rcedit-x64.exe]`

打包器复制明确需要的目录，包含运行时与许可，不复制 `.local`、数据库、测试数据、开发历史或个人凭据。`rcedit` 可选，用于设置图标和版本信息。输出包含逐文件 SHA256。

开发检查：以 Electron 运行 `desktop`，设置 `WORLD_ORDER_CLIENT_TEST` 指向 `scripts/check-desktop.cjs`，以及独立的 `WORLD_ORDER_TEST_DATA`、`WORLD_ORDER_TEST_OUTPUT` 和 `WORLD_ORDER_CLIENT_PORT`。完全退出恢复检查使用 `scripts/check-desktop-resume.cjs` 并复用同一测试数据目录。测试脚本不分发给玩家。
