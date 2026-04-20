import { useReducer, useCallback } from "react";
import specReducer from "./specReducer";

const MAX_HISTORY = 50;

/**
 * Generate a human-readable label for an action.
 */
function actionLabel(action) {
  switch (action.type) {
    case "SET_DIMENSION":
      return `Set ${action.id} ${action.field} to ${action.value}"`;
    case "SET_LABEL":
      return `Rename ${action.id}`;
    case "DELETE_CABINET":
      return `Delete ${action.id}`;
    case "ADD_CABINET":
      return `Add ${action.cabinet?.id || "cabinet"}`;
    case "DUPLICATE_CABINET":
      return `Duplicate ${action.id}`;
    case "SPLIT_CABINET":
      return `Split ${action.id}`;
    case "MOVE_CABINET":
      return `Move ${action.id} ${action.direction}`;
    case "MOVE_ROW":
      return `Move ${action.id} to ${action.targetRow}`;
    case "NUDGE_CABINET":
      return `Nudge ${action.id} ${action.amount > 0 ? "right" : "left"}`;
    case "NUDGE_VERTICAL":
      return `Shift ${action.id} ${action.amount > 0 ? "down" : "up"}`;
    case "CHANGE_TYPE":
      return `Change ${action.id} to ${action.newType}`;
    case "ADD_SECTION":
      // Dispatches use `cabId` (not `id`). Previously labeled "Add section to undefined".
      return `Add section to ${action.cabId}`;
    case "REMOVE_SECTION":
      return `Remove section from ${action.cabId}`;
    case "UPDATE_SECTION":
      return `Update section on ${action.cabId}`;
    case "MERGE_CABINETS":
      return `Merge ${action.targetId} into ${action.sourceId}`;
    case "ADD_GAP":
      return `Add gap`;
    case "DELETE_GAP":
      return `Delete gap ${action.id}`;
    case "UPDATE_GAP":
      return `Update gap ${action.id}`;
    case "SET_ALIGNMENT":
      return `Align ${action.wall} to ${action.base}`;
    case "REMOVE_ALIGNMENT":
      return `Remove alignment for ${action.wall}`;
    case "REORDER_CABINET":
      return `Reorder ${action.id}`;
    case "SET_FRAME_STYLE":
      return `Set frame style to ${action.value}`;
    case "SET_SCRIBE":
      return `Set scribe on ${action.id}`;
    case "SET_SECTION_OVERRIDE":
      return `Override door size on ${action.cabId}`;
    default:
      return action.type;
  }
}

// History entries: { spec, label }
function historyReducer(state, action) {
  switch (action.type) {
    case "UNDO": {
      if (state.past.length === 0) return state;
      const entry = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      return {
        past: newPast,
        present: entry.spec,
        future: [{ spec: state.present, label: entry.label }, ...state.future],
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const entry = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, { spec: state.present, label: entry.label }],
        present: entry.spec,
        future: newFuture,
      };
    }

    default: {
      const newPresent = specReducer(state.present, action);

      // LOAD_SPEC resets history — extraction is the undo floor
      if (action.type === "LOAD_SPEC") {
        return { past: [], present: newPresent, future: [] };
      }

      const label = actionLabel(action);
      const entry = { spec: state.present, label };
      const newPast =
        state.past.length >= MAX_HISTORY
          ? [...state.past.slice(1), entry]
          : [...state.past, entry];

      return {
        past: newPast,
        present: newPresent,
        future: [],
      };
    }
  }
}

export default function useSpecState(initialSpec) {
  const [state, rawDispatch] = useReducer(historyReducer, {
    past: [],
    present: initialSpec,
    future: [],
  });

  const dispatch = useCallback((action) => rawDispatch(action), []);
  const undo = useCallback(() => rawDispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => rawDispatch({ type: "REDO" }), []);

  // Labels for tooltip display
  const undoLabel = state.past.length > 0 ? state.past[state.past.length - 1].label : null;
  const redoLabel = state.future.length > 0 ? state.future[0].label : null;

  return {
    spec: state.present,
    dispatch,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    undoLabel,
    redoLabel,
  };
}
