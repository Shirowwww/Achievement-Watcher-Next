using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using AwNext.Playnite;
using Xunit;

namespace AwNext.Playnite.Tests
{
    public class GameQuestionTests
    {
        [Fact]
        public void PlayActionExe_IsSentAsFullPath_WhenRelativeToInstallFolder()
        {
            var question = GameQuestion.For(new GameFacts { Name = "Big Walk", InstallDirectory = @"C:\Jeux\Big Walk", PlayPath = @"Bin\BigWalk.exe" });

            Assert.Equal(@"C:\Jeux\Big Walk\Bin\BigWalk.exe", question.Exe);
            Assert.Equal("Big Walk", question.Name);
        }

        [Fact]
        public void EmulatedGame_SendsItsRomAsLaunchOptions_SoAwNextMatchesTheRomFolder()
        {
            var question = GameQuestion.For(new GameFacts { Name = "Demon's Souls", RomPath = @"D:\ROMs\PS3\BLUS30443", PlayArguments = "--fullscreen" });

            Assert.Equal(@"D:\ROMs\PS3\BLUS30443", question.LaunchOptions);
            Assert.Equal(string.Empty, question.Exe);
        }

        [Fact]
        public void NonExecutablePlayPath_IsNotSentAsExe()
        {
            var question = GameQuestion.For(new GameFacts { Name = "Some URL game", PlayPath = "steam://rungameid/400" });

            Assert.Equal(string.Empty, question.Exe);
        }

        [Fact]
        public void RelativeExe_WithoutInstallFolder_IsDropped()
        {
            Assert.Equal(string.Empty, GameQuestion.ExecutablePath("game.exe", null));
        }

        [Theory]
        [InlineData("400", true)]
        [InlineData("3751950", true)]
        [InlineData("0400", false)]
        [InlineData("abc", false)]
        [InlineData("12345678901", false)]
        [InlineData("", false)]
        public void SteamAppId_IsOnlyAPlainNumber(string value, bool expected)
        {
            Assert.Equal(expected, GameQuestion.IsSteamAppId(value));
        }

        [Fact]
        public void GameWithNothingToMatch_AsksNothing()
        {
            Assert.Null(GameQuestion.For(new GameFacts()));
        }
    }

    public class FeedTests
    {
        [Fact]
        public void BridgeReply_IsReadWithItsGame()
        {
            var raw = "{\"cmd\":\"bridge-game\",\"id\":3,\"bridge\":1,\"found\":true,\"game\":{\"id\":\"610180\",\"name\":\"Jackbox 4\",\"total\":2,\"unlocked\":1,"
                + "\"achievements\":[{\"id\":\"A\",\"name\":\"First\",\"description\":\"d\",\"icon\":\"http://127.0.0.1:8082/bridge/icon/ab\",\"hidden\":false,\"unlocked\":true,\"unlockedAt\":1790000000,\"rarity\":12.5},"
                + "{\"id\":\"B\",\"name\":\"Second\",\"hidden\":true,\"unlocked\":false,\"unlockedAt\":0,\"progress\":{\"current\":6,\"max\":50}}]}}";

            var message = BridgeProtocol.Read(raw);

            Assert.NotNull(message.Reply);
            Assert.Equal(3, message.Reply.Id);
            Assert.True(message.Reply.Found);
            Assert.Equal("610180", message.Reply.Game.Id);
            Assert.Equal(12.5, message.Reply.Game.Achievements[0].Rarity);
            Assert.Equal(50, message.Reply.Game.Achievements[1].Progress.Max);
        }

        [Fact]
        public void UnlockAnnouncement_NamesTheGame_WhateverTheIdType()
        {
            Assert.Equal("610180", BridgeProtocol.Read("{\"appID\":610180,\"achievement\":\"A\",\"notificationType\":\"achievement\"}").UnlockedGameId);
            Assert.Equal("x360-4D5309C9", BridgeProtocol.Read("{\"appID\":\"x360-4D5309C9\",\"achievement\":\"A\",\"progress\":{\"current\":1,\"max\":5}}").UnlockedGameId);
        }

        [Theory]
        [InlineData("{\"appID\":1,\"achievement\":\"A\",\"test\":true}")]
        [InlineData("{\"appID\":1,\"achievement\":\"A\",\"notificationType\":\"playtime\"}")]
        [InlineData("{\"achievement\":\"A\"}")]
        [InlineData("not json")]
        [InlineData("")]
        public void TestsPlaytimeAndNoise_AreIgnored(string raw)
        {
            Assert.Null(BridgeProtocol.Read(raw));
        }
    }

    public class OrderTests
    {
        [Fact]
        public void UnlockedComeFirst_MostRecentOnTop_ThenLockedInOrder()
        {
            var list = new List<BridgeAchievement>
            {
                new BridgeAchievement { Id = "1", Name = "Locked one" },
                new BridgeAchievement { Id = "2", Name = "Old", Unlocked = true, UnlockedAt = 100 },
                new BridgeAchievement { Id = "3", Name = "Locked two" },
                new BridgeAchievement { Id = "4", Name = "Recent", Unlocked = true, UnlockedAt = 200 },
            };

            var names = AchievementsViewModel.Order(list, CultureInfo.InvariantCulture).Select(i => i.Name).ToList();

            Assert.Equal(new[] { "Recent", "Old", "Locked one", "Locked two" }, names);
        }

        [Fact]
        public void HiddenLockedAchievement_KeepsItsDescriptionSecret()
        {
            var item = AchievementsViewModel.Order(new[] { new BridgeAchievement { Name = "Spoiler", Description = "The ending", Hidden = true } }, CultureInfo.InvariantCulture).Single();

            Assert.NotEqual("Spoiler", item.Name);
            Assert.Equal(string.Empty, item.Description);
            Assert.True(item.CanReveal);
        }

        [Fact]
        public void HiddenLockedAchievement_ShowsItsNameAndDescription_OnceRevealed_AndHidesThemAgain()
        {
            var item = AchievementsViewModel.Order(new[] { new BridgeAchievement { Name = "Spoiler", Description = "The ending", Hidden = true } }, CultureInfo.InvariantCulture).Single();

            item.ToggleReveal();
            Assert.Equal("Spoiler", item.Name);
            Assert.Equal("The ending", item.Description);

            item.ToggleReveal();
            Assert.NotEqual("Spoiler", item.Name);
        }

        [Fact]
        public void OrdinaryAchievement_HasNothingToReveal()
        {
            var item = AchievementsViewModel.Order(new[] { new BridgeAchievement { Name = "Plain", Description = "Text" } }, CultureInfo.InvariantCulture).Single();

            item.ToggleReveal();

            Assert.False(item.CanReveal);
            Assert.Equal("Plain", item.Name);
        }

        [Fact]
        public void LockedAchievement_UsesItsGreyIcon_AndShowsProgress()
        {
            var item = AchievementsViewModel.Order(new[] { new BridgeAchievement { Name = "Grind", Icon = "on", IconLocked = "off", Progress = new BridgeProgress { Current = 25, Max = 100 } } }, CultureInfo.InvariantCulture).Single();

            Assert.Equal("off", item.IconUrl);
            Assert.True(item.HasProgress);
            Assert.Equal(25, item.ProgressValue);
        }
    }

    public class PanelTests
    {
        [Fact]
        public void PanelGoingOffline_DropsThePreviousGamesCount()
        {
            var model = new AchievementsViewModel { Summary = "41 / 75", Percent = 55 };
            model.Items.Add(new AchievementItem { Name = "Old game" });

            model.Show(null, false, CultureInfo.InvariantCulture);

            Assert.Equal(PanelState.Offline, model.State);
            Assert.Equal(string.Empty, model.Summary);
            Assert.Equal(0, model.Percent);
            Assert.Empty(model.Items);
        }

        [Fact]
        public void UnknownGame_DropsThePreviousGamesCount()
        {
            var model = new AchievementsViewModel { Summary = "41 / 75" };

            model.Show(new BridgeReply { Found = false }, true, CultureInfo.InvariantCulture);

            Assert.Equal(PanelState.NotFound, model.State);
            Assert.Equal(string.Empty, model.Summary);
        }

        [Fact]
        public void AnotherGameSelected_ShowsLoading_NotThePreviousList()
        {
            var model = new AchievementsViewModel { Summary = "41 / 75", State = PanelState.Ready };
            model.Items.Add(new AchievementItem { Name = "Old game" });

            model.BeginLoading();

            Assert.Equal(PanelState.Loading, model.State);
            Assert.Equal(string.Empty, model.Summary);
            Assert.Empty(model.Items);
        }

        [Fact]
        public void AnswerToAnEarlierQuestion_IsNotTheCurrentOne()
        {
            var model = new AchievementsViewModel();
            var first = model.NextQuestion();
            var second = model.NextQuestion();

            Assert.False(model.IsCurrent(first));
            Assert.True(model.IsCurrent(second));
        }
    }
}
