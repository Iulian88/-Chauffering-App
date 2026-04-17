import { Request, Response, NextFunction } from 'express';

/**
 * Role-based price field filter.
 *
 * Applied at router level on any router that returns Booking objects.
 * Strips sensitive price columns from the `data` field of JSON responses
 * before they are sent to the client, based on the authenticated user's role.
 *
 * Visibility matrix:
 *   client          → sees client_price only  (driver_price + profit removed)
 *   driver          → sees driver_price only  (client_price + profit removed)
 *   operator_admin / operator_dispatcher / platform_admin / superadmin → full
 *
 * The check is intentionally lazy (evaluated inside res.json, not at
 * middleware call-time) so the middleware can be registered at router level
 * even before requireAuth runs per-route.
 */

type FieldList = readonly string[];

const CLIENT_STRIP: FieldList = ['driver_price', 'profit'];
const DRIVER_STRIP: FieldList = ['client_price', 'profit'];

function stripFields(item: unknown, fields: FieldList): void {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return;
  const obj = item as Record<string, unknown>;
  for (const f of fields) {
    delete obj[f];
  }
}

function applyToData(data: unknown, fields: FieldList): void {
  if (Array.isArray(data)) {
    data.forEach(item => stripFields(item, fields));
  } else {
    stripFields(data, fields);
  }
}

export function filterPricing(req: Request, res: Response, next: NextFunction): void {
  const _json = res.json.bind(res);

  res.json = function (body: unknown): Response {
    // Lazily resolve role so this works even when registered before requireAuth
    const role = req.user?.role;

    const fields: FieldList | null =
      role === 'client' ? CLIENT_STRIP :
      role === 'driver' ? DRIVER_STRIP :
      null;

    if (fields && body && typeof body === 'object' && !Array.isArray(body)) {
      const b = body as Record<string, unknown>;
      if ('data' in b) {
        applyToData(b.data, fields);
      }
    }

    return _json(body);
  };

  next();
}
