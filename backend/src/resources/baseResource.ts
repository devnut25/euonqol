// resources/Resource.ts
import { AuthUser } from '../middleware/auth.js';

export interface ResourceOptions {
  policy?: {
    authUser: AuthUser | null;
  };
}

export abstract class Resource<T> {
  protected options: ResourceOptions;

  constructor(
    protected data: T,
    options: ResourceOptions = {}
  ) {
    this.options = options;
  }

  abstract transform(): any;

  /**
   * Override nelle sottoclassi per aggiungere authorizations
   */
  protected getAuthorizations(): Record<string, boolean> | null {
    return null;
  }

  /**
   * Trasforma con authorizations
   */
  toResponse(): any {
    const transformed = this.transform();
    const authorizations = this.getAuthorizations();

    if (authorizations) {
      return {
        ...transformed,
        authorizations,
      };
    }

    return transformed;
  }

  static make<T>(item: T, options: ResourceOptions = {}): any {
    return new (this as any)(item, options).toResponse();
  }

  static collection<T>(items: T[], options: ResourceOptions = {}): any[] {
    return items.map((item) => new (this as any)(item, options).toResponse());
  }

  /**
   * Wraps data in the standard API response envelope.
   * Equivalent to Laravel's: return new UserResource($user);
   */
  static respond(data: any, message: string = 'Success') {
    return { success: true, message, data };
  }

  /**
   * Wraps a collection in the standard paginated envelope.
   * Equivalent to Laravel's: return UserResource::collection($users)->additional([...]);
   */
  static paginate(
    data: any[],
    total: number,
    take: number,
    skip: number,
    message: string = 'Retrieved successfully',
    authorizations?: Record<string, boolean>
  ) {
    const perPage = take;
    const currentPage = perPage > 0 ? Math.floor(skip / perPage) + 1 : 1;
    const lastPage = perPage > 0 ? Math.ceil(total / perPage) : 1;

    return {
      success: true,
      message,
      data,
      ...(authorizations ? { authorizations } : {}),
      meta: {
        total,
        per_page: perPage,
        current_page: currentPage,
        last_page: lastPage,
        offset: skip,
      },
    };
  }
}
