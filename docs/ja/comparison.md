---
title: "AW Next と他のツールの比較"
description: "Achievement Watcher Next と Achievement Watcher 2.x、Achievements アプリとの違いを、機能ごとに比較します。"
---

# AW Next と他のツールの比較

Achievement Watcher Next は、Xan105 の Achievement Watcher の代替であり後継です。Windows と Linux で
動作し、Steam、GOG、Epic、Ubisoft、Xbox PC、Steam エミュレーターのセーブを読み取り、Goldberg や GBE Fork のセットアップを
アプリから修復し、通知の経路も自分で選びます。PSerban93 の Achievements は、
もう一つの活発に開発されている Windows 向けトラッカーで、Sentinel は Linux 専用です。

AW Next は、[Xan105 のオリジナルの Achievement Watcher](https://github.com/xan105/Achievement-Watcher)
と [darktakayanagi の 2.x ブランチ](https://github.com/darktakayanagi/Achievement-Watcher)を引き継いでいます。このページでは、
その系譜と、もう一つの活発に開発されている Windows 向けトラッカーである [Achievements](https://github.com/PSerban93/Achievements)、
そしてエミュレートされた Steam のセーブ向けの Linux 専用ウォッチャーである [Sentinel](https://github.com/RemakeCode/sentinel) と
比べています。

4 つとも実績の読み取りはよくできているので、役立つ問いは、どの追加機能が自分のプレイスタイルに合うかです。
表には、各プロジェクトができることとできないことを示しています。

AW Next の一部は MIT ライセンスの Achievements に由来しているため、両方のプロジェクトに印が付いている行では、
実装が JokerVerse のものから始まったことがあります。
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE)を参照してください。

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| プラットフォーム | Windows と Linux | Windows のみ | Windows のみ | Linux のみ |
| ライセンス | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| デスクトップのランタイム | Electron 44 | Electron 44 | Electron 12 | GTK 4 と WebKitGTK 6 を使う Go |
| 開発状況 | 活発 | 活発(最後のプッシュは 2026 年 10 月 22 日) | 2026 年 10 月 13 日にアーカイブ、読み取り専用 | 活発(v2.1.1、2026 年 10 月 11 日) |

## 実績の取得元 {#where-the-achievements-come-from}

| ソース | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| 公式のローカルライブラリ | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · Linux では Steam、Heroic、Lutris、Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay(旧形式) | ❌ |
| 任意のアカウント接続 | ✅ Steam(所有ゲーム、ファミリー共有のゲーム、ほかのPCでの解除) · Epic · Xbox(Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Steam エミュレーターのセーブ | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · CODEX/RUNE/EMPRESS/Online-Fix/Tenoke の構成。Linux でも(Wine プレフィックス、Goldberg と GBE はネイティブ) | ✅ 同程度の対応範囲 | ✅ Steam エミュレーター | ⚠️ Wine/Proton プレフィックス内の Goldberg/GSE · CODEX · RUNE |
| 設定なしのポータブル版リリース | ✅ セーブのツリーを自力で読み取る | ⚠️ 手動入力 | ❌ | ⚠️ プレフィックスを手動で追加 |
| Goldberg Uplay R2(Ubisoft) | ✅ ローダーのバージョンを認識 | ❌ | ❌ | ✅ |
| Goldberg SocialClub(Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| コンソールエミュレーター | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ RPCS3 のみ | ❌ |
| PC 向けに再コンパイルされた Xbox 360 ゲーム(ReXGlue など) | ✅ リスト、アイコン、DLC、リアルタイムの解除、60 を超える既知のポート、Linux ビルド | ✅ | ❌ | ❌ |
| PC に移植された PS4 ゲーム | ✅ run.py、ネイティブおよび単一実行ファイルのポート、PROTOTYPE、PORTHEON(UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess、スキーマ、DLC、アイコンをゲームから読み取り | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ プレイ済みゲームのインポート、RetroArch の履歴やプレイリストでディスク上に見つかるゲーム、どのエミュレーターでもリアルタイムの解除 | ✅ | ❌ | ❌ |
| ニッチなパッチ | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| フォルダーの検出 | ✅ 自動設定とスマート検索 | ✅ 自動設定 | ✅ スマート検索 | ⚠️ 追加したプレフィックスを再スキャン |
| カスタムフォルダーと手動のゲーム | ✅ ゲームごと、またはライブラリ全体 | ✅ ゲームごと | ⚠️ 手動設定 | ⚠️ プレフィックスとエミュレーターのパス |

AW Next と Achievements は、いまではほぼ同じソースを読み取ります。AW Next はエミュレートされた PC の構成により
深く対応し、Uplay R2 と SocialClub のセーブを修復できる 4 つの中で唯一のものです。

## ゲームが報告しないとき {#when-a-game-does-not-report}

どのトラッカーでも、ゲームが 0% で止まっていることは分かります。AW Next はさらにそれを直そうとします。

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| ガイド付き修復のあるゲームごとの状態レポート | ✅ | ❌ | ❌ | ❌ |
| エミュレーターのランタイムのインストールと修復 | ✅ Goldberg / GBE、スキーマを含む | ⚠️ スキーマの生成 | ❌ 手動 | ⚠️ Goldberg のフォークによるベストエフォートのセットアップ |
| 変更前のバックアップと復元 | ✅ さらに Steamless と任意の API チェックのバイパス | ❌ | ❌ | ❌ |
| ゲームの実績のリセットまたは復元 | ✅ | ❌ | ❌ | ❌ |
| 手動での解除 | ✅ | ❌ | ❌ | ❌ |
| ゲームの AppID を手動で設定 | ✅ | ❌ | ❌ | ❌ |
| ゲームごとのソースの上書き | ✅ 自動 / Steam / Ubisoft | ❌ | ❌ | ⚠️ ライブラリ全体で 1 つのデータソース |
| ブラックリストとオフラインでの名前の補完 | ✅ | ⚠️ ブラックリスト | ❌ | ❌ |

## 通知 {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| 配信経路 | ✅ ネイティブのトースト + ゲーム内オーバーレイ + OBS ブラウザーソース + ゲームモードでの Steam のトースト(Decky プラグイン) | ✅ ネイティブのトースト + アニメーションするオーバーレイ | ⚠️ トースト · Chromium · WebSocket · GNTP | ⚠️ デスクトップ通知 + ゲームモードでの Decky プラグイン |
| 経路を自分で選ぶ | ✅ 自動モード、ゲームの状態ごと | ❌ 固定の選択 | ❌ 固定の選択 | ❌ |
| コード不要のプリセットデザイナー | ✅ 14 種類の出発点のテンプレート、ライブプレビュー、Steam Original を含む 10 種類の内蔵プリセット | ⚠️ 内蔵のプリセットとテーマ、自作は HTML/CSS で記述 | ❌ | ❌ |
| 共有できるプリセット | ✅ `.awpreset` + コミュニティギャラリー | ❌ | ❌ | ❌ |
| レア度、プラチナ、達成のスタイル | ✅ 3 段階のレア度、達成バー | ✅ レア度 | ❌ | ❌ |
| エミュレーターごとのプリセット | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| サウンド | ✅ ランダム選択、FLAC/M4A/AAC | ✅ | ⚠️ カスタムファイル | ✅ カスタムサウンド |
| スクリーンショット | ✅ Windows では HDR 対応のキャプチャ(BT.2408 トーンマップ)、Linux でも X11 と Wayland で | ✅ HDR キャプチャ | ✅ | ❌ |
| 解除のビデオクリップ | ✅ 10 ～ 30 秒、30/60 FPS、H.264 · HEVC · AV1、HDR トーンマップ。Linux では gpu-screen-recorder または内蔵の WebM レコーダー | ✅ 10 ～ 30 秒、30/60 FPS | ⚠️ OBS 経由 | ❌ |
| プレイ時間と進捗の通知 | ✅ ゲームごとの進捗ミュート | ✅ ゲームごとの進捗ミュート | ✅ プレイ時間 | ✅ 進捗、複数ステップ |
| ゲームごとの独自の通知の見た目 | ✅ 各ゲームでプリセット、位置、サウンド、サイズを上書きできる | ❌ | ❌ | ❌ |

## アプリ自体 {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| ライブラリ、ゲーム、実績の検索 | ✅ | ✅ | ✅ | ⚠️ ライブラリの並べ替え |
| インストール済みのみのフィルターとゲームの操作 | ✅ フィルター · アンインストール · 復元 | ⚠️ プラットフォームのフィルター | ❌ | ❌ |
| コントローラーでの完全なナビゲーション | ✅ アプリ + オーバーレイ、Windows と Linux で | ✅ アプリ + オーバーレイ | ❌ 予定 | ⚠️ Decky プラグイン経由 |
| Steam Deck | ⚠️ Decky プラグイン、実機の Deck ではまだ未確認 | ❌ | ❌ | ✅ Gamescope での Decky プラグイン |
| テーマ | ✅ 内蔵 + カスタムエディター + 共有できる `.awtheme` + ギャラリー | ✅ 内蔵 + ユーザーのテーマファイル | ❌ | ❌ |
| インターフェースの言語 | ✅ 28 言語を同梱 | ✅ 約 30 言語を同梱 | ✅ 18 | ❌ |
| バックグラウンドのプロセス | ✅ トレイのデーモンが 1 つ | ✅ トレイアプリ | ⚠️ 別の watchdog | ✅ トレイアプリ |
| 追加のランタイムのダウンロード | ✅ ブラウザーのランタイムなし。GBE のフォークはインストールまたは修復するときだけ取得 | ⚠️ Playwright Chromium | ✅ なし | ⚠️ システムの GTK 4 と WebKitGTK 6 |
| キーボードとスクリーンリーダーでの利用 | ✅ 設定、ダイアログ、オーバーレイに Tab で到達でき、ダイアログを閉じるとフォーカスが戻る | ⚠️ キーボードショートカットとコントローラーマップ | ❌ | ❌ |
| インストーラー、アンインストーラー、アップデートウィンドウ | ✅ 独自のインストーラーとアンインストーラー、リリースノートと進捗のあるアップデートウィンドウ | ❌ | ❌ | ⚠️ ディストリビューションのパッケージと Flatpak |
| ドキュメント | ✅ ガイド、形式の仕様、ギャラリー | ⚠️ README | ⚠️ README | ⚠️ README と Goldberg のガイド |

## Linux と Steam Deck {#linux-and-the-steam-deck}

AW Next は、ネイティブな Linux アプリ(x64 の AppImage、Wine は通しません)としても提供されます。Steam と Proton、
Wine、Lutris、Heroic、Bottles で実行されるゲームやネイティブな Linux ゲームを追跡し、Windows と同じ
ポップアップ、オーバーレイ、プレイ時間を提供します。Steam Deck への対応は新しく、ゲームモードの通知は
リポジトリの Decky プラグインを通り、プラグインもゲームモードのポップアップも、実機の Deck では
確認されていません。

<sub>✅ = 対応しており文書化されている · ⚠️ = 部分的、手動、または異なるワークフロー · ❌ = 利用できない、または
現在の公開ブランチで文書化されていない。競合の列は、2026 年 10 月 22 日時点の公開 README、GitHub のメタデータ、
パッケージのマニフェストと比較したものです。AW Next の列はバージョン
3.12.2 と 2026 年 10 月の未リリースの変更を反映しています。ほかの列の ❌ は、たいてい不可能という意味ではなく
文書化されていないという意味で、これらのプロジェクトはどれも変化が速いです。</sub>

## Hydra と Steam Achievement Manager {#hydra-and-steam-achievement-manager}

同じ検索で出てくるほかの 2 つのツールは、別の役割を担っています。

- [Hydra](https://hydralauncher.gg/) は、ゲームをダウンロードして実績を追跡できるゲームランチャーと自称しています。
  AW Next はゲームをダウンロードしません。
- [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) は、Steam の実績と統計を管理するために使う
  軽量でポータブルなアプリケーションと自称しています。Steam クライアント、Steam アカウント、ネットワーク接続が必要です。
  AW Next は実績を表示して追跡し、Steam アカウントを必要としません。

どちらも上の表には含まれていません。表はローカルのセーブやエミュレーターのセーブを読み取るトラッカーを比較するものです。

## まとめ {#in-short}

**AW Next** は、Windows と Linux の両方で動作し続ける必要があるライブラリに向いています。公式ランチャーと
エミュレートされたセーブが並び、Goldberg や GBE のセットアップを報告するだけでなく修復する状態レポートがあり、
経路を自分で選ぶ通知があり、自分でデザインして共有できるプリセットとテーマがあります。

**Achievements** は、RetroAchievements、再コンパイルされたポート、ニッチなパッチを含め、Windows で幅広いソースを持ち、
強力な自動設定、アニメーションするオーバーレイ、解除のビデオクリップがあります。

**Achievement Watcher 2.x** は歴史的な土台で、Electron 12 上で幅広いエミュレーター互換性と従来の通知経路を備えています。
そのリポジトリは 2026 年 10 月 13 日にアーカイブされ、もうメンテナンスされていません。

**Sentinel** は、Goldberg、CODEX、RUNE のセーブ向けの軽量な Linux の選択肢で、よく統合された
Steam Deck プラグインがあります。

---

<div align="center">

[← ドキュメント](README.md) · [プロジェクトのホーム](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
