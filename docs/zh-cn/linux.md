---
title: "适用于 Linux 和 Steam Deck 的成就追踪器"
description: "安装并更新 AppImage，在 GNOME 或 KDE 上把叠加层绑定到按键，并通过 Steam、Proton、Lutris、Heroic 或 Bottles 运行游戏。"
---

# 适用于 Linux 和 Steam Deck 的成就追踪器

AW Next 在 Linux（x64）上作为原生应用运行，绝不通过 Wine。它跟踪通过 Steam
和 Proton、Wine、Lutris、Heroic 或 Bottles 运行的游戏、原生 Linux 游戏以及受支持的模拟器，
游戏库、弹窗、叠加层和游戏时长都与 Windows 上相同。

Linux 版本是**测试版**。它在 GNOME 和 KDE Plasma、Wine 和 Proton 前缀以及
测试游戏上经过测试，但没有在很多真实机器上测试过：真实的 Steam Deck、真实的游戏手柄、每个启动器和
每个 scene 发布版。如果有什么不能用，附上你的发行版、桌面环境
和日志的 [issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) 最有帮助。

## 安装 {#install}

1. 打开[最新发布版](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)，
   下载 `Achievement.Watcher.<version>.AppImage`。
2. 把它放在你自己的文件夹中，如 `~/Applications`，并使其可执行：在文件
   管理器中选择 **属性 → 允许作为程序执行文件**，或在终端中：

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. 启动它，像在 Windows 上一样按照首次运行向导操作（见[快速入门](getting-started.md)）。

AppImage 需要 FUSE 2，而一些发行版（包括 Ubuntu 24.04）默认不再安装它。
如果文件无法启动，请安装它：Ubuntu 24.04 及更高版本是 `libfuse2t64`，更早的
Ubuntu 和 Debian 是 `libfuse2`，Fedora 是 `fuse-libs`，Arch 是 `fuse2`。

首次启动时，AW Next 会把自己添加到应用程序菜单。**设置 → 常规 → 随系统启动** 会在每次登录时
将其隐藏在托盘中启动。设置、缓存、游戏时长和日志位于
`~/.config/Achievement Watcher Next`。

## 更新 {#updates}

AppImage 从与 Windows 应用相同的 GitHub 发布版自行更新。新版本会通过桌面通知和
标题栏标签提示，并在下载前询问。随后它会
对照随发布版发布的 SHA-512 摘要（`latest-linux.yml`）检查文件，替换
旧的 AppImage 并重启。如果有游戏正在运行，更新会等到它关闭。你的数据保持
原样。

新文件的名称中带有新版本号。**随系统启动** 条目和
`~/.local/bin/achievement-watcher` 命令会随之更新。你自己创建、并写明
AppImage 文件名的启动器仍然指向旧名称，所以请让它指向该命令。

## 支持的桌面环境 {#supported-desktops}

AW Next 在 Wayland 和 X11 下的 GNOME 和 KDE Plasma 上测试过（Ubuntu 24.04，GNOME 46 和
Plasma 5.27），也在虚拟
机中的 Fedora 44 上测试过（GNOME 50、Plasma 6.7、Hyprland 0.56 和 COSMIC 1.0）。
其他桌面环境可能也能用，但没有试过。

- **Wayland。** AW Next 启动时会通过 XWayland 重启自己一次，使它的弹窗和叠加层
  能保持在游戏上方，这些游戏在 Wine 和 Proton 下作为 X11 窗口运行。Hyprland 和 COSMIC 默认
  启动 XWayland。没有它时（Hyprland 上的 `xwayland.enabled = false`），AW Next 仍是原生 Wayland 应用：
  游戏库、托盘和通知可用，但合成器会像对待
  任何窗口一样放置弹窗和叠加层，而且弹窗显示期间会从游戏夺走键盘。
- **托盘。** KDE 和 COSMIC 原样显示托盘图标。GNOME 需要 AppIndicator 扩展，
  Ubuntu 默认开启它。Hyprland 需要带托盘的状态栏，如带 `tray` 模块的 Waybar。
  没有托盘时，关闭窗口会最小化 AW Next 而不是隐藏它；Hyprland 没有最小化的
  窗口，所以在那里会隐藏，再次启动 AW Next 会让窗口回来。
- **通知** 是桌面自带的。勿扰模式会隐藏它们，除非 **设置 → 通知 →
  高优先级通知** 已开启，开启后解锁仍会在 GNOME 和 KDE 上显示。Hyprland 没有
  自己的通知：请运行通知守护进程，如 mako、dunst 或 SwayNC。mako 会绘制在全屏
  游戏下方，除非其配置设置了 `layer=overlay`，并且会保留每条通知直到你单击，除非
  设置了 `default-timeout`（以毫秒为单位）。COSMIC 会在游戏全屏期间
  保留它的通知。无论哪种情况，AW Next 自己的弹窗都会显示在游戏上方。
- 仅存在于 Windows 上的选项会在设置中标明。

## 截图和剪辑 {#screenshots-and-clips}

每次解锁的截图和剪辑在 X11 和 Wayland 上都可用。如果安装了 gpu-screen-recorder，剪辑
会由它使用显卡录制。如果你在设置中选择它，AW
Next 自己的软件录制器会改为保存 WebM 文件，并显示它的开销。

在 Wayland 上，第一次截图会让桌面询问是否允许应用截图（GNOME 47
及更高版本、KDE Plasma 6、COSMIC 和 Hyprland）。AW Next 会等待几秒钟的回答，然后跳过
那次截图，以及在询问期间发生的解锁的截图。请点击 **允许**，因为在 GNOME 和 Hyprland 上，按 Enter
会选中 **拒绝**，之后的截图将不再询问。如果你拒绝，
AW Next 就不截图，也不会再询问。若想在下次截图时再次被询问，
请运行：

```bash
flatpak permission-remove screenshot screenshot
```

软件录制器通过桌面的屏幕共享对话框捕获屏幕，该对话框会在每次游戏启动时
再次出现，并且在 COSMIC 和 Hyprland 上会让游戏退出全屏。
gpu-screen-recorder 只询问一次。

## 叠加层快捷键 {#overlay-shortcut}

当 Wine 或 Proton 游戏获得焦点时，`Ctrl+Shift+K` 会打开叠加层。在 Wayland 下，当**原生 Wayland 窗口**获得焦点时，AW Next 无法
看到按下的按键，比如 Wayland 模式的 Linux 游戏，或使用其 Wayland 驱动的
Proton。这些游戏没有游戏内热键。

桌面键盘设置中的快捷键不依赖于此。让它运行下面的命令，
把 `you` 换成你的用户名（GNOME 不会展开 `~`，所以请写完整路径）：

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

它会打开或关闭已在运行的副本的叠加层，不会启动其他任何东西。该命令从 AppImage 首次启动起就存在，
AW Next 每次启动都会刷新它，所以它会随更新而更新。

- **GNOME：** **设置 → 键盘 → 查看及自定义快捷键 → 自定义快捷键 → 添加快捷键**。
  命名，粘贴命令，然后按下你想要的按键。
- **KDE Plasma 6：** **系统设置 → 键盘 → 快捷键 → 添加新项 → 命令或脚本**，粘贴
  命令，然后设置快捷键。
- **KDE Plasma 5：** **系统设置 → 快捷键 → 自定义快捷键 → 编辑 → 新建 → 全局快捷键 →
  命令/URL**。在 **触发器** 中设置按键，在 **动作** 中设置命令。
- **Hyprland** 0.55 及更高版本，在 `~/.config/hypr/hyprland.lua` 中：

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  在较旧的 `hyprland.conf` 中，同一行写作
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`。
  Hyprland 会在任何窗口之前接收按键，所以无论哪款游戏，按一次都只会打开或关闭叠加层一次。
- **COSMIC：** **设置 → 输入设备 → 键盘 → 键盘快捷键 → 自定义快捷键 → 添加
  快捷键**。填写 **快捷键名称** 和 **命令**，然后输入按键。它对原生
  Wayland 游戏同样有效。COSMIC 的 **X11 应用程序中的全局快捷键** 设置没有帮助：
  AW Next 在那里仍然看不到按键。

在 Hyprland 和 COSMIC 上，叠加层会显示在全屏游戏（Wine 或原生 Wayland）上方。开启
**打开时聚焦叠加层**（见[手柄指南](controller.md)）后，两者都会让游戏退出
全屏来显示它。在 Hyprland 上，下面这条窗口规则能让游戏保持全屏，并让叠加层
显示在其上方：

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

手柄同样可用。AW Next 直接读取游戏手柄，所以[手柄指南](controller.md)中的手柄快捷键
可以在不从游戏夺走任何东西的情况下打开和操作叠加层。
Steam Input 运行时，AW Next 只读取 Steam 的虚拟手柄，所以一次按键不会被重复计数。

## 密钥环提示 {#keyring-prompt}

AW Next 保存的少量机密信息（Steam、Epic、Xbox 和 PlayStation 的登录令牌、RetroAchievements
密钥、模拟器的 Steam 密码）会用桌面密钥环保存的密钥加密：GNOME Keyring
或 KDE Wallet。Hyprland 自身没有密钥环，会使用已安装的那个，它在 AW Next 首次
请求时启动。

使用**自动登录**时，会话开始时密钥环不会被解锁。AW Next 第一次
需要它时，桌面会要求你解锁，如果没有则要求你创建一个；KDE 会打开 KDE
Wallet 向导。回答之后 AW Next 就会继续。如果你取消，AW Next 仍会继续工作，会提示一次
你的连接没有受到保护，桌面会在下次启动时再次询问。该提示绝不会
阻塞应用：它打开期间，跟踪和通知仍在运行。

## Steam 和 Proton {#steam-and-proton}

无论 Steam 客户端来自你的发行版（`steam-installer`、`steam`）、
Flathub 还是 Snap，AW Next 都能找到它，并找到其他磁盘上的库文件夹以及每款游戏的 Proton 前缀。
如果安装了两个 Steam 客户端，它会跟随最后启动的那个。

由 Steam 自己运行的游戏的解锁，像在 Windows 上一样从 Steam 自己的文件读取。只有开启
**设置 → 通知 → Steam 客户端游戏** 后，AW Next 才会弹出它们，因为 Steam 会为它们显示自己的
弹窗。

## Wine、Lutris、Heroic 和 Bottles {#wine-lutris-heroic-and-bottles}

每个来源都在游戏的前缀内读取，包括其中的 Windows 注册表：使用 Steam
模拟器（Goldberg、GBE Fork 以及[兼容的来源](sources.md)中的其他模拟器）的游戏、Ubisoft 或 GOG
存档，等等。**智能查找** 会搜索你的主目录、其他磁盘以及它所知的每个前缀。

- **Lutris** 和 **Bottles**：它们安装的游戏和程序会连同其前缀一起列出。
- **Heroic**：通过 Heroic 安装的 Epic 游戏会被识别为 Epic 游戏。
- **普通 Wine**：默认的 `~/.wine` 前缀以及你添加的任何前缀文件夹。
- 使用 Goldberg 或 GBE Fork（`libsteam_api.so`）的**原生 Linux 游戏**会从其 Linux 存档
  文件夹读取。

**开始游戏** 会通过游戏所属的启动器（Steam、Lutris、Heroic）启动游戏，游戏时长
根据游戏进程统计。[游戏状态](game-health.md)中的模拟器修复可从
AppImage 使用，并写入游戏的前缀内，一如既往会带备份。

## 模拟器 {#emulators}

RPCS3、shadPS4、RetroArch 和 Xenia 会在它们的 Linux 文件夹中被找到；如果 RPCS3 和 shadPS4 来自
Flathub，也能找到。只要来源已连接，无论使用哪个模拟器，RetroAchievements 的解锁都会被提示。

## Steam Deck {#steam-deck}

Steam Deck 支持是新增的，**尚未在真实的 Deck 上验证**。它预期的行为如下：

- 在 **桌面模式** 下，AW Next 是与任何 Linux 桌面上相同的 AppImage。首个窗口适配
  Deck 的 1280x800 屏幕，并能找到 microSD 卡上的游戏。
- 开启 **随系统启动** 后，AW Next 也能在 **游戏模式** 下运行：Steam 启动后
  它会作为后台服务启动。
- 游戏模式不显示桌面通知，所以 AW Next 会把每次解锁绘制为游戏上方自己的弹窗，
  从左上角开始。SteamOS 的性能叠加层可能会遮住该弹窗。
- 仓库 `decky/` 文件夹中的 **Decky 插件** 会把每次解锁发送到 Steam 自己的
  通知，游戏模式总是会绘制这些通知。它监听期间，AW Next 会关闭自己的弹窗，
  所以你只会看到一条通知。没有该插件时，弹窗就是备用方案。目前你需要手动安装：
  构建它（`npm install`，然后 `npm run build`）并复制到
  `~/homebrew/plugins/achievement-watcher/`，如其
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md) 所述。
  它需要 AW Next 正在运行且其 websocket 数据源开启，这是默认设置。

弹窗已在电脑上重现的游戏模式会话中验证过，而 Decky 插件只有单元测试。如果你在真实的 Deck 上
试用了其中任何一个，附上你所见情况的
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) 会很有帮助。

## 报告问题 {#reporting-a-problem}

请附上你的发行版、桌面环境（GNOME 或 KDE，Wayland 或 X11）、游戏的运行方式（Steam 加 Proton、
Lutris、Heroic、Bottles、Wine）以及 `~/.config/Achievement Watcher Next/logs` 中的文件。

---

**下一页：** [疑难解答](troubleshooting.md)，处理发现、进度、通知和游戏时长
方面的问题。

<div align="center">

[← 文档](README.md) · [快速入门](getting-started.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
