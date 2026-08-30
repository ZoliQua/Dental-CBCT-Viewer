/**
 * `dental-cbct-viewer/core` — React-free, framework-agnostic building blocks:
 * the implant data model + system catalog, and the pure math used by the
 * viewer (implant geometry, safety clearances, bone quality, CPR sampling,
 * arch curve, and 3D-printable drill-guide geometry / STL export).
 *
 * Nothing here imports React, Cornerstone or the DOM, so these functions run
 * in Node, tests or a host app's own logic.
 */

// Data model + implant system catalog
export * from './types/dicom';

// Pure geometry & analysis
export * from './core/implantGeometry';
export * from './core/safety';
export * from './core/boneQuality';
export * from './core/cprMath';
export * from './core/archCurve';

// Drill-guide geometry + STL export (guideBuilder is async / WASM via manifold)
export * from './core/guideGeom';
export * from './core/guideExport';
export * from './core/guideBuilder';
