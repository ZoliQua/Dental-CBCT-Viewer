/**
 * URL of a file in `public/`, honouring the deploy base. The app is served from
 * the domain root on Vercel (`/`) but from a sub-path on a regular web host
 * (e.g. `/denct/`, see `npm run build:dulzoltan`); Vite rewrites asset imports
 * for the base, but NOT plain string paths, so every public-file URL built in
 * code must go through here.
 */
export function publicUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
