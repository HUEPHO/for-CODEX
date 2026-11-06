# 房间大厅与本地入口 · 2026-11-06

本次修复用户实际入口与当前源码错位，以及缺少独立房间大厅的问题。

- 无房号进入完整房间大厅。创建区直接显示无／基础／高级自动机三种模式、四个国旗的真人／自动机选择；无自动机模式固定四位真人。高级模式显示普通／困难难度。
- 大厅包含创建、按房号加入、最近创建、当前房间及本机对局入口。房间等待页显示模式、难度、真人与自动机席位，游戏顶部提供“返回房间大厅”。
- 大厅、当前房间、对局只是视图导航，不发送 leave/reset，不释放席位或重写存档。URL 的 screen 保留刷新位置。远端同步只更新大厅当前房间卡片，不覆盖正在编辑的创建表单。
- 大厅内不恢复本客户端的待推进游戏步骤；返回对局时继续。联机席位、费用、版本和服务端权限沿用原校验。
- Start-Local.bat 与 npm run dev:local 使用 launch-local.mjs：先核对只读 /__local-info，同目录服务可复用；其他目录或旧服务占用端口会明确报错，不再默默打开旧页面。支持被忽略的 .local/launch-config.json 指定 dataDirectory，继续使用已有数据库。

验证：check-room-navigation（真实 RoomClient/API/SQLite，三种模式、席位、导航零修改、刷新位置及自动步骤恢复）、check-local-launcher（来源识别与存档重启恢复）、check-local、check-steam-client、check-architecture 均通过。导航专项还在 Node VM 中执行实际 app.js 的 init/resumeAutomaticFlow/showRoomScreen。

本轮 Computer Use 因无法确认 Windows 浏览器 URL 而停止，未绕过限制；没有新实际界面截图或浏览器视觉验收。运行中的本地地址可直接查看新版大厅： http://127.0.0.1:8787/?screen=lobby 。此前高级自动机截图不能代表本批大厅布局。

本机运行切换已完成：8787 现在服务 D 盘项目源码，继续读取原数据库；原房间 RSP59Y 的 revision、payload 和 state 哈希均未变化，D 盘另存的数据库也未被覆盖。关键 HTTP 脚本与 D 盘源文件逐字节一致。
