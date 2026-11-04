---
title: "成就通知与弹窗"
description: "叠加层弹窗还是 Windows 通知：推送方式、自动、声音、位置、奖杯模式、OBS、截图纪念和视频剪辑。"
---

# 成就通知与弹窗

AW Next 通过原生 Windows 通知（toast）、游戏内叠加层弹窗，或两者同时来提示解锁。
在 **设置 → 通知** 中选择方式。

在 Linux 上，通知使用桌面自带的通知（GNOME 或 KDE），叠加层的工作方式相同。
勿扰模式和高优先级通知开关见[支持的桌面环境](linux.md#supported-desktops)。

<div align="center">
<picture><source srcset="../assets/shot/notifications-panel-800.webp 800w, ../assets/shot/notifications-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notifications-panel.png" width="720" height="529" alt="设置 - 通知"></picture><br>
<sub>一种推送方式，一个预设 - 其余交给“自动”处理</sub>
</div>

## 选择推送方式 {#choose-a-delivery-mode}

| 方式 | 行为 |
|---|---|
| **自动**（默认） | 能显示时使用游戏内叠加层，不能时使用 Windows 通知。 |
| **游戏内叠加层** | 始终在运行的游戏上方显示带样式的弹窗，即使在独占全屏中也是如此，那里它可能看不到。如果叠加层完全无法显示，该通知会以 Windows 通知的形式送达。 |
| **Windows 通知** | 始终使用 Windows 系统通知。成就和进度通知使用成就图标；游戏时长通知可以包含游戏美术图和进度条。 |
| **两者** | 同一事件通过两种渠道发出。 |

AW Next 自己发出 Windows 通知，不会启动任何其他程序（包括 PowerShell），所以通知会
立即出现。在 `options.ini`（`[notification_advanced] appID`）中设置的自定义应用 ID 仍
走原来的 PowerShell 途径。

在任何方式下，游戏库窗口都可以保持关闭：推送由后台跟踪器负责。

<div align="center">
<picture><source srcset="../assets/shot/notification-popup.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup.png" width="440" height="126" alt="解锁弹窗" loading="lazy" decoding="async"></picture><br>
<sub>叠加层弹窗，由所选预设配合游戏自己的美术图绘制</sub>
</div>

无论哪种方式，**Websocket @localhost:8082** 都会把每个通知事件以 JSON 格式广播到
本地 websocket，供直播叠加层和其他工具使用。它默认开启，只监听 `127.0.0.1`，
自身不显示任何内容。如果不用，请关闭它。同一地址还提供现成的
直播叠加层：见[在直播中显示解锁（OBS）](#show-unlocks-on-stream-obs)。

> [!TIP]
> 更改方式后请使用测试按钮。测试成功说明显示路径正常；真正的
> 解锁仍取决于游戏来源是否被正确监视。

### “自动”如何判断 {#how-automatic-decides}

每条通知都只会根据 AW Next 当时能观察到的情况路由一次：

| 情况 | 会发生什么 |
|---|---|
| 没有任何东西遮挡屏幕 | 游戏内叠加层。 |
| 游戏处于**全屏**（带 Windows 全屏优化的 Direct3D，大多数游戏都是） | Windows 通知，显示在游戏上方且不抢夺焦点：开启高优先级通知时使用高优先级通知，否则使用提醒，AW Next 会在通常的通知时长后将其关闭。无边框和窗口化的游戏仍使用叠加层。 |
| 游戏以**传统独占模式**占用屏幕（较旧的游戏、许多 OpenGL 游戏，或关闭了全屏优化） | 其他应用不会在该屏幕上绘制任何内容。通知会进入通知中心；声音和手柄震动仍会播放。在游戏中改用无边框模式可让它回到屏幕上。 |
| 应用无法显示弹窗（没有可用的预设，渲染器不可用） | Windows 通知。 |
| 叠加层显示失败 | 十分钟内使用 Windows 通知，之后再次尝试叠加层。 |
| 已请求叠加层但从未回报 | 不再发第二条通知，以避免重复。下一次解锁使用 Windows 通知。 |

AW Next 会记住每款游戏上次是通过哪种渠道送达的，仅在 Windows 无法判断游戏是否处于独占全屏时，
将其用作决胜依据。只有在明确失败之后才会启用备用渠道，所以同一次解锁绝不会被提示两次。AW Next 不会向游戏注入，
也不会强制更改显示模式。

### 在哪里查看当前状态 {#where-the-current-state-is-shown}

游戏的 **游戏状态** 面板中有一行“通知”，写明送达上一条
通知的渠道及原因，例如 *正常 - Windows 备用已启用*（简易模式）。如果还没有
通知，则显示已配置的方式。如果 Windows 因为游戏处于全屏或开启了勿扰模式而把通知留在
通知中心，这一行也会说明。请参阅
[游戏状态](game-health.md)。

## Windows 高优先级通知 {#priority-windows-notifications}

全屏游戏和其他 Windows 自动规则可能会开启 **勿扰模式**，它会把
普通的 toast 送进通知中心而不显示。**设置 → 通知 → 高优先级
通知** 会把成就解锁标记为重要。Windows 会询问一次是否允许 AW Next 发送
这些通知；之后可在 Windows 通知设置中更改答案。

它默认关闭，只涵盖成就和完成度的解锁，不涉及进度或游戏时长。
该 toast 使用 `urgent` 场景，需要 Windows 11（版本 22546）或更高；在 Windows 10 上
该设置不起作用。请参阅 [Microsoft 的应用通知文档](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content)。

## 由 Steam 运行的游戏 {#games-steam-runs}

Steam 会为它运行的游戏显示自己的弹窗，所以 AW Next 默认对这些游戏保持安静。启用
**设置 → 通知 → Steam 客户端游戏** 后，也会收到 AW Next 的通知，带有声音、
叠加层、稀有度和截图纪念。它涵盖你拥有的游戏，以及通过 SteamTools、
LuaTools 或 GreenLuma 添加的游戏：AW Next 跟踪 Steam 在 `appcache\stats` 中重写的统计文件。若只想
保留 AW Next 的通知，请关闭 **Steam → 设置 → 通知 → 我解锁成就时**。

## 弹窗的外观 {#how-the-popup-looks}

游戏内弹窗的外观由**预设**决定：应用自带十个，你可以设计自己的，
预设也可以作为一个 `.awpreset` 文件分享。请参阅[预设与预设设计器](presets.md)。
同一设置中的 **不透明度**（30% 到 100%）决定弹窗的透明程度。

## 声音、音量和时长 {#sounds-volume-and-duration}

- 在通知设置中导入 `.wav`、`.mp3`、`.ogg`、`.flac`、`.m4a` 或 `.aac` 文件。
- 声音列表中的 **随机** 会为每条通知，以及每次预览或测试，
  从你的文件中播放不同的一个。
- **稀有成就声音** 和 **100%完成声音**（高级模式）为这些弹窗设置各自的
  声音，用于叠加层和 Windows 通知。两者初始都是“与解锁相同”；选“无”会让
  该类弹窗静音。在游戏自己的面板中为某款游戏选的声音仍然优先。
- **进度声音**（高级模式）对进度弹窗起同样的作用。它优先于游戏自己的
  声音，除非该游戏设为无声音。若要让某款游戏的进度弹窗静音，请右键单击它并
  将其进度静音。
- **模拟器**（高级模式）为每种主机提供各自的预设和声音：列出 Xenia、RPCS3、shadPS4 和
  Kyty。重新编译的 Xbox 360 游戏遵循 Xenia 的选择，PS4 移植版遵循 shadPS4 的选择，
  **与主预设相同** 则沿用主设置。
- 叠加层音量范围为 0% 到 200%；超过 100% 时叠加层会增强声音。Windows 通知的
  播放受系统音频路径限制。
- 时长遵循预设，或使用固定上限。
- 游戏时长通知没有声音。

分享的预设可以自带声音，它会取代此处选择的声音。请参阅
[分享预设](presets.md#share-a-preset)。

## 位置和大小 {#position-and-scale}

在通知设置中选择角落、边缘或居中位置。位置是相对于整个屏幕测量的，所以靠底部的锚点位于底边，
而不是任务栏上方，无论预设在卡片周围留了多少阴影或光晕的空间，
卡片都会贴紧所选的边缘。AW
会在预设首次弹出后于后台为每个位置测量一次，所以第一次弹窗
仍显示在原来的位置。卡片宽度随文字长度变化的预设（PS5 Steam、Slim）
每次弹窗都要测量，这会让它延迟约半秒。

**重新定位** 会移动自定义位置，它将完全按你放下的位置使用；保存在已不存在的显示器上的位置会
被拉回可见区域。有多个屏幕时，弹窗出现在你正在玩的游戏所在的屏幕上，
而不是鼠标所在的屏幕，自定义位置会保持相对于该
屏幕的位置。Windows 通知始终显示在主屏幕上。

大小设置会在不改变布局的前提下缩放整个弹窗，**重新定位** 会按
该大小预览。

### 进度弹窗 {#progress-popups}

计数型成就（击败 50 个敌人、行进 100 公里）可以在每一步弹出进度通知。在
高级模式下，**进度位置** 和 **进度大小** 为这些弹窗设置各自的位置和
大小。默认的 **与解锁相同** 会遵循游戏自己的位置（如果有）；其他任何
选择都适用于所有游戏的进度弹窗。**进度位置** 旁边的十字准星可为仅进度弹窗设置
自定义锚点。这些设置只移动游戏内弹窗。

通用通知设置中的 **进度里程碑** 只会在计数器越过目标的又一个 10%、25% 或 50% 时
显示进度通知。它适用于弹窗和 Windows 通知。
解锁本身始终会显示。

叠加层列表有自己的键盘快捷键（见
[叠加层指南](overlay.md#keyboard-shortcuts-overlay-open)）和可选的手柄操作（见
[手柄指南](controller.md)）。

## 按游戏设置 {#per-game-behavior}

打开游戏的工具面板并选择 **通知**，可为该游戏设置专属的弹窗预设、
位置、声音或大小。每个字段都继承全局设置，只有你更改的值才会
保存；声音还可选择静音和随机。位置旁边的十字准星可把预览拖到
该游戏弹窗应出现的位置。五个测试按钮会预览该游戏及其美术图，
而不改变成就进度。被删除的预设或声音会回退到全局值，重命名
用户预设会保留其游戏分配。

右键单击游戏可静音其进度通知，同时保留解锁和完成度
通知。

全球解锁率不高于稀有上限的成就会显示其百分比，并采用
预设的稀有样式：5% 及以下为**金色**，不超过 10% 为**银色**，不超过 15% 为**铜色**。把
**设置 → 常规 → 稀有度阈值** 设为自定义（高级模式），即可调整这些
上限。

### 奖杯模式 {#trophy-mode}

**设置 → 常规 → 稀有度显示** 切换到 **奖杯模式**：每个成就按
全球解锁率评级（低于 20% 为金，低于 50% 为银，其余或解锁率未知时为铜），在游戏窗口、
叠加层、个人资料奖杯和通知中都是如此。**稀有度
阈值** 可调整分界线。三个等级都使用预设的稀有样式（`state-rare` 加上
`tier-gold`、`tier-silver` 或 `tier-bronze`）；白金仍是单独的完成状态。应用
通过 `rarityTier`（连同 `rarityMode` 和本地化的 `rarityGrade`）把等级交给预设；没有该字段的
预设会回退到百分比。

连接 PlayStation 账号后（**设置 → 来源**），同时在 PlayStation 上发售的游戏会使用它真实的
奖杯列表，无论其成就来自哪里：每个成就采用名称或说明相同的奖杯的
等级和 DLC 分组。真实的白金会在每种稀有度模式下显示
（游戏页面、统计、100% 弹窗），带有名称、说明和图标，并在获得该
奖杯后计入，即使还有 DLC 奖杯未获得。PlayStation 模拟器保留自己的奖杯。AW
按游戏的原始名称查找列表，所以重命名游戏没有影响。

每个来源都会弹出 100% 弹窗，包括实时的来源（Xenia、重新编译的移植版、GOG Galaxy、
Ubisoft Connect、Xbox PC）。当游戏有白金时，与之相关联的成就会作为
白金弹出。

<div align="center">
<picture><source srcset="../assets/shot/trophy-profile.webp 640w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/trophy-profile.png" width="440" height="148" alt="个人资料页眉，显示白金、金、银、铜和普通奖杯数量" loading="lazy" decoding="async"></picture><br>
<sub>个人资料按等级统计每次解锁，已完成的游戏计为白金</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/trophy-game-panel.webp 800w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/trophy-game-panel.png" width="560" height="672" alt="游戏页面，每个成就被评为金、银或铜" loading="lazy" decoding="async"></picture><br>
<sub>在游戏页面上，每个成就都带有其等级和拥有它的玩家占比</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/notification-popup-trophy.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup-trophy.png" width="440" height="126" alt="以金色样式绘制的解锁弹窗" loading="lazy" decoding="async"></picture><br>
<sub>AW Next 预设中的金色解锁</sub>
</div>

## 在直播中显示解锁（OBS） {#show-unlocks-on-stream-obs}

把弹窗当作窗口来捕获是行不通的：弹窗窗口只存在几秒，所以 OBS 永远
抓不到它。请使用 **浏览器** 来源，OBS 会在整场直播期间保持它处于加载状态。

1. **设置 -> 通知 -> OBS 浏览器源。** **预览** 会在你的浏览器中打开该页面，
   每十秒显示一次示例解锁，这是检查整条链路是否正常的最快方法。**复制链接**
   会复制地址。
2. 在 OBS 中：**+ -> 浏览器**，把地址粘贴到 **URL**。
3. 设置任意 **宽度** 和 **高度**。卡片会缩放以填满该框。

该来源显示与游戏内弹窗相同的预设、美术图和稀有度样式，并遵循你在设置中选择的
预设。**设置 -> 通知** 下的测试按钮也会发送到这里，
无论推送方式是什么。

> [!TIP]
> **来源越大，卡片越清晰。** 卡片按来源的大小排版，而不是拉伸。
> 把来源设为预设自身尺寸的约两倍，并在场景中按一半大小放置：
> `http://127.0.0.1:8082/obs/_config` 会报告这两个数值。只有成就图标仍然偏软，
> 因为 Steam 发布的图标是 64x64。

### 选项 {#options}

把它们追加到地址后面，格式为 `?first=x&then=y`：

| 选项 | 效果 |
|---|---|
| `?test=1` | 每十秒重复一次示例解锁，用于摆放来源。之后请删除。 |
| `?scale=2` | 把卡片固定在该缩放比例，而不是适应来源。`?scale=app` 遵循设置中的大小。 |
| `?duration=8000` | 每张卡片显示指定的毫秒数，而不是配置的时长。 |
| `?sound=1` | 通过浏览器源播放通知声音，这样无需捕获桌面音频就能传到直播中。默认关闭，因为应用已经在你的扬声器上播放。勾选来源上的 **通过 OBS 控制音频** 即可将其加入混音。 |
| `/obs/preset/Xbox/` | 为直播使用一个指定名称的预设，无论桌面设置的是什么。任何已安装的预设名称都可以，包括你自己的。 |

### 注意事项 {#notes}

- 两次解锁之间页面是空白的，这是有意为之：不绘制任何内容，所以在
  成就弹出之前不占用 CPU。
- 仅限本地。页面和数据源都监听 `127.0.0.1`，所以网络上的其他设备
  无法访问它们。
- 对于在本地保存美术图的来源（Goldberg、模拟器、你自己的游戏库图片），成就图标由这台电脑提供，
  且仅限通知所宣布的图片。
- 同一时间只有一个 AW Next 副本提供该地址：最先启动的那个。第二个实例，或者端口 8082 上的
  其他任何程序，都会让来源无处可连。关闭多余的副本，来源会在几秒内
  重新连接。
- 如果来源在真实解锁时仍然空白，请先检查测试按钮是否有效，再检查
  **Websocket** 一行是否已开启。

## Steam 库页面上的成就 {#achievements-on-steams-library-pages}

Steam 不会在非 Steam 快捷方式的页面上显示成就。Steam 插件（桌面上是 Millennium，
游戏模式下是 Decky）可以通过同一个本地数据源 `ws://127.0.0.1:8082` 向 AW Next 询问该快捷方式的成就，
并自行绘制。AW Next 一次回答一款游戏：插件必须
指明是哪一款，而回答中不包含文件夹、账号或来源名称。

AW Next 自己的 Millennium 插件位于仓库的 `millennium/` 文件夹中，它会为 AW Next 识别的每个
快捷方式这样做：游戏页面随后会显示 Steam 原生的成就部分、游玩栏
计数器、完整列表和 Big Picture 的“你的内容”标签页。当快捷方式
启动的 exe 与 AW Next 中游戏的 **可执行文件** 相同时，匹配效果最好。它的 README 介绍了安装、页面
保持为空时要检查什么，以及它与 Steam Cartridges、NativeGameLink 和 Game
Data Linker 如何共存。`playnite/` 中的 Playnite 扩展以同样的方式询问，适用于 Playnite
库中的任何游戏，它的 README 介绍了安装方法以及主题可以放置的面板。下面的请求
面向编写其他插件的人。

插件发送：

```json
{ "cmd": "bridge-game", "id": "r1", "exe": "D:\\Games\\Pinyon Shift\\pinyon_shift.exe", "launchOptions": "", "steamAppId": 0, "name": "Forza Horizon" }
```

除 `cmd` 外的每个字段都是可选的，多提供一个就多一分帮助。AW Next 按以下顺序尝试：游戏库为某款游戏找到的
exe、启动选项中指明的游戏文件夹或 ROM（模拟器快捷方式）、Steam AppID、
游戏文件夹中的启动器、exe 的文件名，最后是完全相同的标题。
当某一步匹配到多款游戏时，AW Next 会回答“未找到”。

回复：

```json
{ "cmd": "bridge-game", "id": "r1", "bridge": 1, "found": true,
  "game": { "id": "x360-4D5309C9", "name": "Forza Horizon", "total": 50, "unlocked": 12,
    "achievements": [{ "id": "1", "name": "...", "description": "...", "icon": "https://...", "iconLocked": "https://...",
      "hidden": false, "rarity": 12.5, "unlocked": true, "unlockedAt": 1790000000 }] } }
```

- `unlockedAt` 以 Unix 秒为单位。`rarity` 以及 `progress`（对于部分完成的未解锁成就是
  `{ "current": 6, "max": 50 }`）只在 AW Next 知道时才会出现。
- 保存在这台电脑上的图标以 `http://127.0.0.1:8082/bridge/icon/...` 地址的形式提供。
- 该列表是上次扫描所见的游戏库，加上此后宣布的解锁。解锁仍然
  通过数据源到达：当某条解锁在 `appID` 中带有游戏的 `id` 时，请再次询问以刷新页面。
- 插件从 Steam 自己的页面（`https://steamloopback.host`）或原生进程连接；
  网站会被拒绝。如果设置了 websocket 密码，则需要相同的密码。
- 它不应以 `?client=decky` 的身份连接：该名称会告诉 AW Next，Steam 在显示自己的
  通知，于是 AW Next 会关闭自己的弹窗。

## 截图纪念 {#screenshot-souvenirs}

**解锁时截图** 会在成就弹出片刻之后，弹窗完全出现后保存一张屏幕图片，
所以通知也会出现在截图中。文件保存为
`<folder>\<game>\<achievement> - <date>.png`，日期为电脑的本地时间。同一行的 **打开文件夹** 会打开它，
必要时先创建。文件夹默认为 `Pictures\Achievement Watcher Next`，可以更改。

在同一秒解锁的成就各自保留自己的文件，标题被 Windows
拒绝用作文件夹名的游戏仍然会保存截图。在多显示器设置下，纪念截图与视频剪辑一样，会捕获
游戏所在的显示器；没有可见的游戏窗口时，会使用最前面窗口所在的
显示器，其次是主显示器。

### 开启 Windows HDR 时游玩 {#playing-with-windows-hdr-on}

**HDR 截图** 默认是 **自动**。截图时，AW Next 会检查显示游戏的屏幕是否启用了
HDR。如果是，一次性的辅助程序会通过 Windows
Graphics Capture 捕获 FP16 帧，并把高光色调映射为 SDR/sRGB 的 PNG，然后退出。HDR 关闭时，
**自动** 和 **关闭** 都使用标准截图。辅助程序的任何失败（缺少 Windows 支持、
捕获被阻止、超时）同样会回退到标准截图，所以纪念截图和
通知不会丢失。

## 视频剪辑 {#video-clips}

**解锁时录制视频剪辑** 的工作方式类似主机的奖杯视频。在 AW Next 跟踪的游戏运行期间，
最近几秒的游戏画面会保存在内存中，并已由显卡的视频编码器压缩。
成就弹出时，其前后的片段会保存为 MP4，位于
`<folder>\<game>\<achievement> - <date>.mp4`，弹窗正好在片段中间。除非你另选，文件夹为
`Videos\Achievement Watcher Next`。相隔很近解锁的成就
共用一个剪辑。

| 设置 | 选项 | 默认 |
|---|---|---|
| 剪辑时长 | 10 到 30 秒，解锁前后各占一半 | 20 秒 |
| 格式 | H.264、HEVC 或 AV1，保存为 MP4 | H.264 |
| 分辨率 | 屏幕、2160p、1440p、1080p 或 720p，不会超过屏幕 | 1080p |
| 帧率 | 30 FPS、60 FPS 或不限制（跟随你的屏幕，120、144、240 Hz） | 30 FPS |
| 画质 | 低、中或高 | 中 |
| 声音 | 仅游戏，或整台电脑 | 仅游戏 |

<div align="center">
<picture><source srcset="../assets/shot/video-clip-panel-800.webp 800w, ../assets/shot/video-clip-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/video-clip-panel.png" width="720" height="529" alt="设置，通知：带有开关的视频剪辑部分" loading="lazy" decoding="async"></picture><br>
<sub>视频剪辑部分位于通知标签页的底部，在你开启之前处于关闭状态</sub>
</div>

表格下方的一行会按你的屏幕估算单个剪辑的大小。这是上限：编码器
以恒定码率运行，安静的场景会更小。

- **开销。** 没有游戏运行时什么都不会运行。捕获、缩放和编码都留在 GPU 上，使用与渲染游戏的编码器
  模块分开的编码器模块。录制器占用的 CPU 远低于 1 %，
  内存约 70 到 110 MB，外加一个剪辑。在成就
  解锁之前不会向磁盘写入任何内容。
- **格式。** H.264 在任何地方都能播放，包括 Discord 和手机。HEVC 和 AV1 的文件更小。
  AV1 需要 GeForce RTX 40、Radeon RX 7000、Intel Arc 或更新的显卡；没有所选格式时，剪辑
  会以 H.264 录制。没有硬件 H.264 编码器的显卡会使用 Windows 的软件编码器，在
  处理器上运行，最高 1080p 和 30 FPS。
- **帧率。** **不限制** 按显示游戏的显示器的刷新率录制，并在其变化时
  跟随变化。如果编码器拒绝某个帧率，录制器会降到 60，再降到 30
  FPS，并记入日志。大小估算假定不限制时的码率是 30 FPS 的两倍。
- **如果录制器停止响应。** AW Next 会在每次翻倍的等待之后重启它，
  并在五次重启失败后放弃该游戏。写入到一半失败的剪辑，如果已写入的部分
  能播放就保留，否则删除。因电脑宕机而只写了一半的剪辑，会在
  下次录制游戏时清理。
- **HDR。** 开启 Windows HDR 时，剪辑会像 HDR 截图一样进行色调映射；将 **HDR 截图** 设为
  **关闭** 同样适用于剪辑。
- **声音。** **仅游戏** 不包括语音聊天和音乐。如果无法单独录制
  游戏的声音，则会录制整台电脑。
- **捕获的内容。** 显示游戏的显示器，包括通知在内。处于独占全屏的非常老的游戏
  可能会录制出黑色画面。

## 测试或解锁没有出现时 {#if-a-test-or-unlock-does-not-appear}

1. 确认通知已启用，并阅读游戏
   **[游戏状态](game-health.md)** 面板中的通知一行。
2. 检查后台跟踪器是否在运行。
3. 对于叠加层，选择一个有效的预设，并在独占全屏游戏之外再次测试。
   **自动** 已经处理了这两种情况。
4. 如果全屏游戏或勿扰模式隐藏了 Windows 通知，请启用 **高优先级
   通知** 并同意 Windows 的一次性请求。
5. 检查 AW Next 的 Windows 通知设置。
6. 打开 **设置 → 高级 → 诊断** 并查看日志。

如果问题仍然存在，请继续阅读[疑难解答](troubleshooting.md#notifications-do-not-appear)。

---

**下一页：** [预设与预设设计器](presets.md) - 弹窗的外观，以及如何制作你自己的。

<div align="center">

[← 文档](README.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
