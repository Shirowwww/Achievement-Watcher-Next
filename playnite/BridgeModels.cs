using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;

namespace AwNext.Playnite
{
    /// <summary>
    /// What AW Next is asked about one game. Every field helps and none is required; AW Next tries
    /// them from the strongest (the exe it knows) to the weakest (the exact title).
    /// </summary>
    public class BridgeQuestion
    {
        public int Id { get; set; }
        public string Exe { get; set; } = string.Empty;
        public string LaunchOptions { get; set; } = string.Empty;
        public string SteamAppId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    public class BridgeProgress
    {
        public double Current { get; set; }
        public double Max { get; set; }
    }

    public class BridgeAchievement
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string Icon { get; set; }
        public string IconLocked { get; set; }
        public bool Hidden { get; set; }
        public bool Unlocked { get; set; }
        public long UnlockedAt { get; set; }
        public double? Rarity { get; set; }
        public BridgeProgress Progress { get; set; }
    }

    public class BridgeGame
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public int Total { get; set; }
        public int Unlocked { get; set; }
        public List<BridgeAchievement> Achievements { get; set; } = new List<BridgeAchievement>();
    }

    public class BridgeReply
    {
        public int? Id { get; set; }
        public bool Found { get; set; }
        public BridgeGame Game { get; set; }
    }

    /// <summary>One line of AW Next's local feed, once sorted: a reply, an unlock, or nothing for us.</summary>
    public class FeedMessage
    {
        public BridgeReply Reply { get; private set; }

        /// <summary>The AW Next game id an unlock or a progress step was announced for.</summary>
        public string UnlockedGameId { get; private set; }

        public static FeedMessage FromReply(BridgeReply reply) => new FeedMessage { Reply = reply };

        public static FeedMessage Unlock(string gameId) => new FeedMessage { UnlockedGameId = gameId };
    }

    /// <summary>
    /// The feed's JSON, read by hand from .NET's own parser: Playnite's serializer only exists once
    /// Playnite has started, and a reply's fields are loose (an id is a number or a string).
    /// </summary>
    public static class BridgeProtocol
    {
        public const string Command = "bridge-game";
        private const int MaxJsonLength = 8 * 1024 * 1024;

        public static string ToJson(BridgeQuestion question)
        {
            var body = new Dictionary<string, object>
            {
                ["cmd"] = Command,
                ["id"] = question.Id,
                ["exe"] = question.Exe ?? string.Empty,
                ["launchOptions"] = question.LaunchOptions ?? string.Empty,
                ["steamAppId"] = question.SteamAppId ?? string.Empty,
                ["name"] = question.Name ?? string.Empty,
            };
            return Parser().Serialize(body);
        }

        /// <summary>
        /// Sorts one feed line the way the Millennium plugin does (millennium/frontend/achievements.ts):
        /// a bridge reply, or an unlock or progress step for a game. Settings' test buttons are rehearsals.
        /// </summary>
        public static FeedMessage Read(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw) || raw.Length > MaxJsonLength)
            {
                return null;
            }

            IDictionary<string, object> message;
            try
            {
                message = Parser().DeserializeObject(raw) as IDictionary<string, object>;
            }
            catch (Exception e) when (e is ArgumentException || e is InvalidOperationException)
            {
                return null;
            }

            if (message == null)
            {
                return null;
            }

            if (Text(message, "cmd") == Command)
            {
                return FeedMessage.FromReply(ReadReply(message));
            }

            var appId = Text(message, "appID");
            if (Flag(message, "test") || appId.Length == 0 || !(Get(message, "achievement") is string))
            {
                return null;
            }

            var type = Text(message, "notificationType");
            if (type.Length == 0)
            {
                type = Get(message, "progress") != null ? "progress" : "achievement";
            }

            return type == "achievement" || type == "progress" ? FeedMessage.Unlock(appId) : null;
        }

        private static BridgeReply ReadReply(IDictionary<string, object> message)
        {
            var id = Number(message, "id");
            // Our ids are small whole numbers; anything else is not an answer to a question asked here.
            var ours = id.HasValue && id.Value >= 0 && id.Value <= int.MaxValue && Math.Floor(id.Value) == id.Value;
            var reply = new BridgeReply { Id = ours ? (int?)Convert.ToInt32(id.Value) : null, Found = Flag(message, "found") };
            if (reply.Found && Get(message, "game") is IDictionary<string, object> game)
            {
                reply.Game = new BridgeGame
                {
                    Id = Text(game, "id"),
                    Name = Text(game, "name"),
                    Total = (int)(Number(game, "total") ?? 0),
                    Unlocked = (int)(Number(game, "unlocked") ?? 0),
                    Achievements = ((Get(game, "achievements") as IEnumerable)?.OfType<IDictionary<string, object>>() ?? Enumerable.Empty<IDictionary<string, object>>())
                        .Select(ReadAchievement)
                        .ToList(),
                };
            }

            return reply;
        }

        private static BridgeAchievement ReadAchievement(IDictionary<string, object> item)
        {
            var progress = Get(item, "progress") as IDictionary<string, object>;
            return new BridgeAchievement
            {
                Id = Text(item, "id"),
                Name = Text(item, "name"),
                Description = Text(item, "description"),
                Icon = Text(item, "icon"),
                IconLocked = Text(item, "iconLocked"),
                Hidden = Flag(item, "hidden"),
                Unlocked = Flag(item, "unlocked"),
                UnlockedAt = (long)(Number(item, "unlockedAt") ?? 0),
                Rarity = Number(item, "rarity"),
                Progress = progress == null ? null : new BridgeProgress { Current = Number(progress, "current") ?? 0, Max = Number(progress, "max") ?? 0 },
            };
        }

        private static JavaScriptSerializer Parser() => new JavaScriptSerializer { MaxJsonLength = MaxJsonLength };

        private static object Get(IDictionary<string, object> map, string key) => map.TryGetValue(key, out var value) ? value : null;

        private static string Text(IDictionary<string, object> map, string key)
        {
            var value = Get(map, key);
            return value is string || value is int || value is long || value is decimal || value is double ? Convert.ToString(value, CultureInfo.InvariantCulture) : string.Empty;
        }

        private static bool Flag(IDictionary<string, object> map, string key) => Get(map, key) is bool value && value;

        private static double? Number(IDictionary<string, object> map, string key)
        {
            var value = Get(map, key);
            return value is int || value is long || value is decimal || value is double ? (double?)Convert.ToDouble(value, CultureInfo.InvariantCulture) : null;
        }
    }
}
