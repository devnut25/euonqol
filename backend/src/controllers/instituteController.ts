import { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../helpers/ServiceError.js';
import { saveImage } from '../helpers/FileStorage.js';
import { Resource } from '../resources/baseResource.js';
import { InstituteService } from '../services/InstituteService.js';

function toResponse(institute: NonNullable<Awaited<ReturnType<typeof InstituteService.get>>>) {
  return {
    name: institute.name,
    address: institute.address,
    city: institute.city,
    country: institute.country,
    note: institute.note,
    email: institute.email,
    phone: institute.phone,
    referentName: institute.referent_name,
    logoUrl: institute.logo_url,
    updatedAt: institute.updated_at,
  };
}

/**
 * GET /euonqol-api/institute
 * Returns the single institution running this installation, or null if not set yet.
 */
export async function getInstitute(req: Request, res: Response, next: NextFunction) {
  try {
    const institute = await InstituteService.get();
    return res.json(
      Resource.respond(institute ? toResponse(institute) : null, 'Institute retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /euonqol-api/institute
 * Creates or updates the institute record (singleton row). Accepts either plain JSON or
 * multipart/form-data (when replacing the logo, field "logo") — mirrors the PDF-upload
 * routes' pattern of accepting both on the same endpoint. Logo removal is signaled by a
 * JSON body with `logo: null` (the file-aware Form component's "remove attachment"
 * contract); omitting the field entirely leaves the current logo untouched.
 */
export async function updateInstitute(req: Request, res: Response, next: NextFunction) {
  const { name, address, city, country, note, email, phone, referentName, logo } = req.body;
  const file = (req as any).file as Express.Multer.File | undefined;

  if (!name || !address || !city || !country) {
    return res
      .status(400)
      .json({ success: false, message: 'name, address, city and country are required' });
  }

  try {
    const logoUrl = file ? saveImage('institute', file.buffer) : logo === null ? null : undefined;

    const institute = await InstituteService.upsert({
      name,
      address,
      city,
      country,
      note,
      email,
      phone,
      referentName,
      logoUrl,
    });
    return res.json(Resource.respond(toResponse(institute), 'Institute updated successfully'));
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
}
