using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Playnite.SDK;

namespace AwNext.Playnite
{
    public enum PanelState
    {
        Loading,
        Offline,
        NotFound,
        Ready,
    }

    public class AchievementItem : ObservableObject
    {
        private object icon;
        private string name;
        private string description;
        private bool revealed;

        public string Name { get => name; set => SetValue(ref name, value); }
        public string Description { get => description; set => SetValue(ref description, value); }

        /// <summary>A hidden one not unlocked yet keeps its real text here until the user asks for it.</summary>
        internal string SecretName { get; set; }
        internal string SecretDescription { get; set; }
        internal string CoverName { get; set; }

        public bool CanReveal => SecretName != null;

        public void ToggleReveal()
        {
            if (!CanReveal)
            {
                return;
            }

            revealed = !revealed;
            Name = revealed ? SecretName : CoverName;
            Description = revealed ? SecretDescription : string.Empty;
        }
        public bool Unlocked { get; set; }
        public long UnlockedAt { get; set; }
        public string IconUrl { get; set; }

        /// <summary>The unlock date, the rarity and the progress of a locked one, joined for one line.</summary>
        public string Detail { get; set; }

        public double ProgressValue { get; set; }
        public bool HasProgress { get; set; }

        /// <summary>Filled once the picture arrives (see IconLoader), so a slow icon never holds the list.</summary>
        public object Icon { get => icon; set => SetValue(ref icon, value); }
    }

    /// <summary>One game's achievements as the panel and the window show them.</summary>
    public class AchievementsViewModel : ObservableObject
    {
        private PanelState state = PanelState.Loading;
        private string summary = string.Empty;
        private double percent;
        private List<AchievementItem> items = new List<AchievementItem>();
        private int question;

        public PanelState State { get => state; set => SetValue(ref state, value); }
        public string Summary { get => summary; set => SetValue(ref summary, value); }
        public double Percent { get => percent; set => SetValue(ref percent, value); }
        public List<AchievementItem> Items { get => items; set => SetValue(ref items, value); }

        /// <summary>A panel that shows the first few only fetches their pictures; 0 fetches every one.</summary>
        public int IconLimit { get; set; }

        /// <summary>
        /// Unlocked first, the most recent on top, then the locked ones in AW Next's order, the way
        /// Steam lists them. A hidden achievement keeps its secret until it is unlocked.
        /// </summary>
        public static List<AchievementItem> Order(IEnumerable<BridgeAchievement> achievements, CultureInfo culture)
        {
            var list = (achievements ?? Enumerable.Empty<BridgeAchievement>()).Where(a => a != null).ToList();
            var unlocked = list.Where(a => a.Unlocked).OrderByDescending(a => a.UnlockedAt).Select(a => Item(a, culture));
            var locked = list.Where(a => !a.Unlocked).Select(a => Item(a, culture));
            return unlocked.Concat(locked).ToList();
        }

        /// <summary>
        /// Numbers each question, so an answer that arrives after the next one was asked (the user
        /// moved on to another game) is dropped instead of painting that game's list over this one.
        /// </summary>
        internal int NextQuestion() => ++question;

        internal bool IsCurrent(int asked) => asked == question;

        /// <summary>Another game was selected: its answer is on the way.</summary>
        public void BeginLoading() => Clear(PanelState.Loading);

        // The previous game's count and list must not stay on screen under another one.
        private void Clear(PanelState next)
        {
            Summary = string.Empty;
            Percent = 0;
            Items = new List<AchievementItem>();
            State = next;
        }

        public void Show(BridgeReply reply, bool online, CultureInfo culture)
        {
            if (!online || reply == null || !reply.Found || reply.Game == null)
            {
                Clear(online ? PanelState.NotFound : PanelState.Offline);
                return;
            }

            var total = reply.Game.Total;
            var unlocked = reply.Game.Unlocked;
            Percent = total > 0 ? Math.Round(100.0 * unlocked / total) : 0;
            Summary = string.Format(culture, ResourceProvider.GetString("LOCAwNextSummary"), unlocked, total, Percent);
            Items = Order(reply.Game.Achievements, culture);
            State = PanelState.Ready;
        }

        /// <summary>Pictures arrive one by one; a list replaced meanwhile stops getting them.</summary>
        public async Task LoadIconsAsync(string login)
        {
            var list = Items;
            foreach (var item in IconLimit > 0 ? list.Take(IconLimit) : list)
            {
                if (!ReferenceEquals(list, Items))
                {
                    return;
                }

                var image = await IconLoader.LoadAsync(item.IconUrl, login).ConfigureAwait(false);
                if (image != null)
                {
                    item.Icon = image;
                }
            }
        }

        private static AchievementItem Item(BridgeAchievement a, CultureInfo culture)
        {
            var secret = a.Hidden && !a.Unlocked;
            var parts = new List<string>();
            if (a.Unlocked && a.UnlockedAt > 0)
            {
                var when = DateTimeOffset.FromUnixTimeSeconds(a.UnlockedAt).LocalDateTime;
                parts.Add(string.Format(culture, ResourceProvider.GetString("LOCAwNextUnlockedOn"), when.ToString("g", culture)));
            }

            var progress = !a.Unlocked && a.Progress != null && a.Progress.Max > 0 ? a.Progress : null;
            if (progress != null)
            {
                parts.Add(string.Format(culture, "{0:0.##} / {1:0.##}", progress.Current, progress.Max));
            }

            if (a.Rarity.HasValue)
            {
                parts.Add(string.Format(culture, ResourceProvider.GetString("LOCAwNextRarity"), a.Rarity.Value));
            }

            var cover = secret ? ResourceProvider.GetString("LOCAwNextHidden") : null;
            return new AchievementItem
            {
                Name = secret ? cover : a.Name,
                Description = secret ? string.Empty : a.Description,
                CoverName = cover,
                SecretName = secret ? a.Name ?? string.Empty : null,
                SecretDescription = secret ? a.Description ?? string.Empty : null,
                Unlocked = a.Unlocked,
                UnlockedAt = a.UnlockedAt,
                IconUrl = a.Unlocked ? a.Icon : (string.IsNullOrEmpty(a.IconLocked) ? a.Icon : a.IconLocked),
                Detail = string.Join("  ·  ", parts),
                HasProgress = progress != null,
                ProgressValue = progress != null ? Math.Max(0, Math.Min(100, 100.0 * progress.Current / progress.Max)) : 0,
            };
        }
    }
}
