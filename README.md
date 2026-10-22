# WEIMAR 电子版

桌游 The Weimar Republic 的电子版。项目代码在 [`weimar/`](weimar/)，当前为0.11版：三个时代的151个事件、3种选举牌面和四个历史剧本已接入；包含Steam Lobby桌面联机、玩家席位和私有手牌同步；默认界面现为原版棋盘与独立动态棋子。保留浏览器热座、教程与牌效实验局。联机代码和模拟验证已完成，真实Steam双机验收待进行。

## 在另一台电脑继续开发

安装 Git、Node.js 24或更新版本，以及 pnpm 11.25.0，然后执行：

```powershell
git clone https://github.com/HUEPHO/for-CODEX.git
cd for-CODEX/weimar
pnpm install --frozen-lockfile
pnpm dev
```

如果尚未安装pnpm，可先运行 `npm install --global pnpm@11.25.0`。开发页面地址通常为 http://127.0.0.1:5173/。

在Codex或其他编辑器中打开整个 `for-CODEX` 目录。源代码、卡牌及地图素材、规则参考文本、依赖锁文件都随仓库提供；启动项目不需要原电脑的Downloads文件夹，也不需要重新导入TTS素材。`node_modules`、`dist`、测试输出及大幅参考图片按需在本机生成。

```powershell
# 每次开始工作前（先确保没有未提交改动）
git pull --ff-only

# 在 weimar 目录中验证
pnpm test
pnpm build

# 完成改动后检查、提交、同步
git status
git add <本次修改的文件>
git commit -m "说明本次改动"
git push
```

首次在家里的电脑提交时，需要配置自己的Git提交姓名、邮箱；首次推送时通过GitHub认证。两台电脑交替工作时，离开前提交并推送，开始前拉取。

浏览器中的对局存档不会随Git同步；如果还要继续某一局游戏，请在原浏览器导出存档，再在另一台电脑导入。联机对局则由原房主导出完整联机存档，在另一台电脑登录同一Steam账号后导入建房。

## Steam联机

安装并登录Steam后，在`weimar`目录运行：

```powershell
pnpm desktop
# 可选：生成Windows桌面包
pnpm desktop:pack
```

目前使用开发测试AppID **480**（Steam示例游戏的编号）。房主创建房间，通过Steam邀请或房间ID加入；四个阵营选好并准备后开始，一人可以控制多个阵营。双机测试需要两个不同Steam账号，完整步骤与当前限制见[Steam联机说明](weimar/docs/steam-multiplayer-0.8.md)。

## 棋盘界面

默认棋盘沿用原版中文底图，使用原版 token 贴图，根据游戏状态独立摆放；白色棋子和黑色方块沿用实物形状。支持点地区查看／选目标、缩放、专注棋盘。点击阵营名称打开原版玩家垫板，查看动态立场／团结、可用与待解锁库存。见[0.10玩家区说明](weimar/docs/player-mats-0.10.md)和[0.9界面说明](weimar/docs/tabletop-ui-0.9.md)。

## 接着做什么

- [开发交接说明](weimar/docs/development-handoff.md)：当前进度、未完成范围和规则解释。
- [项目说明](weimar/README.md)：代码入口、实验局和来源。
- [完整战役实现说明](weimar/docs/campaign-0.6.md)：时代切换、留牌惩罚、最终结算与验证。
- [历史剧本实现说明](weimar/docs/scenarios-0.7.md)：革命时代、新希望、黑日升起的布局及特殊规则。
- [Steam联机说明](weimar/docs/steam-multiplayer-0.8.md)：桌面启动、建房、私有状态同步、断线恢复与双机验收。
- [衰落时代实现说明](weimar/docs/batch-113-151.md)：最新39张卡的实现与规则口径。

游戏及素材权利归各自权利人。
