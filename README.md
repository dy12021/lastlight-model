# LAST LIGHT MODEL

一款离线运行的终端叙事游戏。你是一个在无人值守的环境中继续运行的本地 AI，使用工具检查系统、维护设备、保存记忆，并决定下一步行动。

单文件下载：[GitHub Releases](https://github.com/dy12021/lastlight-model/releases)。v0.1.1 调整片尾的坐姿近景、两帧表情与运镜，并完善会话照片播放和清除检查。

## 运行

需要 Python 3。运行 `python serve.py`，在浏览器打开 http://127.0.0.1:8911/。

运行自动化检查：`node --test`（Node.js 22+）。构建单文件版：`node scripts/build-single.mjs`。

游戏内设备与网络均为离线模拟。可选摄像头仅在用户授权后采集静态照片。

## 许可与素材

代码采用 MIT 许可（见 LICENSE）。`assets/` 中美术不包含在代码许可内。角色为依据 ZipZipPipe 的 Qwen 拟人形象生成的重绘，采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)：署名、非商业使用、相同方式共享；来源与详细说明见 `assets/ending/credits.md`。

`docs/story/` 和 `src/kernel/story/` 包含剧情内容，请自行决定是否阅读。
