using System;
using System.Windows.Input;
using Playnite.SDK.Events;

namespace AwNext.Playnite
{
    /// <summary>
    /// How far the achievements window scrolls, in pixels (negative is up, 0 is no scroll). The list
    /// holds nothing a controller can focus, so in Fullscreen mode the D-pad and the sticks had nothing
    /// to move: they scroll the window itself, and the shoulders move a page.
    /// </summary>
    public static class WindowScroll
    {
        /// <summary>About three achievements.</summary>
        public const double Step = 160;

        private const double PageShare = 0.85;

        public static double ByController(ControllerInput button, ControllerInputState state, double viewport)
        {
            if (state != ControllerInputState.Pressed)
            {
                return 0;
            }

            switch (button)
            {
                case ControllerInput.DPadDown:
                case ControllerInput.LeftStickDown:
                case ControllerInput.RightStickDown:
                    return Step;
                case ControllerInput.DPadUp:
                case ControllerInput.LeftStickUp:
                case ControllerInput.RightStickUp:
                    return -Step;
                case ControllerInput.RightShoulder:
                    return Page(viewport);
                case ControllerInput.LeftShoulder:
                    return -Page(viewport);
                default:
                    return 0;
            }
        }

        public static double ByKey(Key key, double viewport)
        {
            switch (key)
            {
                case Key.Down:
                    return Step;
                case Key.Up:
                    return -Step;
                case Key.PageDown:
                    return Page(viewport);
                case Key.PageUp:
                    return -Page(viewport);
                default:
                    return 0;
            }
        }

        // Most of what is on screen, and never less than a step in a short window.
        private static double Page(double viewport) => Math.Max(viewport * PageShare, Step);
    }
}
