# 原始资料

以下均为用户提供的原文件，随交接包保留完整内容，不做改写：

| 文件 | 作用 |
| --- | --- |
| `World_Order_-_Rulebook_v1.0.pdf` | 基础规则书 |
| `World_Order_-_Diplomacy_&_Dominance_-_Rulebook_v1.0.pdf` | 外交与霸权（D&D）扩展 |
| `World_Order_-_World_in_Turmoil_-_Rulebook_v1.0.pdf` | 动荡世界（WIT）扩展 |
| `TS_Save_12.json` | 原始 Tabletop Simulator 存档，包含物件/卡牌和素材 URL 等来源数据 |

用户提供的 TTS Workshop 链接：https://steamcommunity.com/sharedfiles/filedetails/?id=3364430480

现有运行素材在 `../dist/assets/`；卡牌索引 `../dist/cards.json` 保留原 TTS GUID/CardID。接手核对时可先按中文卡名/原名定位卡牌 ID，再打开对应图片。用户要求不考虑自动机，即使原资料含相关章节也不在开发范围。

最早导入使用的 M1 `audit.json`、原始整张纹理缓存目录不在现存项目内。本包提供已经导出的完整运行素材；单凭 TTS JSON 不保证在外部素材 URL 失效时重建原审计结果。不要执行导入脚本覆盖后续手工校对和汉化数据。

原文件及全部源码的 SHA-256 在根目录 `MANIFEST.sha256` 中，方便验证传递后的完整性。
