import axios from 'axios';
import { getAdminToken, KeycloakUser } from '../helpers/keycloak.js';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM || 'euonqol';

/**
 * DTO for the Keycloak Admin REST API — create user endpoint.
 */
export interface CreateUserPayload {
  username?: string;
  email: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
  requiredActions?: string[];
}

/**
 * DTO for the Keycloak Admin REST API — update user endpoint.
 */
export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
  requiredActions?: string[];
}

/**
 * Maps an application form payload to the Keycloak REST API create format.
 * Extracts standard fields and collects the rest as custom attributes.
 */
export function mapFormToKeycloakPayload(formData: {
  username?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  password?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  [key: string]: any;
}): CreateUserPayload {
  const { username, email, password, first_name, last_name, enabled, emailVerified, ...rest } =
    formData;

  const attributes: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== '') {
      attributes[key] = [String(value)];
    }
  }

  return {
    username,
    email,
    password,
    first_name,
    last_name,
    enabled: enabled ?? true,
    emailVerified: emailVerified ?? false,
    attributes,
  };
}

/**
 * Keycloak Admin REST API wrapper for user CRUD operations.
 * Includes a 55-second admin token cache to avoid redundant token requests.
 */
export class KeycloakUserModel {
  private static tokenCache: { token: string; expiresAt: number } | null = null;

  private static randomSuffix(length = 4): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private static async getToken(): Promise<string> {
    const now = Date.now();
    if (KeycloakUserModel.tokenCache && now < KeycloakUserModel.tokenCache.expiresAt) {
      return KeycloakUserModel.tokenCache.token;
    }
    const token = await getAdminToken();
    KeycloakUserModel.tokenCache = { token, expiresAt: now + 55_000 };
    return token;
  }

  static async create(
    payload: CreateUserPayload
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
      const adminToken = await KeycloakUserModel.getToken();

      const emailLocalPart = payload.email?.split('@')[0] || '';
      const baseUsername =
        emailLocalPart || `${payload.first_name ?? ''}-${payload.last_name ?? ''}`;
      const randomSuffix = KeycloakUserModel.randomSuffix(4);

      const normalizedUsername =
        `${baseUsername}-${randomSuffix}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9._\-@]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') || `user-${randomSuffix}`;

      const response = await axios.post(
        `${KEYCLOAK_URL}/admin/realms/${REALM}/users`,
        {
          username: normalizedUsername,
          email: payload.email,
          firstName: payload.first_name,
          lastName: payload.last_name,
          enabled: payload.enabled ?? true,
          emailVerified: true,
          attributes: payload.attributes || {},
          credentials: [
            {
              type: 'password',
              value: payload.password,
              temporary: true,
            },
          ],
          requiredActions: ['UPDATE_PASSWORD'],
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const locationHeader = response.headers['location'];
      const userId = locationHeader?.split('/').pop();

      return { success: true, userId };
    } catch (error: any) {
      console.error('❌ Error creating user:', error.response?.data);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Error during creation',
      };
    }
  }

  static async update(
    userId: string,
    payload: UpdateUserPayload
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const adminToken = await KeycloakUserModel.getToken();

      const existingUser = await KeycloakUserModel.findById(userId);

      if (!existingUser) {
        return { success: false, error: 'User not found' };
      }

      const mergedAttributes = {
        ...existingUser.attributes,
        ...payload.attributes,
      };

      await axios.put(
        `${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}`,
        {
          ...existingUser,
          firstName: payload.firstName ?? existingUser.firstName,
          lastName: payload.lastName ?? existingUser.lastName,
          email: payload.email ?? existingUser.email,
          enabled: payload.enabled ?? existingUser.enabled,
          emailVerified: payload.emailVerified ?? existingUser.emailVerified,
          attributes: mergedAttributes,
          requiredActions: payload.requiredActions ?? existingUser.requiredActions,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating user:', error.response?.data);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Error during update',
      };
    }
  }

  static async delete(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const adminToken = await KeycloakUserModel.getToken();

      await axios.delete(`${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting user:', error.response?.data);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Error during deletion',
      };
    }
  }

  static async findById(userId: string): Promise<KeycloakUser | null> {
    try {
      const adminToken = await KeycloakUserModel.getToken();

      const response = await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/users/${userId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      return response.data;
    } catch (error: any) {
      console.error('❌ Error retrieving user:', error.response?.data);
      return null;
    }
  }

  static async findByUsername(username: string): Promise<KeycloakUser | null> {
    try {
      const adminToken = await KeycloakUserModel.getToken();

      const response = await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
        params: { username, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      return response.data.length > 0 ? response.data[0] : null;
    } catch (error: any) {
      console.error('❌ Error retrieving user by username:', error.response?.data);
      return null;
    }
  }

  static async findByEmail(email: string): Promise<KeycloakUser | null> {
    try {
      const adminToken = await KeycloakUserModel.getToken();

      const response = await axios.get(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      return response.data.length > 0 ? response.data[0] : null;
    } catch (error: any) {
      console.error('❌ Error retrieving user by email:', error.response?.data);
      return null;
    }
  }
}
