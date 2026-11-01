using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Playnite.SDK;

namespace AwNext.Playnite
{
    /// <summary>
    /// Achievement pictures, fetched off the UI thread. Pictures stored on the PC are served by AW Next
    /// itself (http://127.0.0.1:8082/bridge/icon/...), which wants the websocket login when one is set:
    /// a plain image source cannot send it, hence the request made here.
    /// </summary>
    public static class IconLoader
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private const int MaxCached = 2048;
        private const int MaxBytes = 4 * 1024 * 1024;

        // The cap also holds for a body sent without a length: past it, SendAsync throws instead of buffering.
        private static readonly HttpClient http = new HttpClient { Timeout = TimeSpan.FromSeconds(15), MaxResponseContentBufferSize = MaxBytes };
        private static readonly ConcurrentDictionary<string, ImageSource> cache = new ConcurrentDictionary<string, ImageSource>();

        public static async Task<ImageSource> LoadAsync(string url, string login)
        {
            if (!Uri.TryCreate(url ?? string.Empty, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                return null;
            }

            if (cache.TryGetValue(uri.AbsoluteUri, out var known))
            {
                return known;
            }

            try
            {
                using (var request = new HttpRequestMessage(HttpMethod.Get, uri))
                {
                    // The login goes to AW Next only, never to a CDN.
                    if (uri.IsLoopback && !string.IsNullOrEmpty(login))
                    {
                        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(login)));
                    }

                    using (var response = await http.SendAsync(request).ConfigureAwait(false))
                    {
                        if (!response.IsSuccessStatusCode || (response.Content.Headers.ContentLength ?? 0) > MaxBytes)
                        {
                            return null;
                        }

                        var bytes = await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
                        var image = Decode(bytes);
                        if (image != null && cache.Count < MaxCached)
                        {
                            cache[uri.AbsoluteUri] = image;
                        }

                        return image;
                    }
                }
            }
            catch (Exception e) when (e is HttpRequestException || e is TaskCanceledException || e is IOException || e is NotSupportedException || e is FormatException)
            {
                logger.Debug($"Icon not loaded ({uri.Host}): {e.Message}");
                return null;
            }
        }

        private static ImageSource Decode(byte[] bytes)
        {
            if (bytes == null || bytes.Length == 0 || bytes.Length > MaxBytes)
            {
                return null;
            }

            using (var stream = new MemoryStream(bytes))
            {
                var image = new BitmapImage();
                image.BeginInit();
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.DecodePixelWidth = 128;
                image.StreamSource = stream;
                image.EndInit();
                image.Freeze();
                return image;
            }
        }
    }
}
