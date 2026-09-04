'use client';

// The viewer reads the DOM (canvas, workers) on mount, so it must run only on
// the client. Load it with `ssr: false` and render it inside a sized container.

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import type { DicomViewerHandle, ImplantData } from 'dental-cbct-viewer';
import 'dental-cbct-viewer/style.css';

const DicomViewer = dynamic(
  () => import('dental-cbct-viewer').then((m) => m.DicomViewer),
  { ssr: false, loading: () => <p style={{ padding: 16 }}>Loading viewer…</p> },
);

export default function Viewer() {
  const ref = useRef<DicomViewerHandle>(null);
  const [implantCount, setImplantCount] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, alignItems: 'center' }}>
        <button onClick={() => ref.current?.loadSample()}>Load sample</button>
        <button onClick={() => ref.current?.exportPdf()}>Export PDF</button>
        <span>Implants: {implantCount}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <DicomViewer
          ref={ref}
          lang="en"
          initialLayout="1+3"
          embedded
          onImplantsChange={(implants: ImplantData[]) => setImplantCount(implants.length)}
          onPlanChange={(plan) => localStorage.setItem('denct-plan', JSON.stringify(plan))}
        />
      </div>
    </div>
  );
}
