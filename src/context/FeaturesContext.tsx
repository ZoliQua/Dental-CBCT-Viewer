/**
 * Which edition is running: the feature switches (see core/features) plus
 * whether the outward-facing web promotion (GitHub star, other projects) is
 * shown. Read it with useFeatures() from any component; without a provider
 * everything is on, which is the web app and every existing embed.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { resolveFeatures, type ResolvedFeatures, type ViewerFeatures } from '@/core/features';

export interface FeaturesValue extends ResolvedFeatures {
  branding: boolean;
}

const FeaturesContext = createContext<FeaturesValue>({ ...resolveFeatures(), branding: true });

export function FeaturesProvider({
  features,
  branding = true,
  children,
}: {
  features?: ViewerFeatures;
  branding?: boolean;
  children: ReactNode;
}) {
  const implantPlanning = features?.implantPlanning;
  const drillGuide = features?.drillGuide;
  // Keyed on the primitives so a host passing a fresh object literal each
  // render does not re-render the whole tree.
  const value = useMemo(
    () => ({ ...resolveFeatures({ implantPlanning, drillGuide }), branding }),
    [implantPlanning, drillGuide, branding],
  );
  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): FeaturesValue {
  return useContext(FeaturesContext);
}
