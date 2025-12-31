import { z } from 'zod';
import { updateDraftPickSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  league: {
    // Fetch from Sleeper and store/update in DB
    fetch: {
      method: 'POST' as const,
      path: '/api/league/:id/fetch',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
    // Get stored data for visualization
    get: {
      method: 'GET' as const,
      path: '/api/league/:id',
      responses: {
        200: z.any(), // Typed as LeagueDataResponse in schema, using z.any() here for simplicity in route def
        404: errorSchemas.notFound,
      },
    },
  },
  picks: {
    // Manually override a pick slot
    update: {
      method: 'PATCH' as const,
      path: '/api/picks/:id',
      input: updateDraftPickSchema,
      responses: {
        200: z.any(), // DraftPick
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
