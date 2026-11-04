---
title: "AW Next 与其他工具的对比"
description: "Achievement Watcher Next 与 Achievement Watcher 2.x 以及 Achievements 应用的区别，逐项功能对比。"
---

# AW Next 与其他工具的对比

Achievement Watcher Next 是 Xan105 的 Achievement Watcher 的替代品和继任者。它
可在 Windows 和 Linux 上运行，读取 Steam、GOG、Epic、Ubisoft、Xbox PC 和 Steam 模拟器的存档，可直接在应用中修复
Goldberg 或 GBE Fork 设置，并自行选择通知渠道。PSerban93 的 Achievements
是另一个活跃开发的 Windows 追踪器，而 Sentinel 仅限 Linux。

AW Next 延续了 [Xan105 的原版 Achievement Watcher](https://github.com/xan105/Achievement-Watcher)
和 [darktakayanagi 的 2.x 分支](https://github.com/darktakayanagi/Achievement-Watcher)。本页把
它与这一脉络，与另一个活跃开发的 Windows 追踪器 [Achievements](https://github.com/PSerban93/Achievements)，
以及仅限 Linux 的模拟 Steam 存档监视器 [Sentinel](https://github.com/RemakeCode/sentinel) 放在一起对比。

这四者读取成就都很出色，所以有用的问题是哪些额外功能适合你的玩法。这些表格
标明了每个项目能做什么、不能做什么。

AW Next 的部分内容源自采用 MIT 许可证的 Achievements，所以在两个项目都有标记的行中，
实现有时起源于 JokerVerse 的版本。见
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE)。

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| 平台 | Windows 和 Linux | 仅 Windows | 仅 Windows | 仅 Linux |
| 许可证 | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| 桌面运行时 | Electron 44 | Electron 44 | Electron 12 | 使用 GTK 4 和 WebKitGTK 6 的 Go |
| 开发状态 | 活跃 | 活跃（最后一次推送为 2026 年 10 月 22 日） | 2026 年 10 月 13 日归档，只读 | 活跃（v2.1.1，2026 年 10 月 11 日） |

## 成就从哪里来 {#where-the-achievements-come-from}

| 来源 | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| 官方本地游戏库 | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · 在 Linux 上：Steam、Heroic、Lutris 和 Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay（旧版） | ❌ |
| 可选的账号连接 | ✅ Steam（已拥有的游戏、家庭共享的游戏、来自你其他电脑的解锁） · Epic · Xbox（Windows） · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Steam 模拟器存档 | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · CODEX/RUNE/EMPRESS/Online-Fix/Tenoke 布局，Linux 上同样支持（Wine 前缀，Goldberg 和 GBE 为原生） | ✅ 覆盖范围相当 | ✅ Steam 模拟器 | ⚠️ Wine/Proton 前缀中的 Goldberg/GSE · CODEX · RUNE |
| 无需配置的便携版发布 | ✅ 自行读取存档目录树 | ⚠️ 手动输入 | ❌ | ⚠️ 手动添加前缀 |
| Goldberg Uplay R2（Ubisoft） | ✅ 识别加载器版本 | ❌ | ❌ | ✅ |
| Goldberg SocialClub（Rockstar / GTA） | ✅ | ❌ | ❌ | ❌ |
| 主机模拟器 | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ 仅 RPCS3 | ❌ |
| 为 PC 重新编译的 Xbox 360 游戏（ReXGlue 及类似项目） | ✅ 列表、图标、DLC 和实时解锁，60 多个已知移植版，Linux 版本 | ✅ | ❌ | ❌ |
| 移植到 PC 的 PS4 游戏 | ✅ run.py、原生和单可执行文件移植版、PROTOTYPE、PORTHEON（UFC） | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess，架构、DLC 和图标从游戏读取 | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ 导入玩过的游戏，通过 RetroArch 历史或播放列表在磁盘上找到的游戏，任何模拟器的实时解锁 | ✅ | ❌ | ❌ |
| 小众补丁 | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| 文件夹发现 | ✅ 自动配置和智能查找 | ✅ 自动配置 | ✅ 智能查找 | ⚠️ 重新扫描你添加的前缀 |
| 自定义文件夹和手动添加游戏 | ✅ 单个游戏或整个游戏库 | ✅ 单个游戏 | ⚠️ 手动配置 | ⚠️ 前缀和模拟器路径 |

AW Next 和 Achievements 现在读取的来源大致相同。AW Next 对模拟的 PC
布局覆盖得更深，并且是四者中唯一能修复 Uplay R2 和 SocialClub 存档的。

## 当游戏不报告成就时 {#when-a-game-does-not-report}

每个追踪器都能告诉你某款游戏卡在 0%。AW Next 还会尝试修复它。

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| 带引导式修复的单个游戏状态报告 | ✅ | ❌ | ❌ | ❌ |
| 安装和修复模拟器运行时 | ✅ Goldberg / GBE，包括架构 | ⚠️ 生成架构 | ❌ 手动 | ⚠️ 使用 Goldberg 分支的尽力设置 |
| 任何更改前的备份和恢复 | ✅ 另有 Steamless 和可选的 API 检查绕过 | ❌ | ❌ | ❌ |
| 重置或恢复游戏的成就 | ✅ | ❌ | ❌ | ❌ |
| 手动解锁 | ✅ | ❌ | ❌ | ❌ |
| 手动设置游戏的 AppID | ✅ | ❌ | ❌ | ❌ |
| 单个游戏的来源覆盖 | ✅ 自动 / Steam / Ubisoft | ❌ | ❌ | ⚠️ 整个游戏库只有一个数据来源 |
| 黑名单和离线名称回填 | ✅ | ⚠️ 黑名单 | ❌ | ❌ |

## 通知 {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| 渠道 | ✅ 原生 toast + 游戏内叠加层 + OBS 浏览器源 + 游戏模式下的 Steam toast（Decky 插件） | ✅ 原生 toast + 动画叠加层 | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ 桌面通知 + 游戏模式下的 Decky 插件 |
| 自行选择渠道 | ✅ 自动模式，按每个游戏的状态 | ❌ 固定选择 | ❌ 固定选择 | ❌ |
| 无需代码的预设设计器 | ✅ 14 个起点模板、实时预览、包括 Steam Original 在内的 10 个内置预设 | ⚠️ 内置预设和主题，自定义的需用 HTML/CSS 编写 | ❌ | ❌ |
| 可分享的预设 | ✅ `.awpreset` + 社区库 | ❌ | ❌ | ❌ |
| 稀有度、白金和完成度样式 | ✅ 3 级稀有度、完成度条 | ✅ 稀有度 | ❌ | ❌ |
| 按模拟器设置预设 | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| 声音 | ✅ 随机选取、FLAC/M4A/AAC | ✅ | ⚠️ 自定义文件 | ✅ 自定义声音 |
| 截图 | ✅ Windows 上支持 HDR 的捕获（BT.2408 色调映射），Linux 上在 X11 和 Wayland 下同样支持 | ✅ HDR 捕获 | ✅ | ❌ |
| 解锁的视频剪辑 | ✅ 10 到 30 秒、30/60 FPS、H.264 · HEVC · AV1、HDR 色调映射；在 Linux 上使用 gpu-screen-recorder 或内置 WebM 录制器 | ✅ 10 到 30 秒、30/60 FPS | ⚠️ 通过 OBS | ❌ |
| 游戏时长和进度通知 | ✅ 按游戏静音进度 | ✅ 按游戏静音进度 | ✅ 游戏时长 | ✅ 进度、多步骤 |
| 每个游戏自己的通知外观 | ✅ 每个游戏都可以覆盖预设、位置、声音和大小 | ❌ | ❌ | ❌ |

## 应用本身 {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| 游戏库、游戏和成就搜索 | ✅ | ✅ | ✅ | ⚠️ 游戏库排序 |
| 仅已安装筛选和游戏操作 | ✅ 筛选 · 卸载 · 恢复 | ⚠️ 平台筛选 | ❌ | ❌ |
| 完整的手柄导航 | ✅ 应用 + 叠加层，Windows 和 Linux 上 | ✅ 应用 + 叠加层 | ❌ 计划中 | ⚠️ 通过 Decky 插件 |
| Steam Deck | ⚠️ Decky 插件，尚未在真实的 Deck 上确认 | ❌ | ❌ | ✅ Gamescope 中的 Decky 插件 |
| 主题 | ✅ 内置 + 自定义编辑器 + 可分享的 `.awtheme` + 社区库 | ✅ 内置 + 用户主题文件 | ❌ | ❌ |
| 界面语言 | ✅ 内置 28 种 | ✅ 内置约 30 种 | ✅ 18 种 | ❌ |
| 后台进程 | ✅ 一个托盘守护进程 | ✅ 托盘应用 | ⚠️ 单独的 watchdog | ✅ 托盘应用 |
| 额外的运行时下载 | ✅ 无浏览器运行时；GBE 分支只在你安装或修复时获取 | ⚠️ Playwright Chromium | ✅ 无 | ⚠️ 系统中的 GTK 4 和 WebKitGTK 6 |
| 键盘和屏幕阅读器访问 | ✅ 设置、对话框和叠加层都可通过 Tab 到达，对话框关闭时焦点会返回 | ⚠️ 键盘快捷键和手柄映射 | ❌ | ❌ |
| 安装程序、卸载程序和更新窗口 | ✅ 自带安装程序和卸载程序，带发布说明和进度的更新窗口 | ❌ | ❌ | ⚠️ 发行版软件包和 Flatpak |
| 文档 | ✅ 指南、格式规范和社区库 | ⚠️ README | ⚠️ README | ⚠️ README 和 Goldberg 指南 |

## Linux 和 Steam Deck {#linux-and-the-steam-deck}

AW Next 也以原生 Linux 应用的形式发布（x64 AppImage，绝不通过 Wine）。它跟踪通过 Steam 和 Proton、
Wine、Lutris、Heroic 和 Bottles 运行的游戏以及原生 Linux 游戏，弹窗、叠加层和游戏时长
都与 Windows 上相同。Steam Deck 支持是新增的：游戏模式的通知通过仓库中的
Decky 插件发送，该插件和游戏模式弹窗都尚未在真实的 Deck 上
确认。

<sub>✅ = 支持且有文档 · ⚠️ = 部分支持、需手动或工作流程不同 · ❌ = 不可用，或
在当前公开分支上没有文档。竞品各列是对照它们公开的
README、GitHub 元数据和软件包清单，于 2026 年 10 月 22 日比较的。AW Next 一列反映的是版本
3.12.2 和 2026 年 10 月尚未发布的更改。其他列中的 ❌ 通常表示没有文档，
而不是不可能，而且这些项目发展都很快。</sub>

## Hydra 和 Steam Achievement Manager {#hydra-and-steam-achievement-manager}

另外两个工具会出现在相同的搜索中，它们做的是不同的工作。

- [Hydra](https://hydralauncher.gg/) 自称是可以下载游戏并跟踪成就的游戏启动器。
  AW Next 不下载游戏。
- [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) 自称是用于管理 Steam 上成就和统计数据的
  轻量级便携应用程序。它需要 Steam 客户端、Steam 账号和网络访问。
  AW Next 显示并跟踪成就，不需要 Steam 账号。

两者都不在上面的表格中，这些表格比较的是读取本地存档和模拟器存档的追踪器。

## 简而言之 {#in-short}

**AW Next** 适合必须在 Windows 和 Linux 上持续工作的游戏库：官方启动器和
模拟存档并存，有修复 Goldberg 或 GBE 设置而不只是报告它的状态报告，有自行选择
渠道的通知，以及可以设计和分享的预设与主题。

**Achievements** 在 Windows 上有很广的来源列表，包括 RetroAchievements、重新编译的移植版和
小众补丁，具有出色的自动配置、动画叠加层和解锁的视频剪辑。

**Achievement Watcher 2.x** 是历史基础，在 Electron 12 上具有广泛的模拟器兼容性和旧版
通知渠道。其仓库已于 2026 年 10 月 13 日归档，不再
维护。

**Sentinel** 是适用于 Goldberg、CODEX 和 RUNE 存档的轻量级 Linux 选项，带有集成良好的
Steam Deck 插件。

---

<div align="center">

[← 文档](README.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
