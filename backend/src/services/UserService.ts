import { keycloakPrisma } from '../config/database.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { FRONTEND_CLIENT_ID } from '../helpers/keycloak.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { KeycloakUserModel, mapFormToKeycloakPayload } from '../models/KeycloakUserModel.js';
import { getUserBaseFilters, REALM_ID, UserModelConfig } from '../models/User.js';
import { CreateUserInput, UpdateUserInput } from '../validators/schemas/user.js';
import { EmailPayloadMap, emailService, EmailType } from './email/index.js';

const USER_STANDARD_FIELDS = ['email', 'first_name', 'last_name'] as const;

export class UserService {
  /**
   * Returns a paginated list of users matching the query params.
   */
  static async getList(query: Record<string, any>) {
    const builder = QueryBuilder.for(UserModelConfig, query).withBaseFilters(getUserBaseFilters());
    const { where, orderBy, include, take, skip, attributeOrderBy } = builder.build();

    const [total, rawUsers] = await Promise.all([
      keycloakPrisma.user_entity.count({ where }),
      keycloakPrisma.user_entity.findMany({
        where,
        include: { ...include, user_attribute: true },
        orderBy,
        ...(attributeOrderBy.length > 0 ? {} : { take, skip }),
      }),
    ]);

    const userIds = rawUsers.map((u: any) => u.id);

    const loginEvents =
      userIds.length === 0
        ? []
        : await keycloakPrisma.event_entity.groupBy({
            by: ['user_id'],
            where: {
              realm_id: REALM_ID,
              type: 'LOGIN',
              // solo login completati dopo OTP: la verifica credenziali usa un client separato
              client_id: FRONTEND_CLIENT_ID,
              user_id: { in: userIds },
            },
            _max: { event_time: true },
          });

    const latestLoginByUser = new Map<string, number | bigint>();
    for (const e of loginEvents) {
      if (e.user_id && e._max.event_time != null) {
        latestLoginByUser.set(e.user_id, e._max.event_time as number | bigint);
      }
    }

    const enrichedUsers = rawUsers.map((u: any) => ({
      ...u,
      latest_login_at: latestLoginByUser.get(u.id) ?? null,
    }));

    let users: any[];
    if (attributeOrderBy.length > 0) {
      // Separate last_access (computed field) from real user_attribute sorts
      const lastAccessOrder = attributeOrderBy.find((o) => 'last_access' in o);
      const attrSortsOnly = attributeOrderBy.filter((o) => !('last_access' in o));

      let sorted: any[] =
        attrSortsOnly.length > 0
          ? builder.sortByAttributes(enrichedUsers, attrSortsOnly)
          : [...enrichedUsers];

      if (lastAccessOrder) {
        const dir = lastAccessOrder['last_access'];
        sorted.sort((a, b) => {
          const aVal = Number(a.latest_login_at ?? 0);
          const bVal = Number(b.latest_login_at ?? 0);
          return dir === 'desc' ? bVal - aVal : aVal - bVal;
        });
      }

      users = sorted.slice(skip, skip + take);
    } else {
      users = enrichedUsers;
    }

    return { users, total, take, skip };
  }

  /**
   * Returns a single user by ID, or null if not found.
   */
  static async getById(id: string) {
    return keycloakPrisma.user_entity.findFirst({
      where: { id, ...getUserBaseFilters() },
      include: {
        user_attribute: true,
        user_role_mapping: true,
        user_group_membership: true,
      },
    });
  }

  /**
   * Creates a new user via Keycloak API and sends a welcome email.
   * Throws ServiceError on business-level failures (e.g. duplicate email).
   */
  static async create(formData: CreateUserInput) {
    const payload = mapFormToKeycloakPayload(formData);
    const result = await KeycloakUserModel.create(payload);

    if (!result.success) {
      throw new ServiceError(result.error ?? 'Error during creation');
    }

    const newUser = await keycloakPrisma.user_entity.findUnique({
      where: { id: result.userId },
      include: { user_attribute: true },
    });

    if (formData.password && newUser?.email) {
      const emailPayload: EmailPayloadMap[EmailType.WELCOME] = { tempPassword: formData.password };
      emailService
        .sendEmail(EmailType.WELCOME, newUser.email, emailPayload)
        .catch((err: any) => console.error('⚠️ Error send email:', err?.message ?? err));
    }

    return newUser;
  }

  /**
   * Updates user fields and custom attributes via Keycloak API.
   * Throws ServiceError on business-level failures.
   */
  static async update(userId: string, updateData: UpdateUserInput) {
    const attributes: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(updateData)) {
      if (!USER_STANDARD_FIELDS.includes(key as any) && value !== undefined && value !== null) {
        attributes[key] = [String(value)];
      }
    }

    const result = await KeycloakUserModel.update(userId, {
      firstName: updateData.first_name,
      lastName: updateData.last_name,
      email: updateData.email,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    });

    if (!result.success) {
      throw new ServiceError(result.error ?? 'Error during update');
    }

    return keycloakPrisma.user_entity.findUnique({
      where: { id: userId },
      include: { user_attribute: true },
    });
  }
}
