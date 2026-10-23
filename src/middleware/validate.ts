import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors.ts';

interface RequestSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

/**
 * Validates the body, params and query against Zod schemas and replaces each
 * with its parsed value. Any failure becomes one 400 listing every bad field.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    const problems: string[] = [];

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) {
        continue;
      }
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        // Zod's messages describe the rule broken, never the value sent.
        for (const issue of result.error.issues) {
          const field = [part, ...issue.path.map(String)].join('.');
          problems.push(`${field}: ${issue.message}`);
        }
        continue;
      }
      if (part === 'query') {
        // Express 5 exposes req.query as a getter, so it has to be redefined.
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else if (part === 'params') {
        req.params = result.data as typeof req.params;
      } else {
        req.body = result.data;
      }
    }

    if (problems.length > 0) {
      throw new AppError(400, 'INVALID_INPUT', `Invalid input. ${problems.join('; ')}`);
    }
    next();
  };
}
