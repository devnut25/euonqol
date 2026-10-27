import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { SurveyPrivacyPolicyPolicy } from '../policy/surveyPrivacyPolicyPolicy.js';
import { Resource } from '../resources/baseResource.js';
import { PrivacyPolicyDetailResource } from '../resources/privacyPolicies.js';
import { SurveyPrivacyPolicyResource } from '../resources/surveyPrivacyPolicies.js';
import { PrivacyPolicyService } from '../services/PrivacyPolicyService.js';
import { SurveyPrivacyPolicyService } from '../services/SurveyPrivacyPolicyService.js';

function parseSurveyId(id: string | string[], res: Response): number | null {
  const surveyId = parseInt(Array.isArray(id) ? id[0] : id, 10);
  if (isNaN(surveyId)) {
    res.status(400).json({ success: false, message: 'Invalid survey ID' });
    return null;
  }
  return surveyId;
}

function parseIntParam(param: string | string[]): number {
  return parseInt(Array.isArray(param) ? param[0] : param, 10);
}

function handleError(res: Response, next: NextFunction, err: any, fallbackMessage: string) {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  console.error(`Error: ${fallbackMessage}`, err?.message ?? err);
  return next(err);
}

export async function getSurveyPrivacyPolicies(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const links = await SurveyPrivacyPolicyService.getPrivacyPolicies(
      surveyId,
      req.query as Record<string, any>
    );

    const items = links.map((l) => ({
      id: l.privacy_policy.id,
      title: l.privacy_policy.title,
      content: l.privacy_policy.content,
      patient_type: l.privacy_policy.patient_type,
      language_id: l.privacy_policy.language_id,
      language: l.privacy_policy.language.language,
      is_active: l.privacy_policy.is_active,
      created_by: l.privacy_policy.created_by,
      pdf_url: l.privacy_policy.pdf_url,
      pdf_filename: l.privacy_policy.pdf_filename,
      is_fallback: l.is_fallback,
      surveyStatus: l.surveyStatus,
    }));

    const data = SurveyPrivacyPolicyResource.collection(items, {
      policy: { authUser: req.user ?? null },
    });

    const surveyStatus = await SurveyPrivacyPolicyService.getSurveyStatus(surveyId);
    const response = Resource.paginate(data, data.length, data.length, 0);
    (response as any).meta.authorizations = {
      create: new SurveyPrivacyPolicyPolicy(req.user ?? null).create({ status: surveyStatus }),
    };
    return res.json(response);
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch survey privacy policies');
  }
}

export async function getSurveyPrivacyPolicyById(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const policyId = parseIntParam(req.params.policyId);
    if (isNaN(policyId))
      return res.status(400).json({ success: false, message: 'Invalid policy ID' });

    const link = await SurveyPrivacyPolicyService.getPrivacyPolicyById(surveyId, policyId);
    const item = {
      id: link.privacy_policy.id,
      title: link.privacy_policy.title,
      content: link.privacy_policy.content,
      patient_type: link.privacy_policy.patient_type,
      language_id: link.privacy_policy.language_id,
      language: link.privacy_policy.language.language,
      is_active: link.privacy_policy.is_active,
      created_by: link.privacy_policy.created_by,
      pdf_url: link.privacy_policy.pdf_url,
      pdf_filename: link.privacy_policy.pdf_filename,
      is_fallback: link.is_fallback,
      surveyStatus: link.surveyStatus,
    };

    return res.json(
      Resource.respond(SurveyPrivacyPolicyResource.make(item, { policy: { authUser: req.user ?? null } }))
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to fetch survey privacy policy');
  }
}

export async function createSurveyPrivacyPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    await SurveyPrivacyPolicyService.assertSurveyNotCompleted(surveyId);

    const policy = await PrivacyPolicyService.create(
      { ...req.body, survey_id: surveyId },
      req.user?.id,
      req.file
    );
    return res
      .status(201)
      .json(
        Resource.respond(PrivacyPolicyDetailResource.make(policy), 'Privacy policy created successfully')
      );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to create survey privacy policy');
  }
}

export async function updateSurveyPrivacyPolicies(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;

    const { privacy_policy_ids } = req.body;
    if (!Array.isArray(privacy_policy_ids)) {
      return res.status(400).json({ error: 'privacy_policy_ids must be an array' });
    }

    const count = await SurveyPrivacyPolicyService.setPrivacyPolicies(surveyId, privacy_policy_ids);
    return res.json({ success: true, count });
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to update survey privacy policies');
  }
}

export async function addSurveyPrivacyPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const policyId = parseIntParam(req.params.policyId);
    if (isNaN(policyId)) return res.status(400).json({ error: 'Invalid policy ID' });

    await SurveyPrivacyPolicyService.addPrivacyPolicy(surveyId, policyId);
    return res.json({ success: true });
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to add privacy policy to survey');
  }
}

export async function removeSurveyPrivacyPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const policyId = parseIntParam(req.params.policyId);
    if (isNaN(policyId)) return res.status(400).json({ error: 'Invalid policy ID' });

    await SurveyPrivacyPolicyService.removePrivacyPolicy(surveyId, policyId);
    return res.json({ success: true });
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to remove privacy policy from survey');
  }
}

export async function updateSurveyPrivacyPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const policyId = parseIntParam(req.params.policyId);
    if (isNaN(policyId))
      return res.status(400).json({ success: false, message: 'Invalid policy ID' });

    await SurveyPrivacyPolicyService.assertSurveyNotCompleted(surveyId);

    const policy = await PrivacyPolicyService.update(policyId, req.body, req.user, req.file);
    return res.json(
      Resource.respond(PrivacyPolicyDetailResource.make(policy), 'Privacy policy updated successfully')
    );
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to update survey privacy policy');
  }
}

export async function setSurveyFallbackPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseSurveyId(req.params.id, res);
    if (surveyId === null) return;
    const policyId = parseIntParam(req.params.policyId);
    if (isNaN(policyId)) return res.status(400).json({ error: 'Invalid policy ID' });

    const is_fallback = await SurveyPrivacyPolicyService.setFallbackPolicy(surveyId, policyId);
    return res.json({ success: true, is_fallback });
  } catch (err: any) {
    return handleError(res, next, err, 'Failed to set fallback privacy policy');
  }
}
