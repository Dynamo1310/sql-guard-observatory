using AdaptiveCards;
using Microsoft.Bot.Schema;
using SQLNovaTeamsBot.Services;
using System.Text.Json;

namespace SQLNovaTeamsBot.Cards;

/// <summary>
/// Factory para crear Adaptive Cards del bot
/// </summary>
public static class AdaptiveCardFactory
{
    private const string AppUrl = "http://asprbm-nov-01:8080";

    /// <summary>
    /// Crea la tarjeta de bienvenida
    /// </summary>
    public static Attachment CreateWelcomeCard()
    {
        var card = new AdaptiveCard(new AdaptiveSchemaVersion(1, 4))
        {
            Body = new List<AdaptiveElement>
            {
                new AdaptiveTextBlock
                {
                    Text = "🤖 SQL Nova Bot",
                    Weight = AdaptiveTextWeight.Bolder,
                    Size = AdaptiveTextSize.Large
                },
                new AdaptiveTextBlock
                {
                    Text = "¡Hola! Soy el bot de SQL Nova. Puedo ayudarte a consultar el estado de los servidores SQL.",
                    Wrap = true
                },
                new AdaptiveTextBlock
                {
                    Text = "**Comandos disponibles:**",
                    Weight = AdaptiveTextWeight.Bolder,
                    Spacing = AdaptiveSpacing.Medium
                },
                new AdaptiveFactSet
                {
                    Facts = new List<AdaptiveFact>
                    {
                        new("estado", "Ver resumen general"),
                        new("estado [nombre]", "Ver instancia específica"),
                        new("alertas", "Ver alertas activas"),
                        new("guardia", "Ver quién está de guardia"),
                        new("ayuda", "Mostrar esta ayuda")
                    }
                }
            },
            Actions = new List<AdaptiveAction>
            {
                new AdaptiveOpenUrlAction
                {
                    Title = "Abrir SQL Nova",
                    Url = new Uri(AppUrl)
                }
            }
        };

        return CreateAttachment(card);
    }

    /// <summary>
    /// Crea la tarjeta de ayuda
    /// </summary>
    public static Attachment CreateHelpCard()
    {
        var card = new AdaptiveCard(new AdaptiveSchemaVersion(1, 4))
        {
            Body = new List<AdaptiveElement>
            {
                new AdaptiveTextBlock
                {
                    Text = "❓ Ayuda - SQL Nova Bot",
                    Weight = AdaptiveTextWeight.Bolder,
                    Size = AdaptiveTextSize.Large
                },
                new AdaptiveTextBlock
                {
                    Text = "Comandos disponibles:",
                    Weight = AdaptiveTextWeight.Bolder,
                    Spacing = AdaptiveSpacing.Medium
                },
                new AdaptiveRichTextBlock
                {
                    Inlines = new List<AdaptiveInline>
                    {
                        new AdaptiveTextRun { Text = "📊 ", Size = AdaptiveTextSize.Default },
                        new AdaptiveTextRun { Text = "estado", Weight = AdaptiveTextWeight.Bolder },
                        new AdaptiveTextRun { Text = " - Ver resumen general de instancias" }
                    }
                },
                new AdaptiveRichTextBlock
                {
                    Inlines = new List<AdaptiveInline>
                    {
                        new AdaptiveTextRun { Text = "📊 ", Size = AdaptiveTextSize.Default },
                        new AdaptiveTextRun { Text = "estado [nombre]", Weight = AdaptiveTextWeight.Bolder },
                        new AdaptiveTextRun { Text = " - Ver instancia específica" }
                    }
                },
                new AdaptiveRichTextBlock
                {
                    Inlines = new List<AdaptiveInline>
                    {
                        new AdaptiveTextRun { Text = "⚠️ ", Size = AdaptiveTextSize.Default },
                        new AdaptiveTextRun { Text = "alertas", Weight = AdaptiveTextWeight.Bolder },
                        new AdaptiveTextRun { Text = " - Ver alertas e incidentes activos" }
                    }
                },
                new AdaptiveRichTextBlock
                {
                    Inlines = new List<AdaptiveInline>
                    {
                        new AdaptiveTextRun { Text = "📅 ", Size = AdaptiveTextSize.Default },
                        new AdaptiveTextRun { Text = "guardia", Weight = AdaptiveTextWeight.Bolder },
                        new AdaptiveTextRun { Text = " - Ver operador de guardia actual" }
                    }
                },
                new AdaptiveRichTextBlock
                {
                    Inlines = new List<AdaptiveInline>
                    {
                        new AdaptiveTextRun { Text = "❓ ", Size = AdaptiveTextSize.Default },
                        new AdaptiveTextRun { Text = "ayuda", Weight = AdaptiveTextWeight.Bolder },
                        new AdaptiveTextRun { Text = " - Mostrar esta ayuda" }
                    }
                }
            },
            Actions = new List<AdaptiveAction>
            {
                new AdaptiveOpenUrlAction
                {
                    Title = "Abrir SQL Nova",
                    Url = new Uri(AppUrl)
                }
            }
        };

        return CreateAttachment(card);
    }

    /// <summary>
    /// Crea la tarjeta de resumen de estado
    /// </summary>
    public static Attachment CreateStatusSummaryCard(HealthSummaryResponse summary)
    {
        var criticalColor = summary.CriticalCount > 0 ? AdaptiveTextColor.Attention : AdaptiveTextColor.Default;
        var warningColor = summary.WarningCount > 0 ? AdaptiveTextColor.Warning : AdaptiveTextColor.Default;

        var card = new AdaptiveCard(new AdaptiveSchemaVersion(1, 4))
        {
            Body = new List<AdaptiveElement>
            {
                new AdaptiveTextBlock
                {
                    Text = "📊 Estado General de SQL Servers",
                    Weight = AdaptiveTextWeight.Bolder,
                    Size = AdaptiveTextSize.Large
                },
                new AdaptiveColumnSet
                {
                    Columns = new List<AdaptiveColumn>
                    {
                        new AdaptiveColumn
                        {
                            Width = "auto",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock { Text = "🟢", Size = AdaptiveTextSize.Large },
                                new AdaptiveTextBlock { Text = "Saludables", Size = AdaptiveTextSize.Small, IsSubtle = true }
                            }
                        },
                        new AdaptiveColumn
                        {
                            Width = "auto",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock 
                                { 
                                    Text = summary.HealthyCount.ToString(), 
                                    Size = AdaptiveTextSize.ExtraLarge,
                                    Weight = AdaptiveTextWeight.Bolder,
                                    Color = AdaptiveTextColor.Good
                                }
                            }
                        },
                        new AdaptiveColumn
                        {
                            Width = "auto",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock { Text = "🟡", Size = AdaptiveTextSize.Large },
                                new AdaptiveTextBlock { Text = "Warning", Size = AdaptiveTextSize.Small, IsSubtle = true }
                            }
                        },
                        new AdaptiveColumn
                        {
                            Width = "auto",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock 
                                { 
                                    Text = summary.WarningCount.ToString(), 
                                    Size = AdaptiveTextSize.ExtraLarge,
                                    Weight = AdaptiveTextWeight.Bolder,
                                    Color = warningColor
                                }
                            }
                        },
                        new AdaptiveColumn
                        {
                            Width = "auto",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock { Text = "🔴", Size = AdaptiveTextSize.Large },
                                new AdaptiveTextBlock { Text = "Críticos", Size = AdaptiveTextSize.Small, IsSubtle = true }
                            }
                        },
                        new AdaptiveColumn
                        {
                            Width = "auto",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock 
                                { 
                                    Text = summary.CriticalCount.ToString(), 
                                    Size = AdaptiveTextSize.ExtraLarge,
                                    Weight = AdaptiveTextWeight.Bolder,
                                    Color = criticalColor
                                }
                            }
                        }
                    }
                },
                new AdaptiveFactSet
                {
                    Facts = new List<AdaptiveFact>
                    {
                        new("Total Instancias", summary.TotalInstances.ToString()),
                        new("Score Promedio", $"{summary.AvgScore}/100"),
                        new("Última Actualización", summary.LastUpdate?.ToLocalTime().ToString("dd/MM/yyyy HH:mm") ?? "N/A")
                    }
                }
            },
            Actions = new List<AdaptiveAction>
            {
                new AdaptiveOpenUrlAction
                {
                    Title = "Ver Detalles",
                    Url = new Uri($"{AppUrl}/health-score")
                }
            }
        };

        return CreateAttachment(card);
    }

    /// <summary>
    /// Crea la tarjeta de estado de una instancia
    /// </summary>
    public static Attachment CreateInstanceStatusCard(HealthScoreItem instance)
    {
        var emoji = instance.HealthScore >= 70 ? "🟢" : instance.HealthScore >= 50 ? "🟡" : "🔴";
        var color = instance.HealthScore >= 70 ? AdaptiveTextColor.Good : 
                    instance.HealthScore >= 50 ? AdaptiveTextColor.Warning : AdaptiveTextColor.Attention;

        var card = new AdaptiveCard(new AdaptiveSchemaVersion(1, 4))
        {
            Body = new List<AdaptiveElement>
            {
                new AdaptiveTextBlock
                {
                    Text = $"{emoji} {instance.InstanceName}",
                    Weight = AdaptiveTextWeight.Bolder,
                    Size = AdaptiveTextSize.Large
                },
                new AdaptiveColumnSet
                {
                    Columns = new List<AdaptiveColumn>
                    {
                        new AdaptiveColumn
                        {
                            Width = "stretch",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock
                                {
                                    Text = "Health Score",
                                    IsSubtle = true
                                },
                                new AdaptiveTextBlock
                                {
                                    Text = $"{instance.HealthScore}/100",
                                    Size = AdaptiveTextSize.ExtraLarge,
                                    Weight = AdaptiveTextWeight.Bolder,
                                    Color = color
                                }
                            }
                        },
                        new AdaptiveColumn
                        {
                            Width = "stretch",
                            Items = new List<AdaptiveElement>
                            {
                                new AdaptiveTextBlock
                                {
                                    Text = "Estado",
                                    IsSubtle = true
                                },
                                new AdaptiveTextBlock
                                {
                                    Text = instance.HealthStatus,
                                    Size = AdaptiveTextSize.Medium,
                                    Weight = AdaptiveTextWeight.Bolder
                                }
                            }
                        }
                    }
                },
                new AdaptiveFactSet
                {
                    Facts = new List<AdaptiveFact>
                    {
                        new("Ambiente", instance.Ambiente ?? "N/A"),
                        new("Hosting", instance.HostingSite ?? "N/A"),
                        new("Última Actualización", instance.GeneratedAtUtc.ToLocalTime().ToString("dd/MM/yyyy HH:mm"))
                    }
                }
            },
            Actions = new List<AdaptiveAction>
            {
                new AdaptiveOpenUrlAction
                {
                    Title = "Ver Detalles",
                    Url = new Uri($"{AppUrl}/health-score")
                }
            }
        };

        return CreateAttachment(card);
    }

    /// <summary>
    /// Crea la tarjeta de alertas
    /// </summary>
    public static Attachment CreateAlertsCard(List<AlertItem> alerts)
    {
        var criticalAlerts = alerts.Where(a => a.HealthScore < 50).ToList();
        var warningAlerts = alerts.Where(a => a.HealthScore >= 50 && a.HealthScore < 70).ToList();

        var bodyElements = new List<AdaptiveElement>
        {
            new AdaptiveTextBlock
            {
                Text = "⚠️ Alertas Activas",
                Weight = AdaptiveTextWeight.Bolder,
                Size = AdaptiveTextSize.Large
            }
        };

        if (criticalAlerts.Any())
        {
            bodyElements.Add(new AdaptiveTextBlock
            {
                Text = "🔴 Críticas",
                Weight = AdaptiveTextWeight.Bolder,
                Color = AdaptiveTextColor.Attention,
                Spacing = AdaptiveSpacing.Medium
            });

            foreach (var alert in criticalAlerts.Take(5))
            {
                bodyElements.Add(new AdaptiveTextBlock
                {
                    Text = $"• **{alert.InstanceName}**: {alert.HealthScore}/100",
                    Wrap = true
                });
            }
        }

        if (warningAlerts.Any())
        {
            bodyElements.Add(new AdaptiveTextBlock
            {
                Text = "🟡 Advertencias",
                Weight = AdaptiveTextWeight.Bolder,
                Color = AdaptiveTextColor.Warning,
                Spacing = AdaptiveSpacing.Medium
            });

            foreach (var alert in warningAlerts.Take(5))
            {
                bodyElements.Add(new AdaptiveTextBlock
                {
                    Text = $"• **{alert.InstanceName}**: {alert.HealthScore}/100",
                    Wrap = true
                });
            }
        }

        var card = new AdaptiveCard(new AdaptiveSchemaVersion(1, 4))
        {
            Body = bodyElements,
            Actions = new List<AdaptiveAction>
            {
                new AdaptiveOpenUrlAction
                {
                    Title = "Ver Todas las Alertas",
                    Url = new Uri($"{AppUrl}/health-score")
                }
            }
        };

        return CreateAttachment(card);
    }

    /// <summary>
    /// Crea la tarjeta de guardia actual
    /// </summary>
    public static Attachment CreateOnCallCard(OnCallResponse onCall)
    {
        var bodyElements = new List<AdaptiveElement>
        {
            new AdaptiveTextBlock
            {
                Text = "📅 Guardia DBA Actual",
                Weight = AdaptiveTextWeight.Bolder,
                Size = AdaptiveTextSize.Large
            }
        };

        if (onCall.IsCurrentlyOnCall)
        {
            bodyElements.Add(new AdaptiveTextBlock
            {
                Text = $"👤 **{onCall.DisplayName}**",
                Size = AdaptiveTextSize.Medium,
                Spacing = AdaptiveSpacing.Medium
            });

            bodyElements.Add(new AdaptiveFactSet
            {
                Facts = new List<AdaptiveFact>
                {
                    new("Email", onCall.Email ?? "N/A"),
                    new("Desde", onCall.WeekStartDate.ToString("dddd dd/MM HH:mm")),
                    new("Hasta", onCall.WeekEndDate.ToString("dddd dd/MM HH:mm"))
                }
            });

            if (onCall.EscalationUsers?.Any() == true)
            {
                bodyElements.Add(new AdaptiveTextBlock
                {
                    Text = "🚨 Escalamiento",
                    Weight = AdaptiveTextWeight.Bolder,
                    Spacing = AdaptiveSpacing.Medium
                });

                foreach (var esc in onCall.EscalationUsers.Take(3))
                {
                    bodyElements.Add(new AdaptiveTextBlock
                    {
                        Text = $"{esc.Order}. {esc.DisplayName}",
                        Spacing = AdaptiveSpacing.None
                    });
                }
            }
        }
        else
        {
            bodyElements.Add(new AdaptiveTextBlock
            {
                Text = "⚠️ No hay guardia asignada actualmente",
                Color = AdaptiveTextColor.Warning
            });
        }

        var card = new AdaptiveCard(new AdaptiveSchemaVersion(1, 4))
        {
            Body = bodyElements,
            Actions = new List<AdaptiveAction>
            {
                new AdaptiveOpenUrlAction
                {
                    Title = "Ver Calendario",
                    Url = new Uri($"{AppUrl}/oncall")
                }
            }
        };

        return CreateAttachment(card);
    }

    /// <summary>
    /// Crea un Attachment a partir de una AdaptiveCard
    /// </summary>
    private static Attachment CreateAttachment(AdaptiveCard card)
    {
        return new Attachment
        {
            ContentType = AdaptiveCard.ContentType,
            Content = card
        };
    }
}






