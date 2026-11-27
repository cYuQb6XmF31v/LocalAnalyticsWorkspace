import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Database,
  FileDown,
  FilePlus2,
  FileUp,
  FolderTree,
  Info,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { CanvasWorkspace } from '../features/canvas/CanvasWorkspace';
import { GraphViewPage } from '../features/canvas/GraphViewPage';
import { ProjectTree } from '../features/canvas/ProjectTree';
import { TemplateChooserModal } from '../features/canvas/TemplateChooserModal';
import { buildPagesFromTemplate, type CanvasTemplateId } from '../features/canvas/templates';
import { HelpPage } from '../features/help/HelpPage';
import {
  buildExportFileName,
  clearActiveFileHandle,
  getActiveFileHandleInfo,
  readTxtFromFileInput,
  saveDirectToActiveHandleOrFallback,
  saveTxtFile,
  stripTxtExtension,
  tryOpenTxtWithFilePicker,
} from '../features/project-file/fileAdapters';
import { ImportPreviewModal } from '../features/project-file/ImportPreviewModal';
import { parseTxtContent, type ParsedTxtResult } from '../features/project-file/txtParser';
import { serializeProjectTxt } from '../features/project-file/txtSerializer';
import { SourceDataGrid } from '../features/source-data/SourceDataGrid';
import { uk } from '../i18n/uk';
import { useProject } from './ProjectContext';
import './AppShell.css';

type MobilePane = 'navigator' | 'canvas' | 'sourceData';
type ActiveView = 'workspace' | 'graph' | 'help';
type ResizeTarget = 'nav' | 'source';

const NAV_MIN_WIDTH = 190;
const NAV_MAX_WIDTH = 440;
const NAV_DEFAULT_WIDTH = 248;

const SOURCE_MIN_WIDTH = 280;
const SOURCE_DEFAULT_WIDTH = 420;
const MIN_CANVAS_STRIP = 80;

interface PendingImport {
  fileName: string;
  parsed: ParsedTxtResult;
}

export function AppShell() {
  const { state, dispatch, sessionNotice, dismissSessionNotice, resetSessionProject } =
    useProject();
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isSourceOpen, setIsSourceOpen] = useState(true);
  const [navWidth, setNavWidth] = useState(NAV_DEFAULT_WIDTH);
  const [sourceWidth, setSourceWidth] = useState(SOURCE_DEFAULT_WIDTH);
  const [resizingTarget, setResizingTarget] = useState<ResizeTarget | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>('canvas');
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window === 'undefined') {
      return 'workspace';
    }
    if (window.location.hash === '#help') {
      return 'help';
    }
    if (window.location.hash === '#graph') {
      return 'graph';
    }
    return 'workspace';
  });

  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isTemplateChooserOpen, setIsTemplateChooserOpen] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [linkedFileName, setLinkedFileName] = useState<string | null>(
    () => getActiveFileHandleInfo()?.fileName ?? null,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shellBodyRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{
    target: ResizeTarget;
    startX: number;
    startWidth: number;
  } | null>(null);

  const { project, dirtySinceLastExport, needsLayoutChooser } = state;

  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === '#help') {
        setActiveView('help');
      } else if (window.location.hash === '#graph') {
        setActiveView('graph');
      } else {
        setActiveView('workspace');
      }
    };
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const navigateTo = useCallback((view: ActiveView) => {
    setActiveView(view);
    if (typeof window !== 'undefined') {
      const nextHash = view === 'help' ? '#help' : view === 'graph' ? '#graph' : '#workspace';
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    }
  }, []);

  const getMaxSourceWidth = useCallback(() => {
    const totalWidth =
      shellBodyRef.current?.clientWidth ??
      (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const occupiedByNav = isNavOpen ? navWidth : 0;
    return Math.max(SOURCE_MIN_WIDTH, totalWidth - occupiedByNav - MIN_CANVAS_STRIP);
  }, [isNavOpen, navWidth]);

  const handleResizeStart = useCallback(
    (target: ResizeTarget) => (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStartRef.current = {
        target,
        startX: event.clientX,
        startWidth: target === 'nav' ? navWidth : sourceWidth,
      };
      setResizingTarget(target);
    },
    [navWidth, sourceWidth],
  );

  useEffect(() => {
    if (!resizingTarget) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStartRef.current;
      if (!drag) {
        return;
      }
      if (drag.target === 'nav') {
        const delta = event.clientX - drag.startX;
        const nextWidth = Math.min(
          NAV_MAX_WIDTH,
          Math.max(NAV_MIN_WIDTH, drag.startWidth + delta),
        );
        setNavWidth(nextWidth);
      } else {
        const delta = drag.startX - event.clientX;
        const maxAllowed = getMaxSourceWidth();
        const nextWidth = Math.min(
          maxAllowed,
          Math.max(SOURCE_MIN_WIDTH, drag.startWidth + delta),
        );
        setSourceWidth(nextWidth);
      }
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      setResizingTarget(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [resizingTarget, getMaxSourceWidth]);

  // Clamp source width cleanly if the viewport shrinks
  useEffect(() => {
    const handleWindowResize = () => {
      const maxAllowed = getMaxSourceWidth();
      setSourceWidth((prev) => (prev > maxAllowed ? maxAllowed : prev));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [getMaxSourceWidth]);

  const handleNavResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setNavWidth((prev) => Math.min(NAV_MAX_WIDTH, prev + 24));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setNavWidth((prev) => Math.max(NAV_MIN_WIDTH, prev - 24));
    }
  };

  const handleSourceResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const maxAllowed = getMaxSourceWidth();
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSourceWidth((prev) => Math.min(maxAllowed, prev + 32));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSourceWidth((prev) => Math.max(SOURCE_MIN_WIDTH, prev - 32));
    }
  };

  const openImportPreviewFromRaw = (fileName: string, content: string) => {
    setActionError(null);
    const parsed = parseTxtContent(content, stripTxtExtension(fileName));
    setPendingImport({ fileName, parsed });
  };

  const handleImportClick = async () => {
    setActionError(null);
    const pickerResult = await tryOpenTxtWithFilePicker();
    if (pickerResult === null) {
      fileInputRef.current?.click();
      return;
    }
    if (pickerResult.status === 'cancelled') {
      return;
    }
    if (pickerResult.status === 'error') {
      setActionError(pickerResult.message);
      return;
    }
    openImportPreviewFromRaw(pickerResult.file.fileName, pickerResult.file.content);
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const readResult = await readTxtFromFileInput(file);
    if (readResult.status === 'error') {
      setActionError(readResult.message);
      return;
    }
    if (readResult.status === 'picked') {
      openImportPreviewFromRaw(readResult.file.fileName, readResult.file.content);
    }
  };

  const handleConfirmImport = () => {
    if (!pendingImport || pendingImport.parsed.errors.length > 0) {
      return;
    }
    if (pendingImport.parsed.kind === 'project') {
      dispatch({ type: 'REPLACE_PROJECT', project: pendingImport.parsed.project });
      setLinkedFileName(getActiveFileHandleInfo()?.fileName ?? null);
    } else {
      clearActiveFileHandle();
      setLinkedFileName(null);
      dispatch({
        type: 'REPLACE_DATASET',
        dataset: pendingImport.parsed.dataset,
        openLayoutChooser: true,
      });
    }
    setPendingImport(null);
    setIsSourceOpen(true);
    navigateTo('workspace');
  };

  const handleSaveDirect = useCallback(async () => {
    setActionError(null);
    const txtContent = serializeProjectTxt(project);
    const fileName = buildExportFileName(project.name);
    const result = await saveDirectToActiveHandleOrFallback(fileName, txtContent);
    if (result.status === 'error') {
      setActionError(result.message);
      return;
    }
    if (result.status === 'saved') {
      dispatch({ type: 'MARK_EXPORTED' });
      const activeInfo = getActiveFileHandleInfo();
      setLinkedFileName(activeInfo?.fileName ?? null);
      setSaveFeedback(
        result.method === 'direct'
          ? `Перезаписано файл ${result.fileName ?? fileName}`
          : `Збережено у ${result.fileName ?? fileName}`,
      );
      window.setTimeout(() => setSaveFeedback(null), 2600);
    }
  }, [dispatch, project]);

  const handleExportTxt = async () => {
    setActionError(null);
    const txtContent = serializeProjectTxt(project);
    const fileName = buildExportFileName(project.name);
    const result = await saveTxtFile(fileName, txtContent);
    if (result.status === 'error') {
      setActionError(result.message);
      return;
    }
    if (result.status === 'saved') {
      dispatch({ type: 'MARK_EXPORTED' });
      setLinkedFileName(getActiveFileHandleInfo()?.fileName ?? null);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyS') {
        event.preventDefault();
        void handleSaveDirect();
        return;
      }

      // Skip navigation hotkeys when typing or inside modals
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('.modal-backdrop')) {
        return;
      }

      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'KeyG') {
        event.preventDefault();
        navigateTo(activeView === 'graph' ? 'workspace' : 'graph');
        return;
      }

      if (event.key === 'Escape' && activeView === 'graph') {
        event.preventDefault();
        navigateTo('workspace');
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [activeView, handleSaveDirect, navigateTo]);

  const handleNewProjectClick = () => {
    const hasData =
      dirtySinceLastExport ||
      project.primaryDataset.columns.length > 0 ||
      project.primaryDataset.rows.length > 0;
    if (hasData) {
      setConfirmNewOpen(true);
    } else {
      clearActiveFileHandle();
      setLinkedFileName(null);
      resetSessionProject();
      navigateTo('workspace');
    }
  };

  const handleSelectTemplate = (templateId: CanvasTemplateId) => {
    const pages = buildPagesFromTemplate(templateId, project.primaryDataset);
    const shouldReplaceEmptyInitial =
      needsLayoutChooser &&
      project.canvases.length === 1 &&
      project.canvases[0].elements.length === 0;
    dispatch({
      type: 'APPLY_CANVAS_PAGES',
      pages,
      activePageId: pages[0]?.id,
      append: !shouldReplaceEmptyInitial,
    });
    setIsTemplateChooserOpen(false);
    navigateTo('workspace');
  };

  const showTemplatesModal = isTemplateChooserOpen || needsLayoutChooser;

  return (
    <div className="shell">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={handleFileInputChange}
      />

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

          <input
            type="text"
            className="shell-project-input desktop-only"
            aria-label={uk.app.renameProjectLabel}
            defaultValue={project.name}
            key={`${project.id}-${project.name}`}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== project.name) {
                dispatch({ type: 'RENAME_PROJECT', name: next });
              } else {
                e.target.value = project.name;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                e.currentTarget.value = project.name;
                e.currentTarget.blur();
              }
            }}
          />

          {dirtySinceLastExport && (
            <span className="shell-dirty-indicator desktop-only" title={uk.app.unsavedChanges}>
              <span className="shell-dirty-dot" aria-hidden="true" />
              <span>{uk.app.unsavedChanges}</span>
            </span>
          )}
        </div>

        <div className="shell-header-right">
          <span className="shell-local-note desktop-only">
            <ShieldCheck size={12} />
            <span>{uk.app.localOnlyNotice}</span>
          </span>

          <span className="shell-divider desktop-only" aria-hidden="true" />

          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={handleNewProjectClick}
            title={uk.header.newProject}
          >
            <FilePlus2 size={14} />
            <span className="desktop-only">{uk.header.newProject}</span>
          </button>

          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={handleImportClick}
            title={uk.header.importTxt}
          >
            <FileUp size={14} />
            <span>{uk.header.importTxt}</span>
          </button>

          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => void handleSaveDirect()}
            title={
              linkedFileName
                ? `Зберегти напряму у ${linkedFileName} (Ctrl+S)`
                : 'Зберегти у TXT (Ctrl+S)'
            }
          >
            <Save size={14} />
            <span>{linkedFileName ? 'Зберегти' : 'Зберегти (Ctrl+S)'}</span>
          </button>

          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={handleExportTxt}
            title={uk.header.exportTxt}
          >
            <FileDown size={14} />
            <span className="desktop-only">{uk.header.exportTxt}</span>
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

      {saveFeedback && (
        <div role="status" className="session-banner session-banner--info">
          <span className="session-banner-content">
            <Save size={14} aria-hidden="true" />
            <span>{saveFeedback}</span>
          </span>
        </div>
      )}

      {actionError && (
        <div role="alert" className="session-banner session-banner--danger">
          <span className="session-banner-content">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{actionError}</span>
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setActionError(null)}
            aria-label={uk.session.dismissNotice}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {sessionNotice && (
        <div
          role="status"
          className={`session-banner ${
            sessionNotice.kind === 'warning' ? 'session-banner--warning' : 'session-banner--info'
          }`}
        >
          <span className="session-banner-content">
            {sessionNotice.kind === 'warning' ? (
              <AlertTriangle size={14} aria-hidden="true" />
            ) : (
              <Info size={14} aria-hidden="true" />
            )}
            <span>{sessionNotice.message}</span>
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={dismissSessionNotice}
            aria-label={uk.session.dismissNotice}
            title={uk.session.dismissNotice}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {activeView === 'help' ? (
        <main className="shell-body">
          <HelpPage onBackToWorkspace={() => navigateTo('workspace')} />
        </main>
      ) : (
        <>
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

          <main ref={shellBodyRef} className="shell-body">
            {isNavOpen && (
              <>
                <aside
                  className={`pane-nav ${mobilePane !== 'navigator' ? 'pane--hidden-mobile' : ''}`}
                  style={{ width: `${navWidth}px` }}
                  aria-label={uk.navigator.title}
                >
                  <div className="pane-header">
                    <span className="pane-header-title">
                      <FolderTree size={14} />
                      <span>{uk.navigator.title}</span>
                    </span>
                  </div>

                  <ProjectTree
                    onOpenGraph={() => {
                      navigateTo(activeView === 'graph' ? 'workspace' : 'graph');
                      setMobilePane('canvas');
                    }}
                    onOpenHelp={() => navigateTo('help')}
                    onNavigateToCanvas={() => {
                      navigateTo('workspace');
                      setMobilePane('canvas');
                    }}
                    isGraphActive={activeView === 'graph'}
                    isHelpActive={false}
                  />
                </aside>

                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={uk.navigator.resizeHandle}
                  aria-valuemin={NAV_MIN_WIDTH}
                  aria-valuemax={NAV_MAX_WIDTH}
                  aria-valuenow={navWidth}
                  tabIndex={0}
                  className={`resize-handle desktop-only ${
                    resizingTarget === 'nav' ? 'resize-handle--active' : ''
                  }`}
                  onPointerDown={handleResizeStart('nav')}
                  onKeyDown={handleNavResizeKeyDown}
                />
              </>
            )}

            <section
              className={`pane-canvas ${mobilePane !== 'canvas' ? 'pane--hidden-mobile' : ''}`}
              aria-label={uk.canvas.title}
            >
              {activeView === 'graph' ? (
                <GraphViewPage onBackToWorkspace={() => navigateTo('workspace')} />
              ) : (
                <CanvasWorkspace onOpenTemplates={() => setIsTemplateChooserOpen(true)} />
              )}
            </section>

            {isSourceOpen && (
              <>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={uk.sourceData.resizeHandle}
                  aria-valuemin={SOURCE_MIN_WIDTH}
                  aria-valuemax={getMaxSourceWidth()}
                  aria-valuenow={sourceWidth}
                  tabIndex={0}
                  className={`resize-handle desktop-only ${
                    resizingTarget === 'source' ? 'resize-handle--active' : ''
                  }`}
                  onPointerDown={handleResizeStart('source')}
                  onKeyDown={handleSourceResizeKeyDown}
                />

                <aside
                  className={`pane-source ${
                    mobilePane !== 'sourceData' ? 'pane--hidden-mobile' : ''
                  }`}
                  style={{ width: `${sourceWidth}px` }}
                  aria-label={uk.sourceData.title}
                >
                  <div className="pane-header">
                    <span className="pane-header-title">
                      <Database size={14} />
                      <span>{uk.sourceData.title}</span>
                      <span className="shell-badge shell-badge--neutral">{uk.sourceData.badgePrimary}</span>
                    </span>
                  </div>

                  <div className="pane-source-body">
                    <SourceDataGrid onRequestImportTxt={handleImportClick} />
                  </div>
                </aside>
              </>
            )}
          </main>
        </>
      )}

      {pendingImport && (
        <ImportPreviewModal
          fileName={pendingImport.fileName}
          parsed={pendingImport.parsed}
          onCancel={() => setPendingImport(null)}
          onConfirm={handleConfirmImport}
        />
      )}

      {showTemplatesModal && (
        <TemplateChooserModal
          onSelect={handleSelectTemplate}
          onClose={() => {
            setIsTemplateChooserOpen(false);
            if (needsLayoutChooser) {
              dispatch({ type: 'DISMISS_LAYOUT_CHOOSER' });
            }
          }}
        />
      )}

      {confirmNewOpen && (
        <Modal
          title={uk.header.confirmNewProjectTitle}
          onClose={() => setConfirmNewOpen(false)}
          narrow
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setConfirmNewOpen(false)}
              >
                {uk.header.cancel}
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  clearActiveFileHandle();
                  setLinkedFileName(null);
                  resetSessionProject();
                  setConfirmNewOpen(false);
                  navigateTo('workspace');
                }}
              >
                {uk.header.confirmNewProjectAction}
              </button>
            </>
          }
        >
          <p className="placeholder-text">{uk.header.confirmNewProjectBody}</p>
        </Modal>
      )}
    </div>
  );
}
