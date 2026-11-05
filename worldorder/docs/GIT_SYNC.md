# 固定仓库与同步

用户于 2026-11-05 指定今后使用 https://github.com/HUEPHO/for-CODEX.git 进行 push / pull。默认远端 `origin`、分支 `main`；World Order 在仓库的 `worldorder/` 下。用户提供的 `876f92f1c68a6d6936fd128ddf9f0d9e21ca6e3b` 是同步基线，不固定回退到这个旧提交。

本机工作路径为 `F:/CODEX/新WO项目组/worldorder`，Git 根为 `F:/CODEX/新WO项目组`。已设置 `main` 跟踪 `origin/main`、`pull.ff=only`，稀疏检出本项目和仓库根文件，保留远端其他项目。可以在项目目录内运行 Git 命令。

同步前检查 `git status` 并 `git fetch origin`。工作区干净且可快进时使用 `git pull --ff-only`。存在本地未提交改动或分支分叉时先保存并整合，不能覆盖用户改动或强制推送。推送源码、素材、规则记录和检查脚本；存档、运行时、临时浏览器／PPTX 构建目录、`output/` 导出产物不纳入 Git。

GitHub 连接器可用于当前账号的授权提交；普通 Git 命令使用本机自己的 GitHub 登录配置，不把连接凭据写入仓库。
