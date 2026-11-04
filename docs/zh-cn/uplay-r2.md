---
title: "Goldberg Uplay 设置，R1 和 R2"
description: "使用 Uplay R1 和 R2 加载器为兼容的 Ubisoft 游戏设置成就，并安全地修复它们。"
---

# Goldberg Uplay 设置（R1 和 R2）

AW Next 为通过 Goldberg Uplay 模拟器运行的 Ubisoft 游戏提供了单独的修复。它从不
触碰官方的 Ubisoft Connect 安装：只有在 AW Next 确认了游戏使用的确切
加载器和世代之后，才会选中该游戏。

Ubisoft 游戏只加载其可执行文件所链接的加载器世代：大致从 2019 年
起是 **R2**，在此之前都是 **R1**。AW Next 会检测并修复适用的那一个，因为
错误的世代会放下一个游戏永远不会打开的 DLL。拥有两个产品 ID 的 Ubisoft 游戏（基础游戏
及其 Complete Edition）两种方式都能用：任一 ID 下的存档都会被读取，其中裸露的
目标 ID 会与 Steam 成就列表匹配。

> [!WARNING]
> 该修复会更改游戏文件。请只对你拥有的游戏使用。

## 修复游戏 {#repair-a-game}

从 **游戏状态** 中：

1. 在 **设置 → 文件夹** 下添加游戏的库并扫描它。
2. 打开游戏的 **游戏状态** 面板，查看 **诊断 Uplay R1/R2 设置**。
3. 运行 **应用 Ubisoft 成就修复…** 并启动游戏一次。

从 **设置 → 模拟器 → Ubisoft / Uplay R1/R2** 中：

<div align="center">
<picture><source srcset="../assets/shot/uplay-r2-panel-800.webp 800w, ../assets/shot/uplay-r2-panel.webp 928w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/uplay-r2-panel.png" width="720" height="536" alt="设置 - Ubisoft / Uplay R2"></picture><br>
<sub>集成的修复包会在触及任何游戏之前先经过验证</sub>
</div>

- **自动修复新检测到的游戏**：Steam / GBE Fork 下也显示的同一个开关，同样适用于
  Ubisoft 游戏。默认关闭。
- **修复检测到的 Uplay R1/R2 游戏**：在一次确认的批处理中修复每个检测到的安装。
- **导入或替换 DLL** / **恢复内置 DLL**：使用你自己的加载器版本，或回到
  AW Next 自带的版本。手动选择的 DLL 不需要已知的 SHA-256 指纹，但它必须是
  有效的、支持成就的 Uplay 加载器，且名称和架构一致。

集成的 DLL 位于 `app/resources/uplayR2/`（R2）和 `app/resources/uplayR1/`（R1）。AW Next
在修复可以使用它们之前，会检查它们的哈希、PE 架构和成就能力，并
在它们旁边保留一个恢复压缩包。

同一个修复事务会从右键菜单、游戏状态、自动修复、全部修复和
批处理按钮运行。它会在 `<game>\.aw-backups\<timestamp>\` 下为每个被更改的 DLL、架构和 INI 创建快照，
如果之后验证失败，会自动恢复它们。重复执行完全相同的修复
不会有任何改变。

## 把未映射的游戏关联到其 Steam 发布版 {#linking-an-unmapped-game-to-its-steam-release}

AW Next 会自行把大多数 Ubisoft 游戏匹配到它们的 Steam 发布版，以便把 Steam 成就
名称转换为加载器所期望的 Ubisoft 目标 ID。无法匹配时，请通过游戏右键菜单中的
**识别游戏（Steam 应用 ID）** 自己选择发布版。无法
确认的配对会被拒绝，因为错误的配对会把另一款游戏的成就列表写入这款
游戏的文件夹。

在 Ubisoft Connect 中打开一次游戏的成就页面，有助于 AW Next 识别需要这样做的
游戏，例如 Brawlhalla 或 The Crew 2。你确认的选择会针对那个确切的
安装文件夹被记住。自动匹配（内置映射、实时的 Ubisoft 目录和
标题匹配规则）在 [Uplay R1/R2 参考](../uplay-reference.md)中介绍。

## 从不请求成就的游戏 {#a-game-that-never-asks-for-an-achievement}

有些 Ubisoft 游戏会先向加载器请求 Ubisoft 会话，而加载器用空密钥
作答。这些游戏把空密钥理解为已退出登录，从不调用成就 API。设置
看起来正确，但什么都没有被记录。Avatar: Frontiers of Pandora 就是这样表现的。

当游戏状态的诊断日志证明了这一点时，它会在模拟器配置检查上提供 **离线启用成就**。
它会在游戏旁边添加一个占位的会话密钥：不是真正的 Ubisoft
会话，不涉及任何账号，不向任何地方发送任何内容，只是刚好足够通过那一项检查。它绝不会
自动添加，因为不合法的令牌可能会破坏某些游戏。

**开启后请启动一次游戏。** 在此之前，该行显示 *离线成就已开启，请启动一次游戏*。
之后旁边的按钮会显示为 **关闭离线成就**，它会把密钥
取回。

这只适用于 R2 加载器；R1 的 INI 带有无关的键。[Goldberg / GBE 指南](emulator-setup.md)
介绍了此修复在 Steam 上的对应方案。

## 成就仍为 0% {#achievements-remain-at-0}

- 游戏更新后再次运行 **诊断 Uplay R1/R2 设置**，因为更新常常会删除架构
  或重置解锁计数。
- 阅读加载器 DLL 旁边的 `upc_r2.log`（或 `upc_r1.log`）：它记录了游戏请求的每个
  目标编号。请在 **设置 → 模拟器 → Ubisoft / Uplay R1/R2** 中保持 **诊断日志** 开启。
  游戏状态需要它来区分从未请求过的游戏，和请求了架构中没有的目标的游戏。
  它默认开启，日志超过 25 MB 后 AW Next 会对其进行裁剪。
- 检查 `%APPDATA%\Achievement Watcher Next\logs\parser.log`。

## 杀毒软件说明 {#antivirus-note}

如果杀毒软件删除了零散的加载器 DLL，或在中途隔离了恢复压缩包，游戏
状态会报告杀毒软件问题，并提供允许该文件夹和放回文件的选项。你不需要
自己寻找替代品。

身份、目标 ID 和加载器日志在 [Uplay R1/R2 参考](../uplay-reference.md)中介绍。

<div align="center">

[← 文档](README.md) · [疑难解答](troubleshooting.md) · [项目主页](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
