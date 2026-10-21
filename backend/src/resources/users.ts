import { toBoolean } from '../helpers/utils.js';
import { UserPolicy } from '../policy/userPolicy.js';
import { Resource, ResourceOptions } from './baseResource.js';

/**
 * Base class for all User resources.
 * Centralizes policy initialization, authorizations, and shared helpers
 * so that concrete classes only implement transform().
 */
abstract class UserBaseResource extends Resource<any> {
  protected policy: UserPolicy | null = null;

  constructor(data: any, options: ResourceOptions = {}) {
    super(data, options);
    if (options.policy?.authUser) {
      this.policy = new UserPolicy(options.policy.authUser);
    }
  }

  protected getAuthorizations(): Record<string, boolean> | null {
    return this.policy?.getAuthorizations(this.data) ?? null;
  }

  protected getFullName(last?: string | null, first?: string | null): string {
    return `${last ?? ''} ${first ?? ''}`.trim() || 'N/A';
  }

  protected formatTimestamp(timestamp: bigint | number | null | undefined): string | null {
    if (timestamp == null) return null;
    const ms = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
    return new Date(ms).toISOString();
  }

  protected formatEpochSeconds(timestamp: bigint | number | null | undefined): string | null {
    if (timestamp == null) return null;
    const seconds = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
    return new Date(seconds * 1000).toISOString();
  }
}

/**
 * Minimal public representation — used in list views.
 * Data source: Prisma keycloak DB (snake_case fields).
 */
export class UserResource extends UserBaseResource {
  transform() {
    const { id, email, first_name, last_name, created_timestamp, user_attribute, latest_login_at } =
      this.data;

    return {
      id,
      email,
      first_name,
      last_name,
      full_name: this.getFullName(last_name, first_name),
      user_type: user_attribute?.find((a: any) => a.name === 'user_type')?.value ?? null,
      is_active: toBoolean(user_attribute?.find((a: any) => a.name === 'is_active')?.value ?? null),
      created_at: this.formatTimestamp(created_timestamp),
      last_access: this.formatTimestamp(latest_login_at), // event_time è epoch ms
    };
  }

  /**
   * Resolves the correct Resource class for a collection based on the requested type.
   * Equivalent to Laravel's conditional resource switching.
   */
  static resolveCollection(type: string, items: any[], options: ResourceOptions = {}): any[] {
    switch (type) {
      case 'detail':
        return UserDetailResource.collection(items, options);
      case 'admin':
        return UserAdminResource.collection(items, options);
      default:
        return UserResource.collection(items, options);
    }
  }

  /**
   * Resolves the correct Resource class for a single item based on the requested type.
   */
  static resolveItem(type: string, item: any, options: ResourceOptions = {}): any {
    switch (type) {
      case 'admin':
        return UserAdminResource.make(item, options);
      default:
        return UserResource.make(item, options);
    }
  }
}

/**
 * Detailed representation — used in create/update responses and detail views.
 * Data source: Prisma keycloak DB (snake_case fields).
 */
export class UserDetailResource extends UserBaseResource {
  transform() {
    const {
      id,
      email,
      username,
      enabled,
      email_verified,
      created_timestamp,
      first_name,
      last_name,
    } = this.data;
    return {
      id,
      email: email || null,
      full_name: this.getFullName(last_name, first_name),
      username,
      enabled,
      email_verified,
      created_at: this.formatTimestamp(created_timestamp),
    };
  }
}

/**
 * Full admin representation — used in admin panels.
 * Data source: Prisma keycloak DB (snake_case fields).
 * Includes user_attribute map and extra fields.
 */
export class UserAdminResource extends UserBaseResource {
  transform() {
    const {
      id,
      username,
      email,
      first_name,
      last_name,
      enabled,
      email_verified,
      created_timestamp,
      user_attribute,
    } = this.data;

    return {
      id,
      username,
      email: email || null,
      full_name: this.getFullName(last_name, first_name),
      first_name: first_name || null,
      last_name: last_name || null,
      enabled,
      email_verified,
      attributes: this.mapAttributes(user_attribute),
      created_at: this.formatTimestamp(created_timestamp),
    };
  }

  private mapAttributes(
    user_attribute?: { name: string; value: string }[]
  ): Record<string, string> {
    if (!user_attribute) return {};
    return user_attribute.reduce(
      (acc, { name, value }) => {
        acc[name] = value;
        return acc;
      },
      {} as Record<string, string>
    );
  }
}
