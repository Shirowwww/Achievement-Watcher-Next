using AwNext.Playnite;
using Xunit;

namespace AwNext.Playnite.Tests
{
    public class ThemeDataTests
    {
        private static BridgeReply Found(int unlocked, int total) =>
            new BridgeReply { Found = true, Game = new BridgeGame { Id = "1", Name = "Game", Unlocked = unlocked, Total = total } };

        [Fact]
        public void FoundGame_ExposesItsCounts_ForThemeBindings()
        {
            var data = new ThemeData();

            data.Show(Found(12, 50));

            Assert.True(data.HasData);
            Assert.Equal(12, data.Unlocked);
            Assert.Equal(50, data.Total);
            Assert.Equal(38, data.Locked);
            Assert.Equal(24, data.Percent);
            Assert.False(data.IsCompleted);
        }

        [Fact]
        public void EveryAchievementUnlocked_IsCompleted()
        {
            var data = new ThemeData();

            data.Show(Found(30, 30));

            Assert.True(data.IsCompleted);
            Assert.True(data.Is100Percent);
            Assert.Equal(100, data.Percent);
        }

        [Fact]
        public void SuccessStoryName_FollowsTheSameState_AsIsCompleted()
        {
            var data = new ThemeData();
            data.Show(Found(30, 30));

            data.Show(Found(29, 30));

            Assert.False(data.Is100Percent);
        }

        [Fact]
        public void GameWithoutAchievements_HasNoData_SoThemesHideTheirBlock()
        {
            var data = new ThemeData();

            data.Show(Found(0, 0));

            Assert.False(data.HasData);
            Assert.False(data.IsCompleted);
            Assert.Equal(0, data.Percent);
        }

        [Fact]
        public void NotFoundOrOffline_ClearsThePreviousGame()
        {
            var data = new ThemeData();
            data.Show(Found(12, 50));

            data.Show(new BridgeReply { Found = false });
            Assert.False(data.HasData);
            Assert.Equal(0, data.Total);

            data.Show(Found(12, 50));
            data.Show(null);
            Assert.False(data.HasData);
            Assert.Equal(0, data.Unlocked);
        }

        [Fact]
        public void LateAnswer_ForAGameNoLongerSelected_IsDropped()
        {
            var data = new ThemeData();
            var first = data.NextQuestion();
            var second = data.NextQuestion();

            Assert.False(data.IsCurrent(first));
            Assert.True(data.IsCurrent(second));
        }
    }
}
