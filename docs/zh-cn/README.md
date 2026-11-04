---
title: "AW Next 文档"
description: "Achievement Watcher Next 的安装、配置与故障排除指南：来源、通知、预设、叠加层和疑难解答。"
---

<div align="center">

# AW Next 文档

设置、日常使用和维护指南。

[首页](../index.html) · [下载](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [预设库](../gallery/) · [主题库](../gallery/themes/) · [更新日志](../changelog.md) · [安全](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [报告问题](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="../assets/shot/home-800.webp 800w, ../assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/home.png" width="800" height="492" alt="AW Next 游戏库"></picture>

</div>

## 从这里开始 {#start-here}

可以按顺序阅读，也可以直接跳到需要的部分。每一页的末尾都有指向下一页的链接。

| # | 指南 | 内容 |
|---|---|---|
| 1 | [快速入门](getting-started.md) | 安装、首次运行、简易与高级、查找游戏、更新 |
| 2 | [兼容的来源](sources.md) | AW Next 读取的所有来源，以及每一种需要什么 |
| 3 | [通知](notifications.md) | 推送方式、自动、声音、位置、截图 |
| 4 | [预设与预设设计器](presets.md) | 弹窗的外观、设计自己的预设、分享 `.awpreset` 文件 |
| 5 | [叠加层](overlay.md) | 游戏内的成就列表：搜索、筛选、稀有度 |
| 6 | [手柄](controller.md) | 用手柄操作应用和叠加层 |
| 7 | [游戏状态](game-health.md) | 每个游戏的报告及其引导式修复 |
| 8 | [疑难解答](troubleshooting.md) | 发现、进度、通知和游戏时长方面的问题 |

## 需要时查阅 {#when-you-need-it}

| 指南 | 内容 |
|---|---|
| [常见问题](faq.md) | 常见问题的简短解答 |
| [Linux 与 Steam Deck](linux.md) | AppImage 及其更新、桌面环境、叠加层快捷键、Steam、Proton 和启动器 |
| [高级工具](advanced.md) | 维护、清除缓存、重置、手动添加游戏、诊断 |
| [Goldberg / GBE 设置](emulator-setup.md) | 诊断或修复使用模拟器的 Steam 游戏 |
| [Uplay 设置，R1 和 R2](uplay-r2.md) | Ubisoft 游戏的对应方法 |
| [对比](comparison.md) | AW Next 与 Achievement Watcher 2.x 和 Achievements 的区别 |
| [社区库](community-galleries.md) | 他人制作的预设和主题，以及如何提交自己的作品 |

应用打开时，**设置 → 帮助** 是最快的参考。它会根据你的配置（叠加层热键、手柄按键绑定、通知方式、主题、已启用的来源）
自动调整，并在你输入时筛选主题。

## 开发者参考 {#developer-reference}

面向贡献者和从源码构建 AW Next 的人。

| 主题 | 参考 |
|---|---|
| 贡献、分支、测试、提交风格 | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| 开发环境设置、运行、打包 | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| 应用、渲染器与 Watchdog 的边界；解析器约定 | [架构](../architecture.md) |
| Goldberg / GBE 文件格式、检测、修复不变量 | [Goldberg / GBE 参考](../goldberg-gbe.md) |
| Uplay R1/R2 游戏如何被识别、修复和读取 | [Uplay R1/R2 参考](../uplay-reference.md) |
| 版本管理、发布、CI、自动更新验证 | [发布流程](../RELEASE_WORKFLOW.md) |
| 安装程序、卸载程序和更新程序 | [安装程序、卸载程序与更新](../INSTALLER_AND_UPDATES.md) |
| 翻译、Intl 格式化、链接路由、语言文件检查器 | [本地化](../localization.md) |
| 语言文件与键对应 | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| 可移植的主题文件及其版本管理 | [.awtheme 格式](../awtheme-format.md) |

## 你的数据存放在哪里 {#where-your-data-lives}

AW Next 写入的所有内容都位于 **`%APPDATA%\Achievement Watcher Next`** 下（Linux 上是 `~/.config/Achievement
Watcher Next`，结构相同）。下面的路径都相对于它。升级会保留全部内容，首次启动时会导入旧版 Achievement Watcher 的文件夹，且不会修改它。

| 内容 | 位置 |
|---|---|
| 设置、索引和数据库 | `cfg\`（`options.ini` 是设置文件） |
| 日志 | `logs\` |
| 你创建或导入的预设 | `presets\Users Presets\` |
| 预设用作背景的图片 | `presets\images\` |
| 你添加的声音 | `sounds\` |
| 你保存或导入的主题 | `theme-packs\` |
| 自定义主题使用的图片 | `theme-images\` |
| 你放入的样式表主题 | `themes\` |
| 成就备份，以及 GBE 修复前所做的备份 | `backups\achievements\`、`backups\gbe\` |
| 封面图和游戏图标 | `covers\`、`gameIcons\` |
| 截图 | `Pictures\Achievement Watcher Next`（或你选择的文件夹） |
| 已登录的账号 | `steam_session.enc`、`epic_tokens.enc`、`cfg\xbox-auth.json`、`cfg\psn-auth.json` |
| **可重新获取：** 平台的架构、图标和稀有度 | `steam_cache\`、`uplay_cache\` |
| **可重新获取：** 下载的工具和文件夹扫描结果 | `cache\`（`cache\uplayR2` 除外，其中存放你提供的 DLL） |
| GBE Fork 存档（由模拟器写入） | `%APPDATA%\GSE Saves` |
| 经典 Goldberg 存档（同上） | `%APPDATA%\Goldberg SteamEmu Saves` |

**设置 → 高级 → 清除缓存** 只会清空那两行可重新获取的内容，其他一概不动。
`cfg\`、`presets\`、`theme-packs\`、`theme-images\`、`themes\`、`sounds\`、`covers\`、
`gameIcons\` 和 `backups\` 下的内容都不会重新生成，所以重新安装前请先复制。

报告问题之前，先运行 **设置 → 高级 → 诊断**，重现一次问题，然后从要附上的日志中删除隐私数据。

### 哪些内容会离开这台电脑 {#what-leaves-this-pc}

AW Next 没有分析统计，没有遥测，也没有自己的账号。它只发送必要的查询，并缓存每一个响应，
因此游戏库在离线时也能正常使用。

| 请求的内容 | 来自 | 携带的信息 |
|---|---|---|
| 成就列表、图标、全球稀有度 | Steam 的公开端点、SteamCommunity 页面、SteamHunters、Exophase | 游戏的 AppID 和界面语言 |
| 封面图和徽标 | Steam CDN、SteamDB、SteamGridDB | 游戏的 AppID 或标题 |
| 更新检查和下载 | GitHub 发布源 | 只有请求本身 |
| 修复工具（运行修复时） | GBE Fork、Steamless、API-bypass 和 CrakFiles 项目 | 只有请求本身 |
| 你的游戏库和解锁记录，**仅在你连接账号时** | Steam、Epic、Xbox Network 或 PlayStation Network | 账号的会话令牌；Steam 解锁则是公开的 Steam ID |
| 你的 RetroAchievements 游戏库和解锁记录，**仅在你填写账号卡片时** | retroachievements.org | 你的用户名和 Web API 密钥，加密保存在这台电脑上 |
| 社区预设和主题，**仅在你打开或发布到社区库时** | 社区库服务 `aw-gallery.shirow.dedyn.io` | 列表请求；只有在你按下“发布”时才会发送文件 |

如果游戏的可执行文件带有真正的 256px 图标，AW Next 会从文件中读取并用作徽标，不会访问网络。

本网站不设置 Cookie，不做分析统计，字体和脚本都从自己的主机加载。
社区库页面从上面的社区库服务获取列表，无法连接时则使用保存在旁边的副本。

除此之外不会上传任何内容：不会上传你的游戏库、游戏时长、文件夹或截图。可选的
`Websocket @localhost:8082` 广播只监听 `127.0.0.1`，因此只有这台电脑上的程序能读取。
你唯一主动发送的，是发布到社区库的预设或主题（见[社区库](community-galleries.md)）。
