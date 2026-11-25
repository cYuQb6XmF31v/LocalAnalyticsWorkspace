import type { NodeProps } from '@xyflow/react';
import { StickyNote } from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type { NoteCanvasElement } from '../../../domain/models';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

export function NoteNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { dispatch } = useProject();
  const element = data.element as NoteCanvasElement;

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={<StickyNote size={12} />}
      onConfigure={data.onConfigure}
    >
      <textarea
        className="canvas-note-textarea nodrag nopan nowheel"
        aria-label={`Текст нотатки ${element.config.title}`}
        placeholder="Введіть текст нотатки…"
        value={element.config.content}
        onChange={(e) =>
          dispatch({
            type: 'UPDATE_ELEMENT_CONFIG',
            pageId: data.pageId,
            elementId: element.id,
            config: {
              ...element.config,
              content: e.target.value,
            },
          })
        }
      />
    </ElementFrame>
  );
}
