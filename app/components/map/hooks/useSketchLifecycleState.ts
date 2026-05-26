import { useReducer, useCallback, useRef, useMemo } from "react";

type Pt = [number, number];

interface CreatingState {
    kind: 'creating';
    points: Pt[];
    ghost: Pt[];
    previewPoint: Pt | null;
    insertPreview: Pt[] | null;
}

interface EditingState {
    kind: 'editing';
    id: string;
    originalCoords: Pt[];
    points: Pt[];
    ghost: Pt[];
    previewPoint: Pt | null;
    insertPreview: Pt[] | null;
}

export type SketchState = { kind: 'idle' } | CreatingState | EditingState;

const initial: SketchState = { kind: 'idle' };

// stable empty references so derived selectors keep reference equality across renders
const EMPTY_POINTS: Pt[] = [];

type Action =
    | { type: 'beginCreate' }
    | { type: 'beginEdit'; id: string; originalCoords: Pt[]; ghost: Pt[] }
    | { type: 'goIdle' }
    | { type: 'setPoints'; points: Pt[] }
    | { type: 'setGhost'; ghost: Pt[] }
    | { type: 'setPreviewPoint'; preview: Pt | null }
    | { type: 'setInsertPreview'; preview: Pt[] | null };

function reducer(state: SketchState, action: Action): SketchState {
    switch (action.type) {
        case 'beginCreate':
            return { kind: 'creating', points: [], ghost: [], previewPoint: null, insertPreview: null };
        case 'beginEdit':
            return {
                kind: 'editing',
                id: action.id,
                originalCoords: action.originalCoords,
                points: action.originalCoords,
                ghost: action.ghost,
                previewPoint: null,
                insertPreview: null,
            };
        case 'goIdle':
            return { kind: 'idle' };
        case 'setPoints':
            if (state.kind === 'idle') return state;
            // mutating the points always invalidates the insert preview
            return { ...state, points: action.points, insertPreview: null };
        case 'setGhost':
            if (state.kind === 'idle') return state;
            return { ...state, ghost: action.ghost };
        case 'setPreviewPoint':
            if (state.kind === 'idle') return state;
            return { ...state, previewPoint: action.preview };
        case 'setInsertPreview':
            if (state.kind === 'idle') return state;
            return { ...state, insertPreview: action.preview };
        default:
            return state;
    }
}

export function useSketchLifecycleState() {
    const [state, dispatch] = useReducer(reducer, initial);
    const stateRef = useRef<SketchState>(state);
    stateRef.current = state;

    // synchronous ref update + dispatch, callers can read stateRef.current right after
    const apply = useCallback((action: Action) => {
        stateRef.current = reducer(stateRef.current, action);
        dispatch(action);
    }, []);

    const beginCreate = useCallback(() => apply({ type: 'beginCreate' }), [apply]);
    const beginEdit = useCallback((id: string, originalCoords: Pt[], ghost: Pt[]) =>
        apply({ type: 'beginEdit', id, originalCoords, ghost }), [apply]);
    const goIdle = useCallback(() => apply({ type: 'goIdle' }), [apply]);
    const setPoints = useCallback((points: Pt[]) => apply({ type: 'setPoints', points }), [apply]);
    const setGhost = useCallback((ghost: Pt[]) => apply({ type: 'setGhost', ghost }), [apply]);
    const setPreviewPoint = useCallback((preview: Pt | null) => apply({ type: 'setPreviewPoint', preview }), [apply]);
    const setInsertPreview = useCallback((preview: Pt[] | null) => apply({ type: 'setInsertPreview', preview }), [apply]);

    const editingId = state.kind === 'editing' ? state.id : null;
    const isCreating = state.kind === 'creating';
    const createPointCount = state.kind === 'creating' ? state.points.length : 0;
    const drawingPoints = state.kind === 'idle' ? EMPTY_POINTS : state.points;
    const ghostCoords = state.kind === 'idle' ? EMPTY_POINTS : state.ghost;
    const createPreviewPoint = state.kind === 'idle' ? null : state.previewPoint;
    const sketchInsertPreview = state.kind === 'idle' ? null : state.insertPreview;

    // back-compat setters for external consumers, prefer the atomic actions internally
    const setIsCreating = useCallback((c: boolean) => {
        if (c) apply({ type: 'beginCreate' });
        else if (stateRef.current.kind === 'creating') apply({ type: 'goIdle' });
    }, [apply]);
    const setEditingId = useCallback((id: string | null) => {
        if (id === null && stateRef.current.kind === 'editing') apply({ type: 'goIdle' });
        // setting a non-null id without context is unsupported, use beginEdit
    }, [apply]);
    // createPointCount is derived, the setter is a no-op for callers that still invoke it
    const setCreatePointCount = useCallback((_n: number | ((p: number) => number)) => {}, []);

    // ref-like views over the same state, callbacks read .current to get the latest value
    // these are stable identities so they can sit in dep arrays without invalidating
    const pointsRef = useMemo(() => ({
        get current(): Pt[] { return stateRef.current.kind === 'idle' ? EMPTY_POINTS : stateRef.current.points; },
    }), []);
    const ghostRef = useMemo(() => ({
        get current(): Pt[] { return stateRef.current.kind === 'idle' ? EMPTY_POINTS : stateRef.current.ghost; },
    }), []);
    const previewPointRef = useMemo(() => ({
        get current(): Pt | null { return stateRef.current.kind === 'idle' ? null : stateRef.current.previewPoint; },
    }), []);
    const originalCoordsRef = useMemo(() => ({
        get current(): Pt[] | null { return stateRef.current.kind === 'editing' ? stateRef.current.originalCoords : null; },
    }), []);

    return {
        state, stateRef,
        editingId, isCreating, createPointCount, drawingPoints, ghostCoords, createPreviewPoint, sketchInsertPreview,
        pointsRef, ghostRef, previewPointRef, originalCoordsRef,
        beginCreate, beginEdit, goIdle,
        setPoints, setGhost, setPreviewPoint, setInsertPreview,
        setIsCreating, setEditingId, setCreatePointCount,
    };
}
