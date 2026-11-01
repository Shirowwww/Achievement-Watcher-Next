using System;
using System.IO;

namespace AwNext.Playnite
{
    /// <summary>
    /// What Playnite knows about a game that can tell AW Next which one it is, already expanded
    /// (no {InstallDir} left). Kept free of Playnite's own types so it can be tested alone.
    /// </summary>
    public class GameFacts
    {
        public string Name { get; set; }
        public string InstallDirectory { get; set; }

        /// <summary>The Steam AppID, for a game Playnite's Steam library imported.</summary>
        public string SteamAppId { get; set; }

        /// <summary>The play action's file and arguments, when it starts a file.</summary>
        public string PlayPath { get; set; }
        public string PlayArguments { get; set; }

        /// <summary>The ROM of an emulated game, which AW Next knows as the game's folder or ROM.</summary>
        public string RomPath { get; set; }
    }

    public static class GameQuestion
    {
        /// <summary>
        /// The bridge request for one game. AW Next matches an emulator shortcut by the ROM or game
        /// folder named in its launch options, so an emulated game sends its ROM there.
        /// </summary>
        public static BridgeQuestion For(GameFacts facts)
        {
            if (facts == null)
            {
                return null;
            }

            var question = new BridgeQuestion
            {
                Exe = ExecutablePath(facts.PlayPath, facts.InstallDirectory),
                LaunchOptions = Clean(string.IsNullOrWhiteSpace(facts.RomPath) ? facts.PlayArguments : facts.RomPath),
                SteamAppId = IsSteamAppId(facts.SteamAppId) ? facts.SteamAppId.Trim() : string.Empty,
                Name = Clean(facts.Name),
            };

            var empty = question.Exe.Length == 0 && question.LaunchOptions.Length == 0 && question.SteamAppId.Length == 0 && question.Name.Length == 0;
            return empty ? null : question;
        }

        // A relative play path is relative to the install folder; only an .exe names a game binary.
        internal static string ExecutablePath(string playPath, string installDirectory)
        {
            var path = Clean(playPath).Trim('"');
            if (path.Length == 0 || !path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                return string.Empty;
            }

            try
            {
                if (!Path.IsPathRooted(path))
                {
                    var root = Clean(installDirectory).Trim('"');
                    if (root.Length == 0)
                    {
                        return string.Empty;
                    }

                    path = Path.Combine(root, path);
                }

                return Path.GetFullPath(path);
            }
            catch (Exception)
            {
                // A path with characters Windows refuses names no file AW Next could know.
                return string.Empty;
            }
        }

        internal static bool IsSteamAppId(string value)
        {
            var raw = Clean(value);
            if (raw.Length == 0 || raw.Length > 10 || raw[0] == '0')
            {
                return false;
            }

            foreach (var c in raw)
            {
                if (c < '0' || c > '9')
                {
                    return false;
                }
            }

            return true;
        }

        private static string Clean(string value) => (value ?? string.Empty).Trim();
    }
}
