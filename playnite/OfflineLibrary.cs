using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace AwNext.Playnite
{
    /// <summary>
    /// The answer AW Next would give, read from its files while it is not running: the library its
    /// last scan saved, its game index and its executables. Read only, never locked (AW Next replaces
    /// each file whole, by a rename), and marked with the time of that scan so the panel can say so.
    /// The matching mirrors watchdog/steamBridge.js; test/fixtures/bridgeMatch.json keeps both in step.
    /// </summary>
    public sealed class OfflineLibrary
    {
        private const int MaxJsonLength = 64 * 1024 * 1024;
        private readonly string userData;
        private readonly object gate = new object();
        private Snapshot cached;

        public OfflineLibrary(string userData)
        {
            this.userData = userData ?? string.Empty;
        }

        /// <summary>
        /// AW Next's default data folder. shortcut: a portable copy or --user-data-dir keeps its data
        /// elsewhere and is not found; add a setting if someone runs it that way.
        /// </summary>
        public static string DefaultFolder() =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Achievement Watcher Next");

        internal string LibraryFile => Path.Combine(userData, "cache", "library_snapshot", "library.json");
        internal string IndexFile => Path.Combine(userData, "cfg", "gameIndex.json");
        internal string ExeListFile => Path.Combine(userData, "cfg", "exeList.db");

        /// <summary>The game's achievements as of AW Next's last scan, or null when there is no saved library.</summary>
        public BridgeReply Ask(BridgeQuestion question)
        {
            var wanted = Wanted.From(question);
            if (wanted == null)
            {
                return null;
            }

            var snapshot = Load();
            if (snapshot == null)
            {
                return null;
            }

            var entry = Matcher.Find(snapshot.Entries, wanted);
            return new BridgeReply
            {
                Found = entry != null,
                Game = entry == null ? null : PublicGame(entry.Game, entry.Id),
                LastScan = snapshot.SavedAt,
            };
        }

        // Parsed again only when one of the three files changed: a panel asks on every selection.
        private Snapshot Load()
        {
            var stamp = string.Join("|", new[] { LibraryFile, IndexFile, ExeListFile }.Select(Stamp));
            lock (gate)
            {
                if (cached != null && cached.Stamp == stamp)
                {
                    return cached;
                }
            }

            var library = ReadJson(LibraryFile) as IDictionary<string, object>;
            var games = library == null ? null : Get(library, "games") as IEnumerable;
            if (games == null)
            {
                return null;
            }

            var savedAt = Number(library, "savedAt");
            var snapshot = new Snapshot
            {
                Stamp = stamp,
                SavedAt = savedAt > 0 ? (DateTimeOffset?)DateTimeOffset.FromUnixTimeMilliseconds((long)savedAt) : null,
                Entries = Matcher.Describe(games.OfType<IDictionary<string, object>>(), Rows(ReadJson(IndexFile), "appid"), Rows(ReadJson(ExeListFile), "exe")),
            };
            lock (gate)
            {
                cached = snapshot;
            }

            return snapshot;
        }

        private static string Stamp(string file)
        {
            try
            {
                var info = new FileInfo(file);
                return info.Exists ? info.Length + ":" + info.LastWriteTimeUtc.Ticks : "-";
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException)
            {
                return "-";
            }
        }

        // Shared read: AW Next may be replacing the file at the same moment, which it does by a rename.
        private static object ReadJson(string file)
        {
            try
            {
                using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                using (var reader = new StreamReader(stream, Encoding.UTF8))
                {
                    return new JavaScriptSerializer { MaxJsonLength = MaxJsonLength }.DeserializeObject(reader.ReadToEnd());
                }
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException || e is ArgumentException || e is InvalidOperationException)
            {
                return null;
            }
        }

        private static Dictionary<string, IDictionary<string, object>> Rows(object list, string field)
        {
            var map = new Dictionary<string, IDictionary<string, object>>();
            foreach (var row in (list as IEnumerable)?.OfType<IDictionary<string, object>>() ?? Enumerable.Empty<IDictionary<string, object>>())
            {
                var id = Text(row, "appid");
                if (id.Length > 0 && Text(row, field).Length > 0)
                {
                    map[id] = row;
                }
            }

            return map;
        }

        internal static BridgeGame PublicGame(IDictionary<string, object> game, string id)
        {
            var achievement = Get(game, "achievement") as IDictionary<string, object>;
            var list = (Get(achievement ?? new Dictionary<string, object>(), "list") as IEnumerable)?.OfType<IDictionary<string, object>>() ?? Enumerable.Empty<IDictionary<string, object>>();
            var achievements = list.Where(item => Get(item, "name") != null).Select(PublicAchievement).ToList();
            var name = Text(game, "displayName");
            return new BridgeGame
            {
                Id = id,
                Name = name.Length > 0 ? name : (Text(game, "name").Length > 0 ? Text(game, "name") : id),
                Total = achievements.Count,
                Unlocked = achievements.Count(a => a.Unlocked),
                Achievements = achievements,
            };
        }

        private static BridgeAchievement PublicAchievement(IDictionary<string, object> item)
        {
            var achieved = Get(item, "Achieved");
            var unlocked = (achieved is bool flag && flag) || (Number(item, "Achieved") == 1) || (achieved is string s && s == "true");
            var hidden = Get(item, "hidden");
            var rarity = Number(item, "rarityPercent") ?? Number(item, "rarityPct");
            var name = Get(item, "displayName") as string;
            var icon = Icon(Get(item, "icon"));
            var locked = Icon(Get(item, "icongray"));
            var max = Number(item, "MaxProgress") ?? 0;
            var current = Number(item, "CurProgress") ?? 0;
            return new BridgeAchievement
            {
                Id = Text(item, "name"),
                Name = string.IsNullOrEmpty(name) ? Text(item, "name") : name,
                Description = Get(item, "description") as string ?? string.Empty,
                Icon = icon,
                IconLocked = locked.Length > 0 ? locked : icon,
                Hidden = (hidden is bool h && h) || Number(item, "hidden") == 1,
                Unlocked = unlocked,
                UnlockedAt = unlocked ? Seconds(Number(item, "UnlockTime")) : 0,
                Rarity = rarity.HasValue && rarity.Value >= 0 && rarity.Value <= 100 ? rarity : null,
                Progress = !unlocked && max > 1 && current > 0 && current < max ? new BridgeProgress { Current = current, Max = max } : null,
            };
        }

        private static readonly Regex LegacyIconHost = new Regex(@"^https?://steamcdn-a\.akamaihd\.net/steamcommunity/public/images/apps/", RegexOptions.IgnoreCase);

        // A web address as AW Next spells it; a picture on this PC as a file:// address read from disk.
        private static string Icon(object value)
        {
            var raw = (value as string ?? string.Empty).Trim();
            if (raw.Length == 0 || raw.Length > 2048)
            {
                return string.Empty;
            }

            if (Regex.IsMatch(raw, "^https?://", RegexOptions.IgnoreCase))
            {
                return LegacyIconHost.Replace(raw, "https://shared.fastly.steamstatic.com/community_assets/images/apps/");
            }

            if (Uri.TryCreate(raw, UriKind.Absolute, out var uri) && uri.IsFile)
            {
                return uri.AbsoluteUri;
            }

            return Path.IsPathRooted(raw) ? new Uri(Path.GetFullPath(raw)).AbsoluteUri : string.Empty;
        }

        private static long Seconds(double? value)
        {
            var n = value ?? 0;
            return n <= 0 ? 0 : (long)Math.Floor(n > 1e12 ? n / 1000 : n);
        }

        internal static object Get(IDictionary<string, object> map, string key) => map != null && map.TryGetValue(key, out var value) ? value : null;

        internal static string Text(IDictionary<string, object> map, string key)
        {
            var value = Get(map, key);
            return value is string || value is int || value is long || value is decimal || value is double ? Convert.ToString(value, CultureInfo.InvariantCulture) : string.Empty;
        }

        // A number written as text counts too, as Number() reads it in the bridge.
        private static double? Number(IDictionary<string, object> map, string key)
        {
            var value = Get(map, key);
            if (value is string text)
            {
                return double.TryParse(text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? (double?)parsed : null;
            }

            return value is int || value is long || value is decimal || value is double ? (double?)Convert.ToDouble(value, CultureInfo.InvariantCulture) : null;
        }

        private sealed class Snapshot
        {
            public string Stamp;
            public DateTimeOffset? SavedAt;
            public List<Matcher.Entry> Entries;
        }
    }

    /// <summary>A bridge question made comparable, as cleanRequest in watchdog/steamBridge.js.</summary>
    internal sealed class Wanted
    {
        public string Exe;
        public string Args;
        public string SteamAppId;
        public string Title;

        public static Wanted From(BridgeQuestion question)
        {
            if (question == null)
            {
                return null;
            }

            var wanted = new Wanted
            {
                Exe = Matcher.NormalizePath(Matcher.Clip(question.Exe, 1024)),
                Args = Matcher.NormalizePath(Matcher.Clip(question.LaunchOptions, 4096)),
                SteamAppId = Regex.IsMatch(Matcher.Clip(question.SteamAppId, 10), "^[1-9][0-9]{0,9}$") ? Matcher.Clip(question.SteamAppId, 10) : string.Empty,
                Title = Matcher.NormalizeTitle(Matcher.Clip(question.Name, 256)),
            };
            return wanted.Exe.Length > 0 || wanted.Args.Length > 0 || wanted.SteamAppId.Length > 0 || wanted.Title.Length > 0 ? wanted : null;
        }
    }

    /// <summary>findGame and describeGames from watchdog/steamBridge.js, rule for rule.</summary>
    internal static class Matcher
    {
        internal sealed class Entry
        {
            public IDictionary<string, object> Game;
            public string Id;
            public List<string> Exes;
            public HashSet<string> Binaries;
            public string GameDir;
            public List<string> Folders;
            public string Title;
        }

        internal static string Clip(string value, int max)
        {
            var trimmed = (value ?? string.Empty).Trim().Trim('"', '\'').Trim();
            return trimmed.Length > 0 && trimmed.Length <= max ? trimmed : string.Empty;
        }

        // Windows file names ignore case, so the extension (Windows only) always folds it.
        internal static string NormalizePath(string value) =>
            Regex.Replace(Regex.Replace((value ?? string.Empty).Trim(), @"[\\/]+", "/"), "/+$", string.Empty).ToLowerInvariant();

        internal static string NormalizeTitle(string value)
        {
            var text = (value ?? string.Empty).Normalize(NormalizationForm.FormKD).ToLowerInvariant();
            var kept = new StringBuilder(text.Length);
            foreach (var c in text)
            {
                var category = char.GetUnicodeCategory(c);
                if (char.IsLetter(c) || category == UnicodeCategory.DecimalDigitNumber || category == UnicodeCategory.LetterNumber || category == UnicodeCategory.OtherNumber)
                {
                    kept.Append(c);
                }
            }

            return kept.ToString();
        }

        private static string ParentDir(string normalized)
        {
            var cut = normalized.LastIndexOf('/');
            return cut < 0 ? string.Empty : normalized.Substring(0, cut);
        }

        private static string BaseName(string normalized) => normalized.Substring(normalized.LastIndexOf('/') + 1);

        internal static List<Entry> Describe(IEnumerable<IDictionary<string, object>> games, Dictionary<string, IDictionary<string, object>> index, Dictionary<string, IDictionary<string, object>> exeList)
        {
            var entries = new List<Entry>();
            foreach (var game in games)
            {
                var id = OfflineLibrary.Text(game, "appid");
                var achievement = OfflineLibrary.Get(game, "achievement") as IDictionary<string, object>;
                if (id.Length == 0 || !(OfflineLibrary.Get(achievement, "list") is IEnumerable))
                {
                    continue;
                }

                index.TryGetValue(id, out var row);
                exeList.TryGetValue(id, out var exeRow);
                var confident = OfflineLibrary.Get(game, "exeConfident") is bool sure && sure;
                var exes = new[] { confident ? OfflineLibrary.Text(game, "exe") : string.Empty, OfflineLibrary.Text(exeRow, "exe"), OfflineLibrary.Text(row, "exePath") }
                    .Select(NormalizePath)
                    .Where(p => p.Length > 0)
                    .ToList();
                var binaries = new HashSet<string>(exes.Select(BaseName));
                var binary = OfflineLibrary.Text(row, "binary");
                if (binary.Length > 0)
                {
                    binaries.Add(NormalizePath(binary));
                }

                var gameDir = NormalizePath(OfflineLibrary.Text(game, "gameDir"));
                var displayName = OfflineLibrary.Text(game, "displayName");
                entries.Add(new Entry
                {
                    Game = game,
                    Id = id,
                    Exes = exes,
                    Binaries = binaries,
                    GameDir = gameDir,
                    Folders = new[] { gameDir, NormalizePath(OfflineLibrary.Text(game, "romPath")) }.Where(f => f.Length > 0).ToList(),
                    Title = NormalizeTitle(displayName.Length > 0 ? displayName : OfflineLibrary.Text(game, "name")),
                });
            }

            return entries;
        }

        private static bool Mentions(string haystack, string needle)
        {
            var at = haystack.IndexOf(needle, StringComparison.Ordinal);
            while (at >= 0)
            {
                var end = at + needle.Length;
                if (end >= haystack.Length)
                {
                    return true;
                }

                var next = haystack[end];
                if (next == '/' || next == '"' || next == '\'' || char.IsWhiteSpace(next))
                {
                    return true;
                }

                at = haystack.IndexOf(needle, at + 1, StringComparison.Ordinal);
            }

            return false;
        }

        private static bool Inside(string file, string folder) => folder.Length > 0 && file.StartsWith(folder + "/", StringComparison.Ordinal);

        private static bool SameInstall(Entry entry, string exe)
        {
            var dir = ParentDir(exe);
            if (entry.GameDir.Length > 0 && dir == entry.GameDir)
            {
                return true;
            }

            var name = BaseName(exe);
            var stem = Regex.Replace(name, @"\.exe$", string.Empty);
            var ownFolder = NormalizeTitle(BaseName(dir)) == entry.Title || NormalizeTitle(stem) == entry.Title;
            return entry.Exes.Any(known => Inside(known, dir) && (BaseName(known).StartsWith(stem + "-", StringComparison.Ordinal) || (ownFolder && BaseName(known) == name)));
        }

        private static bool SameExeName(Entry entry, string exe)
        {
            if (!entry.Binaries.Contains(BaseName(exe)))
            {
                return false;
            }

            var dir = ParentDir(exe);
            return entry.Exes.Count == 0 || entry.Exes.Any(known => ParentDir(known) == dir);
        }

        // Strongest evidence first; a rule that names several games ends the search with nothing.
        internal static Entry Find(List<Entry> entries, Wanted wanted)
        {
            var rules = new List<Func<Entry, bool>>();
            if (wanted.Exe.Length > 0)
            {
                rules.Add(e => e.Exes.Contains(wanted.Exe));
            }

            if (wanted.Args.Length > 0)
            {
                rules.Add(e => e.Folders.Any(folder => Mentions(wanted.Args, folder)));
            }

            if (wanted.SteamAppId.Length > 0)
            {
                rules.Add(e => e.Id == wanted.SteamAppId || OfflineLibrary.Text(e.Game, "steamappid") == wanted.SteamAppId);
            }

            if (wanted.Exe.Length > 0)
            {
                rules.Add(e => SameInstall(e, wanted.Exe));
                rules.Add(e => SameExeName(e, wanted.Exe));
            }

            if (wanted.Title.Length > 0)
            {
                rules.Add(e => e.Title == wanted.Title);
            }

            foreach (var rule in rules)
            {
                var matches = entries.Where(rule).ToList();
                var ids = new HashSet<string>(matches.Select(e => e.Id));
                if (ids.Count == 1)
                {
                    return matches[0];
                }

                if (ids.Count > 1)
                {
                    return null;
                }
            }

            return null;
        }
    }
}
