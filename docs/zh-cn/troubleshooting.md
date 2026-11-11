---
title: "疑难解答"
description: "游戏缺失、进度错误、通知不出现、游戏时长，以及杀毒软件或 SmartScreen 警告的解决办法。"
---

# 疑难解答

## 从这里开始 {#start-here}

如果问题涉及**单个游戏**，请先打开该游戏的 **[游戏状态](game-health.md)** 面板。
它会说明 AW Next 能否看到该游戏、读取它的成就并提示它的解锁，并且
只提供适用的修复。大多数单个游戏的问题到这里就能解决。

本页其余部分用于影响整个应用的问题。**设置 → 帮助** 在 *出现问题时*（游戏状态和疑难解答）下有
前几项检查的简短版本，其 *当前设置* 一行会显示你的主题、通知方式、手柄、叠加层热键以及启用了多少个
来源。如果在确定是不是错误之前有疑问，可以到
[Discord 服务器](https://discord.gg/DjTMrDsXTh)提问。在错误报告中，请包含应用版本、Windows
版本、涉及的来源、确切步骤和相关日志。

## 在 Linux 上 {#on-linux}

Linux 应用存在本页未涵盖的问题。没有 FUSE 2，AppImage 无法启动
（Ubuntu 24.04 上是 `libfuse2t64`）。只有自动登录时，密钥环才会要求输入密码。
Wayland 下的叠加层快捷键需要你在桌面的键盘设置中绑定。每个问题的解决办法都在
[Linux 与 Steam Deck](linux.md#install)中。本页其余部分描述的是 Windows；在 Linux 上，
日志位于 `~/.config/Achievement Watcher Next/logs`。

## 打开日志和本地数据 {#open-logs-and-local-data}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="设置 - 高级，诊断"></picture><br>
<sub>应用和运行时版本，以及快速访问日志、数据和更新检查</sub>
</div>

**高级** 标签页仅在高级模式下存在。如果看不到它，请把 **设置** 顶部的 **界面**
控件从简易切换为高级；切换回来不会丢失任何内容（见
[getting-started.md](getting-started.md#simple-and-advanced)）。

**设置 → 高级 → 诊断** 会打开日志或数据目录。默认日志路径是：

```text
%APPDATA%\Achievement Watcher Next\logs
```

最有用的文件通常是 `Achievement Watcher.log`、`renderer.log`、`parser.log`，以及相关来源的
Watchdog 日志。跨越扫描、界面和通知的故障需要
其中好几个，所以请使用同一张卡片中的 **导出日志 (.zip)**，而不是手动复制文件：
写入日志的进程从不停止，手动复制可能会截到写了一半的行。该
导出可在应用运行时进行，并会添加一个 `about.txt`，其中包含应用、Electron、Node 和 Chrome 的版本。

这个压缩包是为公开的 issue 准备的，所以其中的副本会被遮盖：每个路径中的 Windows 用户名
会变成 `[username]`，密钥、令牌和密码会变成 `[redacted]`、`[token]` 或
`[apikey]`。你磁盘上的日志保持不变，无法遮盖的文件会被排除。
遮盖针对已知的格式，所以发布前请先阅读这些文件；例如，以你的名字命名的游戏文件夹
会保持原样。

日志只追加、从不截断，所以崩溃记录在下次启动后仍然存在。每次运行都以
一个标记开头，随后是一个 `[diag]` 块，包含错误报告所需的信息：版本、安装和数据路径、
应用的启动方式、语言和主题，以及每个显示器的几何信息：

```text
===== session 2026-08-11T00:53:31.890Z pid=19276 =====
[diag] app: Achievement Watcher 3.10.0 (packaged)
[diag] runtime: electron 43.4.0 · chrome 150.0.7871.224 · node 24.18.1 · v8 15.0
[diag] display: 3056414223 1080x1920 @1x work=1080x1872 rotation=270
[diag] display: 3933707034 (primary) 2048x1152 @1.25x work=2048x1104 rotation=0
```

把这个块粘贴到 issue 中。窗口大小和位置的问题几乎总是显示缩放
或多显示器造成的，随后的 `[MainWindow]` 行会在窗口每次显示、移动、调整大小或关闭时
记录其边界和所在显示器。

每个日志文件超过 2 MB 后会轮换为 `<name>.log.1`，因此会保留一代旧日志。

## 游戏缺失 {#a-game-is-missing}

1. 打开 **设置 → 来源**，确认相关集成已启用。
2. 打开 **设置 → 文件夹**，运行 **智能查找**，然后使用 **生成配置** 进行完整扫描。
3. 如果游戏库或存档根目录使用自定义位置，请手动添加。
4. 关闭 **仅显示已安装的游戏**，看看该游戏是否已知但不再被视为
   已安装。
5. 对于模拟器存档，请启动一次游戏，让它创建运行时文件夹。

如果只剩旧的存档残留而游戏文件已不在，仅已安装筛选会隐藏
该条目。

元数据未能获取的游戏仍会保留在列表中：游戏是否存在由磁盘上的内容决定，
在线查询只是装饰。该条目显示本地已知的任何名称，并在
之后的扫描中补全。

## 成就保持锁定或显示 0% {#achievements-stay-locked-or-show-0}

没有运行时解锁文件就意味着 0%，即使成就列表完整。

打开游戏的 **[游戏状态](game-health.md)** 面板：它会指出缺失的部分并提供
修复，无论是重写成就数据、恢复模拟器文件，还是修正指向另一款游戏的
`steam_appid.txt`。要手动检查：

- 确认检测到的 AppID 或平台 ID 属于正确的游戏；
- 检查是否有自定义存档路径；
- 只有在查看报告后才修复不匹配的 `steam_settings` 架构；
- 如果你在另一台电脑上玩过，请连接那个 Steam 账号：本地没有可读内容的游戏随后
  会从你的 Steam 个人资料读取，其游戏详情必须公开。结果会缓存六
  小时（见[已连接的账号](sources.md#connected-accounts)）。

同一款游戏的 Steam 模拟器存档可能分散在 `%APPDATA%\GSE Saves` 和
`%APPDATA%\Goldberg SteamEmu Saves` 中。AW Next 会读取保存了解锁的那个，所以
你不需要手动修复。

没有成就集的游戏不显示进度条，而不是 0%（如果你在 **设置 → 外观 → 游戏库磁贴** 中把那个条找了回来，则显示
**无成就**），并且不计入完成度
统计。

**从 AW Next 的“开始游戏”按钮可以运行，但从 Steam 快捷方式不行。** 作为非 Steam 游戏添加到 Steam 的
破解游戏会以自己的游戏 ID 启动，而 GBE Fork 会先读取该 ID，之后才读取
`steam_appid.txt`，所以解锁会保存在快捷方式的编号下，永远到不了游戏的
卡片。当 `steam_appid.txt` 位于快捷方式的起始文件夹（Start
In）中时，Steam 会传递真实的 ID；只放在可执行文件旁边则不会被读取。游戏状态会标出起始文件夹中
没有它的快捷方式，其修复会把文件写到那里。

**使用了 scene 破解，但从未记录任何内容。** 有些破解从不报告成就。
玩了一个小时仍没有任何记录后，游戏状态会这样告知，并且当该破解就是游戏的
Steam 库文件时，提供在其上安装受支持的模拟器，以及之后撤销的选项。

**Halo: Campaign Evolved 和 The Crew Motorfest 离线时不记录任何内容。** 它们的成就由发行商的
服务器授予，所以任何破解或模拟器都无法记录。它们的游戏状态面板会这样说明。

针对特定来源的步骤，请参阅 [Goldberg 和 GBE Fork 设置](emulator-setup.md#common-problems)或 [Goldberg Uplay R2 设置](uplay-r2.md#achievements-remain-at-0)。

## 匹配到了错误的游戏 {#the-wrong-game-was-matched}

当游戏的文件夹名称匹配多个 Steam 发布版，而自动匹配选错了其中一个时，
右键单击它并选择 **手动设置 AppID...**。你输入的 AppID 会写入
`steam_appid.txt`，并为该安装文件夹记住，所以以后的修复也会使用它；同一菜单中的 **清除手动
AppID** 可撤销它。游戏状态的 **修正游戏 ID 文件** 修复也会询问
AppID。详情：[手动设置游戏的 AppID](advanced.md#set-a-games-appid-by-hand)。

不匹配并不总是模拟器的错。如果它是专门按磁盘上的 ID 设置的，请不要
动它。

## 名称、说明或美术图缺失 {#names-descriptions-or-artwork-are-missing}

- 联网时刷新，让应用重试其元数据来源。
- 确认游戏的平台标识；错误的 Steam AppID 可能返回看似可信但无关的
  元数据。
- 对于 Goldberg/GBE，有效的本地架构可以在离线时补全部分缺失的文字。
- 当自动来源失败时，使用游戏的封面操作重试或选择本地美术图。

标题只是裸 Steam AppID 的卡片，表示名称查询返回为空，而仅凭 AppID 获取的
美术图已解析成功。查询成功后，下一次扫描会替换该数字。

DLC 和更新成就在标题下显示所属分组（例如“Hearts of
Stone”标签），来自 Steam 自己的成就集，或对于没有这些的游戏，来自 SteamHunters。

当所有可用来源都省略隐藏成就的说明时，这些说明会保持隐藏。

## 游戏更新添加了成就，但没有显示 {#a-game-update-added-achievements-that-arent-showing-up}

缓存的架构每 3 天会对照 Steam 重新检查一次，因为 Steam 从不宣布新增
成就。若要立即获取，请使用 **设置 → 高级 → 重新检查成就列表**，即使
**成就数据自动更新** 已关闭也能使用。同样位于 设置 →
高级 的那个开关，只会停止定期检查和空白说明的修复。这两种检查都不会删除
现有成就或解锁。只有在你手动维护 `steam_cache` 时才关闭它。

## 更新卡在同一个文件上 {#an-update-is-stuck-on-the-same-file}

下载的更新文件会在多次运行之间保留。如果下载总是在同一个文件上失败，请使用
**设置 → 高级 → 清除缓存** 并重新检查更新。只会删除可重新下载的缓存；
设置、游戏数据和日志都会保留。

更新通常只下载安装程序中变化的部分，如果失败，会自行回退到完整的
安装程序。

AW Next 通过 Windows 通知和标题栏标签提示新版本，单击任何一个
都会打开更新窗口，其中列出你跳过的每个版本的发布说明。提示
会保留到你关闭它，并在游戏结束后再次出现，绝不会在游戏期间出现。其间托盘图标会带有
蓝点。**设置 → 检查更新** 会立即打开该窗口。

**更新被拒绝。** 每个更新在安装前都会对照项目固定的签名证书进行检查，而不是
任意签名，也不是随附发布的 SHA-512，因为这两者来自
同一个发布版。被拒绝几乎总是意味着下载的文件被篡改或损坏：
请如上所述清除缓存，并从
[官方发布页面](https://github.com/Shirowwww/Achievement-Watcher-Next/releases)重新下载。

## 通知不出现 {#notifications-do-not-appear}

1. 确认后台跟踪器正在运行。
2. 打开游戏，阅读其 **游戏状态** 面板中的通知一行：它会写明为该游戏送达
   最近一条通知的渠道及原因。
3. 使用 **设置 → 通知** 下的普通、稀有和叠加层测试。
4. 确认推送方式和所选预设。在 **自动** 下，缺少叠加层弹窗通常是预期的
   备用行为：见[通知](notifications.md#how-automatic-decides)。
5. 检查 Windows 对 AW Next 的通知权限。
6. 如果问题只在游戏中或全屏时出现，请在 **设置 → 通知** 下开启 **高优先级通知**，
   并接受 Windows 的权限提示。
7. 在独占全屏之外测试叠加层。
8. 在测试或解锁失败后立即查看日志。

如果游戏库有更新但没有通知出现，问题在于通知渠道。如果游戏库
也没有变化，请先诊断来源或存档路径。

## OBS 浏览器源保持空白 {#the-obs-browser-source-stays-empty}

1. 在 **设置 → 通知 → OBS 浏览器源** 下按 **预览**，或打开
   `http://127.0.0.1:8082/obs/?test=1`。每十秒出现一张示例卡片，说明页面和数据源
   正常，问题出在 OBS 中的来源设置。
2. 什么都没有，连空白页也没有：AW Next 的另一个副本，或另一个程序，占用了端口
   8082. 只有最先启动的副本才会提供该地址。
3. 两次解锁之间页面空白是正常的。使用 `?test=1` 可以看到它的绘制。
4. 检查 **设置 → 通知 → 传输** 下的 **Websocket @localhost:8082** 是否已开启：该
   来源读取的就是这个数据源。
5. 卡片会填满来源的任意大小。如果看起来发虚，请给来源更多像素，
   并在场景中把它放得更小。

完整设置请参阅[在直播中显示解锁（OBS）](notifications.md#show-unlocks-on-stream-obs)。

## 点击“开始游戏”按钮无法启动游戏 {#a-game-will-not-start-from-the-play-button}

有些游戏需要管理员权限，因为它们的清单或启动器会要求。Windows
拒绝以 AW Next 通常启动游戏的方式启动它们，并报告 `EACCES`。

这时 AW Next 会通过 Windows shell 重试，它会弹出常规的 UAC 提示，所以确认后游戏
就会启动。如果这也被拒绝，AW Next 会提议以管理员身份重试。只有游戏会被提升权限，
因为提升权限的 AW Next 会创建你的普通账号无法改写的文件。
关闭 UAC 提示会被视为一种决定，而不是错误。

## 游戏时长未被跟踪 {#playtime-is-not-tracked}

AW Next 跟踪配置的游戏可执行文件及其进程的存活时间。如果启动的是启动器、辅助程序
或名称不同的二进制文件：

- 右键单击游戏并打开其配置；
- 选择游戏期间保持运行的可执行文件；
- 避免选择启动器和崩溃处理程序进程；
- 保存后重新启动游戏。

通过 `javaw.exe` 启动并让自己的启动器退出的 Java 游戏，会通过该 Java
进程被自动跟踪。

要修正已经出错的总时长，请使用 **成就与游戏时长 → 编辑游戏时长…**（见
[编辑游戏的游戏时长](advanced.md#editing-a-games-playtime)）。

## PlayStation 奖杯无法导入 {#playstation-trophies-do-not-import}

- *PlayStation 会话已过期*：请在 **设置 → 来源** 中重新连接账号。
- *PlayStation 要求放慢速度* 或 *已被 PlayStation 暂停*：Sony 限制了请求速率。几分钟后再次导入，
  它会从中断处继续。
- *此账号尚无奖杯列表*：该账号没有可导入的奖杯列表。

## Nemirtingas Epic 游戏不记录任何内容 {#a-nemirtingas-epic-game-records-nothing}

当游戏文件夹中有该模拟器（它的 `EOSSDK` 库，旁边有
`nepice_settings\NemirtingasEpicEmu.json`）时，游戏的 **游戏状态** 标签页会显示
**Epic 模拟器** 一行：

- **SavePath 必须是 `"appdata"`。** 只有该值时，模拟器才会把成就写入
  `%APPDATA%\NemirtingasEpicEmu`，AW Next 在那里读取；其他任何值都会把它们
  保留在游戏文件夹中。设置为其他值时，该行会发出警告。
- **有些游戏需要 Epic 启动参数。** 有些 EOS 游戏只有在启动器传入 `-epicapp=...` 等参数时，
  才会登录到模拟器并保存成就。当模拟器
  尚未保存任何内容时，该行会提供 **添加 Epic 启动参数**，它会根据配置中的 `AppId` 把这些参数写入游戏的
  启动设置。传入这些参数的 `.bat` 也可以。
- 如果安装了模拟器后游戏在启动时崩溃，请关闭它的叠加层插件
  （`"Plugins": { "Overlay": { "Enabled": false } }`）；在它开启期间，该行会提醒你。

## Ubisoft 或 Uplay R2 使用了错误的操作 {#ubisoft-or-uplay-r2-uses-the-wrong-action}

Ubisoft 游戏应获得 Ubisoft 元数据和 Uplay R2 修复，而不是 Steam GBE 操作。请重新运行
文件夹扫描并检查来源图标。如果游戏仍被错误识别，请在报告中附上 `parser.log`、
显示的来源和 ID，以及游戏目录名称。

## 杀毒软件或 SmartScreen 警告 {#antivirus-or-smartscreen-warning}

打包发布版使用项目自己的证书签名，并通过其确切的指纹固定，而不是
由公共信任的机构签发，所以 Windows SmartScreen 仍可能发出警告。你从不需要
安装该证书。安装更新之前，AW Next 会检查它已被签名、
签名者是 `CN=Shirow`、指纹与应用固定的两个之一匹配，以及
文件在签名后没有被修改。随发布一起发布的 SHA-512 无法取代该检查，
因为两者会被一起替换。可选的模拟器 DLL 也可能触发启发式检测。
请仅从
[官方发布页面](https://github.com/Shirowwww/Achievement-Watcher-Next/releases)下载，并将
安装程序与对应的 `latest.yml` 中的 SHA-512 进行比对，作为第二重检查。

不要禁用系统级保护。请将官方发布版中被隔离的文件作为误报
报告给杀毒软件厂商。

### 自行检查发布版 {#checking-a-release-yourself}

每个已发布的安装程序都可以通过其 SHA-256 在 VirusTotal 上查询：

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.12.6.exe" -Algorithm SHA256
```

打开 `https://www.virustotal.com/gui/file/<the hash it prints>`。如果该文件就是已发布的那个，
报告已经在那里。对于当前发布版，那就是
[3.12.6 安装程序](https://www.virustotal.com/gui/file/53f6f16421d88687ea70c16ac7a3d016202dc6ad3a008bb986e29160a48f5709)
（`53f6f16421d88687ea70c16ac7a3d016202dc6ad3a008bb986e29160a48f5709`）。

结果会列出每个引擎的判断。在捆绑了模拟器文件的版本上出现少量启发式检测，
就是下面所说的误报。重要的是哈希与发布页面所发布的
文件相符。

### 模拟器文件被标记 {#the-emulator-files-are-flagged}

这是人们实际遇到的检测，它是误报。为没有运行商店客户端的
游戏记录成就，意味着要在它旁边放一个替代库：Steam 模拟器（GBE
Fork）或 Ubisoft 加载器。检测引擎监视的正是这一点，所以它们标记的是文件
*做了什么*，而不是它包含什么。Windows Defender 会一次性隔离它看到的所有副本：游戏
文件夹中的、随 AW Next 安装的，以及缓存中的。

**何时触发。** 只在文件被写入的那一刻：

| 你做了什么 | 写入了什么 |
|---|---|
| 从游戏菜单或设置中运行了修复 | 模拟器或加载器，写入该游戏的文件夹 |
| 打开了 **设置 → 模拟器 → Ubisoft / Uplay R1/R2** | 捆绑的加载器，写入 AW Next 自己的缓存 |
| 开启了 **自动修复新检测到的游戏** | 同上，在扫描期间，针对每个需要的游戏 |

启动 AW Next 不会写入其中任何一个。除非你开启，否则自动修复是关闭的，并且它会事先
警告你，让你有机会先添加 Defender 排除项。如果它已经开启，同样的
警告会在第一次写入之前出现一次，对话框上带有排除项和关闭开关。
窗口隐藏在托盘中时不会写入任何内容。

**AW Next 的处理。** 隔离会被报告为杀毒软件问题，并带有一个在 Windows Defender 中
允许该文件夹的按钮，以及另一个把被删除的文件放回去的按钮。**设置 →
模拟器 → Ubisoft / Uplay R1/R2 → 恢复内置 DLL** 可随时恢复它们。

**该怎么办。** 允许杀毒软件点名的文件，或排除
`%APPDATA%\Achievement Watcher Next\cache`。这样可以保护 AW Next 自己的副本；游戏
文件夹中的副本仍可能被标记，所以如果持续发生，也请排除该文件夹。向厂商报告误报
能为所有人解决问题。

AW Next 把 GBE Fork 压缩包下载到缓存期间，Windows Defender 会将其命名为
`Trojan:Win32/Suschil!rfn`。这是同样的误报：允许它，或排除缓存文件夹，然后再次运行
修复。

**先检查什么。** 两者都是第三方开源项目：Steam 模拟器来自官方的
[GSE Fork 发布版](https://github.com/Detanup01/gbe_fork)，Ubisoft 加载器随仓库中的
`app/resources/uplayR1/` 和 `app/resources/uplayR2/` 一起提供。AW Next 在任何
修复使用捆绑的文件之前，会对照已知的 SHA-256 摘要、它们的 PE 架构以及成就功能
进行验证，并拒绝未通过的文件。

### AW Next 运行时杀毒软件有反应 {#an-antivirus-reacts-while-aw-next-runs}

行为引擎（Kaspersky 的 System Watcher、Bitdefender 的 Advanced Threat Defense）判断的是程序
做了什么，而不是它包含什么。AW Next 不会为 Windows 通知、通知声音
或更新签名检查启动 PowerShell，也不会把代码编译到 `%TEMP%`：截图使用
应用自带的原生辅助程序，通知检查直接调用 Windows。

如果杀毒软件仍有反应，请记下确切的检测名称，并将其点名的文件作为误报
报告。对于 Kaspersky，是 [opentip.kaspersky.com](https://opentip.kaspersky.com)：按哈希查找该文件，
然后点击 **Submit to reanalyze**。

## 窗口无法打开 {#the-window-does-not-open}

- 使用托盘图标（在通知区域），以防应用是隐藏启动的。
- 结束卡住的 AW Next 进程，然后重新启动。
- 如果为开发设置了 `ELECTRON_RUN_AS_NODE`，请将其从环境中移除；它会使
  Electron 作为普通 Node 启动。
- 查看 `renderer.log` 和主应用日志中的第一个错误。
- 如果界面能保持可见足够长的时间来更改，请尝试 **设置 → 常规 → 禁用硬件加速**。

## 用全新配置文件重新开始 {#start-with-a-fresh-profile}

仅在备份了想保留的数据之后使用：

1. 从托盘彻底退出 AW Next。
2. 把 `%APPDATA%\Achievement Watcher Next` 重命名为 `Achievement Watcher Next.backup`。
3. 启动应用，并用新的配置文件重现问题。

如果问题消失，只恢复你需要的数据，或把相关配置文件附到
报告中。重命名保留了退路；删除则没有。

## 报告问题 {#report-the-problem}

请先搜索[现有的 issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues)。如果
没有匹配的，请使用仓库模板提交错误，并在删除任何
不想公开的内容后附上日志。

---

**另请参阅：** 简短解答见[常见问题](faq.md) · 维护、
清除缓存和重置见[高级工具](advanced.md) · 单个游戏的问题见[游戏状态](game-health.md)。

用户路径到此结束。文档接下来转向技术内容：
文件格式和检测规则见 [Goldberg/GBE 参考](../goldberg-gbe.md)，
应用 / 渲染器 / Watchdog 的边界见[架构](../architecture.md)。

<div align="center">

[← 文档](README.md) · [快速入门](getting-started.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
