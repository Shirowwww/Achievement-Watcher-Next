---
title: "快速入门"
description: "安装 Achievement Watcher Next，跟随首次运行向导，选择简易或高级界面，查找游戏并保持应用为最新版本。"
---

# 快速入门

AW Next 是适用于 Windows 和 Linux 的桌面应用。发布版自带运行时，所以只有从源码构建时才需要 Node.js。在 Linux 上，请按照 [Linux 与 Steam Deck](linux.md) 的说明安装 AppImage，然后回到这里：下面的内容全部适用，只需把 `%APPDATA%\Achievement Watcher Next` 换成 `~/.config/Achievement Watcher Next`。

## 安装 {#install}

| 步骤 | Windows 10 和 11 | Linux（x64，测试版） |
|---|---|---|
| **获取** | 从[最新发布版](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)下载 `Achievement.Watcher.Setup.<version>.exe`，或者下载 `Achievement.Watcher.Portable.<version>.zip` 让数据保存在应用旁边 | 从同一发布版下载 `Achievement.Watcher.<version>.AppImage` |
| **启动** | 运行安装程序，选择文件夹，然后从开始菜单打开 AW Next | 先 `chmod +x` 再运行。需要 FUSE 2：Ubuntu 24.04 上是 `libfuse2t64` |
| **数据** | `%APPDATA%\Achievement Watcher Next`（便携版把 `data` 文件夹放在可执行文件旁边） | `~/.config/Achievement Watcher Next` |

> [!WARNING]
> 安装程序使用项目自己的自签名证书（`CN=Shirow`）签名，所以 Windows
> SmartScreen 仍可能要求确认。请参阅
> [杀毒软件或 SmartScreen 警告](troubleshooting.md#antivirus-or-smartscreen-warning)。应用内
> 更新只会安装由该证书签名的发布版，并通过指纹固定。

## 首次启动 {#first-launch}

<div align="center">
<picture><source srcset="../assets/shot/onboarding-dialog-800.webp 800w, ../assets/shot/onboarding-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-dialog.png" width="720" height="475" alt="首次运行向导：选择语言以及简易或高级界面"></picture><br>
<sub>六个步骤：基础、个人资料、游戏、来源、外观与提醒，以及最后的总结</sub>
</div>

首次运行向导会询问那些决定游戏库内容的选项：

- **基础**：语言（界面语言，以及来源支持时的游戏元数据语言）和界面，
  简易或高级（见下文）。两者都不会预先选中。
- **个人资料**：显示在页眉的名称、可选的本地头像，以及你的主要 Steam 账号。
- **游戏**：在这台电脑上找到的内容及数量。只有缺少游戏时才需要添加文件夹。
- **来源**：可选的登录（Steam、Epic、Xbox、PlayStation、RetroAchievements），用来读取你真实的
  游戏库和在另一台电脑上完成的解锁。可以跳过，之后在 **设置 → 来源** 中连接。
  所有来源开关都在 **微调来源** 下，默认折叠，因为默认值会读取所有已安装的内容。
- **外观与提醒**：主题以及解锁的提示方式，带有 **测试通知** 按钮。
  默认的 **自动** 无需做任何决定。
- **完成**：总结页，每个选项旁有 **更改** 按钮，并指向收藏集、奖杯模式、视频片段
  和叠加层。

<div align="center">
<picture><source srcset="../assets/shot/onboarding-ready-dialog-800.webp 800w, ../assets/shot/onboarding-ready-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-ready-dialog.png" width="720" height="475" alt="首次运行向导的最后一步，包含总结和“值得了解”卡片" loading="lazy" decoding="async"></picture><br>
<sub>最后一步：每个选项都带有更改按钮，其后是每个值得了解的功能各一张卡片</sub>
</div>

**跳过设置** 会保留你的回答，其余保持原样，并开始第一次扫描。**设置 →
常规** 可以重新打开向导。

## 简易与高级 {#simple-and-advanced}

在首次运行向导中选择一种，之后可随时通过 **设置** 顶部的 **界面** 控件更改。

<div align="center">
<picture><source srcset="../assets/shot/settings-panel-800.webp 800w, ../assets/shot/settings-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/settings-panel.png" width="720" height="529" alt="AW Next 设置" loading="lazy" decoding="async"></picture><br>
<sub>界面控件位于面板标题旁边；搜索框会同时筛选所有标签页</sub>
</div>

- **简易** 显示日常使用的标签页：常规、外观、手柄、通知、通知预设、来源、文件夹和帮助。
- **高级** 增加 **Steam / GBE Fork**、**Ubisoft / Uplay R1/R2** 和 **高级** 标签页，以及其他标签页中
  更深入的选项。

**简易只是隐藏控件，不会关闭任何功能。** 跟踪、扫描和通知的行为完全相同，你设置的每个值在
切换回来后依然保留。游戏状态也是同样的思路：简易模式显示 *已找到成就数据* 或 *游戏启动时检测*，高级模式则给出精确的数量、文件和
进程名称。现有安装会升级为 **高级**，所以你用过的功能都不会消失。

**设置** 顶部的搜索框会同时筛选所有标签页，并统计每个标签页的匹配数。
它搜索标签、说明、选项值和内部名称，所以 `hideZero` 在任何语言下都能找到同一行。
`Ctrl+F` 跳转到搜索框，`Esc` 清除内容。

## 游戏库 {#the-library}

在 **设置 → 来源** 中，盾牌图标标出官方桌面游戏库。启用一行并刷新；
只会显示在这台电脑上检测到的游戏库。请参阅[兼容的来源](sources.md)。

游戏库搜索框与 `+` 按钮之间的选择器可在六种视图间切换：大卡片、
竖版封面、它们的两种紧凑变体、列表，以及包含游戏时长和上次
游玩时间的详细信息表。所选视图会被保存，所有视图的卡片、筛选器和右键菜单都相同。

<div align="center">
<picture><source srcset="../assets/shot/library-views-800.webp 800w, ../assets/shot/library-views.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/library-views.png" width="800" height="492" alt="游戏库的详细信息视图，显示最新成就、上次游玩和游戏时长" loading="lazy" decoding="async"></picture><br>
<sub>详细信息视图：每款游戏的最新成就、上次游玩和游戏时长一目了然</sub>
</div>

**设置 → 外观 → 游戏库磁贴** 可设置磁贴大小和磁贴间距（最小为 0），并为所有视图
统一显示或隐藏游戏名称、进度条、平台图标、状态点和两个按钮。Steam 上列出但没有成就的游戏会显示其艺术图，而不是进度条；
**无成就游戏的进度条** 可以把进度条找回来。

右键单击游戏可以重命名、编辑游戏时长或加入收藏集。你设置的名称在重新扫描和恢复后依然保留，
而封面和匹配仍使用原始标题。Steam 游戏可以使用你的成就语言显示标题
（**设置 → 常规**）。

### 收藏集 {#collections}

收藏集是你自己的游戏分组。右键单击游戏，选择 **收藏集**，勾选一个，
或新建一个。已安装开关旁边的收藏集按钮可以把游戏库筛选为某一个
收藏集，个人资料中的数字也会随之变化。

<div align="center">
<img src="../assets/shot/collections-flow.webp" width="800" height="493" alt="创建“收藏夹”收藏集，从右键菜单把游戏加入其中，然后在筛选菜单中选择它，游戏库和个人资料的合计就缩小到这些游戏" loading="lazy"><br>
<sub>创建收藏集，从右键菜单添加游戏，然后按它筛选游戏库</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/collections-panel-800.webp 800w, ../assets/shot/collections-panel.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/collections-panel.png" width="800" height="289" alt="按“收藏夹”收藏集筛选的游戏库，个人资料的数字只统计其中的游戏" loading="lazy" decoding="async"></picture><br>
<sub>查看单个收藏集：按钮采用它的图标和颜色，合计只统计其中的游戏</sub>
</div>

收藏集有名称、颜色，以及图标或你自己的图片。按钮菜单中的 **编辑收藏集…** 会打开
编辑器，也可以在那里删除它；其中的游戏仍保留在游戏库中。

<div align="center">
<picture><source srcset="../assets/shot/collection-editor.webp 550w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/collection-editor.png" width="360" height="337" alt="收藏集编辑器，包含名称、颜色、图标和图片" loading="lazy" decoding="async"></picture><br>
<sub>收藏集编辑器</sub>
</div>

### 库统计 {#library-stats}

个人资料页眉中完成率旁边的圆形按钮会打开 **库统计**：总体
完成度、已解锁和未解锁数量、每款游戏的平均值、平均游戏时长和已记录游戏时长、奖杯
数量，以及每个平台一行。**仅显示已安装的游戏** 会把合计限制在这台电脑上。按钮
旁边的箭头把个人资料页眉折叠成一行，给游戏库留出更多空间（**设置
→ 外观 → 个人资料** 里有同样的选项）。

<div align="center">
<picture><source srcset="../assets/shot/stats-overview-800.webp 800w, ../assets/shot/stats-overview.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-overview.png" width="800" height="514" alt="库统计面板：总体完成度、已解锁和未解锁数量、每款游戏的平均值和游戏时长" loading="lazy" decoding="async"></picture><br>
<sub>概览：完成度、数量、每款游戏的平均值和游戏时长</sub>
</div>

**奖杯** 为每款完成的游戏计一个白金（PlayStation 游戏则在获得其白金奖杯后计入），并按稀有度给其余每个已解锁成就评级，
阈值显示在进度条下方（它们
遵循[通知](notifications.md#trophy-mode)中的稀有度设置）。**白金游戏** 列出
你完成的游戏及时间，**最稀有的成就** 列出你拥有的最难的成就，**所有成就**
则打开完整列表。

<div align="center">
<picture><source srcset="../assets/shot/stats-trophies-800.webp 800w, ../assets/shot/stats-trophies.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-trophies.png" width="800" height="514" alt="奖杯数量、白金游戏、最稀有的成就和各平台表格" loading="lazy" decoding="async"></picture><br>
<sub>奖杯、白金游戏、最稀有的解锁以及各平台合计</sub>
</div>

## 主题 {#themes}

**设置 → 外观** 为整个应用和游戏内叠加层配色。内置十三套配色，
每一套都可以编辑：选择一个主题，编辑器就会打开它的颜色，每一层一行（窗口
背景、顶栏、游戏库面板、卡片和行、设置窗口、文本、弱化文本、边框、强调色）。
每一层可以设置带不透明度的颜色，也可以设置渐变；五个表面层
还可以设置背景图片，并选择适应方式，以及彩色蒙层或模糊效果。

编辑时实时预览，不会写入任何内容。**保存主题** 会把它变成你自己的主题：保留名称则
替换该主题，输入另一个名称则得到第二个主题。**自定义…** 是草稿槽位，始终
可编辑，从它保存也不会覆盖它。**全部重置** 会还原你正在编辑的主题：
内置主题恢复自己的配色，已保存或导入的主题恢复磁盘上的内容，
自定义则恢复为默认配色。

**主题文件** 把主题变成一个可移植的文件。**导出主题…** 会写出一个 `.awtheme`，
包含你用到的配色、渐变、效果和图片，不含任何关于你电脑的信息（图片以
字节形式保存，而不是路径）。在你以自己的名称保存之前，内置主题的导出会被拒绝，
否则该文件在别处会作为“Nord”安装，并覆盖那里已有的 Nord。**导入
主题…** 会先显示应用套用该主题后的样子，附带名称、作者、版本和图片数量，
只有你确认后才会安装。**删除主题** 会把导入的主题连同其图片一起删除。

`.awtheme` 只包含颜色、数字和图片，所以它无法运行任何程序，也无法访问网络
（见[格式参考](../awtheme-format.md)）。其他人制作的主题在
[主题库](../gallery/themes/)里，提交你自己的主题只需[一个文件](community-galleries.md)。放入
`%APPDATA%\Achievement Watcher Next\themes` 的普通 `*.css` 文件仍会出现在选择器中，
但无法导出。

## 帮助与提示 {#help-and-tips}

**设置 → 帮助** 是实时参考，按问题出现的方式分组：**快速上手**、
**出现问题时**、**模拟器游戏** 和 **个性化**。它会显示你实际的热键、手柄
布局和按键绑定、主题以及通知方式，并随着设置的更改而刷新。它的搜索
不区分大小写和重音，每个主题在两种界面模式下都可用。

## 查找游戏和存档 {#find-games-and-saves}

打开 **设置 → 文件夹** 并选择一个路径：

- **智能查找** 会先把找到的所有内容交给你批准，然后才添加。它按名称识别游戏库
  文件夹（“Games”“Jeux”“Repacks”以及二十多种语言中的对应名称，还有
  “Emulators”和“Emulation”），覆盖所有驱动器，并读取启动器记录的信息：Epic
  清单、GOG Galaxy 和 Ubisoft Connect 的注册表项，以及 Windows 为你选作 Xbox 游戏的
  驱动器写入的指针。这样无需扫描就能找到以商店命名的游戏库（`D:\Epic Games`、
  `D:\XboxGames`）。由启动器管理的游戏保持各自的来源。智能查找会添加同一文件夹中的
  其他所有内容，通常 repack 版本或 Goldberg 构建最终就在那里。
- **添加文件夹** 会监视你选择的位置。
- **生成配置** 会执行更完整的扫描，并可应用已启用的模拟器设置选项。

如果文件夹被拒绝，请选择直接包含存档文件夹、AppID 文件夹、
`steam_settings` 或模拟器配置的目录。[疑难解答](troubleshooting.md#a-game-is-missing)
列出了最先要做的检查。当文件夹名称匹配多个 Steam 发布版而匹配有误时，
右键单击游戏并选择 **手动设置 AppID...**（见
[手动设置游戏的 AppID](advanced.md#set-a-games-appid-by-hand)）。

成就列表不需要 Steam Web API 密钥：它们来自公开端点，并按
语言缓存，所以之后游戏库在离线时也能使用（[原理](sources.md#steam-metadata-without-an-api-key)）。

## 通知 {#notifications}

**设置 → 通知** 设置推送方式：**自动**（默认：能显示时使用游戏内叠加层，
不能时使用 Windows 或桌面通知，且同一次解锁绝不会提示两次）、
**游戏内叠加层**、**Windows 通知** 或 **两者**。如果 Windows 的勿扰模式在游戏时
隐藏了通知，请启用 **高优先级通知** 并同意一次性请求。测试
按钮让你在启动游戏前试用所有方式。请参阅[通知](notifications.md)和
[“自动”的判断依据](notifications.md#how-automatic-decides)。

## 检查游戏 {#check-on-a-game}

游戏磁贴上的 **工具** 按钮会打开它的 **游戏状态** 面板：AW Next 能否看到该游戏、读取
它的成就并提示它的解锁，以及适用的修复。报告问题之前，
首先应该打开它（见[游戏状态](game-health.md)）。想从零开始重玩一款游戏，请使用
[重置成就](advanced.md#reset-a-games-achievements)，它会先备份所有内容。

## 托盘与开机启动 {#tray-and-startup}

关闭主窗口后，AW Next 会留在系统托盘，后台跟踪器继续监视
文件和进程，用于记录游戏时长和解锁。没有打开窗口时，它会把内存还给 Windows，
定期的游戏库扫描会在游戏运行期间等待。**设置 → 高级 → 成就数据自动更新**
可为手动维护 `steam_cache` 的用户关闭该扫描。AW Next 是否随
Windows 启动以及是否关闭到托盘，在 **设置 → 常规** 中设置。要完全退出，请使用
托盘菜单。

## 更新与现有数据 {#updates-and-existing-data}

已安装的发布版会检查项目的 GitHub 发布源，但从不在游戏期间检查。新版本会通过
桌面通知和标题栏标签提示（托盘图标也会出现蓝点），
并且不会从游戏或其他应用夺走焦点。提示会一直保留到你关闭它，并在
游戏结束后再次出现。

单击通知或标签即可打开更新窗口。它会显示你跳过的每个
版本的发布说明以及下载大小，并提供 **立即更新**、**稍后** 和 **跳过此版本**。
在你选择之前不会下载任何内容。选择 **立即更新** 后，同一窗口会跟踪下载进度，
你可以取消下载，或把它放到后台。标题栏标签显示状态，并可把窗口调回来。
下载完成后，安装程序会显示自己的进度卡片，AW Next 随后重启。如果有游戏
正在运行，安装会等它关闭，你也可以在窗口中选择仍然安装。**设置 →
检查更新** 会立即打开该窗口。更新只下载变化的部分，失败时会自动
回退到完整安装程序。Linux 的 AppImage 从同一发布版更新（见
[Linux 更新](linux.md#updates)）。

在旧版本上安装新版本时，你的数据会保留在 `%APPDATA%\Achievement Watcher Next`：
设置、监视的文件夹、缓存、游戏时长、日志、通知资源和本地账号数据。
升级后的首次启动时，AW Next 会导入之前的安装：

| 你从哪里升级 | 从哪里导入 | 会发生什么 |
|---|---|---|
| Achievement Watcher 3.x | `%APPDATA%\Achievement Watcher 3.0` | 设置、预设、主题、封面、缓存、备份和日志都会被迁移 |
| Achievement Watcher 1.6.8 | `%APPDATA%\Achievement Watcher` | 同上，适用于跳过 3.x 的用户 |
| 全新的机器 | 无 | AW Next 以默认设置启动 |

导入只运行一次，会复制小文件，对只写一次的大文件创建硬链接，并且**绝不会删除或
修改被读取的文件夹**。保存在注册表中的游戏时长计数器也会一并迁移，
截图会移到 `Pictures\Achievement Watcher Next`，除非你选择了自己的文件夹。

卸载时提供一个默认关闭的选项：**同时删除设置、缓存和已保存的数据**（静默卸载时用
`--delete-app-data`），它会删除数据文件夹及注册表中的游戏时长。
如果更新总是在同一个下载的文件上失败，**设置 → 高级 → 清除缓存** 只会删除
可重新下载的缓存（更新文件、Steam 和 Ubisoft 的架构与图标、模拟器修复工具）。
设置、存档和备份会保留。

---

**下一页：** [兼容的来源](sources.md)：AW Next 能读取什么，以及每种来源需要什么。

*如果你知道自己需要什么，可以直接跳转：[通知](notifications.md) ·
[游戏状态](game-health.md) · [Goldberg / GBE 设置](emulator-setup.md) ·
[疑难解答](troubleshooting.md)*

<div align="center">

[← 文档](README.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
