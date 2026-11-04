---
title: "Goldberg と GBE Fork の実績セットアップ"
description: "Goldberg または GBE Fork でエミュレートされた Steam ゲームを診断・修復します。書き込みのたびにバックアップと確認があります。"
---

# Goldberg と GBE Fork の実績セットアップ

AW Next は、Goldberg、GBE Fork、および互換性のある Steam エミュレーターの構成が生成する実績のセーブを読み取ります。
また、スキーマ、AppID、ランタイムのファイルが不完全な場合に、ゲームのローカルなエミュレーター設定を診断して修復することもできます。

## Goldberg または GBE Fork で実績の通知を受け取るには? {#how-do-i-get-achievement-notifications-with-goldberg-or-gbe-fork}

Goldberg と GBE Fork は Steam エミュレーターです。Steam ライブラリの代わりになり、解除を
`%APPDATA%\GSE Saves\<appid>` の下のセーブファイル `achievements.json` に記録します。ゲームの `steam_settings` フォルダーにある
同名の 2 つ目のファイルは、実績を説明するだけです。AW Next は両方を読み取り、
ゲームの上に解除のポップアップを表示します。**設定 → フォルダー** にゲームのフォルダーを追加して **スマート検索** を実行し、
0% のままなら、ゲームを右クリックして **エミュレーターを診断** を選びます。修復を依頼するまで、
ゲームのフォルダーには何も書き込まれません。

> [!WARNING]
> 修復ツールは任意です。選択したゲームのフォルダー内のファイルを変更するため、自分が所有するゲームにだけ
> 使い、大切なものは別にバックアップを取っておいてください。

## スキーマとセーブのファイルは別物 {#schema-and-save-files-are-different}

関連のない 2 つのファイルが、どちらも `achievements.json` と呼ばれることがよくあります。

| | スキーマファイル | 実行時のセーブファイル |
|---|---|---|
| 典型的な場所 | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` または `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| 書き込むもの | ゲームまたはエミュレーターのセットアップ | ゲームの実行中にエミュレーター |
| 目的 | 実績の名前、説明、アイコン | どの実績が解除されたか |
| ない場合 | ゲーム内の実績処理が不完全になることがある。AW Next は別のスキーマソースを使える | 最初の解除が書き込まれるまで、ゲームは 0% と表示される |

スキーマファイルは何かが解除されたことを証明せず、獲得したエントリのない実行時のセーブは、正当な
0% です。1 つのゲームに両方のセーブフォルダーが存在することもあります。AW Next は解除が入っている方を読み取ります。GBE や
Goldberg の設定がセーブを別の場所にリダイレクトしている場合(`local_save_path`)、AW Next はそれが
置かれるフォルダーを監視します。

## 推奨の手順 {#recommended-workflow}

1. **設定 → フォルダー** にゲームライブラリまたはセーブのルートを追加します。
2. **スマート検索** または **設定を生成** を実行します。
3. ゲームでデータが不足している場合は、右クリックして **エミュレーターを診断** を選びます。
4. 修復を適用する前に、レポートを読みます。
5. **エミュレーター修正を適用…** を使うと、ランタイムの DLL のインストールと `steam_settings` の修復が一緒に行われます。
6. ゲームを起動して実績を解除し、必要なら AW Next を更新します。

新しく検出されたゲームの自動セットアップは、**設定 → エミュレーター → Steam / GBE
Fork** で有効にした場合のみ動作します。オフの間、ライブラリのスキャンはゲームのフォルダーに何も書き込みません(DLL も、設定ファイルも、
不足している `achievements.json` すら)。修復を依頼するまでは書き込まれません。

<div align="center">
<picture><source srcset="../assets/shot/steam-gbe-panel-800.webp 800w, ../assets/shot/steam-gbe-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/steam-gbe-panel.png" width="720" height="529" alt="設定 - Steam / GBE Fork"></picture><br>
<sub>自動修復、DLC と ID のスイッチ、任意の SteamStub アンパッカー</sub>
</div>

## コンテキストメニューの操作 {#context-menu-actions}

<div align="center">
<picture><source srcset="../assets/shot/emulator-tools-800.webp 800w, ../assets/shot/emulator-tools.webp 1049w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/emulator-tools.png" width="560" height="336" alt="エミュレーターとツールのコンテキストメニュー" loading="lazy" decoding="async"></picture><br>
<sub>ゲームを右クリック → エミュレーター &amp; ツール</sub>
</div>

### エミュレーターを診断 {#diagnose-emulator}

検出されたエミュレーターの種類、AppID、`steam_settings` の場所、スキーマとセーブの件数、不足しているエントリやアイコン、
カスタムのセーブパスと AppID の不一致、そしてインストールされているランタイムが
AW Next が置いたものかどうかを報告します。診断は読み取り専用です。

### エミュレーター修正を適用… {#apply-emulator-fix}

ランタイムの DLL とスキーマを一度に修復します。

- 一致する GBE Fork のリリースをダウンロードしてキャッシュし、ゲームに必要なアーキテクチャの DLL
  (`steam_api.dll` または `steam_api64.dll`)をインストールします。既存のファイルはバックアップとして残します。
- Steam の実績リストに合わせて `steam_settings\achievements.json`(とその `images` フォルダー)を作成し、
  アイコンをダウンロードします。
- `steam_appid.txt` がない場合は書き込みます。
- GBE の設定ファイル(`configs.app.ini`、`configs.main.ini`、`configs.user.ini`)を書き込みます。

置き換えるすべてのファイルは先にバックアップされ、スキーマの修復では、タイムスタンプ付きのコピーも
`steam_settings\.aw-backups` に保持されます。ランタイムは通常の DLL の置き換えとしてインストールされます。AW Next は
別の ColdClient ランチャーを設定しません。

パッケージ化された Unreal Engine のビルドも同じように修復されます。それらの Steam ファイルは実行ファイルの隣ではなく
`Engine\Binaries\ThirdParty\Steamworks` の下にあり、AW Next はそこで見つけ、インストールし、
確認します。

### DLC の所有権とアカウントの ID {#dlc-ownership-and-account-identity}

**設定 → エミュレーター → Steam / GBE Fork** の 2 つのスイッチは、どちらも既定ではオフで、
自動修復とは独立しています。

| 設定 | 書き込むもの |
|---|---|
| **DLC所有権の管理** | `configs.app.ini`。エミュレーターがすべての DLC を所有済みとして報告するようにします |
| **アカウント名と言語の書き込み** | `configs.user.ini` に、アカウント名と言語 |

どちらも実績には影響しません。ゲームを元のままにしたい場合や、DLC や ID を手動で管理している場合は、オフのままにしてください。

その下の **エミュレーターの ID** カードには、書き込まれる内容が表示されます。

| フィールド | 内容 |
|---|---|
| **アカウント名** | **アカウント名と言語の書き込み** がオンの間、書き込まれます。空の場合は AW Next のプロフィール名を使います。 |
| **Steam ID** | そのスイッチがオンの間、書き込まれます。空の場合は各ゲーム自身のものを保持します。サイコロのボタンで有効なランダム値を作成でき、入力ミスは入力中に指摘され、書き込まれることはありません。 |
| **セーブフォルダー** | 選んだ時点で適用されます：それ以降に修正または修復されたすべてのゲームがそこに保存し(`local_save_path`)、AW Next はリアルタイムの通知のためにそこを監視します。空の場合は `%APPDATA%\GSE Saves` を保持します。 |

どちらのスイッチが書き込んだものも元に戻すには、ゲームを右クリックして **AW Next のエミュレーター設定を削除** を選びます。
何かを行う前に、削除する内容を正確に表示します。AW Next が追加した DLC のセクション、
スイッチ、ID のキーだけを削除し、自分やリパックが設定した値はすべて保持し、
ほかに何も残っていないときにだけファイルを削除します。

### 独自のエミュレーター DLL を使う {#using-your-own-emulator-dll}

**設定 → エミュレーター → エミュレーターの DLL** は、自分の `steam_api.dll` または `steam_api64.dll` をインポートし、
すべての修正と自動修正で、ダウンロードした GBE Fork のビルドの代わりにインストールします。インポートしていない
アーキテクチャは、インターフェースのツールと同様に、公式のビルドから引き続き取得されます。

インポートしたファイルは使用のたびに再検証されます：名前が示すアーキテクチャの本物の PE であり、
Steam エミュレーターの DLL でなければなりません。失敗したファイルは報告されて無視され、インストールされることは
ありません。**公式版を使用** は、インポートを削除してダウンロードしたリリースに戻します。

### Steam DRM を削除（Steamless） {#remove-steam-drm-steamless}

DLL の置き換えを読み込めないとき、選択した実行ファイルから SteamStub を展開しようとします。元の
実行ファイルは `*.steamstub.bak` として保持されます。SteamStub のないゲームには何もせず、サーバー側の
所有権チェックを回避することもありません。

### バックアップと復元 {#back-up-and-restore}

**GBE/Goldberg 構成をバックアップ** を右クリックすると、現在の DLL と `steam_settings` のファイルのスナップショットを取り、
**最新の GBE/Goldberg バックアップを復元…** でそれを戻せます。バックアップには、フォルダーにすでに AW Next が書き込んだ設定が
入っていたことが記録されるため、手を加えていない元の状態と間違えられることはありません。

## AppID を手動で設定する {#set-appid-manually}

ゲームのフォルダー名が複数の Steam リリースに一致して、自動の照合が誤ったものを選んだ場合は、
右クリックして **AppID を手動で設定** を選びます。AppID は `steam_appid.txt` に書き込まれ、
そのインストールフォルダーについて記憶されるため、以降の修復では再び推測せずにそれが使われます。同じメニューの
**手動の AppID を解除** で削除できます。

## よくある問題 {#common-problems}

### ゲームが見つからない {#the-game-is-missing}

- エミュレーターを一度起動して実行時のセーブを作成させるか、実際のゲームライブラリを追加して、検出が
  `steam_settings`、`steam_appid.txt`、Steam API の DLL を見つけられるようにします。
- 設定で追加したフォルダーが、ゲームのフォルダーを含む十分な上位にあり、しかし無関係なデータの入った
  ドライブ全体ではないことを確認します。
- **設定を生成** を実行して、結果の件数を確認します。

### すべての実績がロックされたまま {#every-achievement-remains-locked}

次の原因を順に確認してください。

1. **まだ何も解除されていない。** 実行時のセーブがない、または空であるのは想定どおりです。
2. **スキーマの名前がセーブのキーと一致しない。** **エミュレーターを診断** を実行してから、スキーマを修復します。
3. **セーブパスがカスタマイズされている。** 実際のセーブのルートを AW Next に指定するか、プレースホルダーの
   上書きを取り除きます。
4. **AppID が間違っている。** 別の修復を実行する前に **AppID を手動で設定** を使います。

### 説明やアイコンがない {#descriptions-or-icons-are-missing}

アイコンのダウンロードを有効にして完全な修復を実行します。オンラインのメタデータが使えないとき、AW Next は有効な
ローカルのスキーマを再利用できますが、どのソースにもない説明を作り出すことはできません。

### ゲーム内の通知が出ないがライブラリは更新される {#in-game-notifications-are-missing-but-the-library-updates}

AW Next は実行時のセーブを読み取りますが、ゲーム自身のエミュレーターのスキーマやオーバーレイが不完全な場合があります。
`steam_settings\achievements.json` に実行時のセーブと同じ API 名があり、アイコンのパスが
有効であることを確認してください。

## 制限事項 {#limitations}

Steam で販売されていても、Steamworks 経由で実績をまったく報告しないゲームがあり、Goldberg や GBE の
セーブパスでは追跡できません。また、AW Next は、本当の ID や実績スキーマを安全に解決できない
ゲームを修復することもできません。

[Goldberg/GBE の技術リファレンス](../goldberg-gbe.md)では、ファイル形式、検出ルール、
実装の詳細を説明しています。

---

**次へ：** [Uplay のセットアップ、R1 と R2](uplay-r2.md) - `steam_api.dll` を読み込まないゲーム向けの、
Ubisoft 版に相当するもの。

<div align="center">

[← ドキュメント](README.md) · [技術リファレンス](../goldberg-gbe.md) · [プロジェクトのホーム](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
