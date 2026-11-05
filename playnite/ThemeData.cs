using System;
using System.Collections.Generic;

namespace AwNext.Playnite
{
    /// <summary>
    /// The selected game's counts for themes that draw their own block:
    /// {PluginSettings Plugin=AwNext, Path=HasData}. The names match those of SuccessStory and of
    /// Playnite Achievements, so a theme that reads either can read AW Next with the plugin name changed.
    /// </summary>
    public class ThemeData : ObservableObject
    {
        private bool hasData;
        private int unlocked;
        private int total;
        private int locked;
        private int percent;
        private bool isCompleted;
        private bool is100Percent;
        private int question;

        public bool HasData { get => hasData; private set => SetValue(ref hasData, value); }
        public int Unlocked { get => unlocked; private set => SetValue(ref unlocked, value); }
        public int Total { get => total; private set => SetValue(ref total, value); }
        public int Locked { get => locked; private set => SetValue(ref locked, value); }
        public int Percent { get => percent; private set => SetValue(ref percent, value); }
        public bool IsCompleted { get => isCompleted; private set => SetValue(ref isCompleted, value); }

        /// <summary>SuccessStory's name for IsCompleted.</summary>
        public bool Is100Percent { get => is100Percent; private set => SetValue(ref is100Percent, value); }

        // Same guard as the panels: an answer for a game the user already left is dropped.
        internal int NextQuestion() => ++question;

        internal bool IsCurrent(int asked) => asked == question;

        /// <summary>Paints AW Next's answer; anything but a game with achievements clears the block.</summary>
        public void Show(BridgeReply reply)
        {
            var game = reply != null && reply.Found ? reply.Game : null;
            var all = game != null ? Math.Max(0, game.Total) : 0;
            var got = all > 0 ? Math.Max(0, Math.Min(game.Unlocked, all)) : 0;

            Unlocked = got;
            Total = all;
            Locked = all - got;
            Percent = all > 0 ? (int)Math.Round(100.0 * got / all) : 0;
            IsCompleted = all > 0 && got == all;
            Is100Percent = IsCompleted;
            HasData = all > 0;
        }
    }
}
