/**
 * Cornerstone3D and its imaging stack (with vtk.js, ~1.8 MB) are only needed
 * once a study is actually opened, so they are pulled in on demand — the
 * landing page loads without them.
 *
 * Memoised: every caller awaits the same initialisation. Any code path that
 * loads a study (sample, DICOM files, native volumes) must await this first.
 */
let started: Promise<void> | null = null;

export function ensureCornerstone(): Promise<void> {
  if (!started) started = import('./init').then((m) => m.initCornerstone());
  return started;
}
