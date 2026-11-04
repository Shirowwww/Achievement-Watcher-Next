---
title: "成就追踪器常见问题"
description: "关于 Achievement Watcher Next 的账号、来源、通知、安全、备份和支持平台的简短解答。"
---

# 成就追踪器常见问题

对常见问题的简短解答。每条都链接到介绍它的指南。

## 开始设置 {#getting-set-up}

### 我需要 Steam Web API 密钥或登录 Steam 吗？ {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
不需要。成就列表来自一系列无需密钥的公开端点，也不需要任何账号。你自己的 Steam 解锁
是从 Steam 保存在这台电脑上的统计数据读取的，所以私密个人资料对在这里玩过的每款游戏都有效。连接 Steam 是可选的：它会添加只在你
其他电脑上玩过的游戏，以及 Steam 家庭。见[已连接的账号](sources.md#connected-accounts)。

### 它能在哪些平台上运行？ {#which-platforms-does-it-run-on}
Windows 10 和 11，以及 Linux（x64）。发布版自带运行时。只有从源码构建时
才需要 Node.js。

### 它能在 Linux 或 Steam Deck 上运行吗？ {#does-it-run-on-linux-or-the-steam-deck}
在 Linux 上可以，目前是测试版：适用于 GNOME 和 KDE Plasma 的原生 AppImage（从不通过 Wine 运行），
支持 Wayland 或 X11。它能找到通过 Steam 和 Proton、Wine、Lutris、Heroic 或 Bottles 运行的游戏，并从与
Windows 应用相同的发布版自动更新。在 Steam Deck 上，支持是新增的，尚未在真实的 Deck 上
验证。见 [Linux 与 Steam Deck](linux.md)。

### 它支持 RetroAchievements 吗？ {#does-it-support-retroachievements}
支持。开启 **RetroAchievements** 来源，用用户名和 Web API
密钥连接你的账号，**导入游戏库** 就会带入你玩过的每款游戏。只要有任何启用了
RetroAchievements 的模拟器在运行，新的解锁就会被提示。见 [RetroAchievements](sources.md#retroachievements)。

### 它会显示 PlayStation 奖杯吗？ {#does-it-show-playstation-trophies}
会。在 **设置 → 来源** 中连接你的 PlayStation 账号（你在 Sony 的页面登录），你的
游戏和奖杯就会被导入，并带有 Sony 给出的每个奖杯的获得率。来自其他来源、同时也在 PlayStation 上发售的游戏，
会显示其列表真实的白金。见
[已连接的账号](sources.md#connected-accounts)。

### 我必须连接账号吗？ {#do-i-have-to-connect-an-account}
不必。Steam、Epic、Xbox PC 和 PlayStation 都可以连接，以读取本地文件没有的内容，
RetroAchievements 则要求你的用户名和 Web API 密钥。每个令牌和密钥在保存到这台电脑之前都会加密。
其余功能无需账号即可使用。

### 它能离线使用吗？ {#does-it-work-offline}
可以，适用于本地来源和任何已缓存的内容。成就名称、说明和美术图
只获取一次，之后从 `%APPDATA%\Achievement Watcher Next\steam_cache` 复用
（Linux 上是 `~/.config/Achievement Watcher Next/steam_cache`）。

### 选择简易模式会失去什么吗？ {#do-i-lose-anything-by-choosing-simple-mode}
不会。简易模式只是隐藏控件，绝不会关闭任何功能。扫描、监视或保存的内容都不会
改变，切换回来会恢复每个控件及其值。见
[快速入门](getting-started.md#simple-and-advanced)。

### 它能显示我拥有但从未安装的游戏，或来自另一台电脑的解锁吗？ {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
可以。当 Steam 来源设为 **拥有** 时，Steam 账号卡片中的两个开关，**添加你拥有的游戏** 和 **添加通过 Steam 家庭与你共享的游戏**，
会列出你的整个游戏库。两者
默认关闭，因为庞大的游戏库会让首次扫描长得多。连接了 Steam 账号后，
本地没有可读内容的游戏会从你的 Steam 个人资料读取（其游戏详情
必须公开），结果会缓存六小时。见
[已连接的账号](sources.md#connected-accounts)。

## 游戏库 {#the-library}

### 游戏缺失 {#a-game-is-missing}
检查 **设置 → 来源** 中它的来源是否已启用，运行 **设置 →
文件夹** 下的 **智能查找**，并关闭 **仅显示已安装的游戏**，看看该游戏是否已知但不再
安装。完整的检查清单见[疑难解答](troubleshooting.md#a-game-is-missing)。

### 游戏显示“无成就” {#a-game-shows-no-achievements}
该游戏没有成就集。它仍可启动并继续跟踪游戏时长，并且不计入
完成度统计，而不是算作 0%。它的磁贴在进度条的位置显示美术图。
**设置 → 外观 → 游戏库磁贴 → 无成就游戏的进度条** 可以把
进度条找回来。

### 我已解锁成就，但游戏显示 0% {#a-game-shows-0-although-i-have-unlocked-achievements}
该游戏有架构，但运行时没有解锁文件。打开它的[游戏状态](game-health.md)面板：它
会指出缺失的部分，并且只提供适用的修复。

### 为什么同一款游戏出现了两次？ {#why-does-the-same-game-appear-twice}
它是通过两个来源找到的。设置 → 常规 中的 **合并重复项** 可以把它们合并。如果其中一个
条目是你现在在别处拥有的游戏的过期存档文件夹，请将其加入黑名单。

### 游戏更新添加了成就，但我看不到 {#a-game-update-added-achievements-and-i-do-not-see-them}
缓存的列表每 3 天重新检查一次。若要立即获取新的成就，请使用 **设置 → 高级 →
重新检查成就列表**，即使 **成就数据自动更新** 已关闭也能使用。这两种
检查都不会删除任何已缓存的内容。

### 游戏被匹配到了错误的 Steam 发布版 {#a-game-was-matched-to-the-wrong-steam-release}
右键单击它并选择 **手动设置 AppID...**。AppID 会写入 `steam_appid.txt`，并为该安装文件夹
记住。见[手动设置游戏的 AppID](advanced.md#set-a-games-appid-by-hand)。

## 通知 {#notifications}

### 我解锁东西时什么都没出现 {#nothing-appears-when-i-unlock-something}
先看该游戏的[游戏状态](game-health.md)面板中的通知一行，它会写明
最近一次送达的渠道及原因。然后按照
[测试或解锁没有出现时](notifications.md#if-a-test-or-unlock-does-not-appear)操作。

### 在某一款游戏中不显示叠加层弹窗 {#the-overlay-popup-does-not-show-in-one-particular-game}
该游戏可能处于独占全屏，那里无法绘制始终置顶的弹窗。在
**自动** 下，AW Next 会把该解锁作为显示在游戏上方的 Windows 通知发出。处于
传统独占模式的游戏什么都不会放行：请将其切换为无边框。见
[“自动”如何判断](notifications.md#how-automatic-decides)。

### 我游戏时通知被隐藏 {#notifications-are-hidden-while-i-play}
那是 Windows 的勿扰模式。开启 **高优先级通知** 并同意 Windows 的一次性
请求。见 [Windows 高优先级通知](notifications.md#priority-windows-notifications)。

### 我可以更改弹窗的外观，或分享设计吗？ {#can-i-change-how-the-popup-looks-or-share-a-design}
可以。应用自带十个预设，**预设设计器** 用普通控件构建你自己的，
任何预设都可以导出为一个 `.awpreset` 文件。见[预设与预设设计器](presets.md)。

### 我可以把解锁显示在直播中吗？ {#can-i-put-unlocks-on-my-stream}
可以，在 OBS 中使用浏览器来源。把弹窗当作窗口捕获行不通，因为它只为
一次解锁而存在，在 OBS 列出它之前就消失了，所以 AW Next 把同样的弹窗作为页面提供。地址在
设置 → 通知 → **OBS 浏览器源** 中。见
[在直播中显示解锁（OBS）](notifications.md#show-unlocks-on-stream-obs)。

### 叠加层和弹窗是同一个东西吗？ {#is-the-overlay-the-same-thing-as-the-popup}
不是。弹窗是由预设设定样式的一次性通知。**叠加层** 是游戏运行时按 `Ctrl+Shift+K`
打开的完整成就列表。见[叠加层指南](overlay.md)。

### 在 Linux 上，Ctrl+Shift+K 在我的游戏中没有反应 {#on-linux-ctrlshiftk-does-nothing-in-my-game}
在 Wayland 下，当原生 Wayland 窗口获得焦点时，AW Next 看不到按下的按键，比如
Wayland 模式的 Linux 游戏，或使用其 Wayland 驱动的 Proton。请在桌面的键盘设置中
给 `/home/you/.local/bin/achievement-watcher --toggle-overlay` 绑定一个按键，把其中的 `you` 换成你的
用户名。AW Next 会让该命令始终指向当前的 AppImage，所以快捷键在
更新后依然有效。见[叠加层快捷键](linux.md#overlay-shortcut)。

## 安全与数据 {#safety-and-data}

### AW Next 会修改我的游戏，或从我的电脑发送任何内容吗？ {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
只有在你要求时才会。读取成就是只读的。模拟器修复工具（游戏的
右键 **模拟器与工具** 子菜单和 **设置 → 模拟器**）会写入游戏文件夹，总是
在确认之后并带有备份。请只对你拥有的游戏使用。除了只读查询
和已连接账号返回的内容之外，没有任何内容会离开这台电脑。见
[哪些内容会离开这台电脑](README.md#what-leaves-this-pc)。

### 我的杀毒软件标记或删除了一个文件 {#my-antivirus-flagged-or-removed-a-file}
几乎可以肯定是 Steam 模拟器或 Ubisoft 加载器，而且是误报：这些文件充当
游戏的 Steam 或 Ubisoft 库，而这正是检测引擎要找的行为。除非你运行了修复、打开了 **设置 → 模拟器**，或开启了
自动修复，否则不会写入任何内容。允许
杀毒软件点名的文件，或排除 `%APPDATA%\Achievement Watcher Next\cache`。切勿关闭
保护。见[疑难解答 → 杀毒软件](troubleshooting.md#antivirus-or-smartscreen-warning)。

### Windows SmartScreen 对安装程序发出警告 {#windows-smartscreen-warns-about-the-installer}
发布版使用项目自己的证书签名，并通过指纹固定，而不是商业证书，
所以 SmartScreen 可能会要求确认。你从不需要安装该证书：应用内的
更新程序在安装任何东西之前，会检查签名者、固定的指纹，以及文件在签名后是否被修改。
请仅从
[官方发布页面](https://github.com/Shirowwww/Achievement-Watcher-Next/releases)下载。要自行检查
安装程序，请运行 `Get-FileHash <installer> -Algorithm SHA256` 并打开
`https://www.virustotal.com/gui/file/<hash>`。当前发布版是
[3.12.5](https://www.virustotal.com/gui/file/364b7ecdc1d039e74066ec924453ba665ff33b36dded965703c3373fa53b58ea)。
见[疑难解答 → 自行检查发布版](troubleshooting.md#checking-a-release-yourself)。

### 在 Linux 上，为什么会出现密钥环提示？ {#on-linux-why-does-a-keyring-prompt-appear}
AW Next 用桌面密钥环（GNOME Keyring 或 KDE
Wallet）保存的密钥加密它的登录令牌。使用自动登录时，密钥环保持锁定，所以 AW Next 启动时桌面会要求你解锁或创建
一个。取消是安全的：应用继续工作，提示会在下次
启动时再次出现。见[密钥环提示](linux.md#keyring-prompt)。

### 我的数据在哪里，更新会丢失吗，更新有多大？ {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
一切都在 `%APPDATA%\Achievement Watcher Next`（Linux 上是 `~/.config/Achievement Watcher Next`）中，
安装较新的版本会保留它。升级后的首次启动会导入旧版 Achievement
Watcher 文件夹，且不会修改或删除它。更新只下载自你已安装的
版本以来变化的部分，如果失败，会自行回退到完整下载。见
[更新与现有数据](getting-started.md#updates-and-existing-data)。

### 我如何迁移到新电脑，或备份我的设置？ {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**设置 → 高级 → 配置文件备份 → 导出配置文件…** 会把你的设置、游戏库选择、
预设、主题、封面和游戏时长写入一个 `.awbackup` 文件。在新电脑上安装 AW Next，选择
**恢复配置文件…**，它会在下次启动时应用；被替换的文件会保留。登录信息
从不保存，所以请重新连接 Steam、Epic、Xbox、PlayStation 和 RetroAchievements。见
[配置文件备份](advanced.md#profile-backup)。

### 有便携版吗？ {#is-there-a-portable-version}
有。便携版 ZIP 把应用及其数据保存在一个文件夹中，并检查与安装版相同的发布源。
它从不下载或运行安装程序：有较新版本时，它会提供发布页面，
把新压缩包解压到旧文件夹上会保留你的数据。

### 如何彻底退出？ {#how-do-i-quit-completely}
关闭窗口会让 AW Next 留在系统托盘中，以便继续跟踪。请使用托盘菜单退出。

## 关于项目 {#the-project}

### 它适用于 Goldberg、GBE Fork 和 CODEX 游戏吗？ {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
适用。AW Next 读取 Goldberg、GBE Fork、CODEX、RUNE 和 CPY 写入的成就文件，并且可以
为游戏安装和修复 GBE Fork 运行时。见[兼容的来源](sources.md)和
[Goldberg 和 GBE Fork 设置](emulator-setup.md)。

### 这和 Xan105 的 Achievement Watcher 是同一个应用吗？ {#is-this-the-same-app-as-xan105s-achievement-watcher}
不是，它是后续项目。AW Next 延续了 Xan105 的 Achievement Watcher 和 darktakayanagi 的 2.x
分支，基于当前的 Electron 运行时，支持 Linux，来源更多，并有带引导式修复的单个游戏状态报告。
见[对比](comparison.md)。

### 用于破解游戏安全吗？ {#is-it-safe-to-use-with-cracked-games}
读取成就是只读的。修复工具只在确认之后并带有备份时才写入游戏文件夹，
自动修复默认关闭。请只对你拥有的游戏使用。杀毒软件
可能会把模拟器文件标记为误报。见
[疑难解答 → 杀毒软件](troubleshooting.md#antivirus-or-smartscreen-warning)。

### 它与 Achievement Watcher 2.x 有什么不同？ {#how-does-this-differ-from-achievement-watcher-2x}
AW Next 以现代运行时和对兼容性、可靠性及
功能的大幅改进延续了它。见[对比](comparison.md)。

### 它能帮我弄到游戏、密钥或账号吗？ {#can-it-get-me-games-keys-or-accounts}
不能，问题跟踪器也帮不了这个忙。AW Next 不包含任何游戏文件，也不会
绕过在线所有权检查。

### 我发现了错误或有想法 {#i-found-a-bug-or-have-an-idea}
请[提交 issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues)，附上应用版本、
你的 Windows 版本（或 Linux 发行版和桌面）、涉及的来源以及相关日志。
如发现疑似漏洞，请通过
[安全政策](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md)私下报告。如有
疑问，或在确定是不是错误之前需要帮助，请到 [Discord 服务器](https://discord.gg/DjTMrDsXTh)提问。

---

**仍然没解决？** [疑难解答](troubleshooting.md)会按顺序逐一排查每种症状。

<div align="center">

[← 文档](README.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
