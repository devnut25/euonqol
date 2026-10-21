import { NextFunction, Request, Response } from 'express';
import { Resource } from '../resources/baseResource.js';
import { AppSettingsKeys, AppSettingsService } from '../services/AppSettingsService.js';
import { createEmailProvider, resolveEmailConfig, ResolvedEmailConfig } from '../services/email/email.js';
import catService from '../services/cat/catService.js';

const VALID_EMAIL_PROVIDERS = ['smtp', 'mailpit', 'resend'];

/**
 * GET /euonqol-api/settings/email
 * Returns the current outgoing-email config. Secrets (SMTP password, Resend API key)
 * are never returned — only whether one is currently set.
 */
export async function getEmailSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const [provider, from, host, port, secure, user, hasPassword, hasResendApiKey] = await Promise.all([
      AppSettingsService.get(AppSettingsKeys.EMAIL_PROVIDER),
      AppSettingsService.get(AppSettingsKeys.EMAIL_FROM),
      AppSettingsService.get(AppSettingsKeys.EMAIL_HOST),
      AppSettingsService.get(AppSettingsKeys.EMAIL_PORT),
      AppSettingsService.get(AppSettingsKeys.EMAIL_SECURE),
      AppSettingsService.get(AppSettingsKeys.EMAIL_USER),
      AppSettingsService.has(AppSettingsKeys.EMAIL_PASSWORD),
      AppSettingsService.has(AppSettingsKeys.EMAIL_RESEND_API_KEY),
    ]);

    return res.json(
      Resource.respond(
        {
          provider: provider || process.env.EMAIL_PROVIDER || 'smtp',
          from: from || process.env.EMAIL_FROM || 'noreply@euonqol.com',
          host: host || process.env.EMAIL_HOST || 'localhost',
          port: port ? parseInt(port, 10) : parseInt(process.env.EMAIL_PORT || '1025', 10),
          secure: (secure ?? process.env.EMAIL_SECURE) === 'true',
          user: user || process.env.EMAIL_USER || null,
          // A password/key set only via env (e.g. at install time, before anything was
          // ever saved through this UI) is genuinely in use — report it as configured
          // rather than falsely showing "not configured" just because app_settings is empty.
          hasPassword: hasPassword || !!process.env.EMAIL_PASSWORD,
          hasResendApiKey: hasResendApiKey || !!process.env.RESEND_API_KEY,
        },
        'Email settings retrieved successfully'
      )
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /euonqol-api/settings/email
 * Updates the outgoing-email config. `password`/`resendApiKey` are optional — omitting
 * them (or sending an empty string) keeps the currently stored secret unchanged.
 */
export async function updateEmailSettings(req: Request, res: Response, next: NextFunction) {
  const { provider, from, host, port, secure, user, password, resendApiKey } = req.body;

  if (!provider || !VALID_EMAIL_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      success: false,
      message: `provider must be one of: ${VALID_EMAIL_PROVIDERS.join(', ')}`,
    });
  }
  if (!from) {
    return res.status(400).json({ success: false, message: 'from is required' });
  }
  if (port !== undefined && port !== null && port !== '') {
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ success: false, message: 'port must be an integer between 1 and 65535' });
    }
  }
  if (provider === 'resend') {
    const hasResendKey =
      !!resendApiKey ||
      (await AppSettingsService.has(AppSettingsKeys.EMAIL_RESEND_API_KEY)) ||
      !!process.env.RESEND_API_KEY;
    if (!hasResendKey) {
      return res.status(400).json({ success: false, message: 'resendApiKey is required for the Resend provider' });
    }
  } else if (provider === 'smtp' && !host) {
    return res.status(400).json({ success: false, message: 'host is required for the SMTP provider' });
  }

  try {
    const writes: { key: string; value: string | null; encrypt?: boolean }[] = [
      { key: AppSettingsKeys.EMAIL_PROVIDER, value: provider },
      { key: AppSettingsKeys.EMAIL_FROM, value: from },
      { key: AppSettingsKeys.EMAIL_HOST, value: host || null },
      { key: AppSettingsKeys.EMAIL_PORT, value: port ? String(port) : null },
      { key: AppSettingsKeys.EMAIL_SECURE, value: secure === true || secure === 'true' ? 'true' : 'false' },
      { key: AppSettingsKeys.EMAIL_USER, value: user || null },
    ];
    if (password) {
      writes.push({ key: AppSettingsKeys.EMAIL_PASSWORD, value: password, encrypt: true });
    }
    if (resendApiKey) {
      writes.push({ key: AppSettingsKeys.EMAIL_RESEND_API_KEY, value: resendApiKey, encrypt: true });
    }

    await AppSettingsService.setMany(writes, req.user?.id ?? null);

    return res.json(Resource.respond(null, 'Email settings updated successfully'));
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/settings/email/test
 * Sends a test email. If provider/host/etc are included in the body, they're used as an
 * override (so an admin can try out unsaved changes); otherwise the saved config is used.
 */
export async function sendTestEmail(req: Request, res: Response, next: NextFunction) {
  const { to, provider, from, host, port, secure, user, password, resendApiKey } = req.body;

  if (!to) {
    return res.status(400).json({ success: false, message: 'to is required' });
  }

  try {
    let config: ResolvedEmailConfig;
    if (provider) {
      const saved = await resolveEmailConfig();
      config = {
        provider,
        from: from || saved.from,
        host: host || saved.host,
        port: port ? parseInt(port, 10) : saved.port,
        secure: secure === true || secure === 'true',
        user: user || saved.user,
        password: password || saved.password,
        resendApiKey: resendApiKey || saved.resendApiKey,
      };
    } else {
      config = await resolveEmailConfig();
    }

    const emailProvider = await createEmailProvider(config);
    await emailProvider.send({
      to,
      subject: 'Test email from EUonQoL',
      html: '<p>This is a test email sent from the EUonQoL admin settings page.</p>',
    });

    return res.json(Resource.respond(null, `Test email sent to ${to}`));
  } catch (error: any) {
    const message = error?.message || 'Failed to send test email';
    return res.status(502).json({ success: false, message });
  }
}

/**
 * GET /euonqol-api/settings/cat-api
 * Returns the current CAT API config. The key itself is never returned — only whether
 * one is set and when it was last updated/is due to expire.
 */
export async function getCatApiSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const [apiUrl, hasApiKey, apiKeyUpdatedAt, apiKeyExpiresAt] = await Promise.all([
      AppSettingsService.get(AppSettingsKeys.CAT_API_URL),
      AppSettingsService.has(AppSettingsKeys.CAT_API_KEY),
      AppSettingsService.get(AppSettingsKeys.CAT_API_KEY_UPDATED_AT),
      AppSettingsService.get(AppSettingsKeys.CAT_API_KEY_EXPIRES_AT),
    ]);

    return res.json(
      Resource.respond(
        {
          apiUrl: apiUrl || process.env.CAT_API_URL || 'https://cat.eortc.org/api',
          // Same reasoning as hasPassword/hasResendApiKey in getEmailSettings — a key set
          // only via env is genuinely in use, not "not configured".
          hasApiKey: hasApiKey || !!process.env.CAT_API_KEY,
          apiKeyUpdatedAt,
          apiKeyExpiresAt,
        },
        'CAT API settings retrieved successfully'
      )
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /euonqol-api/settings/cat-api
 * Updates the CAT API config. `apiKey` is optional — omitting it (or sending an empty
 * string) keeps the currently stored key unchanged, so the URL/expiry can be edited
 * without re-entering the key.
 */
export async function updateCatApiSettings(req: Request, res: Response, next: NextFunction) {
  const { apiUrl, apiKey, apiKeyExpiresAt } = req.body;

  if (!apiUrl) {
    return res.status(400).json({ success: false, message: 'apiUrl is required' });
  }

  try {
    const writes: { key: string; value: string | null; encrypt?: boolean }[] = [
      { key: AppSettingsKeys.CAT_API_URL, value: apiUrl },
      { key: AppSettingsKeys.CAT_API_KEY_EXPIRES_AT, value: apiKeyExpiresAt || null },
    ];
    if (apiKey) {
      writes.push({ key: AppSettingsKeys.CAT_API_KEY, value: apiKey, encrypt: true });
      writes.push({ key: AppSettingsKeys.CAT_API_KEY_UPDATED_AT, value: new Date().toISOString() });
    }

    await AppSettingsService.setMany(writes, req.user?.id ?? null);

    return res.json(Resource.respond(null, 'CAT API settings updated successfully'));
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/settings/cat-api/test
 * Verifies connectivity/credentials against the CAT API. If apiUrl/apiKey are included
 * in the body, they're tested directly (so an admin can validate a new key before
 * saving it); otherwise the saved config is tested.
 */
export async function testCatApiConnection(req: Request, res: Response, next: NextFunction) {
  const { apiUrl, apiKey } = req.body;

  try {
    const version = await catService.testConnection(apiUrl || undefined, apiKey || undefined);
    return res.json(Resource.respond({ version }, 'CAT API connection successful'));
  } catch (error: any) {
    const message = error?.message || 'Failed to reach the CAT API';
    return res.status(502).json({ success: false, message });
  }
}
