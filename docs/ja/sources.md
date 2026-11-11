---
title: "対応ソース"
description: "Achievement Watcher Next が読み取るゲームのソース(Steam、GOG、Epic、Ubisoft、EA、Xbox PC、エミュレーター、RetroAchievements)と、それぞれに必要なもの。"
---

# 対応ソース

**ソース**とは、AW Next が実績を読み取る場所の 1 つです。ランチャーのローカルデータ、Steam 互換の
セーブファイル、コンソールエミュレーターのトロフィーファイルなどがあります。各ソースには **設定 →
ソース** に専用のスイッチがあります。

AW Next は、Steam、GOG Galaxy、Ubisoft Connect、Epic Games、Xbox PC、EA Desktop のローカル実績ログ、
RetroAchievements、コンソールエミュレーター、そして Goldberg、GBE
Fork、CODEX、RUNE、CPY といった Steam エミュレーターのセーブファイルを読み取ります。Steam Web API キーもアカウントも不要です。

<div align="center">
<picture><source srcset="../assets/shot/sources-panel-800.webp 800w, ../assets/shot/sources-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/sources-panel.png" width="720" height="529" alt="設定 - ゲームのソース"></picture><br>
<sub>各ソースは個別のスイッチです。盾のマークは公式のデスクトップライブラリを示します</sub>
</div>

ソースを有効にしたら、ライブラリを更新してください。このPCで検出されたライブラリだけが表示されます。

## 公式プラットフォームのライブラリ {#official-platform-libraries}

ランチャー自身のローカルデータを読み取るもので、設定では盾のマークが付いています。

| ソース | AW Next が読み取るもの | 必要なもの |
|---|---|---|
| **Steam** | ローカルの appcache の状態、公開プロフィールのデータ、実績のスキーマ、製品のメタデータ | Steam がインストールされていること。アカウントの接続は任意 |
| **GOG Galaxy** | Galaxy クライアントのローカルデータベースと、互換性のある旧形式のセーブおよび UniverseLAN | GOG Galaxy がインストールされているか、UniverseLAN で動作しているゲーム |
| **Ubisoft Connect** | ネイティブのローカルデータと旧 Uplay 形式 | Ubisoft Connect がインストールされていること |
| **Epic Games** | ローカルのインストールと、接続後はアカウントが所有するゲームとその公式の実績の状態 | ローカルのインストールには Epic Games ランチャー。それ以外にはアカウントの接続 |
| **Xbox PC** | ローカルの Game Pass と Microsoft Store のインストールと、アカウントが所有するゲームとその Xbox Network の状態 | ローカルのインストールには Xbox アプリ。それ以外にはアカウントの接続 |
| **Rockstar Games Launcher** | インストールしたゲームと、その Steam 版の実績リスト、および接続後はその解除状態 | Rockstar Games Launcher がインストールされていること。解除状態にはアカウントの接続が必要 |

**Steam**、**Epic Games**、**Xbox PC** にはそれぞれ 3 つの設定があります：**なし**、**インストール済み**(このPCの
ゲーム)、**所有**(アカウントが所有するライブラリ全体)。**所有** はここにインストールされていないゲームも
一覧に出し、下記のアカウント接続が必要です。**GOG Galaxy** には **なし**、**インストール済み**、
**プレイ済み** があります。Galaxy はゲームのアンインストール後もプレイデータを保持しており、**プレイ済み** ではそうした
ゲームも引き続き一覧に出ます。

Steam アカウントのカードの下にある **Steam ライブラリ** には、このPCのすべての Steam ライブラリフォルダーが並びます。1 つを
オフにすると、そのゲームは「すべてのゲーム」を含む一覧から消えます。たとえばストレージとして接続したままにしている
ドライブなどです。オンに戻すとまた表示されます。

> [!NOTE]
> Steam の解除は、Steam がこのPCに保持している統計から読み取ります。プロフィールが非公開でも、**ゲームの詳細** が非公開でも、
> ここでプレイしたすべてのゲームで動作します。SteamTools、LuaTools、GreenLuma 経由で追加したゲームも含まれ、
> Steam が解除を記録した瞬間にカードが更新されます。公開プロフィールで追加されるのは
> 名前とアバターだけです。別のPCだけでプレイしたゲームには、下記のアカウント接続が必要です。これらの解除は、通知の設定で
> **Steam クライアントのゲーム** を有効にすると AW Next の通知を出します
> ([通知](notifications.md#games-steam-runs)を参照)。

> [!NOTE]
> **EA Desktop** は異なります。EA の管理フォルダー外にあるゲームについて EA Desktop のローカル実績ログを読み取り、
> 通常の EA ライブラリはインポートしません。

> [!NOTE]
> **Rockstar Games Launcher** のゲームでは、Rockstar Games アカウントを接続するまで、すべての実績がロック状態で表示されます。Social Club は解除済みの実績をアカウントの鍵で暗号化したファイルに保存しており、そのため AW Next は代わりに Rockstar に問い合わせます。

### 接続したアカウント {#connected-accounts}

Steam、Epic、Xbox PC、PlayStation、Rockstar Games は、ローカルファイルにない情報を読み取るために、設定からそれぞれ接続できます。
すべてのトークンはこのPCに保存される前に暗号化され、それ以外の機能はすべて
アカウントなしで動作します。

| アカウント | 接続すると追加されるもの |
|---|---|
| **Steam** | 既定ではオフで、Steam ソースが **所有** のときに表示される 2 つのスイッチ：**所有しているゲームを追加** と **Steam ファミリーで共有されているゲームを追加**。非公開プロフィールや、ライブラリの大半をここにインストールしたことがないプロフィールでも、正しいゲームを一覧に出せます。どちらも最初のスキャンがかなり長くなります。追加された各ゲームの実績とアートワークを一度解決するためです。ローカルに読み取るものがないゲームは、その後 Steam プロフィールから読み取られ、そのためにはゲームの詳細が公開されている必要があります。結果は 6 時間キャッシュされます。**Steam ライブラリにもうないゲームを隠す** は残りを取り除きますが、ここにインストールされているゲームや Steam ファミリーで共有されているゲームは決して隠しません。サインインは Valve 自身のページで行います。 |
| **Epic Games** | 解除済みの実績と、**所有** にした場合はライブラリ全体：各ゲームの完全なリスト、解除の状態、レア度。所有しているゲームの一部には、Epic のストアデータに載っていない実績があります(Shadow of the Tomb Raider、Civilization VI)。それらも Nemirtingas の games-infos-datas から一覧に出ますが、解除の状態はありません。サインインしていても Epic は共有しないためです。インストール済みのゲームの名前、説明、レア度はアカウントなしで動作します。 |
| **Xbox PC** | ライブラリの Xbox Network からの解除の状態とレア度を、ローカルにキャッシュして表示します。**所有** にすると、アカウントがほかの場所でだけプレイしたゲームも追加されます。 |
| **PlayStation** | PlayStation のゲームとトロフィー、各トロフィーに対する Sony 自身の取得率。バックグラウンドで 3 日ごとに更新されます。持っていないゲームは Sony のカタログから名前で追加でき、同じ方法で削除できます。PlayStation でも発売された他のソースのゲームには、そのリストの本物のプラチナが表示され、トロフィーモードでは本物のグレードと DLC グループが表示されます([通知](notifications.md#trophy-mode)を参照)。サインインは Sony 自身のページで行います。 |
| **Rockstar Games** | Rockstar Games Launcher がインストールしたゲームの解除状態と解除日時。Rockstar は実績に番号を振っており、AW Next はランチャーが `Documents\Rockstar Games\Social Club\Titles` に保持するリストを使って名前を付けます。そこにリストがないゲームは、すべてロックのままです。GTA V の両エディションで確認済みです。サインインは Rockstar 自身のページで行い、その際に残るセッションはトークンを更新するために暗号化して保存されます。 |

タイルには、接続によって判明したことを示す小さなバッジが付きます：そのストアで購入、Steam ファミリーで共有、
またはライブラリにもうない、のいずれかです。

## Steam 互換のセーブ {#steam-compatible-saves}

AW Next は、Steam エミュレーターが書き込む実績と統計のファイル(`achievements.json`、
`achievements.ini`、`achievements.bin`、`stats.ini` と互換性のある構成)を、それらの
ツールが使う場所から読み取ります。対象は **Goldberg** と **GBE Fork**(AW Next でインストールと修復もできます)、
**GreenLuma**、**LumaPlay**、**SmartSteamEmu**、**CreamAPI**、**Nemirtingas** のエミュレーター、そして
互換性のある構成のシーンリリースです。ファイルが別の場所にあるゲームは、
**設定 → フォルダー** にそのフォルダーを追加してください。

<div align="center">
<picture><source srcset="../assets/shot/folders-panel-800.webp 800w, ../assets/shot/folders-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/folders-panel.png" width="720" height="529" alt="設定 - フォルダー" loading="lazy" decoding="async"></picture><br>
<sub>AW Next が自動で確認するフォルダーと、追加したフォルダー(ゲームごとのセーブまたはライブラリ全体)</sub>
</div>

ポータブル版の CODEX、RUNE、CPY のリリースは通常 `%PUBLIC%\Documents\Steam\<SOURCE>\<appid>` に書き込みますが、
ポータブルコピーはそのツリーをゲームフォルダーの中に置くため、誰も探しません。
ゲーム自身のフォルダーを **設定 → フォルダー** に追加すれば十分です。その `steam_emu.ini`(または `cpy.ini`)に
AppID が書かれており、セーブのツリーは共有の場所より先に、その隣で探されます。まだセーブのないゲームも、
0% で追加されます。

エミュレーターの設定がないリリースや、ini を削除したリリースでも動作します。`Steam\RUNE\<appid>` はフォルダー名に AppID を持つため、
セーブのツリーが直接読み取られます。同じ構成は、追加したフォルダーの 1 階層下でも調べられるので、
ゲームライブラリ全体を AW に指定できます。

フォルダーが使えないとき、AW はその理由を示します：ゲームはあるが読み取れる解除のファイルがない、
実績に関するものが何もない、または **EA app** のリリースである、のいずれかです。EA app のリリースは実績を
ディスクではなく EA アカウントに保持するため、EA ソース経由で読み取られ、どのフォルダーを追加しても
表示させることはできません。メッセージには調べた構成の数も示されるので、「見つからなかった」と「確認していない」を
区別できます。

3 つのケースは個別に扱われます。

- **Goldberg SocialClub**：Rockstar と Social Club のバリアントで、専用のスイッチがあります。
- **RUNE Ubisoft Connect**：RUNE の Ubisoft エミュレーターは `achievements.cfg` ファイルを
  `Documents\RUNE\Ubisoft Connect\achievements` に保持します。フォルダーを追加しなくても見つかり
  (**設定 → フォルダー** に `RUNE\Ubisoft Connect` フォルダーを追加しても動作します)、Ubisoft
  Connect エミュレーターのスイッチに従います。名前とアイコンはそのゲームの Ubisoft Connect のリストから取得され、
  それがなければ実績の番号だけが表示されます。
- **Uplay R2**：Goldberg の経路に相当する Ubisoft 向けのもので、対応タイトル用です。専用のスイッチはありません。
  セーブは Steam エミュレーターのソースを通り、修復とローダーのツールは
  **設定 → エミュレーター → Ubisoft / Uplay R1/R2** にあります。[Uplay R2 のセットアップ](uplay-r2.md)を参照してください。

これらを使うゲームで実績が表示されない場合は、その **ゲームの状態** パネルが足りないものを示します。
[ゲームの状態](game-health.md)と [Goldberg / GBE のセットアップ](emulator-setup.md)を参照してください。

## コンソールエミュレーター {#console-emulators}

| エミュレーター | コンソール | トロフィー / 実績のファイル |
|---|---|---|
| **RPCS3** | PlayStation 3 | トロフィーリストの隣の `TROPUSR.DAT` |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`。リストと獲得状態の両方を保持 |
| **KytyPS5** | PlayStation 5 | エミュレーターの隣の `_Trophies\<title>\trophies_*.json`。リストはゲームの `sce_sys\trophy2` パッケージから取得 |
| **Xenia** | Xbox 360 | `.gpd`。こちらも両方を保持 |

どれもリアルタイムで監視されるため、解除はほかと同じように通知されます。RPCS3、ShadPS4、Xenia はデータを
既定のパスから移動でき、AW Next はエミュレーターが読むのと同じ設定を読み取ります。

- **RPCS3**：トロフィーフォルダーは `vfs.yml`(`$(EmulatorDir)` からの相対的な再割り当てを含む)、
  実行ファイルの隣の `portable` フォルダー、`RPCS3_CONFIG_DIR` に従います。
- **ShadPS4**：エミュレーター、その `user` フォルダー、`game_data` そのもの、または
  (0.19 以降)その `trophy` フォルダーか `home\<user>\trophy` のどれを指定しても認識されます。設定は
  shadPS4 が保存してきた 2 か所のどちらからでも読み取られます。
- **Xenia**：設定の `storage_root` と `content_root` に従います。
- **KytyPS5**：エミュレーター、その `_Trophies` フォルダー、または 1 つのゲームのフォルダーのどれを指定しても認識されます。
  ゲームは KytyPS5 ランチャーのゲームフォルダー(`Kyty.ini`)とエミュレーターの隣から、
  展開された状態か `.zar` アーカイブとして探されます。トロフィーリストはゲーム自体に入っているため、AW Next が
  認識したあとに削除されたゲームは、そのとき保存されたリストとアートのコピーから、未インストールとして一覧に残ります。
  ランチャーのゲームは最初のトロフィーより前に一覧に出ます。有効なユーザーだけが対象です：ランチャーでそのゲームに設定された
  ユーザー、なければエミュレーターのグローバルなユーザー。ユーザー設定がない場合は、すべてのユーザーの
  トロフィーが追加されます。

そのため、移動した RPCS3 の仮想ディスクや ShadPS4 のデータフォルダーは、近くにエミュレーターの実行ファイルがなくても、
**設定 → フォルダー** に直接追加できます。

## RetroAchievements {#retroachievements}

RetroAchievements に報告するエミュレーターでプレイしたゲームは、ファイルではなくアカウントから取得されます。
**RetroAchievements** ソースをオンにして、その下のアカウントカードに入力します：ユーザー名と、
retroachievements.org/settings の **Web API キー** です。キーはこのPCに保存される前に暗号化されます。

<div align="center">
<picture><source srcset="../assets/shot/retroachievements-panel-800.webp 800w, ../assets/shot/retroachievements-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/retroachievements-panel.png" width="720" height="529" alt="設定、ソース：アカウントカードの上にある RetroAchievements のスイッチ" loading="lazy" decoding="async"></picture><br>
<sub>RetroAchievements のスイッチと、その下の Epic と Steam のアカウントカード</sub>
</div>

**ライブラリをインポート** は、プレイしたすべてのゲームを、実績、解除日、ポイント、レア度とともに追加します。
2 回目のインポートでは進捗が変わったゲームだけを取得し、初めてプレイしたゲームは
自動的に追加されます。RetroAchievements に報告するエミュレーターの実行中は、新しい解除が数秒以内に通知されます
(RetroArch、DuckStation、PCSX2、PPSSPP、Dolphin、BizHawk、Project64、またはその他の
RA 統合ビルドで、名前または隣にある RetroAchievements の dll で認識されます)。それ以外の場合は数分以内です。

AW Next は retroachievements.org から解除を読み取るため、エミュレーターの RetroAchievements はオンのままにしてください。
そこでオフにすると、解除が送信されなくなります。AW Next の通知だけを表示するには、
エミュレーター自身のポップアップを隠します。RetroArch では **Settings → Achievements → Visibility → Unlock
Notifications** です。RetroBat は起動のたびに `retroarch.cfg` を書き換えるため、RetroBat を閉じて、この行を
`RetroBat\emulationstation\.emulationstation\es_settings.cfg` に追加します。

```xml
<string name="global.retroarch.cheevos_visibility_unlock" value="false" />
```

マスタリーのポップアップには、同じ方法で `cheevos_visibility_mastery` を使います。

## その他のソース {#other-sources}

| ソース | 内容 |
|---|---|
| **PC 向けに再コンパイルされた Xbox 360 ゲーム** | ReXGlue のポートなどは、実績リストを `achievements` フォルダー(`.toml`、`.tsv`)または `SaveData\Achievements.json` に、ゲームフォルダーか `Documents\<game>` の中に保持します。リストはゲーム自身の `default.xex` から、収録されているすべての言語で取得され、シークレットの実績はシークレットのままです。[dbox.tools](https://dbox.tools) が DLC の実績を、Exophase が実績ごとのプレイヤーの割合を追加します。`Documents` にあるリストは自動で見つかります。ゲームフォルダーにあるものは、**スマート検索** がゲームライブラリ内の既知のポートを実行ファイルから、最初の実績より前に見つけます。それ以外の場所にある場合は、そのフォルダーを **設定 → フォルダー** に追加してください。解除はリアルタイムで通知され、プレイ時間も記録され、実績のリセットも動作します。80 を超える既知のポート(Sonic Unleashed、Marathon Recompiled 経由の Sonic the Hedgehog、Blue Dragon re:Blue、Lost Odyssey、Perfect Dark Zero、Fable II、Gears of War 2、Forza Motorsport 4、GoldenEye 007、Skate 2、Marvel Ultimate Alliance、Eternal Sonata、Trials コレクションなど)は、最初の実績より前に実行ファイルから一覧に出ます。プロフィールごとに 1 つのリストを持つポートは 1 つのゲームとして扱われます。このソースは Xenia のスイッチに従います。 |
| **PC に移植された PS4 ゲーム** | Bloodborne、Uncharted コレクション(ゲームごとに 1 件)、God of War III Remastered、MediEvil など、`run.py` ランナー上に構築されたポート。それを使わないポート(Dragon's Crown Pro、inFAMOUS Second Son と First Light、The Last Guardian、Gravity Rush 2、Killzone Shadow Fall、Driveclub、Unicorn Overlord、Fist of the North Star: Lost Paradise、UFC 3、PROTOTYPE と PROTOTYPE 2 は各 1 件、PORTHEON の UFC ゲーム)、BilalReloaded のランタイム上のポート(彼の Nathan Drake Collection のポート、Odin Sphere Leifthrasir、13 Sentinels: Aegis Rim、ReCasted(Ratchet & Clank。`trophies\trophies.log` は専用のフォルダーにあり、プラチナは他の 46 個のトロフィーがそろうと付与されます)など)、独自のリストを書き込むポート(Crash Team Racing Nitro-Fueled など)も含みます。**スマート検索** は、ゲームライブラリ内のポートをそのポート自身のファイル(`run.py`、`trophy.key`、ReCasted の `rcps4-probe.exe`)から、また Quiver Launcher がインストールしたゲームの中から見つけます。それ以外の場所にある場合は、ポートのフォルダーを **設定 → フォルダー** に追加してください。トロフィーのリスト、グレード、アイコンは、ポートのランチャーが指す元のゲームのダンプ(`sce_sys\trophy`。`npbind.dat` が暗号化されていても可)か、ポート自身の `user\trophies\<title id>\trophies.tsv` から取得されます。解除は、ポートが書き込む `trophies.log`、`last_run.log`、`analysis\<name>-user\trophy\trophyNN.txt`、`progress_user<N>.txt`、`<title id>-user<N>.bin`、`trophies.dat`、`unlocked.txt` のいずれかから、すべてのプロフィールを統合して取得され、リアルタイムで通知されます。レア度は Exophase の PS4 リストから取得されます。スイッチは **PS4 Recomp** です。 |
| **Games for Windows LIVE** | XLiveLessNess のインストール。各プロフィールの解除記録が読み取られ、リスト、そのテキスト、アイコンはゲーム自身の実行ファイルから取得されるため、何もダウンロードされません。DLC の実績は、XLiveLessNess の `dlc\<title id>` フォルダーにある各コンテンツパックの `spa.bin` から取得されます。リアルタイムで監視されます。 |
| **Dead Space 2 MarkerPatch、Alice: Madness Returns MadnessPatch** | MOD を導入した Steam 版は自動で見つかります。それ以外の版は、ゲームフォルダーを **設定 → フォルダー** に追加するか(`Binaries\Win32` のような中のフォルダーもゲームフォルダーとして扱われます)、**スマート検索** にライブラリを探させてください。リストは MOD 自身のテキストと画像から作られ、MOD が保存する解除はリアルタイムで通知されます。それぞれ専用のスイッチがあり、MOD の `AchievementSupport` がオフの間は何も読み取られません。 |
| **PC ポート** | *The Legend of Zelda: Link's Awakening DX HD* (LADXHD Updated)。ゲームフォルダーを **設定 → フォルダー** に追加してください。110 個の実績、ゲームの各言語のテキスト、画像はインストールから取得されます。解除は `%LOCALAPPDATA%\Zelda_LA\achievements`(ゲームに `portable.txt` がある場合はゲームの隣)から読み取られます。このファイルに日付はないため、解除は確認された時点の日付になります。 |
| **再コンパイルされた PC ポート** | *Twilight Princess* (Dusklight)、*Super Mario 64* (Ghostship)、*Diddy Kong Racing* (DKR-R)、*Super Mario Bros. Remastered*、Super Mario Eclipse MOD を使った *Super Mario Sunshine* (SMS Launcher)、*Super Mario All-Stars* (Darhkfox の PC ポート)、*Road Rash 64 Recompiled*、*F-Zero X* (G-Diffuser)、そして *Pikmin* と *Pikmin 2* (Open Nectar)。これらのポートは実績リストをゲームに組み込んでいるため、AW Next はポートのソースから取った英語の各リストを同梱しています。実績の画像は SMS Launcher 自身のフォルダーから取得されるか、Ghostship、Super Mario Bros. Remastered、Road Rash 64 のリポジトリから一度だけ取得されます。それ以外のポートは画像をコードで描画するため、実績にはゲームのアイコンが表示されます。ポートは、`%APPDATA%` または `%LOCALAPPDATA%` 内の解除ファイル(`TwilitRealm\Dusklight`、`DKRPort`、`SMB1R`、`sms-launcher`、`RoadRash64Recompiled`)、Quiver Launcher(バージョン 3 または 4)がインストールしたゲーム、ゲームライブラリ内で **スマート検索** が実行ファイルから見つけたもの、または **設定 → フォルダー** のそのフォルダーから見つかります。Ghostship、Super Mario All-Stars、G-Diffuser、Open Nectar はセーブをゲームの隣に保持するため、後ろの 3 つのどれかが必要です。Open Nectar のフォルダーを追加すると、その `pikmin2` フォルダーにある Pikmin 2 も見つかります。ポータブルなインストール(`portable.txt`、または Dusklight の `data_location.json`)は、書き込み先から読み取られます。DKR-R、SMS Launcher、Super Mario All-Stars、G-Diffuser は各解除の日付を保持します。ほかは確認された時点の日付になります。Linux ではネイティブ版が `~/.local/share` と `~/.config` から、Windows 版が Wine または Proton のプレフィックスから読み取られます。これらは PC ポートのスイッチを共有します。 |
| **FINAL FANTASY VII (2013)** | この再リリース版は Steamworks の実績より前のもので、36 個の解除をセーブの隣の 8 バイトのビットフィールドに保持しており、フォルダーを追加しなくても Documents で見つかります。 |
| **確認した実績を記憶** | セーブがなくなったあとも、バックグラウンドのトラッカーが確認した解除とともに、ゲームを一覧に残します。 |
| **手動で追加したゲーム** | タイトルと実行ファイルから追加したゲームで、プラットフォームと Steam AppID は任意です。[詳細ツール](advanced.md#add-a-game-manually)を参照してください。 |

## API キーなしの Steam メタデータ {#steam-metadata-without-an-api-key}

AW Next はこの用途で、Steam Web API キーも接続した Steam アカウントも使いません。各ゲームのリストは
キー不要の経路で取得されます：まず公式の `GetGameAchievements` エンドポイント(非表示の説明、アイコン、全体の
レア度、Steam の実績セット)、次に SteamCommunity の実績ページ(同じスキーマで、
使用言語)、その次に SteamHunters、最後の手段としてブラウザーのスクレイピングです。

Steam と同様に、開発者がアーカイブした実績は、獲得した場合にだけ数に入ります。そうでなければ、
リスト、パーセンテージ、プラチナの通知から除外されます。

結果は言語ごとに `%APPDATA%\Achievement Watcher Next\steam_cache\schema` にキャッシュされるため、ローカルの
ソースと以前に見たゲームはオフラインで動作します。

Steam はアップデートで実績が追加されたことを通知しないため、キャッシュされたリストは 3
日ごとに自分で再確認し、何も削除せずに新しい実績を取り込みます。すぐに確認するには、**設定 → 詳細 →
実績リストを再確認** を使います。同じ場所にある **実績データの自動更新** は、`steam_cache` を手動で管理している人向けに
定期的な再確認をオフにします。ボタンは引き続き使えます。

DLC やアップデートの実績は、同じ検索から取得したグループ名(たとえば *Hearts of Stone*)が
タイトルの下に表示されます。

## 表示されないソース {#sources-you-do-not-see}

**シンプル** モードでは、ソースの一覧から用途の限られた 6 行が折りたたまれます：GreenLuma、LumaPlay、2 つの
Nemirtingas エミュレーター(GOG と Epic のセーブリーダー)、Goldberg SocialClub、通知キャッシュの
インポートです。行が折りたたまれるのは、有効で、かつライブラリのどのゲームもそこから来ていない間だけです。オフにするか、
それが検出したゲームを所有すると行が戻るので、インターフェースのモードが、見つからないゲームを
説明するコントロールを隠すことはありません。**詳細** では常にすべてのソースが表示されます。

---

**次へ：** [通知](notifications.md)：解除の知らせ方を選びます。

*ソースごとのセットアップ：[Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[ゲームの状態](game-health.md)*

<div align="center">

[← ドキュメント](README.md) · [プロジェクトのホーム](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
