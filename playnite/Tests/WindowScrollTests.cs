using System.Windows.Input;
using AwNext.Playnite;
using Playnite.SDK.Events;
using Xunit;

namespace AwNext.Playnite.Tests
{
    public class WindowScrollTests
    {
        private const double Viewport = 700;

        [Theory]
        [InlineData(ControllerInput.DPadDown)]
        [InlineData(ControllerInput.LeftStickDown)]
        [InlineData(ControllerInput.RightStickDown)]
        public void ControllerDown_ScrollsTheListDown(ControllerInput button)
        {
            Assert.Equal(WindowScroll.Step, WindowScroll.ByController(button, ControllerInputState.Pressed, Viewport));
        }

        [Theory]
        [InlineData(ControllerInput.DPadUp)]
        [InlineData(ControllerInput.LeftStickUp)]
        [InlineData(ControllerInput.RightStickUp)]
        public void ControllerUp_ScrollsTheListUp(ControllerInput button)
        {
            Assert.Equal(-WindowScroll.Step, WindowScroll.ByController(button, ControllerInputState.Pressed, Viewport));
        }

        [Fact]
        public void ControllerShoulders_ScrollAPage()
        {
            var page = WindowScroll.ByController(ControllerInput.RightShoulder, ControllerInputState.Pressed, Viewport);

            Assert.True(page > WindowScroll.Step && page < Viewport);
            Assert.Equal(-page, WindowScroll.ByController(ControllerInput.LeftShoulder, ControllerInputState.Pressed, Viewport));
        }

        [Fact]
        public void ShortWindow_PageIsOneStep_NotAJumpPastUnseenRows()
        {
            Assert.Equal(WindowScroll.Step, WindowScroll.ByController(ControllerInput.RightShoulder, ControllerInputState.Pressed, 150));
            Assert.Equal(-WindowScroll.Step, WindowScroll.ByKey(Key.PageUp, 150));
        }

        [Fact]
        public void ControllerRelease_AndOtherButtons_DoNotScroll()
        {
            Assert.Equal(0, WindowScroll.ByController(ControllerInput.DPadDown, ControllerInputState.Released, Viewport));
            Assert.Equal(0, WindowScroll.ByController(ControllerInput.A, ControllerInputState.Pressed, Viewport));
            Assert.Equal(0, WindowScroll.ByController(ControllerInput.DPadLeft, ControllerInputState.Pressed, Viewport));
        }

        [Fact]
        public void KeyboardArrowsAndPageKeys_ScrollTheList()
        {
            Assert.Equal(WindowScroll.Step, WindowScroll.ByKey(Key.Down, Viewport));
            Assert.Equal(-WindowScroll.Step, WindowScroll.ByKey(Key.Up, Viewport));
            Assert.True(WindowScroll.ByKey(Key.PageDown, Viewport) > WindowScroll.Step);
            Assert.True(WindowScroll.ByKey(Key.PageUp, Viewport) < -WindowScroll.Step);
            Assert.Equal(0, WindowScroll.ByKey(Key.Enter, Viewport));
        }
    }
}
