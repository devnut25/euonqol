import axios from 'axios';
import { Request } from 'express';

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;
const ENV = process.env.NODE_ENV || 'development';
const TEAMS_NOTIFICATIONS_ENABLED = process.env.TEAMS_NOTIFICATIONS_ENABLED !== 'false';

interface AdaptiveCard {
  type: string;
  attachments: Array<{
    contentType: string;
    content: {
      $schema?: string;
      type: string;
      version: string;
      body: Array<any>;
      msteams?: {
        width: string;
      };
    };
  }>;
}

export async function sendErrorToTeams(error: Error, req?: Request): Promise<void> {
  if (!TEAMS_NOTIFICATIONS_ENABLED || ENV === 'development' || !TEAMS_WEBHOOK_URL) {
    return;
  }

  const endpoint = req
    ? `${req.method} ${(req as any).originalUrl || req.path}`
    : 'N/A';

  const message: AdaptiveCard = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        msteams: {
          width: "Full"
        },
        body: [
          {
            type: "Container",
            style: "attention",
            items: [
              {
                type: "TextBlock",
                text: "🚨 Errore rilevato",
                weight: "Bolder",
                size: "Large",
                color: "Attention",
                wrap: true
              }
            ]
          },
          {
            type: "Container",
            spacing: "Medium",
            separator: true,
            items: [
              {
                type: "TextBlock",
                text: "**Stack Trace:**",
                weight: "Bolder",
                size: "Medium",
                wrap: true
              },
              {
                type: "TextBlock",
                text: error.stack?.substring(0, 1000) || 'N/A',
                wrap: true,
                isSubtle: true,
                size: "Small",
                spacing: "Small",
                fontType: "Monospace"
              }
            ]
          },
          {
            type: "FactSet",
            separator: true,
            spacing: "Medium",
            facts: [
              {
                title: "Endpoint:",
                value: endpoint
              },
              {
                title: "Tipo errore:",
                value: error.name || 'Error'
              },
              {
                title: "Timestamp:",
                value: new Date().toLocaleString('it-IT', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              }
            ]
          }
        ]
      }
    }]
  };

  try {
    await axios.post(TEAMS_WEBHOOK_URL, message, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
  } catch (err) {
    console.error('Errore invio notifica a Teams:', err);
  }
}