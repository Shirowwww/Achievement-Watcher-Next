using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;

namespace AwNext.Playnite.Views
{
    /// <summary>
    /// The list both places draw: whole in the window, cut to the first few in a theme's panel, where
    /// "Show all" opens the window.
    /// </summary>
    public partial class AchievementsList : UserControl
    {
        public static readonly DependencyProperty MaxItemsProperty =
            DependencyProperty.Register(nameof(MaxItems), typeof(int), typeof(AchievementsList), new PropertyMetadata(0, (d, e) => ((AchievementsList)d).Refresh()));

        public static readonly DependencyProperty ShownItemsProperty =
            DependencyProperty.Register(nameof(ShownItems), typeof(IEnumerable<AchievementItem>), typeof(AchievementsList));

        private AchievementsViewModel model;

        /// <summary>0 shows every achievement.</summary>
        public int MaxItems
        {
            get => (int)GetValue(MaxItemsProperty);
            set => SetValue(MaxItemsProperty, value);
        }

        public IEnumerable<AchievementItem> ShownItems
        {
            get => (IEnumerable<AchievementItem>)GetValue(ShownItemsProperty);
            set => SetValue(ShownItemsProperty, value);
        }

        public event EventHandler ShowAllRequested;

        public AchievementsList()
        {
            InitializeComponent();
            DataContextChanged += (s, e) => Watch(e.NewValue as AchievementsViewModel);
        }

        private void Watch(AchievementsViewModel next)
        {
            if (model != null)
            {
                model.PropertyChanged -= OnModelChanged;
            }

            model = next;
            if (model != null)
            {
                model.PropertyChanged += OnModelChanged;
            }

            Refresh();
        }

        private void OnModelChanged(object sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(AchievementsViewModel.Items))
            {
                Dispatcher.Invoke(Refresh);
            }
        }

        private void Refresh()
        {
            var all = model?.Items ?? new List<AchievementItem>();
            var cut = MaxItems > 0 && all.Count > MaxItems;
            ShownItems = cut ? all.Take(MaxItems).ToList() : all;
            ShowAll.Visibility = cut ? Visibility.Visible : Visibility.Collapsed;
        }

        private void ShowAll_Click(object sender, RoutedEventArgs e) => ShowAllRequested?.Invoke(this, EventArgs.Empty);

        // A click on a hidden achievement shows its name and description, a second one hides them.
        private void Item_Click(object sender, System.Windows.Input.MouseButtonEventArgs e) => ((sender as FrameworkElement)?.DataContext as AchievementItem)?.ToggleReveal();
    }
}
