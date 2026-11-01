using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using AwNext.Playnite.Views;
using Playnite.SDK;
using Playnite.SDK.Events;
using Playnite.SDK.Models;
using Playnite.SDK.Plugins;

namespace AwNext.Playnite
{
    /// <summary>
    /// AW Next's achievements in Playnite. AW Next finds the game and its achievements; this only
    /// asks for them on AW Next's local feed and draws them: in a window from the game's menu, and in
    /// the panels a theme can place (AwNext_Achievements, AwNext_Progress).
    /// </summary>
    public class AwNextPlugin : GenericPlugin
    {
        private static readonly ILogger logger = LogManager.GetLogger();

        // Playnite's own Steam library: its games carry their Steam AppID as GameId.
        private static readonly Guid SteamLibraryId = Guid.Parse("CB91DFC9-B977-43BF-8E70-55F46E410FAB");

        private readonly AwNextSettingsViewModel settings;
        private readonly ConcurrentDictionary<Guid, string> awIds = new ConcurrentDictionary<Guid, string>();
        private BridgeClient client;

        public override Guid Id { get; } = Guid.Parse("4ae86d6e-6590-497f-adf9-0d373068627d");

        /// <summary>Raised on the UI thread when AW Next announces an unlock for a game shown here.</summary>
        public event Action<Game> GameUpdated;

        public AwNextPlugin(IPlayniteAPI api) : base(api)
        {
            settings = new AwNextSettingsViewModel(this);
            Properties = new GenericPluginProperties { HasSettings = true };
            AddCustomElementSupport(new AddCustomElementSupportArgs
            {
                SourceName = "AwNext",
                ElementList = new List<string> { "Achievements", "Progress" },
            });
        }

        public override void OnApplicationStarted(OnApplicationStartedEventArgs args) => Connect();

        public override void OnApplicationStopped(OnApplicationStoppedEventArgs args) => client?.Dispose();

        public override ISettings GetSettings(bool firstRunSettings) => settings;

        public override UserControl GetSettingsView(bool firstRunSettings) => new AwNextSettingsView();

        public override Control GetGameViewControl(GetGameViewControlArgs args)
        {
            switch (args.Name)
            {
                case "Achievements":
                    return new AchievementsElement(this);
                case "Progress":
                    return new ProgressElement(this);
                default:
                    return null;
            }
        }

        public override IEnumerable<GameMenuItem> GetGameMenuItems(GetGameMenuItemsArgs args)
        {
            if (args.Games.Count != 1)
            {
                yield break;
            }

            var game = args.Games[0];
            yield return new GameMenuItem
            {
                Description = ResourceProvider.GetString("LOCAwNextMenu"),
                Icon = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(typeof(AwNextPlugin).Assembly.Location), "icon.png"),
                Action = a => OpenWindow(game),
            };
        }

        internal void Reconnect()
        {
            client?.Dispose();
            Connect();
        }

        private void Connect()
        {
            client = new BridgeClient(() => settings.Settings);
            client.Connected += () => RaiseForAll();
            client.GameChanged += OnAwGameChanged;
            client.Start();
        }

        /// <summary>Asks AW Next for the game and paints the answer into the model.</summary>
        public async Task FillAsync(AchievementsViewModel model, Game game)
        {
            var asked = model.NextQuestion();
            var current = client;
            if (current == null || !current.IsOpen)
            {
                model.Show(null, false, CultureInfo.CurrentCulture);
                return;
            }

            BridgeReply reply = null;
            try
            {
                reply = await current.AskAsync(GameQuestion.For(FactsOf(game))).ConfigureAwait(true);
            }
            catch (Exception e)
            {
                logger.Error(e, $"AW Next request failed for {game.Name}");
            }

            if (reply != null && reply.Found && reply.Game != null)
            {
                awIds[game.Id] = reply.Game.Id;
            }

            if (!model.IsCurrent(asked))
            {
                return;
            }

            model.Show(reply, current.IsOpen, CultureInfo.CurrentCulture);
            _ = model.LoadIconsAsync(settings.Settings.Login);
        }

        public void OpenWindow(Game game)
        {
            if (game == null)
            {
                return;
            }

            var model = new AchievementsViewModel();
            var window = PlayniteApi.Dialogs.CreateWindow(new WindowCreationOptions { ShowMinimizeButton = false, ShowMaximizeButton = true });
            window.Title = string.Format(ResourceProvider.GetString("LOCAwNextWindowTitle"), game.Name);
            window.Width = 620;
            window.Height = 720;
            window.Owner = PlayniteApi.Dialogs.GetCurrentAppWindow();
            window.WindowStartupLocation = WindowStartupLocation.CenterOwner;
            window.Content = new ScrollViewer
            {
                Padding = new Thickness(16),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Content = new AchievementsList { DataContext = model },
            };

            Action<Game> refresh = updated =>
            {
                if (updated != null && updated.Id == game.Id)
                {
                    _ = FillAsync(model, game);
                }
            };
            GameUpdated += refresh;
            window.Closed += (s, e) => GameUpdated -= refresh;
            _ = FillAsync(model, game);
            window.ShowDialog();
        }

        private void OnAwGameChanged(string awId)
        {
            var games = awIds.Where(pair => pair.Value == awId).Select(pair => PlayniteApi.Database.Games.Get(pair.Key)).Where(g => g != null).ToList();
            if (games.Count > 0)
            {
                Application.Current?.Dispatcher.BeginInvoke(new Action(() => games.ForEach(g => GameUpdated?.Invoke(g))));
            }
        }

        // AW Next came back: every panel on screen asks again.
        private void RaiseForAll()
        {
            // Raised on the feed's worker thread: the selection belongs to the UI thread, so it is read there.
            Application.Current?.Dispatcher.BeginInvoke(new Action(() =>
            {
                var selected = PlayniteApi.MainView?.SelectedGames?.ToList() ?? new List<Game>();
                selected.ForEach(g => GameUpdated?.Invoke(g));
            }));
        }

        /// <summary>What Playnite knows about the game, with its variables ({InstallDir}...) expanded.</summary>
        internal GameFacts FactsOf(Game game)
        {
            var facts = new GameFacts
            {
                Name = game.Name,
                InstallDirectory = Expand(game, game.InstallDirectory),
                SteamAppId = game.PluginId == SteamLibraryId ? game.GameId : null,
            };

            var play = game.GameActions?.FirstOrDefault(a => a != null && a.IsPlayAction) ?? game.GameActions?.FirstOrDefault();
            if (play != null && play.Type == GameActionType.File)
            {
                facts.PlayPath = Expand(game, play.Path);
                facts.PlayArguments = Expand(game, play.Arguments);
            }
            else if (play != null && play.Type == GameActionType.Emulator && game.Roms != null && game.Roms.Count > 0)
            {
                facts.RomPath = Expand(game, game.Roms[0].Path);
            }

            return facts;
        }

        private string Expand(Game game, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            try
            {
                return PlayniteApi.ExpandGameVariables(game, value);
            }
            catch (Exception e)
            {
                logger.Debug($"Could not expand '{value}' for {game.Name}: {e.Message}");
                return value;
            }
        }
    }
}
