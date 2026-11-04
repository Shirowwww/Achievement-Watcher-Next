---
title: "Linux と Steam Deck 向けの実績トラッカー"
description: "AppImage のインストールと更新、GNOME や KDE でのオーバーレイのキー割り当て、Steam、Proton、Lutris、Heroic、Bottles でのゲームの実行。"
---

# Linux と Steam Deck 向けの実績トラッカー

AW Next は Linux (x64) でネイティブアプリとして動作し、Wine を通すことはありません。Steam と Proton、Wine、Lutris、Heroic、Bottles で
実行されるゲーム、ネイティブな Linux ゲーム、対応するエミュレーターを追跡し、
Windows と同じライブラリ、ポップアップ、オーバーレイ、プレイ時間を提供します。

Linux 版は**ベータ**です。GNOME と KDE Plasma、Wine と Proton のプレフィックス、テスト用のゲームで
テストされていますが、多くの実機では試されていません：実機の Steam Deck、実機のゲームパッド、すべてのランチャー、
すべてのシーンリリースです。うまく動かない場合は、ディストリビューション、デスクトップ、ログを添えた
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) がもっとも役立ちます。

## インストール {#install}

1. [最新のリリース](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)を開いて、
   `Achievement.Watcher.<version>.AppImage` をダウンロードします。
2. `~/Applications` など自分のフォルダーに置き、実行可能にします：ファイル
   マネージャーでは **プロパティ → ファイルをプログラムとして実行することを許可**、またはターミナルで：

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. 起動して、Windows と同じように初回ガイドに従います([はじめに](getting-started.md)を参照)。

AppImage には FUSE 2 が必要ですが、Ubuntu 24.04 をはじめ、一部のディストリビューションでは既定でインストールされなくなっています。
ファイルが起動しない場合は、インストールしてください：Ubuntu 24.04 以降では `libfuse2t64`、それ以前の
Ubuntu と Debian では `libfuse2`、Fedora では `fuse-libs`、Arch では `fuse2` です。

最初の起動時に、AW Next は自分自身をアプリケーションメニューに追加します。**設定 → 一般 → 起動時に開始** で、
ログインのたびにトレイに隠れた状態で起動します。設定、キャッシュ、プレイ時間、ログは
`~/.config/Achievement Watcher Next` にあります。

## アップデート {#updates}

AppImage は、Windows 版と同じ GitHub のリリースから自動でアップデートします。新しいバージョンはデスクトップ通知と
タイトルバーのチップで知らされ、ダウンロードの前に確認します。その後、リリースとともに公開される SHA-512 ダイジェスト
(`latest-linux.yml`)でファイルを検証し、古い AppImage を置き換えて再起動します。ゲームが実行中の場合、
アップデートはゲームが閉じるまで待ちます。データはそのまま残ります。

新しいファイルには、名前に新しいバージョンが入ります。**起動時に開始** のエントリと
`~/.local/bin/achievement-watcher` コマンドはそれに追従します。AppImage のファイル名を指定して自作したランチャーは
古い名前を指したままなので、代わりにそのコマンドを指すようにしてください。

## 対応デスクトップ {#supported-desktops}

AW Next は、Wayland と X11 の GNOME と KDE Plasma(GNOME 46 と Plasma 5.27 の Ubuntu 24.04)、および仮想
マシン上の Fedora 44(GNOME 50、Plasma 6.7、Hyprland 0.56、COSMIC 1.0)でテストされています。
ほかのデスクトップでも動作する可能性はありますが、試していません。

- **Wayland。** AW Next は、ポップアップとオーバーレイが、Wine と Proton の下で X11 ウィンドウとして動作するゲームの上に
  とどまれるよう、起動時に XWayland を通して一度自分自身を再起動します。Hyprland と COSMIC は XWayland を
  既定で起動します。それがないと(Hyprland で `xwayland.enabled = false`)、AW Next はネイティブな Wayland アプリのままです：
  ライブラリ、トレイ、通知は動作しますが、コンポジターがポップアップとオーバーレイを
  通常のウィンドウと同様に配置し、ポップアップは表示されている間、ゲームからキーボードを奪います。
- **トレイ。** KDE と COSMIC はトレイアイコンをそのまま表示します。GNOME には AppIndicator 拡張機能が必要で、
  Ubuntu では有効な状態で出荷されています。Hyprland には、Waybar の `tray` モジュールのような、トレイ付きのバーが必要です。
  トレイがない場合、ウィンドウを閉じると AW Next は隠れずに最小化されます。Hyprland には最小化された
  ウィンドウがないので、そこでは隠れ、AW Next をもう一度起動するとウィンドウが戻ります。
- **通知** はデスクトップ標準のものです。応答不可は、**設定 → 通知 →
  優先度の高い通知** がオンでない限り通知を隠し、オンなら GNOME と KDE では解除が引き続き表示されます。Hyprland には独自のものがありません：
  mako、dunst、SwayNC などの通知デーモンを実行してください。mako は、設定で `layer=overlay` を指定しない限りフルスクリーンの
  ゲームの下に描画し、`default-timeout`(ミリ秒)を設定しない限り、クリックするまで各通知を表示し続けます。
  COSMIC は、ゲームがフルスクリーンの間、通知を保留します。AW Next 自身のポップアップは、どちらの場合もゲームの上に表示されます。
- Windows にしかないオプションは、設定にその旨が表示されます。

## スクリーンショットとクリップ {#screenshots-and-clips}

解除ごとのスクリーンショットとクリップは、X11 でも Wayland でも動作します。クリップは、インストールされている場合は
gpu-screen-recorder がグラフィックスカードで録画します。設定でそれを選ぶと、AW
Next 自身のソフトウェアレコーダーが WebM ファイルを保存し、その負荷を表示します。

Wayland では、最初のスクリーンショットで、アプリにスクリーンショットを撮ってよいかデスクトップが確認します(GNOME 47
以降、KDE Plasma 6、COSMIC、Hyprland)。AW Next は数秒だけ回答を待ち、そのあとそのスクリーンショットと、
質問が開いている間に起きた解除のスクリーンショットを省略します。GNOME と Hyprland では Enter が **拒否** を選ぶため、
**許可** をクリックしてください。以降のスクリーンショットは何も表示せずに撮られます。拒否すると、
AW Next はスクリーンショットを撮らず、二度と尋ねません。次のスクリーンショットでもう一度尋ねられるようにするには、
次を実行します。

```bash
flatpak permission-remove screenshot screenshot
```

ソフトウェアレコーダーは、デスクトップの画面共有ダイアログを通して画面をキャプチャします。そのダイアログはゲームの起動のたびに
再び表示され、COSMIC と Hyprland ではゲームをフルスクリーンから外します。
gpu-screen-recorder が尋ねるのは一度だけです。

## オーバーレイのショートカット {#overlay-shortcut}

Wine または Proton のゲームにフォーカスがあるとき、`Ctrl+Shift+K` でオーバーレイが開きます。Wayland では、AW Next は
**ネイティブな Wayland ウィンドウ**にフォーカスがあるときに押されたキーを認識できません。Wayland モードの Linux ゲームや、
Wayland ドライバーを使う Proton がそうです。そうしたゲームにはゲーム内のホットキーがありません。

デスクトップのキーボード設定のショートカットは、それに依存しません。次のコマンドを実行するように設定してください。
`you` は自分のユーザー名に置き換えます(GNOME は `~` を展開しないので、フルパスを書いてください)。

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

すでに実行中のコピーのオーバーレイを開閉し、ほかには何も起動しません。このコマンドは AppImage の最初の起動から存在し、
AW Next が起動のたびに更新するため、アップデートにも追随します。

- **GNOME：** **設定 → キーボード → ショートカットを表示およびカスタマイズ → カスタムショートカット → ショートカットを追加**。
  名前を付け、コマンドを貼り付けて、使いたいキーを押します。
- **KDE Plasma 6：** **システム設定 → キーボード → ショートカット → 新規追加 → コマンドまたはスクリプト**。
  コマンドを貼り付けて、ショートカットを設定します。
- **KDE Plasma 5：** **システム設定 → ショートカット → カスタムショートカット → 編集 → 新規 → グローバルショートカット →
  コマンド/URL**。**トリガー** でキーを、**アクション** でコマンドを設定します。
- **Hyprland** 0.55 以降は、`~/.config/hypr/hyprland.lua` に：

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  古い `hyprland.conf` では、同じ行は
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay` になります。
  Hyprland はどのウィンドウよりも先にキーを受け取るため、ゲームにかかわらず、1 回の押下でオーバーレイが一度だけ開閉します。
- **COSMIC：** **設定 → 入力デバイス → キーボード → キーボードショートカット → カスタムショートカット → ショートカットを
  追加**。**ショートカット名** と **コマンド** を入力し、キーを入力します。ネイティブな
  Wayland ゲームの上でも動作します。COSMIC の **X11 アプリケーションのグローバルショートカット** の設定は役に立ちません：
  AW Next はそこでもキーを認識しません。

Hyprland と COSMIC では、オーバーレイはフルスクリーンのゲーム(Wine でもネイティブ Wayland でも)の上に表示されます。
**開いたときにオーバーレイにフォーカス** がオンの場合([コントローラーのガイド](controller.md)を参照)、どちらも表示のためにゲームを
フルスクリーンから外します。Hyprland では、次のウィンドウルールで、ゲームをフルスクリーンのまま、オーバーレイをその上に保てます。

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

コントローラーでも使えます。AW Next はゲームパッドを直接読み取るため、
[コントローラーのガイド](controller.md)のコントローラーショートカットで、ゲームから何も奪わずにオーバーレイを開き、操作できます。
Steam Input の実行中は Steam の仮想パッドだけを読み取るため、1 回の押下が二重に数えられることはありません。

## キーリングのプロンプト {#keyring-prompt}

AW Next が保持するわずかな秘密情報(Steam、Epic、Xbox、PlayStation のサインインのトークン、RetroAchievements の
キー、エミュレーターの Steam パスワード)は、デスクトップのキーリング(GNOME Keyring
または KDE Wallet)が保持するキーで暗号化されます。Hyprland には独自のものがなく、インストールされているものを使い、
AW Next が最初にそれを要求したときに起動します。

**自動ログイン**では、セッションの開始時にキーリングはロック解除されません。AW Next が初めてそれを
必要としたとき、デスクトップがロック解除を求め、なければ作成を求めます。KDE では KDE
Wallet のアシスタントが開きます。答えると AW Next は続行します。キャンセルしても AW Next は動作し続け、
接続が保護されていないと一度だけ知らせ、デスクトップは次の起動時にもう一度尋ねます。このプロンプトがアプリを
ブロックすることはありません：開いている間も、追跡と通知は動作します。

## Steam と Proton {#steam-and-proton}

AW Next は、ディストリビューション(`steam-installer`、`steam`)、Flathub、Snap のいずれから来た Steam クライアントでも検出し、
ほかのディスクにあるライブラリフォルダーや、各ゲームの Proton プレフィックスも見つけます。
2 つの Steam クライアントがインストールされている場合は、最後に起動したほうに従います。

Steam 自身が実行するゲームの解除は、Windows と同様に Steam 自身のファイルから読み取られます。AW Next がそれらを表示するのは、
**設定 → 通知 → Steam クライアントのゲーム** がオンのときだけです。Steam がそれらに独自のポップアップを表示するためです。

## Wine、Lutris、Heroic、Bottles {#wine-lutris-heroic-and-bottles}

すべてのソースは、Windows レジストリを含め、ゲームのプレフィックスの中で読み取られます：Steam エミュレーター
(Goldberg、GBE Fork、および[対応ソース](sources.md)にあるその他)を使うゲーム、Ubisoft や GOG の
セーブなどです。**スマート検索** は、ホームフォルダー、ほかのディスク、把握しているすべてのプレフィックスを検索します。

- **Lutris** と **Bottles**：それらがインストールしたゲームとプログラムが、プレフィックスとともに一覧に出ます。
- **Heroic**：Heroic 経由でインストールした Epic のゲームは、Epic のゲームとして認識されます。
- **通常の Wine**：既定の `~/.wine` プレフィックスと、追加したプレフィックスのフォルダー。
- Goldberg または GBE Fork(`libsteam_api.so`)を使う**ネイティブな Linux ゲーム**は、Linux のセーブフォルダーから
  読み取られます。

**再生** は、ゲームが属するランチャー(Steam、Lutris、Heroic)を通してゲームを起動し、プレイ時間は
ゲームのプロセスから数えられます。[ゲームの状態](game-health.md)のエミュレーター修復は AppImage から動作し、
常にバックアップを取ったうえで、ゲームのプレフィックスの中に書き込みます。

## エミュレーター {#emulators}

RPCS3、shadPS4、RetroArch、Xenia は Linux のフォルダーから検出され、RPCS3 と shadPS4 は Flathub から
インストールした場合も検出されます。RetroAchievements の解除は、ソースが接続されていれば、どのエミュレーターでも通知されます。

## Steam Deck {#steam-deck}

Steam Deck への対応は新しく、**実機の Deck では確認されていません**。想定している動作は次のとおりです。

- **デスクトップモード**では、AW Next はほかの Linux デスクトップと同じ AppImage です。最初のウィンドウは
  Deck の 1280x800 の画面に収まり、microSD カード上のゲームも検出されます。
- **起動時に開始** がオンなら、AW Next は**ゲームモード**でも動作します：Steam が起動したあと
  バックグラウンドサービスとして起動します。
- ゲームモードにはデスクトップ通知がないため、AW Next は各解除を、左上の隅から独自のポップアップとして
  ゲームの上に描画します。SteamOS のパフォーマンスオーバーレイがそのポップアップを隠すことがあります。
- リポジトリの `decky/` フォルダーにある **Decky プラグイン**は、各解除を Steam 自身の通知に送り、
  ゲームモードでは常にそれが描画されます。プラグインが待ち受けている間、AW Next は自身のポップアップを出さないため、
  通知は 1 つだけ表示されます。プラグインがなければ、ポップアップが代替になります。今のところ手動でインストールします：
  ビルド(`npm install`、続いて `npm run build`)して
  `~/homebrew/plugins/achievement-watcher/` にコピーします。詳しくは
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md) を参照してください。
  AW Next が実行中で、websocket フィード(既定でオン)が有効である必要があります。

ポップアップは PC 上で再現したゲームモードのセッションで確認され、Decky プラグインにはユニットテストしかありません。実機の Deck で
どちらかを試した場合は、見たことを書いた
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) が助けになります。

## 問題を報告する {#reporting-a-problem}

ディストリビューション、デスクトップ(GNOME か KDE、Wayland か X11)、ゲームの実行方法(Steam と Proton、
Lutris、Heroic、Bottles、Wine)、そして `~/.config/Achievement Watcher Next/logs` のファイルを含めてください。

---

**次へ：** [トラブルシューティング](troubleshooting.md) - 検出、進捗、通知、プレイ時間の
問題について。

<div align="center">

[← ドキュメント](README.md) · [はじめに](getting-started.md) · [プロジェクトのホーム](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
