using System.Windows.Input;
using AwNext.Playnite;
using Playnite.SDK.Events;
using Xunit;

namespace AwNext.Playnite.Tests
{
    public class WindowCloseTests
    {
        [Theory]
        [InlineData(ControllerInput.B)]
        [InlineData(ControllerInput.Back)]
        public void ControllerCancelButtons_CloseTheWindow_WhenPressed(ControllerInput button)
        {
            Assert.True(WindowClose.ByController(button, ControllerInputState.Pressed));
        }

        [Fact]
        public void ControllerRelease_DoesNotCloseTheWindow()
        {
            Assert.False(WindowClose.ByController(ControllerInput.B, ControllerInputState.Released));
        }

        [Fact]
        public void ControllerConfirmButton_DoesNotCloseTheWindow()
        {
            Assert.False(WindowClose.ByController(ControllerInput.A, ControllerInputState.Pressed));
        }

        [Theory]
        [InlineData(Key.Escape, true)]
        [InlineData(Key.Back, true)]
        [InlineData(Key.Enter, false)]
        [InlineData(Key.R, false)]
        public void Keys_CloseTheWindow_OnlyForEscapeAndBack(Key key, bool closes)
        {
            Assert.Equal(closes, WindowClose.ByKey(key));
        }
    }
}
