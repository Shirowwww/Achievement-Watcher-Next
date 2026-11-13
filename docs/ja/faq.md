---
title: "実績トラッカーの FAQ"
description: "Achievement Watcher Next のアカウント、ソース、通知、安全性、バックアップ、対応プラットフォームについての短い答え。"
---

# 実績トラッカーの FAQ

よくある質問への短い答えです。それぞれ、詳しく説明しているガイドへのリンクがあります。

## セットアップ {#getting-set-up}

### Steam Web API キーや Steam へのサインインは必要ですか? {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
いいえ。実績リストはキー不要の公開エンドポイントの連鎖から取得され、アカウントも必要ありません。自分の Steam の解除は、
Steam がこのPCに保持している統計から読み取られるため、非公開プロフィールでも、ここでプレイしたすべてのゲームで
動作します。Steam の接続は任意です。接続すると、ほかのPCでだけプレイしたゲームと
Steam ファミリーが追加されます。[接続したアカウント](sources.md#connected-accounts)を参照してください。

### どのプラットフォームで動作しますか? {#which-platforms-does-it-run-on}
Windows 10 と 11、および Linux (x64) です。リリースには専用のランタイムが含まれています。Node.js が必要なのは
ソースからビルドするときだけです。

### Linux や Steam Deck で動作しますか? {#does-it-run-on-linux-or-the-steam-deck}
Linux ではベータ版として動作します。GNOME と KDE Plasma 向けのネイティブな AppImage(Wine は使いません)で、
Wayland でも X11 でも使えます。Steam と Proton、Wine、Lutris、Heroic、Bottles で実行されるゲームを検出し、
Windows 版と同じリリースから自動でアップデートされます。Steam Deck への対応は新しく、実機の Deck では
確認されていません。[Linux と Steam Deck](linux.md)を参照してください。

### RetroAchievements に対応していますか? {#does-it-support-retroachievements}
はい。**RetroAchievements** ソースをオンにして、ユーザー名と Web API キーでアカウントを接続すると、
**ライブラリをインポート** でプレイしたすべてのゲームが取り込まれます。RetroAchievements 対応のエミュレーターが実行中は、
新しい解除が通知されます。[RetroAchievements](sources.md#retroachievements)を参照してください。

### PlayStation のトロフィーを表示できますか? {#does-it-show-playstation-trophies}
はい。**設定 → ソース** で PlayStation アカウントを接続する(Sony のページでサインインします)と、
ゲームとトロフィーが、各トロフィーの Sony の取得率とともにインポートされます。PlayStation でも発売された
ほかのソースのゲームには、そのリストの本物のプラチナが表示されます。
[接続したアカウント](sources.md#connected-accounts)を参照してください。

### アカウントを接続する必要がありますか? {#do-i-have-to-connect-an-account}
いいえ。Steam、Epic、Xbox PC、PlayStation は、ローカルファイルにない情報を読み取るためにそれぞれ接続でき、
RetroAchievements はユーザー名と Web API キーを求めます。すべてのトークンとキーは、このPCに保存される前に
暗号化されます。それ以外はアカウントなしで動作します。

### オフラインでも動作しますか? {#does-it-work-offline}
はい。ローカルのソースと、すでにキャッシュされたものは動作します。実績の名前、説明、アートワークは
一度取得され、その後 `%APPDATA%\Achievement Watcher Next\steam_cache`
(Linux では `~/.config/Achievement Watcher Next/steam_cache`)から再利用されます。

### シンプルモードを選ぶと何か失いますか? {#do-i-lose-anything-by-choosing-simple-mode}
いいえ。シンプルはコントロールを隠すだけで、機能をオフにすることはありません。スキャン、監視、保存されるものは
何も変わらず、元に戻せばすべてのコントロールがその値とともに復元されます。
[はじめに](getting-started.md#simple-and-advanced)を参照してください。

### 所有しているがインストールしていないゲームや、別のPCでの解除を表示できますか? {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
はい。Steam ソースを **所有** にすると、Steam アカウントのカードにある 2 つのスイッチ、**所有しているゲームを追加** と
**Steam ファミリーで共有されているゲームを追加** で、ライブラリ全体が一覧に出ます。大きなライブラリでは最初のスキャンが
かなり長くなるため、どちらも既定ではオフです。Steam アカウントを接続している場合、ローカルに
読み取るものがないゲームは Steam プロフィールから読み取られ(ゲームの詳細が公開されている必要があります)、
結果は 6 時間キャッシュされます。
[接続したアカウント](sources.md#connected-accounts)を参照してください。

## ライブラリ {#the-library}

### ゲームが見つからない {#a-game-is-missing}
**設定 → ソース** でそのソースが有効になっていることを確認し、**設定 →
フォルダー** の **スマート検索** を実行して、**インストール済みのゲームのみ表示** をオフにし、ゲームが既知なのに
インストール済みではなくなっていないか確認してください。完全なチェックリストは[トラブルシューティング](troubleshooting.md#a-game-is-missing)にあります。

### ゲームに「実績なし」と表示される {#a-game-shows-no-achievements}
そのゲームには実績セットがありません。起動はでき、プレイ時間も記録され続け、0% として数えられる代わりに
達成率の統計から除外されます。タイルには、進捗バーの場所にアートワークが表示されます。
**設定 → 外観 → ライブラリのタイル → 実績のないゲームのバー** でバーを戻せます。

### 実績を解除したのにゲームが 0% と表示される {#a-game-shows-0-although-i-have-unlocked-achievements}
ゲームにはスキーマがありますが、実行時の解除ファイルがありません。その[ゲームの状態](game-health.md)パネルを開いてください。
足りない部分が示され、該当する修復だけが提案されます。

### なぜ同じゲームが 2 つ表示されるのですか? {#why-does-the-same-game-appear-twice}
2 つのソースで見つかったためです。設定 → 一般 の **重複を統合** で 1 つにまとめられます。一方のエントリが、
今はほかの場所で所有しているゲームの古いセーブフォルダーなら、ブラックリストに入れてください。

### ゲームのアップデートで実績が追加されたが表示されない {#a-game-update-added-achievements-and-i-do-not-see-them}
キャッシュされたリストは 3 日ごとに自分で再確認します。新しいものをすぐに取得するには、**設定 → 詳細 →
実績リストを再確認** を使ってください。**実績データの自動更新** がオフでも動作します。どちらの確認も、すでに
キャッシュされたものを取り除くことはありません。

### ゲームが誤った Steam リリースに照合された {#a-game-was-matched-to-the-wrong-steam-release}
右クリックして **AppID を手動で設定...** を選びます。AppID は `steam_appid.txt` に書き込まれ、
そのインストールフォルダーについて記憶されます。[ゲームの AppID を手動で設定する](advanced.md#set-a-games-appid-by-hand)を参照してください。

## 通知 {#notifications}

### 何かを解除しても何も表示されない {#nothing-appears-when-i-unlock-something}
まず、そのゲームの[ゲームの状態](game-health.md)パネルの通知の行を確認してください。最後に配信した
経路とその理由が示されます。次に
[テストや解除が表示されないとき](notifications.md#if-a-test-or-unlock-does-not-appear)に従ってください。

### 特定のゲームでだけオーバーレイのポップアップが表示されない {#the-overlay-popup-does-not-show-in-one-particular-game}
おそらくそのゲームは排他的フルスクリーンで、常に手前に表示されるポップアップを描画できません。
**自動** では、AW Next はその解除を、ゲームの上に表示される Windows 通知として送ります。従来の排他モードの
ゲームでは何も通過しません。ボーダーレスに切り替えてください。
[自動の判断の仕方](notifications.md#how-automatic-decides)を参照してください。

### プレイ中に通知が隠れる {#notifications-are-hidden-while-i-play}
それは Windows の応答不可です。**優先度の高い通知** をオンにして、Windows の一度だけの確認を
承認してください。[優先度の高い Windows 通知](notifications.md#priority-windows-notifications)を参照してください。

### ポップアップの見た目を変えたり、デザインを共有したりできますか? {#can-i-change-how-the-popup-looks-or-share-a-design}
はい。アプリには 10 種類のプリセットが付属し、**プリセットデザイナー** で通常のコントロールを使って自作でき、
どのプリセットも 1 つの `.awpreset` ファイルにエクスポートできます。[プリセットとプリセットデザイナー](presets.md)を参照してください。

### 配信に解除を表示できますか? {#can-i-put-unlocks-on-my-stream}
はい。OBS のブラウザーソースを使います。ポップアップをウィンドウとしてキャプチャする方法は使えません。1 回の解除のために
存在し、OBS が一覧にする前に消えてしまうため、AW Next は同じポップアップをページとして提供します。アドレスは
設定 → 通知 の **OBSブラウザソース** にあります。
[配信で解除を表示する(OBS)](notifications.md#show-unlocks-on-stream-obs)を参照してください。

### オーバーレイとポップアップは同じものですか? {#is-the-overlay-the-same-thing-as-the-popup}
いいえ。ポップアップはプリセットで装飾される一度きりの通知です。**オーバーレイ** は、ゲームの実行中に
`Ctrl+Shift+K` で開く、実績の完全なリストです。[オーバーレイのガイド](overlay.md)を参照してください。

### Linux で、ゲーム中に Ctrl+Shift+K を押しても何も起きない {#on-linux-ctrlshiftk-does-nothing-in-my-game}
Wayland では、ネイティブな Wayland ウィンドウにフォーカスがあるとき、たとえば Wayland モードの
Linux ゲームや Wayland ドライバーを使う Proton では、AW Next は押されたキーを認識できません。デスクトップのキーボード
設定で、`/home/you/.local/bin/achievement-watcher --toggle-overlay` にキーを割り当ててください。`you` は自分のユーザー名に
置き換えます。AW Next はそのコマンドが現在の AppImage を指すように保つため、ショートカットは
アップデート後も有効です。[オーバーレイのショートカット](linux.md#overlay-shortcut)を参照してください。

## 安全性とデータ {#safety-and-data}

### AW Next はゲームを変更したり、PCから何かを送信したりしますか? {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
依頼したときだけです。実績の読み取りは読み取り専用です。エミュレーターの修復ツール(ゲームの
右クリックの **エミュレーターとツール** サブメニューと **設定 → エミュレーター**)はゲームフォルダーに書き込みますが、必ず
確認のあとで、バックアップとともに行われます。自分が所有するゲームにだけ使ってください。読み取り専用の問い合わせと、
接続したアカウントが返す内容を除けば、このPCから外へ出るものはありません。
[このPCから外に出るもの](README.md#what-leaves-this-pc)を参照してください。

### ウイルス対策ソフトがファイルを検出または削除した {#my-antivirus-flagged-or-removed-a-file}
ほぼ確実に Steam エミュレーターか Ubisoft のローダーで、誤検出です。これらのファイルはゲームの Steam や Ubisoft の
ライブラリの代わりになるもので、検出エンジンはまさにその振る舞いを探しています。修復を実行したか、**設定 → エミュレーター** を開いたか、
自動修復をオンにしたときでなければ、何も書き込まれません。ウイルス対策ソフトが名指ししたファイルを許可するか、
`%APPDATA%\Achievement Watcher Next\cache` を除外してください。保護を決してオフにしないでください。
[トラブルシューティング → ウイルス対策ソフト](troubleshooting.md#antivirus-or-smartscreen-warning)を参照してください。

### Windows SmartScreen がインストーラーについて警告する {#windows-smartscreen-warns-about-the-installer}
リリースは、商用のものではなく、拇印で固定されたプロジェクト独自の証明書で署名されているため、SmartScreen が
確認を求めることがあります。その証明書をインストールする必要はありません。アプリ内のアップデーターは、何かをインストールする前に、
署名者、固定された拇印、署名後にファイルが変更されていないことを確認します。ダウンロードは
[公式のリリースページ](https://github.com/Shirowwww/Achievement-Watcher-Next/releases)からだけにしてください。
インストーラーを自分で確認するには、`Get-FileHash <installer> -Algorithm SHA256` を実行し、
`https://www.virustotal.com/gui/file/<hash>` を開きます。現在のリリースは
[3.12.7](https://www.virustotal.com/gui/file/183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96)です。
[トラブルシューティング → リリースを自分で確認する](troubleshooting.md#checking-a-release-yourself)を参照してください。

### Linux で、なぜキーリングのプロンプトが表示されますか? {#on-linux-why-does-a-keyring-prompt-appear}
AW Next はサインインのトークンを、デスクトップのキーリング(GNOME Keyring または KDE
Wallet)が保持するキーで暗号化します。自動ログインではキーリングがロックされたままなので、AW Next の起動時に
デスクトップがロック解除か作成を求めます。キャンセルしても問題ありません。アプリは動作し続け、プロンプトは次の
起動時に再び表示されます。[キーリングのプロンプト](linux.md#keyring-prompt)を参照してください。

### データはどこにありますか? アップデートで失われますか? アップデートの大きさは? {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
すべて `%APPDATA%\Achievement Watcher Next`(Linux では `~/.config/Achievement Watcher Next`)にあり、
新しいビルドをインストールしても保持されます。アップグレード後の最初の起動で、古い Achievement
Watcher のフォルダーが、変更も削除もされずに取り込まれます。アップデートは、インストール済みのバージョンから
変更された部分だけをダウンロードし、失敗すると自動的に完全なダウンロードに切り替わります。
[アップデートと既存のデータ](getting-started.md#updates-and-existing-data)を参照してください。

### 新しいPCに移行したり、設定をバックアップしたりするには? {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**設定 → 詳細 → プロファイルのバックアップ → プロファイルをエクスポート…** で、設定、ライブラリの選択、
プリセット、テーマ、カバー、プレイ時間が 1 つの `.awbackup` ファイルに書き出されます。新しいPCに AW Next をインストールし、
**プロファイルを復元…** を選ぶと、次の起動時に適用されます。置き換えられるファイルは保持されます。サインインは
保存されないため、Steam、Epic、Xbox、PlayStation、RetroAchievements をもう一度接続してください。
[プロファイルのバックアップ](advanced.md#profile-backup)を参照してください。

### ポータブル版はありますか? {#is-there-a-portable-version}
はい。ポータブル版の ZIP は、アプリとそのデータを 1 つのフォルダーに保持し、インストール版と同じリリースフィードを確認します。
インストーラーをダウンロードも実行もすることはなく、新しいバージョンが出たときにリリースページを案内します。
新しいアーカイブを古いフォルダーに展開すれば、データは保持されます。

### 完全に終了するには? {#how-do-i-quit-completely}
ウィンドウを閉じると AW Next はシステムトレイに残り、追跡が続きます。終了するにはトレイメニューを使ってください。

## プロジェクト {#the-project}

### Goldberg、GBE Fork、CODEX のゲームで動作しますか? {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
はい。AW Next は Goldberg、GBE Fork、CODEX、RUNE、CPY が書き込む実績ファイルを読み取り、ゲーム用に GBE Fork のランタイムを
インストールして修復することもできます。[対応ソース](sources.md)と
[Goldberg と GBE Fork のセットアップ](emulator-setup.md)を参照してください。

### これは Xan105 の Achievement Watcher と同じアプリですか? {#is-this-the-same-app-as-xan105s-achievement-watcher}
いいえ、その後継です。AW Next は Xan105 の Achievement Watcher と darktakayanagi の 2.x
ブランチを引き継ぎ、最新の Electron ランタイム、Linux 対応、より多くのソース、ガイド付き修復のあるゲームごとの状態レポートを備えています。
[比較](comparison.md)を参照してください。

### クラック版のゲームで使っても安全ですか? {#is-it-safe-to-use-with-cracked-games}
実績の読み取りは読み取り専用です。修復ツールは、確認のあとで、バックアップとともにだけゲームフォルダーに書き込み、
自動修復は既定でオフです。自分が所有するゲームにだけ使ってください。ウイルス対策ソフトが
エミュレーターのファイルを誤検出することがあります。
[トラブルシューティング → ウイルス対策ソフト](troubleshooting.md#antivirus-or-smartscreen-warning)を参照してください。

### Achievement Watcher 2.x とどう違いますか? {#how-does-this-differ-from-achievement-watcher-2x}
AW Next は、モダンなランタイムと、互換性、信頼性、機能への大規模な見直しとともにこれを引き継いでいます。
[比較](comparison.md)を参照してください。

### ゲーム、キー、アカウントを入手できますか? {#can-it-get-me-games-keys-or-accounts}
いいえ。issue トラッカーでもそれには対応できません。AW Next にはゲームのファイルは含まれておらず、
オンラインの所有権チェックを回避することもありません。

### バグを見つけた、またはアイデアがある {#i-found-a-bug-or-have-an-idea}
アプリのバージョン、Windows のバージョン(または Linux のディストリビューションとデスクトップ)、関係するソース、関連するログを添えて
[issue を作成](https://github.com/Shirowwww/Achievement-Watcher-Next/issues)してください。
脆弱性の疑いは、
[セキュリティポリシー](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md)に従って非公開で報告してください。
質問や、バグかどうか分かる前のヘルプは、[Discord サーバー](https://discord.gg/DjTMrDsXTh)でどうぞ。

---

**まだ解決しませんか?** [トラブルシューティング](troubleshooting.md)で症状ごとに順を追って確認できます。

<div align="center">

[← ドキュメント](README.md) · [プロジェクトのホーム](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
