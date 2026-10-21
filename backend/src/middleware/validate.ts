import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

/**
 * Middleware factory per validazione con Zod (supporta validazioni asincrone)
 */
export function validate(schema: z.ZodType | ((req: Request) => z.ZodType)) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Se schema è una funzione, la esegue passando req
      const resolvedSchema = typeof schema === 'function' ? schema(req) : schema;
      
      req.body = await resolvedSchema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string[]> = {};
        
        error.issues.forEach(err => {
          const field = err.path.join('.');
          if (!errors[field]) {
            errors[field] = [];
          }
          console.log(err);
          errors[field].push(err.message);
        });


        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Internal validation error',
      });
    }
  };
}