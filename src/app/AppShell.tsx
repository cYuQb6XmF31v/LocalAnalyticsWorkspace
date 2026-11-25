import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  Database,
  FileDown,
  FileUp,
  FolderTree,
  HelpCircle,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { uk } from '../i18n/uk';
import './AppShell.css';

type MobilePane = 'navigator' | 'canvas' | 'sourceData';

const SOURCE_MIN_WIDTH = 260;
const SOURCE_MAX_WIDTH = 620;
const SOURCE_DEFAULT_WIDTH = 360;

export function AppShell() {
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isSourceOpen, setIsSourceOpen] = useState(true);
  const [sourceWidth, setSourceWidth] = useState(SOURCE_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>('canvas');

  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStartRef.current = {
        startX: event.clientX,
        startWidth: sourceWidth,
      };
      setIsResizing(true);
    },
    [sourceWidth],
  );

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStartRef.current) {
        return;
      }
      const delta = dragStartRef.current.startX - event.clientX;
      const nextWidth = Math.min(
        SOURCE_MAX_WIDTH,
        Math.max(SOURCE_MIN_WIDTH, dragStartRef.current.startWidth + delta),
      );
      setSourceWidth(nextWidth);
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isResizing]);

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSourceWidth((prev) => Math.min(SOURCE_MAX_WIDTH, prev + 24));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSourceWidth((prev) => Math.max(SOURCE_MIN_WIDTH, prev - 24));
    }
  };

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <button
            type="button"
            className={`icon-btn desktop-only ${isNavOpen ? 'icon-btn--active' : ''}`}
            onClick={() => setIsNavOpen((prev) => !prev)}
            aria-label={uk.header.toggleNav}
            aria-expanded={isNavOpen}
            title={uk.header.toggleNav}
          >
            {isNavOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          <div className="shell-brand">
            <span className="shell-brand-mark" aria-hidden="true">
              <Layers size={13} />
            </span>
            <span className="shell-title">{uk.app.name}</span>
          </div>

          <span className="shell-divider desktop-only" aria-hidden="true" />
          <span className="shell-project-name desktop-only">{uk.app.projectPlaceholder}</span>
          <span className="shell-badge desktop-only">{uk.app.stageBadge}</span>
        </div>

        <div className="shell-header-right">
          <span className="shell-badge shell-badge--neutral desktop-only">
            <ShieldCheck size={12} />
            {uk.app.localOnlyNotice}
          </span>

          <button
            type="button"
            className="icon-btn icon-btn--outlined desktop-only"
            disabled
            title={uk.header.plannedHint}
          >
            <FileUp size={14} />
            <span>{uk.header.importSoon}</span>
          </button>

          <button
            type="button"
            className="icon-btn icon-btn--outlined desktop-only"
            disabled
            title={uk.header.plannedHint}
          >
            <FileDown size={14} />
            <span>{uk.header.exportSoon}</span>
          </button>

          <button
            type="button"
            className="icon-btn icon-btn--outlined desktop-only"
            disabled
            title={uk.header.plannedHint}
          >
            <HelpCircle size={14} />
            <span>{uk.header.helpSoon}</span>
          </button>

          <button
            type="button"
            className={`icon-btn desktop-only ${isSourceOpen ? 'icon-btn--active' : ''}`}
            onClick={() => setIsSourceOpen((prev) => !prev)}
            aria-label={uk.header.toggleSourceData}
            aria-expanded={isSourceOpen}
            title={uk.header.toggleSourceData}
          >
            {isSourceOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
      </header>

      <nav className="mobile-tabs" aria-label="Перемикач робочих панелей">
        <button
          type="button"
          className={`mobile-tab ${mobilePane === 'navigator' ? 'mobile-tab--active' : ''}`}
          onClick={() => setMobilePane('navigator')}
        >
          <FolderTree size={14} />
          <span>{uk.tabs.navigator}</span>
        </button>
        <button
          type="button"
          className={`mobile-tab ${mobilePane === 'canvas' ? 'mobile-tab--active' : ''}`}
          onClick={() => setMobilePane('canvas')}
        >
          <LayoutGrid size={14} />
          <span>{uk.tabs.canvas}</span>
        </button>
        <button
          type="button"
          className={`mobile-tab ${mobilePane === 'sourceData' ? 'mobile-tab--active' : ''}`}
          onClick={() => setMobilePane('sourceData')}
        >
          <Table2 size={14} />
          <span>{uk.tabs.sourceData}</span>
        </button>
      </nav>

      <main className="shell-body">
        {isNavOpen && (
          <aside
            className={`pane-nav ${mobilePane !== 'navigator' ? 'pane--hidden-mobile' : ''}`}
            aria-label={uk.navigator.title}
          >
            <div className="pane-header">
              <span className="pane-header-title">
                <FolderTree size={14} />
                <span>{uk.navigator.title}</span>
              </span>
              <button
                type="button"
                className="icon-btn desktop-only"
                onClick={() => setIsNavOpen(false)}
                aria-label={uk.navigator.collapse}
                title={uk.navigator.collapse}
              >
                <PanelLeftClose size={14} />
              </button>
            </div>

            <div className="pane-content">
              <div className="tree-preview" aria-label="Заглушка дерева проєкту">
                <div className="tree-row">
                  <ChevronRight size={13} />
                  <span>{uk.navigator.sampleProject}</span>
                </div>
                <div className="tree-row tree-row--nested tree-row--active">
                  <LayoutGrid size={13} />
                  <span>{uk.navigator.samplePage}</span>
                </div>
              </div>

              <div className="placeholder-card placeholder-card--compact">
                <span className="placeholder-icon" aria-hidden="true">
                  <FolderTree size={15} />
                </span>
                <h2 className="placeholder-title">{uk.navigator.placeholderTitle}</h2>
                <p className="placeholder-text">{uk.navigator.placeholderText}</p>
              </div>
            </div>
          </aside>
        )}

        <section
          className={`pane-canvas ${mobilePane !== 'canvas' ? 'pane--hidden-mobile' : ''}`}
          aria-label={uk.canvas.title}
        >
          <div className="canvas-subbar">
            <span className="pane-header-title">
              <LayoutGrid size={14} />
              <span>{uk.canvas.title}</span>
            </span>
            <span className="mono-chip">{uk.canvas.toolbarPlaceholder}</span>
          </div>

          <div className="canvas-stage">
            <div className="placeholder-card">
              <span className="placeholder-icon" aria-hidden="true">
                <LayoutGrid size={16} />
              </span>
              <h1 className="placeholder-title">{uk.canvas.placeholderTitle}</h1>
              <p className="placeholder-text">{uk.canvas.placeholderText}</p>
              <p className="placeholder-hint">{uk.canvas.hint}</p>
            </div>
          </div>
        </section>

        {isSourceOpen && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={uk.sourceData.resizeHandle}
              aria-valuemin={SOURCE_MIN_WIDTH}
              aria-valuemax={SOURCE_MAX_WIDTH}
              aria-valuenow={sourceWidth}
              tabIndex={0}
              className={`resize-handle desktop-only ${isResizing ? 'resize-handle--active' : ''}`}
              onPointerDown={handleResizeStart}
              onKeyDown={handleResizeKeyDown}
            />

            <aside
              className={`pane-source ${mobilePane !== 'sourceData' ? 'pane--hidden-mobile' : ''}`}
              style={{ width: `${sourceWidth}px` }}
              aria-label={uk.sourceData.title}
            >
              <div className="pane-header">
                <span className="pane-header-title">
                  <Database size={14} />
                  <span>{uk.sourceData.title}</span>
                  <span className="shell-badge">{uk.sourceData.badgePrimary}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn desktop-only"
                  onClick={() => setIsSourceOpen(false)}
                  aria-label={uk.sourceData.collapse}
                  title={uk.sourceData.collapse}
                >
                  <PanelRightClose size={14} />
                </button>
              </div>

              <div className="pane-content">
                <div>
                  <span className="mono-chip">{uk.sourceData.statsPlaceholder}</span>
                </div>

                <div className="placeholder-card placeholder-card--compact">
                  <span className="placeholder-icon" aria-hidden="true">
                    <Table2 size={15} />
                  </span>
                  <h2 className="placeholder-title">{uk.sourceData.placeholderTitle}</h2>
                  <p className="placeholder-text">{uk.sourceData.placeholderText}</p>
                  <p className="placeholder-hint">{uk.sourceData.hint}</p>
                </div>
              </div>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}
