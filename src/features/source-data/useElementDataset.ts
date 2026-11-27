import { useMemo } from 'react';
import { useProject } from '../../app/ProjectContext';
import type { CanvasElement, Dataset } from '../../domain/models';
import { resolveEffectiveDataset } from './dataPipeline';

/**
 * Resolves the effective Dataset for a Canvas element, combining:
 * - formula column evaluation
 * - selected secondary dataset or join
 * - page-level + element-level reusable filters
 */
export function useElementDataset(pageId: string, element: CanvasElement): Dataset {
  const { state } = useProject();
  const page = state.project.canvases.find((p) => p.id === pageId);
  const pageFilterIds = page?.filterIds;
  const elementFilterIds = element.filterIds;

  return useMemo(() => {
    const mergedFilterIds = [
      ...(pageFilterIds ?? []),
      ...(elementFilterIds ?? []),
    ];
    return resolveEffectiveDataset(
      state.project,
      element.datasetId,
      mergedFilterIds.length > 0 ? mergedFilterIds : undefined,
    );
  }, [state.project, element.datasetId, pageFilterIds, elementFilterIds]);
}
