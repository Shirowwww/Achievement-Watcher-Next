using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using AwNext.Playnite;
using Xunit;

namespace AwNext.Playnite.Tests
{
    /// <summary>
    /// AW Next's files read while it is not running. The cases are shared with the Watchdog's bridge
    /// (test/fixtures/bridgeMatch.json), so the extension answers exactly as AW Next would.
    /// </summary>
    public class OfflineLibraryTests : IDisposable
    {
        private readonly string folder = Path.Combine(Path.GetTempPath(), "aw-offline-" + Guid.NewGuid().ToString("N"));
        private readonly IDictionary<string, object> fixture;

        public OfflineLibraryTests()
        {
            fixture = (IDictionary<string, object>)new JavaScriptSerializer().DeserializeObject(File.ReadAllText(FixturePath()));
            var json = new JavaScriptSerializer();
            Directory.CreateDirectory(Path.Combine(folder, "cache", "library_snapshot"));
            Directory.CreateDirectory(Path.Combine(folder, "cfg"));
            File.WriteAllText(Path.Combine(folder, "cache", "library_snapshot", "library.json"), json.Serialize(new Dictionary<string, object> { ["format"] = 2, ["savedAt"] = fixture["savedAt"], ["games"] = fixture["games"] }));
            File.WriteAllText(Path.Combine(folder, "cfg", "gameIndex.json"), json.Serialize(fixture["index"]));
            File.WriteAllText(Path.Combine(folder, "cfg", "exeList.db"), json.Serialize(fixture["exeList"]));
        }

        public void Dispose()
        {
            try
            {
                Directory.Delete(folder, true);
            }
            catch (IOException)
            {
            }
        }

        private static string FixturePath()
        {
            for (var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory); dir != null; dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, "test", "fixtures", "bridgeMatch.json");
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            throw new FileNotFoundException("test/fixtures/bridgeMatch.json");
        }

        private static string Field(IDictionary<string, object> map, string key) => map.TryGetValue(key, out var value) ? value as string ?? string.Empty : string.Empty;

        [Fact]
        public void EverySharedCase_FindsTheGameTheWatchdogBridgeFinds()
        {
            var library = new OfflineLibrary(folder);
            foreach (var item in ((IEnumerable)fixture["cases"]).OfType<IDictionary<string, object>>())
            {
                var asked = (IDictionary<string, object>)item["question"];
                var reply = library.Ask(new BridgeQuestion { Exe = Field(asked, "exe"), LaunchOptions = Field(asked, "launchOptions"), SteamAppId = Field(asked, "steamAppId"), Name = Field(asked, "name") });
                var why = (string)item["why"];
                Assert.True(reply != null, why);
                Assert.True(reply.LastScan.HasValue, why);
                Assert.Equal(item["expect"] as string, reply.Found ? reply.Game.Id : null);
                if (item.TryGetValue("total", out var total))
                {
                    Assert.Equal(Convert.ToInt32(total), reply.Game.Total);
                    Assert.Equal(Convert.ToInt32(item["unlocked"]), reply.Game.Unlocked);
                }
            }
        }

        [Fact]
        public void Answer_CarriesUnlocks_Progress_Rarity_AndTheDateOfTheScan()
        {
            var reply = new OfflineLibrary(folder).Ask(new BridgeQuestion { Exe = @"C:\Jeux\Big Walk\Bin\BigWalk.exe" });

            Assert.Equal(DateTimeOffset.FromUnixTimeMilliseconds(1763300000000), reply.LastScan);
            var first = reply.Game.Achievements.Single(a => a.Id == "A1");
            Assert.True(first.Unlocked);
            Assert.Equal(1700000000, first.UnlockedAt);
            Assert.Equal(42.5, first.Rarity);
            Assert.StartsWith("https://shared.fastly.steamstatic.com/community_assets/images/apps/", first.Icon);
            var second = reply.Game.Achievements.Single(a => a.Id == "A2");
            Assert.False(second.Unlocked);
            Assert.True(second.Hidden);
            Assert.Equal(3, second.Progress.Current);
            Assert.Equal(10, second.Progress.Max);
        }

        [Fact]
        public void NoSavedLibrary_GivesNoAnswer_SoThePanelSaysAwNextIsNotRunning()
        {
            Assert.Null(new OfflineLibrary(Path.Combine(folder, "missing")).Ask(new BridgeQuestion { Name = "Big Walk" }));
        }

        [Fact]
        public void UnreadableLibrary_GivesNoAnswer_InsteadOfThrowing()
        {
            File.WriteAllText(Path.Combine(folder, "cache", "library_snapshot", "library.json"), "{ half a file");
            Assert.Null(new OfflineLibrary(folder).Ask(new BridgeQuestion { Name = "Big Walk" }));
        }

        [Fact]
        public void ALibraryReplacedByAwNext_IsReadAgain()
        {
            var library = new OfflineLibrary(folder);
            Assert.True(library.Ask(new BridgeQuestion { Name = "Steamy" }).Found);

            var file = Path.Combine(folder, "cache", "library_snapshot", "library.json");
            File.WriteAllText(file, "{\"format\":2,\"savedAt\":1,\"games\":[]}");
            File.SetLastWriteTimeUtc(file, DateTime.UtcNow.AddMinutes(1));
            Assert.False(library.Ask(new BridgeQuestion { Name = "Steamy" }).Found);
        }

        [Fact]
        public void ReadWhileAwNextHoldsTheFileOpen_StillAnswers()
        {
            var file = Path.Combine(folder, "cache", "library_snapshot", "library.json");
            using (new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite | FileShare.Delete))
            {
                Assert.True(new OfflineLibrary(folder).Ask(new BridgeQuestion { Name = "Steamy" }).Found);
            }
        }

        [Fact]
        public void LocalIconPath_BecomesAFileAddress()
        {
            var game = new Dictionary<string, object>
            {
                ["achievement"] = new Dictionary<string, object> { ["list"] = new object[] { new Dictionary<string, object> { ["name"] = "L", ["icon"] = @"C:\AW\icons\l.png" } } },
            };

            Assert.Equal("file:///C:/AW/icons/l.png", OfflineLibrary.PublicGame(game, "1").Achievements[0].Icon);
        }

        [Fact]
        public void NumbersWrittenAsText_AreReadAsTheBridgeReadsThem()
        {
            var game = new Dictionary<string, object>
            {
                ["achievement"] = new Dictionary<string, object> { ["list"] = new object[] { new Dictionary<string, object> { ["name"] = "S", ["Achieved"] = "true", ["UnlockTime"] = "1700000000", ["hidden"] = "1" } } },
            };

            var item = OfflineLibrary.PublicGame(game, "1").Achievements[0];
            Assert.True(item.Unlocked);
            Assert.Equal(1700000000, item.UnlockedAt);
            Assert.True(item.Hidden);
        }

        [Fact]
        public void ScanNote_NamesTheDate()
        {
            var note = AchievementsViewModel.ScanNote(DateTimeOffset.FromUnixTimeMilliseconds(1763300000000), CultureInfo.InvariantCulture);
            Assert.False(string.IsNullOrEmpty(note));
        }
    }
}
