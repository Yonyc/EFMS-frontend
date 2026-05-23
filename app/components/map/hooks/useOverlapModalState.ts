import { useReducer, useCallback } from "react";
import type { OverlapWarning, ManualEditContext } from "../types";

interface State {
    overlapWarning: OverlapWarning | null;
    showPreview: boolean;
    previewVisibility: { original: boolean; fixed: boolean };
    manualEditContext: ManualEditContext | null;
    pendingManualEditId: string | null;
}

const initialState: State = {
    overlapWarning: null,
    showPreview: false,
    previewVisibility: { original: false, fixed: true },
    manualEditContext: null,
    pendingManualEditId: null,
};

type Action =
    | { type: 'flagOverlap'; warning: OverlapWarning }
    | { type: 'dismissOverlap' }
    | { type: 'setShowPreview'; show: boolean }
    | { type: 'setPreviewVisibility'; updater: (prev: State['previewVisibility']) => State['previewVisibility'] }
    | { type: 'startManualEdit'; pendingId: string; context: ManualEditContext }
    | { type: 'clearManualEdit' }
    | { type: 'restoreOverlapFromContext'; warning: OverlapWarning }
    | { type: '_setOverlapWarning'; warning: OverlapWarning | null }
    | { type: '_setManualEditContext'; context: ManualEditContext | null }
    | { type: '_setPendingManualEditId'; id: string | null };

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'flagOverlap':
            // a fresh overlap always starts with the preview hidden
            return { ...state, overlapWarning: action.warning, showPreview: false };
        case 'dismissOverlap':
            return { ...state, overlapWarning: null, showPreview: false };
        case 'setShowPreview':
            return { ...state, showPreview: action.show };
        case 'setPreviewVisibility':
            return { ...state, previewVisibility: action.updater(state.previewVisibility) };
        case 'startManualEdit':
            return { ...state, pendingManualEditId: action.pendingId, manualEditContext: action.context };
        case 'clearManualEdit':
            return { ...state, pendingManualEditId: null, manualEditContext: null };
        case 'restoreOverlapFromContext':
            // user cancelled a manual edit launched from the modal, restore the warning
            return {
                ...state,
                overlapWarning: action.warning,
                showPreview: false,
                pendingManualEditId: null,
                manualEditContext: null,
            };
        case '_setOverlapWarning':
            // back-compat shim, clearing the warning also hides the preview to keep them in sync
            return action.warning === null
                ? { ...state, overlapWarning: null, showPreview: false }
                : { ...state, overlapWarning: action.warning };
        case '_setManualEditContext':
            return { ...state, manualEditContext: action.context };
        case '_setPendingManualEditId':
            return { ...state, pendingManualEditId: action.id };
        default:
            return state;
    }
}

export function useOverlapModalState() {
    const [state, dispatch] = useReducer(reducer, initialState);

    const flagOverlap = useCallback((warning: OverlapWarning) => dispatch({ type: 'flagOverlap', warning }), []);
    const dismissOverlap = useCallback(() => dispatch({ type: 'dismissOverlap' }), []);
    const startManualEdit = useCallback(
        (pendingId: string, context: ManualEditContext) => dispatch({ type: 'startManualEdit', pendingId, context }),
        [],
    );
    const clearManualEdit = useCallback(() => dispatch({ type: 'clearManualEdit' }), []);
    const restoreOverlapFromContext = useCallback(
        (warning: OverlapWarning) => dispatch({ type: 'restoreOverlapFromContext', warning }),
        [],
    );
    const setShowPreview = useCallback((show: boolean) => dispatch({ type: 'setShowPreview', show }), []);
    const setPreviewVisibility = useCallback(
        (updater: (prev: { original: boolean; fixed: boolean }) => { original: boolean; fixed: boolean }) =>
            dispatch({ type: 'setPreviewVisibility', updater }),
        [],
    );

    // raw setters for external consumers that still pass these around, prefer the atomic actions internally
    const setOverlapWarning = useCallback(
        (w: OverlapWarning | null) => dispatch({ type: '_setOverlapWarning', warning: w }),
        [],
    );
    const setManualEditContext = useCallback(
        (c: ManualEditContext | null) => dispatch({ type: '_setManualEditContext', context: c }),
        [],
    );
    const setPendingManualEditId = useCallback(
        (id: string | null) => dispatch({ type: '_setPendingManualEditId', id }),
        [],
    );

    return {
        overlapWarning: state.overlapWarning,
        showPreview: state.showPreview,
        previewVisibility: state.previewVisibility,
        manualEditContext: state.manualEditContext,
        pendingManualEditId: state.pendingManualEditId,
        flagOverlap,
        dismissOverlap,
        startManualEdit,
        clearManualEdit,
        restoreOverlapFromContext,
        setShowPreview,
        setPreviewVisibility,
        setOverlapWarning,
        setManualEditContext,
        setPendingManualEditId,
    };
}
