---
title: "游戏内成就列表（叠加层）"
description: "用 Ctrl+Shift+K 打开的游戏内成就列表：搜索、筛选、稀有度、隐藏成就说明和自定义。"
---

# 游戏内成就列表（叠加层）

游戏内叠加层（受支持的游戏运行时默认按 `Ctrl+Shift+K`）无需离开游戏即可显示正在运行的游戏的成就
列表：名称、说明、锁定状态、解锁日期和
进度。拖动其页眉可移动它；它始终位于游戏上方。在 Linux 上，以 Wayland 原生方式运行的游戏
不会传递该热键：请改为把 `~/.local/bin/achievement-watcher --toggle-overlay`
绑定到某个按键，如[叠加层快捷键](linux.md#overlay-shortcut)所示。

<div align="center">
<picture><source srcset="../assets/shot/overlay.webp 569w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/overlay.png" width="360" height="633" alt="游戏内叠加层的成就列表"></picture><br>
<sub>状态、稀有度和日期列，带有搜索和筛选</sub>
</div>

## 如何在游戏中打开成就列表？ {#how-do-i-open-the-achievement-list-in-a-game}

在受支持的游戏运行时按 `Ctrl+Shift+K`。这是默认热键。叠加层会列出该游戏的每个
成就，包括状态、解锁日期、稀有度和进度，并且可以搜索。
再次按热键即可关闭。使用手柄时，默认是 **Back + Start + LB**。

在 Wayland 下的 Linux 上，以原生 Wayland 窗口运行的游戏永远不会把按键传给 AW Next。
请改为在桌面的键盘设置中把 `~/.local/bin/achievement-watcher --toggle-overlay` 绑定到某个按键。
见[叠加层快捷键](linux.md#overlay-shortcut)。

## 叠加层和解锁弹窗是一回事吗？ {#is-the-overlay-the-same-as-the-unlock-popup}

不是。弹窗是有内容解锁时出现的一次性通知，由预设设定样式（见
[通知](notifications.md)）。叠加层是单个游戏的完整列表，由你打开，
并保持显示直到你关闭它。

## 它显示什么 {#what-it-shows}

- 一个统计栏，显示 `unlocked / total` 和完成百分比。
- 每个成就一行，带有彩色的状态标签（`已解锁` / `已锁定`），已获得成就的解锁日期，以及
  进度型成就带有 `current / max` 标签的进度条。
- 每个已知解锁率的成就都有稀有度徽章（`★ 12.3%`）。普通成就使用
  深灰色徽章；稀有的使用金色、银色和铜色并带有柔和的光环，默认分别在 5%、10% 和 15%。
  **设置 → 常规 → 稀有度显示** 可以更改等级，或切换为奖杯等级。

## 隐藏成就 {#hidden-achievements}

叠加层不会剧透你尚未解锁的隐藏成就：与主窗口一样，它的
说明显示为 *隐藏 - 点击显示*。单击它，或在手柄上按 **A**，即可显示
那一条说明。搜索会忽略仍被遮盖的说明。

<div align="center">
<picture><source srcset="../assets/shot/overlay-hidden-800.webp 800w, ../assets/shot/overlay-hidden.webp 1162w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/overlay-hidden.png" width="560" height="482" alt="叠加层列表两次：隐藏说明被遮盖，然后其中一条被显示" loading="lazy" decoding="async"></picture><br>
<sub>单击“We've all been there before...”之前和之后：只有那条说明被显示</sub>
</div>

## 搜索和筛选 {#search-and-filters}

- 搜索框会在你输入时按成就名称和说明筛选各行。
- 列表上方的标签在 **全部**、**已解锁**、**未解锁** 和 **进行中** 之间切换。
- 单击 **稀有度**、**日期** 或 **状态** 列标题，先升序排序，再降序，
  然后恢复自然顺序。一次只能按一列排序。
- `/` 让搜索框获得焦点。`Esc` 清空搜索框，或在选项面板打开时关闭它。

## 手柄（游戏手柄） {#controller-gamepad}

在 **设置 → 手柄** 中启用 **使用手柄控制游戏内叠加层**，即可用游戏手柄操作
叠加层。使用默认按键绑定时：

- **Back + Start + LB** 打开或关闭叠加层。
- **LB + X** 切换导航模式：焦点环显示你所在的位置，叠加层页眉中会出现一个小的 **UI** 徽章。
- 在导航模式下，方向键或左摇杆移动焦点，**A** 确认，**B** 取消，**X**
  聚焦搜索，**Y** 打开选项面板。
- 按住 **LB + RB** 时，左摇杆移动叠加层，右摇杆滚动列表。

每个快捷键都可配置，按钮名称遵循你选择的布局，叠加层的提示栏
显示你自己的绑定。[手柄指南](controller.md)介绍了设置、支持的手柄，
以及关于游戏仍会收到你按键输入的 Windows 注意事项。

## 自定义 {#customization}

叠加层页眉中的 **⚙** 按钮会打开选项：

- **强调色**：五种颜色预设、自定义取色器，或 **使用应用主题** 以跟随主窗口的
  主题（用于进度、活动的筛选、焦点环和已解锁行的光晕）。
- **密度**：紧凑、舒适或宽松的行间距。
- **图标大小**：小、中或大。
- **缩放**：面板大小的 80% 到 125%。
- **不透明度**：面板背景的 40% 到 100%。
- 统计栏、进度条、稀有度徽章和说明的**显示/隐藏开关**。

更改立即生效并保存在本地。**恢复默认** 会恢复原始外观。这些选项
可以用键盘操作：缩放和不透明度菜单会显示焦点环，开关用
Tab 和空格切换，动画遵循系统的减弱动态效果设置。

## 键盘快捷键（叠加层打开时） {#keyboard-shortcuts-overlay-open}

- `Ctrl+Alt+Shift+方向键` - 微调叠加层窗口。
- `Ctrl+Alt+Shift+1` … `5` - 吸附到预设位置。
- `Ctrl+Alt+Shift+C` - 切换点击穿透。

## 说明 {#notes}

- 叠加层遵循应用中选择的界面语言。
- 首次打开后，叠加层窗口会保持隐藏并复用 5 分钟，所以再次切换
  几乎是瞬间的。隐藏期间它会暂停手柄轮询，闲置 5 分钟后窗口会被
  释放以腾出内存。
- 行内容在渲染前会被转义；成就数据只用于显示，绝不会被执行。
- 叠加层列表与一次性的叠加层*通知*预设是分开的（设置 →
  通知），弹窗的外观在那里配置。

---

**下一页：** [手柄指南](controller.md) - 用游戏手柄操作叠加层和应用。

<div align="center">

[← 文档](README.md) · [通知指南](notifications.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
