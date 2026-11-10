using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AwNext.Playnite;
using Xunit;

namespace AwNext.Playnite.Tests
{
    public class IconLoadingTests
    {
        private static AchievementsViewModel ModelWith(params string[] urls) =>
            new AchievementsViewModel { Items = urls.Select(url => new AchievementItem { IconUrl = url }).ToList() };

        [Fact]
        public async Task PictureThatNeverArrives_DoesNotHoldTheOnesAfterIt()
        {
            var model = ModelWith("a", "stuck", "c", "d");
            var stuck = new TaskCompletionSource<object>();

            var loading = model.LoadIconsAsync(null, (url, login) => url == "stuck" ? stuck.Task : Task.FromResult<object>(url));
            await Task.WhenAny(loading, Task.Delay(2000));

            Assert.Equal(new object[] { "a", null, "c", "d" }, model.Items.Select(item => item.Icon).ToArray());
            stuck.SetResult(null);
            await loading;
        }

        [Fact]
        public async Task PictureThatFails_LeavesItsPlaceEmpty_AndTheOthersLoad()
        {
            var model = ModelWith("a", "missing", "c");

            await model.LoadIconsAsync(null, (url, login) => Task.FromResult<object>(url == "missing" ? null : url));

            Assert.Equal(new object[] { "a", null, "c" }, model.Items.Select(item => item.Icon).ToArray());
        }

        [Fact]
        public async Task PanelWithALimit_OnlyFetchesItsFirstPictures()
        {
            var model = ModelWith("a", "b", "c");
            model.IconLimit = 2;
            var asked = new List<string>();

            await model.LoadIconsAsync(null, (url, login) =>
            {
                lock (asked)
                {
                    asked.Add(url);
                }

                return Task.FromResult<object>(url);
            });

            Assert.Equal(new[] { "a", "b" }, asked.OrderBy(url => url).ToArray());
        }
    }
}
