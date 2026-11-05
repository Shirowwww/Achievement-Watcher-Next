using System.Windows.Input;
using Playnite.SDK.Events;

namespace AwNext.Playnite
{
    /// <summary>
    /// What closes the achievements window. In Fullscreen mode (Selene and other controller themes)
    /// the window has no reachable close button, so B, Back, Escape and Backspace close it.
    /// </summary>
    public static class WindowClose
    {
        public static bool ByController(ControllerInput button, ControllerInputState state) =>
            state == ControllerInputState.Pressed && (button == ControllerInput.B || button == ControllerInput.Back);

        public static bool ByKey(Key key) => key == Key.Escape || key == Key.Back;
    }
}
