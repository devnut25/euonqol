import { NextFunction, Request, Response } from 'express';
import { introspectToken } from '../helpers/keycloak.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AuthUser {
  id: string; // Keycloak UUID (da user_entity, nello schema di Keycloak)
  email: string;
  username: string;
  user_type?: string; // 'admin' | 'manager' - From Keycloak token
  is_active?: boolean; // User active status from Keycloak
  roles: string[]; // Keycloak roles (realm + resource)
  firstName?: string;
  lastName?: string;
}

/**
 * Estrae i ruoli dal token introspezionato
 */
function extractRoles(tokenData: any): string[] {
  const roles: string[] = [];

  if (tokenData.realm_access?.roles) {
    roles.push(...tokenData.realm_access.roles);
  }

  if (tokenData.resource_access) {
    for (const client of Object.values(tokenData.resource_access) as any[]) {
      if (client.roles) {
        roles.push(...client.roles);
      }
    }
  }

  return roles;
}

/**
 * Middleware di autenticazione con Keycloak introspection
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token not provided',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const tokenData = await introspectToken(token);

    if (!tokenData.active) {
      return res.status(401).json({
        success: false,
        message: 'Token invalid or expired',
      });
    }

    // Extract user_type and is_active from Keycloak token
    const userType = tokenData.user_type || tokenData.attributes?.user_type?.[0];
    const isActive =
      tokenData.is_active !== undefined
        ? tokenData.is_active
        : tokenData.attributes?.is_active?.[0] === 'true';

    req.user = {
      id: tokenData.sub, // Keycloak UUID - riferisce user_entity(id), nello schema di Keycloak
      email: tokenData.email,
      username: tokenData.preferred_username || tokenData.username,
      user_type: userType,
      is_active: isActive,
      firstName: tokenData.given_name,
      lastName: tokenData.family_name,
      roles: extractRoles(tokenData),
    };

    next();
  } catch (error: any) {
    console.error('❌ Errore introspection:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Errore verifica token',
    });
  }
}

/**
 * Middleware opzionale - Non blocca se non c'è token
 */
export async function authenticateOptional(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = undefined;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const tokenData = await introspectToken(token);

    if (tokenData.active) {
      // Extract user_type and is_active from Keycloak token
      const userType = tokenData.user_type || tokenData.attributes?.user_type?.[0];
      const isActive =
        tokenData.is_active !== undefined
          ? tokenData.is_active
          : tokenData.attributes?.is_active?.[0] === 'true';

      req.user = {
        id: tokenData.sub, // Keycloak UUID - riferisce user_entity(id), nello schema di Keycloak
        email: tokenData.email,
        username: tokenData.preferred_username || tokenData.username,
        user_type: userType,
        is_active: isActive,
        firstName: tokenData.given_name,
        lastName: tokenData.family_name,
        roles: extractRoles(tokenData),
      };
    }
  } catch {
    req.user = undefined;
  }

  next();
}

/**
 * Middleware per verificare ruoli specifici
 */
export function requireRoles(...requiredRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const hasRole = requiredRoles.some((role) => req.user!.roles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      });
    }

    next();
  };
}

/**
 * PHASE 3: Middleware per verificare user_type dal token Keycloak
 * Sostituisce requireAdmin e requireAdminOrManager da roleAuth.ts
 *
 * @param allowedUserTypes - Array di user_type permessi (es. ['admin', 'manager'])
 * @example
 *   router.post('/patients', authenticate, requireUserTypes(['admin', 'manager']), createPatient);
 */
export function requireUserTypes(allowedUserTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Check if user is active
    if (req.user.is_active === false) {
      return res.status(403).json({
        success: false,
        message: 'User account is inactive',
      });
    }

    // Check if user_type is allowed
    if (!req.user.user_type || !allowedUserTypes.includes(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: allowedUserTypes,
        actual: req.user.user_type || 'none',
      });
    }

    next();
  };
}
