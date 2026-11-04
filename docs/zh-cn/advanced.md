---
title: "高级工具"
description: "设置 高级 下的维护工具：清除缓存、诊断、配置文件备份、手动设置 AppID 和重置。"
---

# 高级工具

这些工具位于 **设置 → 高级** 或游戏的右键菜单中。高级标签页
只在界面处于 **高级** 模式时存在：如果看不到它，请切换设置顶部的 **界面**
控件。切换回来不会丢失任何内容。

<div align="center">
<picture><source srcset="../assets/shot/advanced-panel-800.webp 800w, ../assets/shot/advanced-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/advanced-panel.png" width="720" height="529" alt="设置 - 高级，设置与维护"></picture><br>
<sub>设置 &amp; 维护；其他部分折叠在它下面</sub>
</div>

## 设置与维护 {#setup-and-maintenance}

| 工具 | 作用 |
|---|---|
| **修复所有检测到的游戏** | 对每个已知安装文件夹的兼容检测游戏运行匹配的修复（Steam/GBE Fork 或 Ubisoft/Uplay R2）。这会重建已有设置的游戏。 |
| **禁用硬件加速** | 当窗口或叠加层出现异常时关闭 GPU 加速。需要重启。 |
| **清除缓存** | 只删除可重新下载的缓存：更新文件、Steam/Ubisoft 架构和图标缓存，以及下载的模拟器修复工具。设置、存档、备份和手动放置的文件绝不会被触及。 |
| **重新检查成就列表** | 向 Steam 查询游戏更新添加的成就。这每 3 天运行一次；该按钮会立即强制执行。 |
| **成就数据自动更新** | 默认开启。关闭会停止这项重新检查和空白说明的修复，适用于手动维护 `steam_cache` 的用户。关闭期间 **重新检查成就列表** 仍然可用。 |

针对特定来源的修复设置位于 **设置 → 模拟器**。**Ubisoft / Uplay R2** 包含
包健康状况、DLL 导入/恢复控件和有针对性的批量修复；加载器和 INI 的细节仍然
自动处理。

当更新总是在同一个下载的文件上失败时，**清除缓存** 是首先要尝试的办法。

## 诊断 {#diagnostics}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="设置 - 高级，诊断" loading="lazy" decoding="async"></picture><br>
<sub>版本信息，以及一键打开日志和数据文件夹</sub>
</div>

诊断卡片会显示应用、Electron、Node 和 Chrome 的版本，并可打开日志文件夹、
数据文件夹或检查更新。**导出日志 (.zip)** 会在应用运行时把每个日志文件打包成一个压缩包；
手动复制并不可靠，因为写入日志的进程从不停止。
你的用户名以及任何密钥、令牌或密码在压缩包中会被遮盖，磁盘上的日志则不会。错误报告需要什么，见
[疑难解答](troubleshooting.md#open-logs-and-local-data)。

## 配置文件备份 {#profile-backup}

<div align="center">
<picture><source srcset="../assets/shot/profile-backup-panel-800.webp 800w, ../assets/shot/profile-backup-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/profile-backup-panel.png" width="720" height="529" alt="设置 - 高级，配置文件备份" loading="lazy" decoding="async"></picture><br>
<sub>导出配置文件和恢复配置文件，位于设置 → 高级 下</sub>
</div>

**导出配置文件…** 会把你的设置、游戏库选择、预设、主题、封面、自定义背景、
GBE 还原点和游戏时长保存到一个 `.awbackup` 文件中，用于重新安装或换新电脑。登录信息、
缓存和日志从不保存，所以之后你需要重新登录 Epic、Steam、Xbox、PlayStation 和
RetroAchievements。**恢复配置文件…** 会先检查整个文件，并在下次
启动时应用。被替换的文件会保留，恢复失败时会把一切放回原处。

## 已移除的游戏 {#removed-games}

用 **从 AW Next 中移除** 移除的游戏会列在 **设置 → 常规 → 已移除的游戏** 中，
并且可以逐个或一次性全部恢复。用它处理扫描不断发现、但并非游戏的零散文件夹；若只想让真正的游戏
不显示，**从显示中隐藏** 更轻量
（见[隐藏、移除或清除游戏](#hide-remove-or-clear-a-game)）。

## 重置游戏的成就 {#reset-a-games-achievements}

游戏页面上游戏时长旁边或右键菜单中的 **重置成就**，会把每个成就
都恢复为锁定，这样你就可以把游戏重新打通一遍。成就解锁时，AW Next 会将它们作为
新成就提示。

<div align="center">
<picture><source srcset="../assets/shot/achievements-800.webp 800w, ../assets/shot/achievements.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/achievements.png" width="800" height="492" alt="带有“重置成就”的游戏页面" loading="lazy" decoding="async"></picture><br>
<sub>重置位于游戏自己页面上的完成数旁边</sub>
</div>

涉及的每个文件都会先备份到
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`，确认窗口会在触及任何内容之前
列出确切的文件。备份失败的文件会被跳过，而不是被清除。

| 来源 | 重置的作用 |
|---|---|
| Steam 模拟器（Goldberg / GBE 及兼容布局，包括 Goldberg SocialClub 和 Uplay R2） | 删除成就存档。模拟器会在下次解锁时写入新的。 |
| RPCS3 | 删除 `TROPUSR.DAT`。奖杯列表（`TROPCONF.SFM`）保持不动。 |
| ShadPS4 | 重新锁定 `TROP*.XML` 内的奖杯，该文件同时保存奖杯列表，所以是编辑文件而不是删除。 |
| KytyPS5 | 删除游戏的 `trophies_*.json` 解锁文件。奖杯列表保留在游戏自己的包中。 |
| Xenia | 清除 `.gpd` 内的已获得标志，该文件同时保存成就列表，所以是编辑文件。 |
| Steam、GOG Galaxy、Ubisoft Connect、EA、Epic、Xbox | **无法进行。** 这些平台把解锁保存在你的账号中并重新同步；只有账号才能清除它们。AW Next 会这样说明。 |

保存在成就旁边的进度计数器（`stats.ini`、`stats.bin` 等）也会被重置并备份：
对于“行进 1000 公里”的成就，计数器就是进度，把它留满会让
成就立刻触发，或再也不会触发。

同一右键菜单中的 **还原成就备份** 会撤销整个重置。之后请刷新
游戏库以读取恢复的解锁。

> [!NOTE]
> 重置还会清除 AW Next 自己对已解锁内容的记录，包括正在运行的
> 后台跟踪器中的记录。否则重新获得的成就将永远不会再被提示。

## 重新锁定单个成就 {#re-lock-a-single-achievement}

在游戏页面上右键单击一个已解锁的成就，选择 **重新锁定此成就**，即可
单独再玩那一个。只有该成就会恢复为锁定：模拟器存档中它的标志、解锁时间和
进度，存档将计数器与它关联时的计数器，以及 AW Next 自己的
记录，所以你重新获得它时会作为新成就提示。确认窗口会列出文件，并且每个文件都会
先备份，与重置一样；**还原成就备份** 可以把它放回去。

请先关闭游戏。模拟器把解锁保存在内存中，并在游戏退出时写回，
这会撤销更改，所以游戏运行期间 AW Next 会拒绝。

它适用于 Steam 模拟器（Goldberg 和 GSE、CODEX、RUNE、OnlineFix、RLD!、
3DM、ALI213、TENOKE、Hoodlum、RAZOR1911、CreamAPI）、UniverseLAN、Nemirtingas、Uplay R1 和 R2、
Windows 上 GreenLuma 和 LumaPlay 的文本存档，以及 RPCS3、ShadPS4、Xenia、KytyPS5、Xbox
360 移植版和 XLLN 的主机存档。SmartSteamEmu（`stats.bin`）和 SKIDROW（`achieve.dat`）的存档由于布局没有文档，
不能逐个成就编辑；对这些请使用 **重置成就**。

## 隐藏、移除或清除游戏 {#hide-remove-or-clear-a-game}

游戏的右键菜单有三种让它消失的方式，从最轻到最强：

| 条目 | 会发生什么 | 如何撤销 |
|---|---|---|
| **从显示中隐藏** | 游戏会离开“所有游戏”、每个收藏集和统计，但仍被跟踪并仍会通知。 | 游戏被隐藏期间，收藏集菜单会显示一个 **已隐藏** 视图；在那里右键单击它并选择 **重新显示**。 |
| **从 AW Next 中移除** | 扫描会跳过该游戏：它离开游戏库。适用于工具和其他并非游戏的东西。 | **设置 → 常规 → 已移除的游戏**。 |
| **清除此游戏的数据...** | AW Next 保存的关于该游戏的一切都会被清除：它的成就存档（先备份，与重置一样）、游戏时长、缓存的成就列表和图标、单个游戏的设置，以及 AW Next 写入其文件夹的模拟器配置。确认窗口会先列出每个部分。 | 无需撤销：下次扫描会把该游戏作为新游戏重新找到。 |

## 重命名游戏 {#renaming-a-game}

右键菜单中的 **游戏设置 → 重命名…** 设置游戏的显示名称：在它的
磁贴和页面上、搜索和排序中、通知中，以及截图和剪辑所保存的文件夹中。
搜索仍然能通过原始名称找到该游戏。将字段留空，或选择
**恢复原名称**，即可恢复。名称按游戏保存在 `cfg/gameTitles.json` 中，因此
重新扫描后依然保留，并且包含在配置文件备份中。封面查找和游戏匹配使用原始
名称。

**设置 → 常规 → 以我的语言显示游戏名称**（默认开启）会以 Steam 在你的成就语言下给出的
标题显示 Steam 游戏（游戏有自己的语言时则用该语言）。
封面也遵循同一语言。Steam 本地目录负责你的 Steam 客户端已知的游戏；
其余的会成批询问一次，并在一个月后再次检查。你自己设置的名称始终
优先。

## 编辑游戏时长 {#editing-a-games-playtime}

右键菜单中的 **成就与游戏时长 → 编辑游戏时长…** 会替换游戏的总
游戏时长，例如从另一个追踪器带过来的时长，或遗漏了会话的时长。输入小时数
（`12.5`）或小时和分钟（`12h30` 或 `12:30`）。最后一次游玩的日期会保留，AW Next
会把之后的游玩时间加到新的总数上。你在 Steam 上拥有的游戏永远不会低于 Steam
报告的游戏时长：下次扫描会把较低的总数提升回 Steam 的数值。

## 为单个游戏使用不同的成就语言 {#a-different-achievement-language-for-one-game}

右键菜单中的 **游戏设置 → 成就语言** 会用不同于游戏库其他部分的语言显示单个游戏的成就和
通知。**与应用相同** 会回到全局设置。

## 手动添加游戏 {#add-a-game-manually}

游戏库搜索旁边的 `+` 会根据标题和可执行文件添加游戏，平台和 Steam AppID 可选。
用于没有任何来源能检测到的游戏：独立版本、便携
安装，或你自己启动的模拟器。

手动添加的游戏：

- 可以启动，并像其他条目一样跟踪游戏时长；
- 如果没有成就，则显示 **无成就**，并且不计入完成度统计，
  而不是算作 0%；
- 之后可通过添加 AppID 采用 Steam 成就架构，无需重新创建；
- 保留受保护的单个游戏诊断，而破坏性操作保持隐藏。

手动添加的文件夹在文件夹列表中带有一个紧凑图标，以便与
智能查找发现的位置区分。

## 手动设置游戏的 AppID {#set-a-games-appid-by-hand}

右键单击文件夹名称匹配多个 Steam 发布版、导致自动匹配选错的游戏，
然后选择 **手动设置 AppID...**。该选择按安装文件夹记住，并
写入 `steam_appid.txt`；**清除手动 AppID** 可撤销。游戏状态的 **修正
游戏 ID 文件** 也会询问 AppID，并以 AW Next 自己的建议为起点。

## 将成就标记为已解锁 {#mark-an-achievement-as-unlocked}

来源无法看到的成就（在你设置跟踪之前获得的，或从未被
模拟器记录的）可以通过其右键菜单的 **标记为手动解锁** 来标记。**清除手动
解锁** 可撤销。手动解锁会在多次扫描之间保留，并会被重置清除。

## 成就下的步骤 {#steps-under-an-achievement}

较长的成就可以拆分成你自己编写并勾选的步骤。在游戏页面上将鼠标悬停在它上面，
打开 **步骤**，或右键单击它并选择 **添加步骤**，然后输入一个步骤并按 Enter。
单击方框可勾选步骤，双击其文字可重命名，用叉号可删除。
游戏从不报告步骤，所以它们只会填充成就的进度条：解锁仍来自
游戏，一旦解锁，所有步骤都会显示为已完成。游戏内叠加层显示相同的步骤，
并可用鼠标或手柄勾选。

游戏页眉中的 **步骤** 可把列表导出为文件以便分享，或导入一个。文件包含
文本而不含勾选状态，其成就先按 ID 匹配，再按名称匹配；已有的步骤
保留其勾选状态。步骤保存在 `cfg/achievement-steps.json` 中，并包含在配置文件备份中。

## 模拟器和修复工具 {#emulator-and-repair-tools}

Goldberg / GBE Fork 设置的诊断和修复、GBE 运行时安装程序、Steamless 以及
可选的 API 检查绕过位于 **设置 → 模拟器** 和每个游戏的 **模拟器与工具**
子菜单中。它们的指南：

- [Goldberg / GBE 设置](emulator-setup.md) - 诊断并修复使用模拟器的 Steam 游戏
- [Uplay 设置，R1 和 R2](uplay-r2.md) - Ubisoft 游戏的对应方法
- [Goldberg / GBE 参考](../goldberg-gbe.md) - 文件格式和检测规则

同一菜单中的 **移除 AW Next 的模拟器配置** 只撤销 AW Next 写入游戏 `configs.user.ini` 的
DLC 部分、开关和标识键，绝不会动你或 repack 设置的值，
并且只有在文件中没有其他内容时才删除该文件。它会先精确显示将要移除的内容，
如果你从未备份过该文件，这是唯一的恢复办法。

**应用 GOG 成就修复 (UniverseLAN)…** 出现在带有 Galaxy dll 的 GOG 游戏上。它
会安装与该游戏的 Galaxy SDK 匹配的 UniverseLAN 版本，把原始 dll 保留为备份，并且
绝不覆盖现有的 UniverseLAN 存档。它在 `%LOCALAPPDATA%\UniverseLAN` 下写入的解锁
会像其他解锁一样被读取和提示。

如果修复换用了受支持的模拟器，[游戏状态](game-health.md#the-repairs)中的 **撤销模拟器切换**
会把破解自带的文件放回去。

> [!WARNING]
> 修复会创建备份，但仍然会修改游戏文件。请只对你拥有的游戏使用。

---

**下一页：** [常见问题](faq.md) - 对最常见问题的简短解答。

<div align="center">

[← 文档](README.md) · [疑难解答](troubleshooting.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
