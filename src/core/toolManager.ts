import {
  addTool,
  ToolGroupManager,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  TrackballRotateTool,
  LengthTool,
  AngleTool,
  EllipticalROITool,
  CircleROITool,
  RectangleROITool,
  PlanarFreehandROITool,
  BidirectionalTool,
  ArrowAnnotateTool,
  ProbeTool,
  CrosshairsTool,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';
import { TOOL_GROUP_ID, TOOL_GROUP_3D_ID, VP_AXIAL, VP_SAGITTAL, VP_CORONAL } from './constants';
import type { ViewportTool } from '@/types/dicom';

// Reference line colors per orientation (the line representing that plane)
const CROSSHAIR_COLORS: Record<string, string> = {
  [VP_AXIAL]: 'rgb(255, 255, 50)',    // Yellow — axial plane
  [VP_SAGITTAL]: 'rgb(255, 100, 100)', // Red — sagittal plane
  [VP_CORONAL]: 'rgb(100, 220, 100)',  // Green — coronal plane
};

let toolGroupCreated = false;

export function setupTools(): void {
  if (toolGroupCreated) return;

  // Register all tools globally
  addTool(WindowLevelTool);
  addTool(PanTool);
  addTool(ZoomTool);
  addTool(StackScrollTool);
  addTool(TrackballRotateTool);
  addTool(LengthTool);
  addTool(AngleTool);
  addTool(EllipticalROITool);
  addTool(CircleROITool);
  addTool(RectangleROITool);
  addTool(PlanarFreehandROITool);
  addTool(BidirectionalTool);
  addTool(ArrowAnnotateTool);
  addTool(ProbeTool);
  addTool(CrosshairsTool);

  // --- 2D / MPR tool group ---
  const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
  if (!toolGroup) return;

  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(PlanarFreehandROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor: (_vpId: string, refVpId: string) =>
      CROSSHAIR_COLORS[refVpId] || 'rgb(200, 200, 200)',
    getReferenceLineControllable: () => true,
    getReferenceLineDraggableRotatable: () => true,
    getReferenceLineSlabThicknessControlsOn: () => false,
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
  });

  // Default: left click = Window/Level
  setActiveTool('windowLevel');

  // --- 3D tool group ---
  const toolGroup3D = ToolGroupManager.createToolGroup(TOOL_GROUP_3D_ID);
  if (toolGroup3D) {
    toolGroup3D.addTool(TrackballRotateTool.toolName);
    toolGroup3D.addTool(PanTool.toolName);
    toolGroup3D.addTool(ZoomTool.toolName);

    // Left click = rotate
    toolGroup3D.setToolActive(TrackballRotateTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
    });
    // Middle click = pan
    toolGroup3D.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
    });
    // Right click or mouse wheel = zoom (so the 3D view is scrollable/zoomable)
    toolGroup3D.setToolActive(ZoomTool.toolName, {
      bindings: [
        { mouseButton: csToolsEnums.MouseBindings.Secondary },
        { mouseButton: csToolsEnums.MouseBindings.Wheel },
      ],
    });
  }

  toolGroupCreated = true;
}

const TOOL_NAME_MAP: Record<ViewportTool, string> = {
  windowLevel: WindowLevelTool.toolName,
  pan: PanTool.toolName,
  zoom: ZoomTool.toolName,
  scroll: StackScrollTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  ellipticalRoi: EllipticalROITool.toolName,
  circleRoi: CircleROITool.toolName,
  rectangleRoi: RectangleROITool.toolName,
  freehandRoi: PlanarFreehandROITool.toolName,
  bidirectional: BidirectionalTool.toolName,
  arrowAnnotate: ArrowAnnotateTool.toolName,
  probe: ProbeTool.toolName,
  crosshairs: CrosshairsTool.toolName,
};

const ALL_PRIMARY_TOOLS = Object.values(TOOL_NAME_MAP);

export function setActiveTool(tool: ViewportTool): void {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (!toolGroup) return;

  // Deactivate all primary-button tools (crosshairs → disabled to avoid warning)
  for (const t of ALL_PRIMARY_TOOLS) {
    if (t === CrosshairsTool.toolName) {
      toolGroup.setToolDisabled(t);
    } else {
      toolGroup.setToolPassive(t);
    }
  }

  const csToolName = TOOL_NAME_MAP[tool];
  if (!csToolName) return;

  // CrosshairsTool requires multiple viewports — skip activation if not enough
  if (tool === 'crosshairs') {
    const vpIds = toolGroup.getViewportIds();
    if (vpIds.length < 2) {
      console.warn('[DQ-DICOM] Crosshairs requires MPR layout (2+ viewports)');
      return;
    }
  }

  toolGroup.setToolActive(csToolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
  });

  // Middle click = Pan (always active)
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Auxiliary }],
  });

  // Right click = Zoom (always active)
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Secondary }],
  });

  // Mouse wheel = Scroll through slices (always active)
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: csToolsEnums.MouseBindings.Wheel }],
  });
}

export function addViewportToToolGroup(viewportId: string, renderingEngineId: string): void {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (toolGroup) {
    toolGroup.addViewport(viewportId, renderingEngineId);
  }
}

export function addViewportTo3DToolGroup(viewportId: string, renderingEngineId: string): void {
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_3D_ID);
  if (toolGroup) {
    toolGroup.addViewport(viewportId, renderingEngineId);
  }
}
