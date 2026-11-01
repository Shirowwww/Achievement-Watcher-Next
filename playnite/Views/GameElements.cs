using System.Windows;
using System.Windows.Controls;
using Playnite.SDK.Controls;
using Playnite.SDK.Models;

namespace AwNext.Playnite.Views
{
    /// <summary>
    /// The panels a theme places in a game's details: AwNext_Achievements (the first unlocks and
    /// "Show all") and AwNext_Progress (the "12 / 50" line). Each follows the selected game.
    /// </summary>
    public class GameElement : PluginUserControl
    {
        private readonly AwNextPlugin plugin;
        private Game shown;

        protected AchievementsViewModel Model { get; } = new AchievementsViewModel();

        protected GameElement(AwNextPlugin plugin)
        {
            this.plugin = plugin;
            DataContext = Model;
            Unloaded += (s, e) => plugin.GameUpdated -= OnGameUpdated;
            Loaded += (s, e) => plugin.GameUpdated += OnGameUpdated;
        }

        protected AwNextPlugin Plugin => plugin;

        protected Game Shown => shown;

        public override void GameContextChanged(Game oldContext, Game newContext)
        {
            shown = newContext;
            Visibility = newContext == null ? Visibility.Collapsed : Visibility.Visible;
            if (newContext != null)
            {
                Model.BeginLoading();
                _ = plugin.FillAsync(Model, newContext);
            }
        }

        private void OnGameUpdated(Game game)
        {
            if (shown != null && game != null && game.Id == shown.Id)
            {
                _ = plugin.FillAsync(Model, shown);
            }
        }
    }

    public class AchievementsElement : GameElement
    {
        public const int ItemsShown = 8;

        public AchievementsElement(AwNextPlugin plugin) : base(plugin)
        {
            Model.IconLimit = ItemsShown;
            var list = new AchievementsList { MaxItems = ItemsShown };
            list.ShowAllRequested += (s, e) => Plugin.OpenWindow(Shown);
            Content = list;
        }
    }

    public class ProgressElement : GameElement
    {
        public ProgressElement(AwNextPlugin plugin) : base(plugin)
        {
            var text = new TextBlock();
            text.SetBinding(TextBlock.TextProperty, nameof(AchievementsViewModel.Summary));
            text.SetResourceReference(TextBlock.ForegroundProperty, "TextBrush");
            Content = text;
        }
    }
}
