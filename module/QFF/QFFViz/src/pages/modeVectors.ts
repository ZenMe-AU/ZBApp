/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { store } from "../data/store";
import { modeColor } from "../shared/modes";
import { modeGeometry } from "../shared/modeGeometry";
import { modeHelp } from "../shared/modeHelp";
import { renderVector3d, type Vector3dData, type Vector3dOptions } from "../shared/vector3d";

interface VectorRow {
  id: string
  mode: string
  type: string
  text: string
  weight: number | null
  parentCosine: number | null
  siblingCosine: number | null
  rival: string
  gap: number | null
}

const score = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(3));

function modeVectorData(): Vector3dData<VectorRow> {
  const modes = store.modes!.data;
  const geometry = modeGeometry(modes);
  const preview = geometry.points.filter(point => point.submode === null && point.issue).map(point => point.mode);
  return {
    points: geometry.points.map((point) => {
      const alignment = geometry.alignment.find(item => item.point.id === point.id);
      const mode = modes.modes[point.mode];
      return {
        row: {
          id: point.id, mode: point.mode, type: point.submode === null ? "Mode" : "Submode",
          text: point.text, weight: point.weight,
          parentCosine: alignment?.parentScore ?? null, siblingCosine: alignment?.siblingScore ?? null,
          rival: alignment?.rival?.mode ?? "", gap: alignment?.margin ?? null,
        },
        vector: point.vector,
        group: point.mode,
        color: modeColor(point.mode),
        shape: point.submode === null ? "triangle" : "circle",
        size: point.submode === null ? 10 : point.weight === 0 ? 4 : 6,
        selectedSize: point.submode === null ? 13 : 10,
        label: point.submode === null ? `${point.mode} (mode)` : point.text,
        detail: point.submode === null ? mode.definition : mode.submodes[point.submode].definition,
        note: point.issue ? "Preview average" : undefined,
      };
    }),
    warnings: geometry.warnings,
    notices: [
      ...(store.areModesDirty ? ["Showing unsaved mode draft."] : []),
      ...(preview.length ? [`Preview averages: ${preview.join(", ")}. Recalculate in Edit to persist.`] : []),
    ],
  };
}

function renderModes3d(root: HTMLElement, engine: "plotly" | "echarts"): () => void {
  const title = engine === "echarts" ? "3DE" : "3D";
  const options: Vector3dOptions<VectorRow> = {
    title: `Modes: ${title}`,
    helpTitle: `Mode ${title.toLowerCase()} and outliers`,
    help: modeHelp,
    engine,
    fields: [
      { field: "mode", label: "Mode" },
      { field: "type", label: "Type" },
      { field: "text", label: "Submode / mode text" },
      { field: "weight", label: "Weight" },
      { field: "parentCosine", label: "Parent cosine" },
      { field: "siblingCosine", label: "Sibling cosine" },
      { field: "rival", label: "Rival mode" },
      { field: "gap", label: "Gap" },
    ],
    columns: [
      { field: "mode", filter: "agTextColumnFilter", cellStyle: p => ({ color: modeColor(p.value) }) },
      { field: "type", filter: "agTextColumnFilter" },
      { field: "text", headerName: "Submode / mode text", filter: "agTextColumnFilter", flex: 3, minWidth: 250, wrapText: true, autoHeight: true },
      { field: "weight", filter: "agNumberColumnFilter" },
      ...(["parentCosine", "siblingCosine", "gap"] as const).map(field => ({
        field, filter: "agNumberColumnFilter", valueFormatter: (p: { value: number | null }) => score(p.value),
      })),
      { field: "rival", filter: "agTextColumnFilter" },
    ],
    emptyMessage: "No visible valid vectors. Show all or refresh missing embeddings.",
    getData: modeVectorData,
    subscribe: (refresh) => {
      store.addEventListener("modes", refresh);
      return () => store.removeEventListener("modes", refresh);
    },
  };
  return renderVector3d(root, options);
}

export const render3d = (root: HTMLElement): (() => void) => renderModes3d(root, "plotly");
export const render3dE = (root: HTMLElement): (() => void) => renderModes3d(root, "echarts");
