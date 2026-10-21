import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { PrivacyPolicyDetailResource, PrivacyPolicyResource } from '../resources/privacyPolicies.js';
import { PrivacyPolicyService } from '../services/PrivacyPolicyService.js';

function handleError(res: Response, next: NextFunction, err: unknown, fallback: string): Response | void {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  console.error(fallback, err);
  return next(err);
}

export async function getPrivacyPolicies(req: Request, res: Response, next: NextFunction) {
  try {
    const { policies, total, take, skip } = await PrivacyPolicyService.getList(
      req.query as Record<string, any>,
      req.user
    );
    return res.json(
      Resource.paginate(
        PrivacyPolicyResource.collection(policies),
        total,
        take,
        skip,
        'Privacy policies retrieved successfully'
      )
    );
  } catch (err) {
    return handleError(res, next, err, 'Failed to fetch privacy policies');
  }
}

export async function getPrivacyPolicyById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const policy = await PrivacyPolicyService.getById(id);
    return res.json(
      Resource.respond(PrivacyPolicyDetailResource.make(policy), 'Privacy policy retrieved successfully')
    );
  } catch (err) {
    return handleError(res, next, err, 'Failed to fetch privacy policy');
  }
}

export async function createPrivacyPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await PrivacyPolicyService.create(req.body, req.user?.id, req.file);
    return res
      .status(201)
      .json(Resource.respond(PrivacyPolicyDetailResource.make(policy), 'Privacy policy created successfully'));
  } catch (err) {
    return handleError(res, next, err, 'Failed to create privacy policy');
  }
}

