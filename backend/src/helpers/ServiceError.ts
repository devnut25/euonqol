/**
 * Error class for business-level errors (4xx) thrown from services.
 * Allows controllers to distinguish between expected business errors
 * and unexpected runtime errors (5xx).
 *
 * Usage:
 *   throw new ServiceError('Email already exists', 409);
 *   throw new ServiceError('User not found', 404);
 *   throw new ServiceError('Name already taken', 409, 'name');  // field-specific
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
