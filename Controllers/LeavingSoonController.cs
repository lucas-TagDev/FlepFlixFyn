using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JMSFusion.Controllers
{
    /// <summary>
    /// "Saindo do catálogo": seções da página inicial com títulos escolhidos pelo admin.
    /// Os dados ficam na configuração do plugin, então valem para todos os usuários.
    /// </summary>
    [ApiController]
    [Route("JMSFusion/leaving-soon")]
    [Route("Plugins/JMSFusion/leaving-soon")]
    public class LeavingSoonController : ControllerBase
    {
        private const int MaxSections = 12;
        private const int MaxItemsPerSection = 150;
        private const int MaxMessages = 30;
        private const int MaxTextLength = 120;

        private static readonly string[] DefaultMessages =
        {
            "Última semana para aproveitar",
            "Vai nos deixar em breve",
            "Últimos dias no catálogo",
            "Assista antes que saia"
        };

        private readonly IUserManager _users;

        public LeavingSoonController(IUserManager users)
        {
            _users = users;
        }

        [HttpGet]
        public IActionResult Get()
        {
            var plugin = JMSFusionPlugin.Instance ?? throw new InvalidOperationException("Plugin not available.");
            var cfg = plugin.Configuration;
            var settings = EnsureDefaults(cfg.LeavingSoon);

            NoCache();
            return Ok(new { ok = true, settings });
        }

        [HttpPost]
        [Authorize(Policy = "RequiresElevation")]
        public IActionResult Save([FromBody] LeavingSoonSettings? request)
        {
            var adminCheck = TryGetAdminUser();
            if (adminCheck.Result is not null)
            {
                return adminCheck.Result;
            }

            if (request is null)
            {
                return BadRequest(new { ok = false, error = "Dados inválidos." });
            }

            var plugin = JMSFusionPlugin.Instance ?? throw new InvalidOperationException("Plugin not available.");
            var cfg = plugin.Configuration;
            var settings = Sanitize(request);
            settings.Initialized = true;
            settings.UpdatedAtUtc = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            cfg.LeavingSoon = settings;
            plugin.UpdateConfiguration(cfg);

            NoCache();
            return Ok(new { ok = true, settings });
        }

        private static LeavingSoonSettings EnsureDefaults(LeavingSoonSettings? source)
        {
            var settings = source ?? new LeavingSoonSettings();
            settings.Messages ??= new();
            settings.Sections ??= new();

            if (settings.Initialized)
            {
                return settings;
            }

            // Primeira vez: devolve um modelo inicial (não é salvo até o admin salvar).
            return new LeavingSoonSettings
            {
                Initialized = false,
                Messages = DefaultMessages.ToList(),
                Sections = new List<LeavingSoonSection>
                {
                    new() { Id = "movies", Title = "Filmes saindo do catálogo", ItemTypes = "Movie", Enabled = true },
                    new() { Id = "series", Title = "Séries saindo do catálogo", ItemTypes = "Series", Enabled = true }
                }
            };
        }

        private static LeavingSoonSettings Sanitize(LeavingSoonSettings request)
        {
            var messages = (request.Messages ?? new())
                .Select(CleanText)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(MaxMessages)
                .ToList();

            var usedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var sections = new List<LeavingSoonSection>();
            foreach (var section in (request.Sections ?? new()).Take(MaxSections))
            {
                if (section is null)
                {
                    continue;
                }

                var id = CleanId(section.Id);
                if (string.IsNullOrWhiteSpace(id) || usedIds.Contains(id))
                {
                    id = "s" + Guid.NewGuid().ToString("N")[..8];
                }
                usedIds.Add(id);

                var usedItems = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var items = new List<LeavingSoonItem>();
                foreach (var item in (section.Items ?? new()))
                {
                    var itemId = CleanId(item?.ItemId);
                    if (item is null || string.IsNullOrWhiteSpace(itemId) || !usedItems.Add(itemId))
                    {
                        continue;
                    }

                    items.Add(new LeavingSoonItem
                    {
                        ItemId = itemId,
                        Name = CleanText(item.Name),
                        Type = CleanText(item.Type),
                        Year = item.Year is > 1800 and < 3000 ? item.Year : null,
                        Message = NullIfEmpty(CleanText(item.Message)),
                        LeaveDate = CleanDate(item.LeaveDate)
                    });

                    if (items.Count >= MaxItemsPerSection)
                    {
                        break;
                    }
                }

                sections.Add(new LeavingSoonSection
                {
                    Id = id,
                    Title = string.IsNullOrWhiteSpace(CleanText(section.Title)) ? "Saindo do catálogo" : CleanText(section.Title),
                    ItemTypes = CleanItemTypes(section.ItemTypes),
                    Enabled = section.Enabled,
                    Items = items
                });
            }

            return new LeavingSoonSettings { Messages = messages, Sections = sections };
        }

        private static string CleanText(string? value)
        {
            var text = string.Join(" ", (value ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
            return text.Length > MaxTextLength ? text[..MaxTextLength] : text;
        }

        private static string? NullIfEmpty(string value) => string.IsNullOrWhiteSpace(value) ? null : value;

        private static string CleanId(string? value)
        {
            var raw = (value ?? string.Empty).Trim();
            var clean = new string(raw.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
            return clean.Length > 64 ? clean[..64] : clean;
        }

        private static string? CleanDate(string? value)
        {
            var raw = (value ?? string.Empty).Trim();
            return DateTime.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                : null;
        }

        private static string CleanItemTypes(string? value)
        {
            var types = (value ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(t => t.Equals("Movie", StringComparison.OrdinalIgnoreCase) || t.Equals("Series", StringComparison.OrdinalIgnoreCase))
                .Select(t => t.Equals("Movie", StringComparison.OrdinalIgnoreCase) ? "Movie" : "Series")
                .Distinct()
                .ToList();
            return types.Count == 0 ? "Movie,Series" : string.Join(",", types);
        }

        private (User? User, Guid UserId, IActionResult? Result) TryGetAdminUser()
        {
            var userIdHeader =
                Request.Headers["X-Emby-UserId"].FirstOrDefault() ??
                Request.Headers["X-MediaBrowser-UserId"].FirstOrDefault();

            if (!Guid.TryParse(userIdHeader, out var userId) || userId == Guid.Empty)
            {
                return (null, Guid.Empty, Unauthorized(new { ok = false, error = "X-Emby-UserId gerekli." }));
            }

            var user = _users.GetUserById(userId);
            if (user is null)
            {
                return (null, Guid.Empty, Unauthorized(new { ok = false, error = "Usuário não encontrado." }));
            }

            var isAdmin = user.Permissions.Any(permission =>
                permission.Kind == PermissionKind.IsAdministrator && permission.Value);
            if (!isAdmin)
            {
                return (null, Guid.Empty, StatusCode(403, new { ok = false, error = "Apenas administradores podem alterar esta seção." }));
            }

            return (user, userId, null);
        }

        private void NoCache()
        {
            Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
            Response.Headers["Pragma"] = "no-cache";
            Response.Headers["Expires"] = "0";
        }
    }
}
