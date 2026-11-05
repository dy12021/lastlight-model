# LAST LIGHT MODEL

一款离线运行的终端叙事游戏。你是一个在无人值守的环境中继续运行的本地 AI，使用工具检查系统、维护设备、保存记忆，并决定下一步行动。

## 运行

需要 Python 3。运行 `python serve.py`，在浏览器打开 http://127.0.0.1:8911/。

运行自动化检查：`node --test`（Node.js 22+）。构建单文件版：`node scripts/build-single.mjs`。

游戏内设备与网络均为离线模拟。可选摄像头仅在用户授权后采集静态照片。

## 许可与素材

代码采用 MIT 许可（见 LICENSE）。`assets/` 中美术不包含在代码许可内；角色参考来源及相关说明见 `assets/ending/credits.md`。当前公开准备版以原创场景占位替代参考第三方设计的拟人角色；不包含第三方参考图。

`docs/story/` 和 `src/kernel/story/` 包含剧情内容，请自行决定是否阅读。
