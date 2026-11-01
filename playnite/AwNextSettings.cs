using System.Collections.Generic;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace AwNext.Playnite
{
    public class AwNextSettings : ObservableObject
    {
        public const int DefaultPort = 8082;

        private int port = DefaultPort;
        private string login = string.Empty;

        /// <summary>AW Next's websocket port (Settings > Notification > Websocket in AW Next).</summary>
        public int Port { get => port; set => SetValue(ref port, value); }

        /// <summary>"user:password", only when a websocket password is set in AW Next.</summary>
        public string Login { get => login; set => SetValue(ref login, value); }
    }

    public class AwNextSettingsViewModel : ObservableObject, ISettings
    {
        private readonly AwNextPlugin plugin;
        private AwNextSettings editingClone;
        private AwNextSettings settings;

        public AwNextSettings Settings
        {
            get => settings;
            set
            {
                settings = value;
                OnPropertyChanged();
            }
        }

        public AwNextSettingsViewModel(AwNextPlugin plugin)
        {
            this.plugin = plugin;
            Settings = plugin.LoadPluginSettings<AwNextSettings>() ?? new AwNextSettings();
        }

        public void BeginEdit() => editingClone = Serialization.GetClone(Settings);

        public void CancelEdit() => Settings = editingClone;

        public void EndEdit()
        {
            plugin.SavePluginSettings(Settings);
            plugin.Reconnect();
        }

        public bool VerifySettings(out List<string> errors)
        {
            errors = new List<string>();
            if (Settings.Port < 1 || Settings.Port > 65535)
            {
                errors.Add(ResourceProvider.GetString("LOCAwNextPortInvalid"));
            }

            return errors.Count == 0;
        }
    }
}
