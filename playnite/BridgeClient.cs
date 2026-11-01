using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Playnite.SDK;

namespace AwNext.Playnite
{
    /// <summary>
    /// AW Next's local feed (ws://127.0.0.1:8082). The bridge answers on it and every unlock is
    /// announced on it. AW Next may start after Playnite, or restart, so the connection keeps coming
    /// back on its own, slower each time it fails.
    /// </summary>
    public sealed class BridgeClient : IDisposable
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly TimeSpan FirstRetry = TimeSpan.FromSeconds(5);
        private static readonly TimeSpan LastRetry = TimeSpan.FromSeconds(60);
        private static readonly TimeSpan AnswerTimeout = TimeSpan.FromSeconds(5);
        private const int MaxMessageBytes = 8 * 1024 * 1024;

        private readonly Func<AwNextSettings> settings;
        private readonly ConcurrentDictionary<int, TaskCompletionSource<BridgeReply>> pending = new ConcurrentDictionary<int, TaskCompletionSource<BridgeReply>>();
        private readonly SemaphoreSlim sendLock = new SemaphoreSlim(1, 1);
        private readonly CancellationTokenSource stopping = new CancellationTokenSource();
        private ClientWebSocket socket;
        private int nextId;

        /// <summary>Raised on a worker thread when the feed opens, so open pages can ask again.</summary>
        public event Action Connected;

        /// <summary>Raised on a worker thread with the AW Next id of a game that just unlocked something.</summary>
        public event Action<string> GameChanged;

        public BridgeClient(Func<AwNextSettings> settings)
        {
            this.settings = settings;
        }

        public bool IsOpen => socket != null && socket.State == WebSocketState.Open;

        public void Start() => Task.Run(() => RunAsync(stopping.Token));

        /// <summary>The game's achievements, or null when AW Next is not there or does not know it.</summary>
        public async Task<BridgeReply> AskAsync(BridgeQuestion question)
        {
            var current = socket;
            if (question == null || current == null || current.State != WebSocketState.Open)
            {
                return null;
            }

            question.Id = Interlocked.Increment(ref nextId);
            var answer = new TaskCompletionSource<BridgeReply>(TaskCreationOptions.RunContinuationsAsynchronously);
            pending[question.Id] = answer;
            try
            {
                var bytes = Encoding.UTF8.GetBytes(BridgeProtocol.ToJson(question));
                await sendLock.WaitAsync(stopping.Token).ConfigureAwait(false);
                try
                {
                    await current.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, stopping.Token).ConfigureAwait(false);
                }
                finally
                {
                    sendLock.Release();
                }

                var done = await Task.WhenAny(answer.Task, Task.Delay(AnswerTimeout)).ConfigureAwait(false);
                return done == answer.Task ? answer.Task.Result : null;
            }
            catch (Exception e) when (e is WebSocketException || e is OperationCanceledException || e is ObjectDisposedException)
            {
                logger.Debug($"AW Next did not answer: {e.Message}");
                return null;
            }
            finally
            {
                pending.TryRemove(question.Id, out _);
            }
        }

        private async Task RunAsync(CancellationToken token)
        {
            var retry = FirstRetry;
            while (!token.IsCancellationRequested)
            {
                var opened = false;
                using (var client = new ClientWebSocket())
                {
                    try
                    {
                        var login = settings().Login;
                        if (!string.IsNullOrEmpty(login))
                        {
                            client.Options.SetRequestHeader("Authorization", "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes(login)));
                        }

                        await client.ConnectAsync(FeedUri(settings().Port), token).ConfigureAwait(false);
                        socket = client;
                        opened = true;
                        retry = FirstRetry;
                        logger.Info("Connected to AW Next");
                        Connected?.Invoke();
                        await ReceiveAsync(client, token).ConfigureAwait(false);
                    }
                    catch (Exception e) when (e is WebSocketException || e is OperationCanceledException || e is IOException)
                    {
                        if (opened)
                        {
                            logger.Info($"AW Next feed closed: {e.Message}");
                        }
                    }
                    finally
                    {
                        socket = null;
                        SettleAll();
                    }
                }

                if (token.IsCancellationRequested)
                {
                    return;
                }

                try
                {
                    await Task.Delay(retry, token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }

                retry = TimeSpan.FromTicks(Math.Min(retry.Ticks * 2, LastRetry.Ticks));
            }
        }

        // Not `client=decky`: that name tells AW Next that Steam shows its notifications.
        internal static Uri FeedUri(int port) => new Uri($"ws://127.0.0.1:{(port > 0 && port < 65536 ? port : AwNextSettings.DefaultPort)}/?client=aw-next-playnite");

        private async Task ReceiveAsync(ClientWebSocket client, CancellationToken token)
        {
            var buffer = new byte[64 * 1024];
            while (client.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                using (var message = new MemoryStream())
                {
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await client.ReceiveAsync(new ArraySegment<byte>(buffer), token).ConfigureAwait(false);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            return;
                        }

                        message.Write(buffer, 0, result.Count);
                        if (message.Length > MaxMessageBytes)
                        {
                            throw new WebSocketException("message too large");
                        }
                    }
                    while (!result.EndOfMessage);

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        Dispatch(BridgeProtocol.Read(Encoding.UTF8.GetString(message.ToArray())));
                    }
                }
            }
        }

        private void Dispatch(FeedMessage message)
        {
            if (message == null)
            {
                return;
            }

            if (message.Reply != null)
            {
                if (message.Reply.Id.HasValue && pending.TryRemove(message.Reply.Id.Value, out var answer))
                {
                    answer.TrySetResult(message.Reply);
                }

                return;
            }

            if (!string.IsNullOrEmpty(message.UnlockedGameId))
            {
                GameChanged?.Invoke(message.UnlockedGameId);
            }
        }

        private void SettleAll()
        {
            foreach (var id in pending.Keys)
            {
                if (pending.TryRemove(id, out var answer))
                {
                    answer.TrySetResult(null);
                }
            }
        }

        public void Dispose()
        {
            stopping.Cancel();
            SettleAll();
        }
    }
}
