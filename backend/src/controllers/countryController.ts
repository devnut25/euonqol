import { Request, Response, NextFunction } from 'express';
import { Resource } from '../resources/baseResource.js';
import { CountryResource } from '../resources/countries.js';
import { CountryService } from '../services/CountryService.js';

/**
 * GET /euonqol-api/countries
 */
export async function getCountries(req: Request, res: Response, next: NextFunction) {
  try {
    const countries = await CountryService.getAll();
    return res.json(
      Resource.respond(CountryResource.collection(countries), 'Countries retrieved successfully')
    );
  } catch (err: any) {
    return next(err);
  }
}
