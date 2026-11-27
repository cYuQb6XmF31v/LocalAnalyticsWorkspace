import { useRef, useState, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Bold, Italic, StickyNote, Underline } from 'lucide-react';
import { useProject } from '../../../app/ProjectContext';
import type { NoteCanvasElement } from '../../../domain/models';
import { ElementFrame, type CanvasFlowNode } from './ElementFrame';

function renderFormattedInline(text: string): ReactNode[] {
  const tokenRe = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = tokenRe.exec(text);
  let keyIdx = 0;

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={`b-${keyIdx++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('__') && token.endsWith('__')) {
      parts.push(<u key={`u-${keyIdx++}`}>{token.slice(2, -2)}</u>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={`i-${keyIdx++}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = tokenRe.lastIndex;
    match = tokenRe.exec(text);
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function NoteNode({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { dispatch } = useProject();
  const element = data.element as NoteCanvasElement;
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const patchNote = (patch: Partial<NoteCanvasElement['config']>) => {
    dispatch({
      type: 'UPDATE_ELEMENT_CONFIG',
      pageId: data.pageId,
      elementId: element.id,
      config: {
        ...element.config,
        ...patch,
      },
    });
  };

  const applyFormat = (kind: 'bold' | 'italic' | 'underline') => {
    const ta = textareaRef.current;
    if (isEditing && ta && ta.selectionStart !== ta.selectionEnd) {
      const marker = kind === 'bold' ? '**' : kind === 'underline' ? '__' : '*';
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const sel = element.config.content.slice(start, end);
      const alreadyWrapped =
        sel.startsWith(marker) && sel.endsWith(marker) && sel.length > marker.length * 2;
      const replacement = alreadyWrapped
        ? sel.slice(marker.length, sel.length - marker.length)
        : `${marker}${sel}${marker}`;
      const nextContent =
        element.config.content.slice(0, start) +
        replacement +
        element.config.content.slice(end);
      patchNote({ content: nextContent });
      window.requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start, start + replacement.length);
      });
      return;
    }

    patchNote({ [kind]: !element.config[kind] });
  };

  const noteStyle = {
    '--note-font-size': `${element.config.fontSize ?? 12}px`,
  } as React.CSSProperties;

  const formatClasses = [
    element.config.bold ? 'canvas-note--bold' : '',
    element.config.italic ? 'canvas-note--italic' : '',
    element.config.underline ? 'canvas-note--underline' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const headerActions = (
    <div className="canvas-node-quick-group">
      <button
        type="button"
        className={`sd-mini-btn ${element.config.bold ? 'sd-mini-btn--active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          applyFormat('bold');
        }}
        title="Жирний (виділіть текст або застосуйте до всієї нотатки)"
        aria-label="Жирний шрифт"
      >
        <Bold size={11} />
      </button>
      <button
        type="button"
        className={`sd-mini-btn ${element.config.italic ? 'sd-mini-btn--active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          applyFormat('italic');
        }}
        title="Курсив (виділіть текст або застосуйте до всієї нотатки)"
        aria-label="Курсив"
      >
        <Italic size={11} />
      </button>
      <button
        type="button"
        className={`sd-mini-btn ${element.config.underline ? 'sd-mini-btn--active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          applyFormat('underline');
        }}
        title="Підкреслений (виділіть текст або застосуйте до всієї нотатки)"
        aria-label="Підкреслений шрифт"
      >
        <Underline size={11} />
      </button>
    </div>
  );

  return (
    <ElementFrame
      element={element}
      pageId={data.pageId}
      selected={selected}
      icon={<StickyNote size={12} />}
      headerActions={headerActions}
      onConfigure={data.onConfigure}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          autoFocus
          className={`canvas-note-textarea nodrag nopan nowheel ${formatClasses}`}
          style={noteStyle}
          aria-label={`Текст нотатки ${element.config.title}`}
          placeholder="Введіть текст нотатки… (**жирний**, *курсив*, __підкреслений__)"
          value={element.config.content}
          onBlur={() => setIsEditing(false)}
          onChange={(e) => patchNote({ content: e.target.value })}
        />
      ) : (
        <div
          className={`canvas-note-view nodrag nopan nowheel ${formatClasses}`}
          style={noteStyle}
          role="textbox"
          aria-readonly="false"
          tabIndex={0}
          onClick={() => setIsEditing(true)}
          onFocus={() => setIsEditing(true)}
          title="Клікніть щоб редагувати текст"
        >
          {element.config.content ? (
            renderFormattedInline(element.config.content)
          ) : (
            <span className="canvas-note-placeholder">Введіть текст нотатки…</span>
          )}
        </div>
      )}
    </ElementFrame>
  );
}
