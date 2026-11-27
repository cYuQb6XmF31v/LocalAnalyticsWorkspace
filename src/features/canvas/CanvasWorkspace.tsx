import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  BarChart3,
  ChevronDown,
  Columns2,
  Columns3,
  Filter,
  Grid3x3,
  Hash,
  Keyboard,
  LayoutTemplate,
  LineChart,
  Magnet,
  Maximize2,
  PieChart,
  Plus,
  ScatterChart,
  SlidersHorizontal,
  StickyNote,
  Table,
  Undo2,
  X,
} from 'lucide-react';
import { useProject } from '../../app/ProjectContext';
import { CustomSelect } from '../../components/CustomSelect';
import { createStableId } from '../../domain/id';
import type { CanvasElement, CanvasElementType, Position } from '../../domain/models';
import { uk } from '../../i18n/uk';
import {
  CanvasPaneView,
  createDefaultElement,
  isEditableTarget,
  type CanvasPaneHandle,
} from './CanvasPaneView';
import { ElementConfigPanel } from './ElementConfigPanel';
import { FiltersModal } from './FiltersModal';
import './CanvasWorkspace.css';

interface CanvasWorkspaceProps {
  onOpenTemplates: () => void;
}

export function CanvasWorkspace({ onOpenTemplates }: CanvasWorkspaceProps) {
  const { state, dispatch, undo, canUndo } = useProject();
  const canvases = state.project.canvases;

  // Multi-pane support: 1..4 simultaneous Canvas views
  const [panePageIds, setPanePageIds] = useState<string[]>(() => [state.activePageId]);
  const [focusedPaneIndex, setFocusedPaneIndex] = useState<number>(0);

  const [configTarget, setConfigTarget] = useState<{
    pageId: string;
    elementId: string;
  } | null>(null);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [renamingTabPageId, setRenamingTabPageId] = useState<string | null>(null);
  const [tabRenameDraft, setTabRenameDraft] = useState('');
  const [openToolbarMenu, setOpenToolbarMenu] = useState<'charts' | 'tables' | null>(null);
  const [showHotkeysHint, setShowHotkeysHint] = useState(true);
  const [autoConfigOnSelect, setAutoConfigOnSelect] = useState(true);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const toolbarMenuRef = useRef<HTMLDivElement | null>(null);
  const paneRefs = useRef<Array<CanvasPaneHandle | null>>([]);
  const lastFocusedSelectionRef = useRef<string | null>(null);

  // Resolve valid pages for each pane, and keep single-pane synced with state.activePageId
  const resolvedPanePages = panePageIds.map((pid, idx) => {
    if (panePageIds.length === 1 && idx === 0) {
      return canvases.find((c) => c.id === state.activePageId) ?? canvases[0];
    }
    return canvases.find((c) => c.id === pid) ?? canvases[0];
  });

  const safeFocusIndex = Math.min(focusedPaneIndex, Math.max(0, resolvedPanePages.length - 1));
  const focusedPage = resolvedPanePages[safeFocusIndex] ?? canvases[0];
  const dataset = state.project.primaryDataset;

  // Keep panePageIds synchronized if activePageId changes externally (e.g. Navigator Tree click)
  useEffect(() => {
    setPanePageIds((prev) => {
      if (prev.length === 1) {
        return prev[0] === state.activePageId ? prev : [state.activePageId];
      }
      // In multi-pane mode, if focused pane doesn't contain selectedElementId, point focused pane to activePageId
      if (prev.includes(state.activePageId)) {
        const idx = prev.indexOf(state.activePageId);
        if (idx >= 0) setFocusedPaneIndex(idx);
        return prev;
      }
      const next = [...prev];
      next[safeFocusIndex] = state.activePageId;
      return next;
    });
  }, [state.activePageId]);

  useEffect(() => {
    if (!configTarget) return;
    const pg = canvases.find((p) => p.id === configTarget.pageId);
    if (!pg || !pg.elements.some((el) => el.id === configTarget.elementId)) {
      setConfigTarget(null);
    }
  }, [canvases, configTarget]);

  useEffect(() => {
    if (autoConfigOnSelect && state.selectedElementId) {
      const targetPage =
        canvases.find((p) => p.elements.some((el) => el.id === state.selectedElementId)) ??
        focusedPage;
      setConfigTarget({ pageId: targetPage.id, elementId: state.selectedElementId });
    }
  }, [state.selectedElementId, autoConfigOnSelect, canvases, focusedPage]);

  useEffect(() => {
    if (!openToolbarMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        toolbarMenuRef.current &&
        event.target instanceof Node &&
        !toolbarMenuRef.current.contains(event.target)
      ) {
        setOpenToolbarMenu(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenToolbarMenu(null);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [openToolbarMenu]);

  const handleConfigureElement = useCallback(
    (pageId: string, elementId: string | null, toggle = false) => {
      if (!elementId) {
        setConfigTarget(null);
        return;
      }
      setConfigTarget((prev) =>
        toggle && prev?.elementId === elementId && prev?.pageId === pageId
          ? null
          : { pageId, elementId },
      );
    },
    [],
  );

  const handleAddElementToPage = useCallback(
    (pageId: string, type: CanvasElementType, explicitPosition?: Position) => {
      const targetPage = canvases.find((p) => p.id === pageId) ?? focusedPage;
      const element = createDefaultElement(
        type,
        targetPage.elements.length,
        dataset,
        explicitPosition,
      );
      lastFocusedSelectionRef.current = element.id;
      dispatch({
        type: 'ADD_ELEMENT',
        pageId: targetPage.id,
        element,
        select: true,
      });
      if (type !== 'note') {
        setConfigTarget({ pageId: targetPage.id, elementId: element.id });
      }
    },
    [canvases, focusedPage, dataset, dispatch],
  );

  const handleDuplicateElementOnPage = useCallback(
    (pageId: string, element: CanvasElement) => {
      const copy: CanvasElement = {
        ...element,
        id: createStableId('el'),
        position: {
          x: element.position.x + 28,
          y: element.position.y + 28,
        },
        config: {
          ...element.config,
          title: `${element.config.title} (копія)`,
        },
      } as CanvasElement;

      lastFocusedSelectionRef.current = copy.id;
      dispatch({
        type: 'ADD_ELEMENT',
        pageId,
        element: copy,
        select: true,
      });
    },
    [dispatch],
  );

  const handleAddSplitPane = () => {
    if (panePageIds.length >= 4) return;
    const unusedPage = canvases.find((p) => !panePageIds.includes(p.id));
    const nextPageId = unusedPage?.id ?? canvases[Math.min(panePageIds.length, canvases.length - 1)]?.id ?? focusedPage.id;
    setPanePageIds((prev) => [...prev, nextPageId]);
    setFocusedPaneIndex(panePageIds.length);
  };

  const handleCloseSplitPane = (idx: number) => {
    if (panePageIds.length <= 1) return;
    setPanePageIds((prev) => prev.filter((_, i) => i !== idx));
    setFocusedPaneIndex((prevFocus) =>
      prevFocus >= idx ? Math.max(0, prevFocus - 1) : prevFocus,
    );
  };

  const handleSelectSheetTab = (pageId: string) => {
    dispatch({ type: 'SELECT_PAGE', pageId });
    setPanePageIds((prev) => {
      const next = [...prev];
      next[safeFocusIndex] = pageId;
      return next;
    });
  };

  // Workspace keyboard shortcuts acting on focused pane
  useEffect(() => {
    const handleCanvasHotkeys = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (document.querySelector('.modal-backdrop')) return;

      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && !event.shiftKey) {
        if (event.code === 'KeyD') {
          const primaryEl = state.selectedElementId
            ? focusedPage.elements.find((e) => e.id === state.selectedElementId)
            : null;
          if (primaryEl) {
            event.preventDefault();
            handleDuplicateElementOnPage(focusedPage.id, primaryEl);
          }
          return;
        }
        if (event.code === 'KeyA' && focusedPage.elements.length > 0) {
          event.preventDefault();
          const allIds = focusedPage.elements.map((e) => e.id);
          dispatch({
            type: 'SELECT_ELEMENTS',
            elementIds: allIds,
            primaryId: allIds[0] ?? null,
            pageId: focusedPage.id,
          });
          return;
        }
      }

      if (mod || event.altKey) return;

      if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
        event.preventDefault();
        setShowHotkeysHint((prev) => !prev);
        return;
      }

      switch (event.code) {
        case 'KeyN':
          event.preventDefault();
          handleAddElementToPage(focusedPage.id, 'note');
          break;
        case 'KeyK':
          event.preventDefault();
          handleAddElementToPage(focusedPage.id, 'kpi');
          break;
        case 'KeyC':
          event.preventDefault();
          handleAddElementToPage(focusedPage.id, 'bar-chart');
          break;
        case 'KeyG':
          event.preventDefault();
          setSnapEnabled((prev) => !prev);
          break;
        case 'KeyF':
          event.preventDefault();
          paneRefs.current[safeFocusIndex]?.fitView();
          break;
        case 'Digit0':
          event.preventDefault();
          paneRefs.current[safeFocusIndex]?.resetViewport();
          break;
        case 'Escape':
          if (configTarget) {
            setConfigTarget(null);
          } else if (state.selectedElementId) {
            lastFocusedSelectionRef.current = null;
            dispatch({ type: 'SELECT_ELEMENT', elementId: null, pageId: focusedPage.id });
          }
          break;
      }
    };

    window.addEventListener('keydown', handleCanvasHotkeys);
    return () => window.removeEventListener('keydown', handleCanvasHotkeys);
  }, [
    configTarget,
    dispatch,
    focusedPage,
    handleAddElementToPage,
    handleDuplicateElementOnPage,
    safeFocusIndex,
    state.selectedElementId,
  ]);

  const configElement = configTarget
    ? canvases
        .find((p) => p.id === configTarget.pageId)
        ?.elements.find((el) => el.id === configTarget.elementId) ?? null
    : null;

  const isMultiPane = resolvedPanePages.length > 1;
  const gridClass =
    resolvedPanePages.length === 1
      ? 'cw-panes-grid cw-panes-grid--1'
      : resolvedPanePages.length === 2
        ? 'cw-panes-grid cw-panes-grid--2'
        : resolvedPanePages.length === 3
          ? 'cw-panes-grid cw-panes-grid--3'
          : 'cw-panes-grid cw-panes-grid--4';

  return (
    <div className="cw-root">
      <div className="cw-toolbar">
        <div className="cw-toolbar-group" ref={toolbarMenuRef}>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => {
              handleAddElementToPage(focusedPage.id, 'note');
              setOpenToolbarMenu(null);
            }}
          >
            <StickyNote size={13} />
            <span>{uk.canvas.addNote}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => {
              handleAddElementToPage(focusedPage.id, 'kpi');
              setOpenToolbarMenu(null);
            }}
          >
            <Hash size={13} />
            <span>{uk.canvas.addKpi}</span>
          </button>

          <div className="cw-dropdown-wrap">
            <button
              type="button"
              className={`icon-btn icon-btn--outlined ${openToolbarMenu === 'charts' ? 'icon-btn--active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openToolbarMenu === 'charts'}
              onClick={() =>
                setOpenToolbarMenu((prev) => (prev === 'charts' ? null : 'charts'))
              }
            >
              <BarChart3 size={13} />
              <span>Графіки</span>
              <ChevronDown size={12} className="cw-dropdown-chevron" />
            </button>
            {openToolbarMenu === 'charts' && (
              <div className="cw-dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'line-chart');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <LineChart size={13} />
                    <span>Лінійний графік</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'bar-chart');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <BarChart3 size={13} />
                    <span>Стовпчиковий графік</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'histogram');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <BarChart2 size={13} />
                    <span>Гістограма розподілу</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'pie-chart');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <PieChart size={13} />
                    <span>Кругова діаграма</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'stacked-bar');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <BarChart3 size={13} />
                    <span>Складений графік</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'scatter');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <ScatterChart size={13} />
                    <span>Точкова діаграма</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="cw-dropdown-wrap">
            <button
              type="button"
              className={`icon-btn icon-btn--outlined ${openToolbarMenu === 'tables' ? 'icon-btn--active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openToolbarMenu === 'tables'}
              onClick={() =>
                setOpenToolbarMenu((prev) => (prev === 'tables' ? null : 'tables'))
              }
            >
              <Table size={13} />
              <span>Таблиці та дошки</span>
              <ChevronDown size={12} className="cw-dropdown-chevron" />
            </button>
            {openToolbarMenu === 'tables' && (
              <div className="cw-dropdown-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'table-view');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <Table size={13} />
                    <span>Таблиця перегляду</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'pivot-table');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <Grid3x3 size={13} />
                    <span>Зведена таблиця</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cw-context-item"
                  onClick={() => {
                    handleAddElementToPage(focusedPage.id, 'kanban');
                    setOpenToolbarMenu(null);
                  }}
                >
                  <span className="cw-context-item-left">
                    <Columns3 size={13} />
                    <span>Kanban-дошка</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="cw-toolbar-group">
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            disabled={!canUndo}
            onClick={undo}
            title="Скасувати останню дію (Ctrl+Z)"
            aria-label="Скасувати (Ctrl+Z)"
          >
            <Undo2 size={13} />
          </button>

          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${isMultiPane ? 'icon-btn--active' : ''}`}
            disabled={panePageIds.length >= 4}
            onClick={handleAddSplitPane}
            title="Відкрити ще одну панель Canvas поруч (до 4 панелей одночасно)"
          >
            <Columns2 size={13} />
            <span>{isMultiPane ? `+ Панель (${resolvedPanePages.length}/4)` : '+ Панель'}</span>
          </button>

          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${(focusedPage.filterIds?.length ?? 0) > 0 ? 'icon-btn--active' : ''}`}
            onClick={() => setIsFiltersOpen(true)}
            title="Багаторазові фільтри проєкту та сторінки"
          >
            <Filter size={13} />
            <span>
              Фільтри
              {(focusedPage.filterIds?.length ?? 0) > 0 ? ` (${focusedPage.filterIds!.length})` : ''}
            </span>
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${autoConfigOnSelect ? 'icon-btn--active' : ''}`}
            onClick={() => setAutoConfigOnSelect((prev) => !prev)}
            title={
              autoConfigOnSelect
                ? 'Авто-відкриття властивостей при натисканні на елемент увімкнено (клік щоб вимкнути)'
                : 'Авто-відкриття властивостей при натисканні вимкнено (клік щоб увімкнути)'
            }
          >
            <SlidersHorizontal size={13} />
            <span>Авто-налашт.</span>
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--outlined ${snapEnabled ? 'icon-btn--active' : ''}`}
            onClick={() => setSnapEnabled((prev) => !prev)}
            title={
              snapEnabled
                ? 'Прив’язка та напрямні увімкнені (клік щоб вимкнути)'
                : 'Прив’язка вимкнена (клік щоб увімкнути)'
            }
          >
            <Magnet size={13} />
            <span>Прив’язка</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate size={13} />
            <span>{uk.canvas.templatesBtn}</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--outlined"
            onClick={() => paneRefs.current[safeFocusIndex]?.fitView()}
            title={uk.canvas.fitView}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      <div className="cw-panes-area">
        <div className={gridClass}>
          {resolvedPanePages.map((panePage, idx) => {
            const isFocused = idx === safeFocusIndex;
            return (
              <div
                key={`pane-${idx}`}
                className={`cw-pane-cell ${isMultiPane && isFocused ? 'cw-pane-cell--focused' : ''}`}
                onPointerDown={() => {
                  setFocusedPaneIndex(idx);
                  if (panePage.id !== state.activePageId) {
                    dispatch({ type: 'SELECT_PAGE', pageId: panePage.id });
                  }
                }}
              >
                {isMultiPane && (
                  <div className="cw-pane-bar">
                    <span className="cw-pane-title">
                      <span
                        className={`cw-pane-dot ${isFocused ? 'cw-pane-dot--active' : ''}`}
                        aria-hidden="true"
                      />
                      <span>Панель {idx + 1}</span>
                    </span>

                    <div className="cw-pane-select-wrap">
                      <CustomSelect
                        size="xs"
                        ariaLabel={`Сторінка для панелі ${idx + 1}`}
                        value={panePage.id}
                        options={canvases.map((c) => ({
                          value: c.id,
                          label: `${c.name} (${c.elements.length})`,
                        }))}
                        onChange={(nextPid) => {
                          setPanePageIds((prev) => {
                            const next = [...prev];
                            next[idx] = nextPid;
                            return next;
                          });
                          setFocusedPaneIndex(idx);
                          dispatch({ type: 'SELECT_PAGE', pageId: nextPid });
                        }}
                      />
                    </div>

                    <div className="cw-pane-actions">
                      <button
                        type="button"
                        className="sd-mini-btn"
                        title="Вписати аркуш цієї панелі"
                        aria-label={`Вписати панель ${idx + 1}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          paneRefs.current[idx]?.fitView();
                        }}
                      >
                        <Maximize2 size={11} />
                      </button>
                      <button
                        type="button"
                        className="sd-mini-btn"
                        title="Закрити цю панель Canvas"
                        aria-label={`Закрити панель ${idx + 1}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseSplitPane(idx);
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                )}

                <CanvasPaneView
                  ref={(el) => {
                    paneRefs.current[idx] = el;
                  }}
                  page={panePage}
                  snapEnabled={snapEnabled}
                  autoConfigOnSelect={autoConfigOnSelect}
                  lastFocusedSelectionRef={lastFocusedSelectionRef}
                  onFocusPane={() => setFocusedPaneIndex(idx)}
                  onConfigureElement={handleConfigureElement}
                  onAddElement={handleAddElementToPage}
                  onDuplicateElement={handleDuplicateElementOnPage}
                  onOpenTemplates={onOpenTemplates}
                />
              </div>
            );
          })}
        </div>

        {showHotkeysHint ? (
          <aside className="cw-hotkeys-card" aria-label="Підказка гарячих клавіш">
            <div className="cw-hotkeys-head">
              <span className="cw-hotkeys-title">
                <Keyboard size={12} />
                <span>Гарячі клавіші</span>
              </span>
              <button
                type="button"
                className="sd-mini-btn"
                onClick={() => setShowHotkeysHint(false)}
                title="Приховати підказку (?)"
                aria-label="Приховати підказку гарячих клавіш"
              >
                <X size={12} />
              </button>
            </div>
            <div className="cw-hotkeys-grid">
              <div className="cw-hotkey-item"><kbd>N</kbd><span>Нотатка</span></div>
              <div className="cw-hotkey-item"><kbd>K</kbd><span>KPI</span></div>
              <div className="cw-hotkey-item"><kbd>C</kbd><span>Графік</span></div>
              <div className="cw-hotkey-item"><kbd>G</kbd><span>Прив’язка</span></div>
              <div className="cw-hotkey-item"><kbd>F</kbd><span>Вписати</span></div>
              <div className="cw-hotkey-item"><kbd>0</kbd><span>100%</span></div>
              <div className="cw-hotkey-item"><kbd>Ctrl+D</kbd><span>Дублювати</span></div>
              <div className="cw-hotkey-item"><kbd>Ctrl+A</kbd><span>Обрати всі</span></div>
              <div className="cw-hotkey-item"><kbd>Ctrl+Z</kbd><span>Скасувати</span></div>
              <div className="cw-hotkey-item"><kbd>Del</kbd><span>Видалити</span></div>
              <div className="cw-hotkey-item"><kbd>Shift+G</kbd><span>Граф</span></div>
              <div className="cw-hotkey-item"><kbd>?</kbd><span>Підказка</span></div>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            className="cw-hotkeys-pill"
            onClick={() => setShowHotkeysHint(true)}
            title="Показати підказку гарячих клавіш (?)"
            aria-label="Показати гарячі клавіші"
          >
            <Keyboard size={12} />
            <span>Клавіші</span>
            <kbd>?</kbd>
          </button>
        )}

        {configTarget && configElement && (
          <ElementConfigPanel
            pageId={configTarget.pageId}
            element={configElement}
            onClose={() => setConfigTarget(null)}
          />
        )}

        {isFiltersOpen && (
          <FiltersModal pageId={focusedPage.id} onClose={() => setIsFiltersOpen(false)} />
        )}
      </div>

      {/* Excel-like bottom sheet tabs for Canvas pages */}
      <div className="cw-sheet-tabs" role="tablist" aria-label="Сторінки Canvas">
        <div className="cw-sheet-tabs-scroll">
          {canvases.map((page) => {
            const isActive = page.id === focusedPage.id;
            const isRenaming = renamingTabPageId === page.id;
            return isRenaming ? (
              <input
                key={page.id}
                type="text"
                className="cw-sheet-tab-input"
                value={tabRenameDraft}
                autoFocus
                onChange={(e) => setTabRenameDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = tabRenameDraft.trim();
                  if (trimmed) {
                    dispatch({ type: 'RENAME_PAGE', pageId: page.id, name: trimmed });
                  }
                  setRenamingTabPageId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const trimmed = tabRenameDraft.trim();
                    if (trimmed) {
                      dispatch({ type: 'RENAME_PAGE', pageId: page.id, name: trimmed });
                    }
                    setRenamingTabPageId(null);
                  } else if (e.key === 'Escape') {
                    setRenamingTabPageId(null);
                  }
                }}
              />
            ) : (
              <button
                key={page.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`cw-sheet-tab ${isActive ? 'cw-sheet-tab--active' : ''}`}
                onClick={() => handleSelectSheetTab(page.id)}
                onDoubleClick={() => {
                  setRenamingTabPageId(page.id);
                  setTabRenameDraft(page.name);
                }}
                title="Клік — перейти · Подвійний клік — перейменувати"
              >
                <span>{page.name}</span>
                {page.elements.length > 0 && (
                  <span className="cw-sheet-tab-count">{page.elements.length}</span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="cw-sheet-add-btn"
          onClick={() =>
            dispatch({
              type: 'ADD_PAGE',
              name: `Сторінка ${canvases.length + 1}`,
              activate: true,
            })
          }
          title={uk.navigator.addPage}
          aria-label={uk.navigator.addPage}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
