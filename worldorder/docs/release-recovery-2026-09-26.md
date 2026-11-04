# 0.6 成品与恢复验收

{
  "commandDiagnosis": {
    "completedAt": "2026-09-26 00:58:51 +08:00",
    "exitCode": 0,
    "durationMs": 221,
    "hereStringClosed": true,
    "pythonDashMeansStdin": true,
    "stalePythonOrPowerShellFound": false
  },
  "existingTests": {
    "ui": "ui6-owned-qa-3: passed",
    "trade": "trade6-qa-9: passed",
    "permissions": "viewer-permission-audit-final: 21 passed"
  },
  "first": {
    "stage": "first",
    "checks": [
      "Packaged 0.6.0 starts with existing save and Continue enabled",
      "Existing completed setup and played card restored",
      "Return to menu, Continue and reload preserve the entire session"
    ],
    "passed": true,
    "saveSha256": "235dd420f9a34e2e3a53d7c3d08f558dc0d81c4349bbd777e65a38a550d4a61b",
    "servicePids": [
      17956
    ],
    "appPid": 17512
  },
  "restart": {
    "stage": "restart",
    "checks": [
      "Packaged 0.6.0 starts with existing save and Continue enabled",
      "Existing completed setup and played card restored",
      "Entire persisted session identical after full app/service process restart",
      "Return to menu, Continue and reload preserve the entire session"
    ],
    "passed": true,
    "saveSha256": "235dd420f9a34e2e3a53d7c3d08f558dc0d81c4349bbd777e65a38a550d4a61b",
    "servicePids": [
      39384
    ],
    "appPid": 29484
  },
  "verifiedPackageFiles": 678,
  "userSaveModified": false
}

成品：`C:/Users/fhs/Documents/Codex/2026-09-26/referenced-chatgpt-conversation-this-is-an/outputs/WorldOrder-Windows-0.6`。使用已完成开局并打出一张牌的测试存档副本，未读写用户 APPDATA 存档；未重新执行已通过的 UI/贸易/权限专项。首次脚本等待导航 IPC 返回而超时，改用现有菜单按钮后两次通过，无游戏代码修改。
