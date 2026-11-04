---
title: "ドキュメント"
description: "Achievement Watcher Next のインストール、設定、トラブル解決のガイド。ソース、通知、プリセット、オーバーレイ、トラブルシューティングを扱います。"
---

<div align="center">

# AW Next ドキュメント

セットアップ、日常の使い方、メンテナンスのガイドです。

[ホーム](../index.html) · [ダウンロード](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [プリセットギャラリー](../gallery/) · [テーマギャラリー](../gallery/themes/) · [変更履歴](../changelog.md) · [セキュリティ](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [問題を報告](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="../assets/shot/home-800.webp 800w, ../assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/home.png" width="800" height="492" alt="AW Next のライブラリ"></picture>

</div>

## はじめに {#start-here}

順番に読んでも、必要なところから読んでもかまいません。各ページの最後に次のページへのリンクがあります。

| # | ガイド | 内容 |
|---|---|---|
| 1 | [はじめに](getting-started.md) | インストール、初回起動、シンプルと詳細、ゲームの検索、アップデート |
| 2 | [対応ソース](sources.md) | AW Next が読み取るすべてのソースと、それぞれに必要なもの |
| 3 | [通知](notifications.md) | 配信モード、自動、サウンド、位置、スクリーンショット |
| 4 | [プリセットとプリセットデザイナー](presets.md) | ポップアップの見た目、自作、`.awpreset` ファイルの共有 |
| 5 | [オーバーレイ](overlay.md) | ゲーム内の実績リスト：検索、フィルター、レア度 |
| 6 | [コントローラー](controller.md) | ゲームパッドでアプリとオーバーレイを操作する |
| 7 | [ゲームの状態](game-health.md) | ゲームごとのレポートとガイド付き修復 |
| 8 | [トラブルシューティング](troubleshooting.md) | 検出、進捗、通知、プレイ時間の問題 |

## 必要なときに {#when-you-need-it}

| ガイド | 内容 |
|---|---|
| [FAQ](faq.md) | よくある質問への短い答え |
| [Linux と Steam Deck](linux.md) | AppImage とそのアップデート、デスクトップ、オーバーレイのショートカット、Steam、Proton、ランチャー |
| [詳細ツール](advanced.md) | メンテナンス、キャッシュの消去、リセット、手動のゲーム、診断 |
| [Goldberg / GBE のセットアップ](emulator-setup.md) | エミュレートされた Steam ゲームの診断と修復 |
| [Uplay のセットアップ、R1 と R2](uplay-r2.md) | Ubisoft 向けの同様の手順 |
| [比較](comparison.md) | AW Next と Achievement Watcher 2.x、Achievements との違い |
| [コミュニティギャラリー](community-galleries.md) | ほかの人が作ったプリセットとテーマ、自作の投稿 |

**設定 → ヘルプ** は、アプリを開いている間にいちばん手早く調べられるリファレンスです。環境
(オーバーレイのホットキー、コントローラーの割り当て、通知モード、テーマ、有効なソース)に合わせて内容が変わり、
入力に応じてトピックを絞り込みます。

## 開発者向けリファレンス {#developer-reference}

コントリビューターと、AW Next をソースからビルドする方のための資料です。

| トピック | リファレンス |
|---|---|
| コントリビュート、ブランチ、テスト、コミットのスタイル | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| 開発環境のセットアップ、実行、パッケージ化 | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| アプリ、レンダラー、Watchdog の境界、パーサーの規約 | [アーキテクチャ](../architecture.md) |
| Goldberg / GBE のファイル形式、検出、修復の不変条件 | [Goldberg / GBE リファレンス](../goldberg-gbe.md) |
| Uplay R1/R2 のゲームの識別、修復、読み取りの方法 | [Uplay R1/R2 リファレンス](../uplay-reference.md) |
| バージョン管理、公開、CI、自動アップデートの検証 | [リリースワークフロー](../RELEASE_WORKFLOW.md) |
| インストーラー、アンインストーラー、アップデーター | [インストーラー、アンインストーラー、アップデート](../INSTALLER_AND_UPDATES.md) |
| 翻訳、Intl による書式、リンクのルーティング、ロケールリンター | [ローカライズ](../localization.md) |
| ロケールファイルとキーの一致 | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| 持ち運べるテーマファイルとそのバージョン管理 | [.awtheme 形式](../awtheme-format.md) |

## データの保存場所 {#where-your-data-lives}

AW Next が書き込むものはすべて **`%APPDATA%\Achievement Watcher Next`** の下にあります(Linux では
`~/.config/Achievement Watcher Next`、構成は同じです)。以下のパスはこのフォルダーからの相対パスです。アップデートしてもすべて保持され、
初回起動時には古い Achievement Watcher のフォルダーが、変更されないまま読み込まれます。

| 内容 | 場所 |
|---|---|
| 設定、インデックス、データベース | `cfg\` (`options.ini` が設定ファイル) |
| ログ | `logs\` |
| 作成またはインポートしたプリセット | `presets\Users Presets\` |
| プリセットが背景に使う画像 | `presets\images\` |
| 追加したサウンド | `sounds\` |
| 保存またはインポートしたテーマ | `theme-packs\` |
| カスタムテーマで使う画像 | `theme-images\` |
| 置いたスタイルシートのテーマ | `themes\` |
| 実績のバックアップと、GBE の修復前に取ったバックアップ | `backups\achievements\`, `backups\gbe\` |
| カバー画像とゲームのアイコン | `covers\`, `gameIcons\` |
| スクリーンショット | `Pictures\Achievement Watcher Next` (または選んだフォルダー) |
| サインインしたアカウント | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json`, `cfg\psn-auth.json` |
| **再取得できる:** プラットフォームのスキーマ、アイコン、レア度 | `steam_cache\`, `uplay_cache\` |
| **再取得できる:** ダウンロードしたツールとフォルダースキャンの結果 | `cache\` (ユーザーが用意した DLL を置く `cache\uplayR2` を除く) |
| GBE Fork のセーブ(エミュレーターが書き込む) | `%APPDATA%\GSE Saves` |
| 従来の Goldberg のセーブ(同上) | `%APPDATA%\Goldberg SteamEmu Saves` |

**設定 → 詳細 → キャッシュを消去** は、再取得できる 2 行だけを空にし、ほかには何も触れません。
`cfg\`、`presets\`、`theme-packs\`、`theme-images\`、`themes\`、`sounds\`、`covers\`、
`gameIcons\`、`backups\` の中身は再生成されないので、再インストールの前にコピーしておいてください。

問題を報告する前に **設定 → 詳細 → 診断** を実行し、問題を一度再現してから、添付するログの個人情報を取り除いてください。

### このPCから外に出るもの {#what-leaves-this-pc}

AW Next には、アナリティクスもテレメトリーも専用アカウントもありません。必要な問い合わせだけを送り、
すべての応答をキャッシュするので、オフラインでもライブラリが使えます。

| 問い合わせる内容 | 問い合わせ先 | 送る情報 |
|---|---|---|
| 実績リスト、アイコン、全体のレア度 | Steam の公開エンドポイント、SteamCommunity のページ、SteamHunters、Exophase | ゲームの AppID とインターフェース言語 |
| カバー画像とロゴ | Steam CDN、SteamDB、SteamGridDB | ゲームの AppID またはタイトル |
| アップデートの確認とダウンロード | GitHub のリリースフィード | リクエストのみ |
| 修復ツール(修復を実行したとき) | GBE Fork、Steamless、API-bypass、CrakFiles の各プロジェクト | リクエストのみ |
| ライブラリと解除、**アカウントを接続した場合のみ** | Steam、Epic、Xbox Network、PlayStation Network | アカウントのセッショントークン。Steam の解除では公開 Steam ID |
| RetroAchievements のライブラリと解除、**アカウントのカードに入力した場合のみ** | retroachievements.org | ユーザー名と Web API キー(このPCに暗号化して保存) |
| コミュニティのプリセットとテーマ、**ギャラリーを開くか公開した場合のみ** | ギャラリーサービス `aw-gallery.shirow.dedyn.io` | 一覧のリクエスト。ファイルは「公開」を押したときだけ |

ゲームの実行ファイルに本物の 256px アイコンがある場合、AW Next はファイルからそれを読み取ってロゴとして使い、
ネットワークには問い合わせません。

このウェブサイトは Cookie を設定せず、アナリティクスも使わず、フォントとスクリプトも自分のホストから読み込みます。
ギャラリーのページは上記のギャラリーサービスから一覧を取得し、接続できないときは隣にコミットされたコピーに切り替えます。

それ以外は何もアップロードされません。ライブラリ、プレイ時間、フォルダー、スクリーンショットも同様です。任意の
`Websocket @localhost:8082` ブロードキャストは `127.0.0.1` だけで待ち受けるため、読めるのはこのPC上のプログラムだけです。
自分の意思で送るのは、ギャラリーに公開するプリセットまたはテーマだけです
([コミュニティギャラリー](community-galleries.md)を参照)。
