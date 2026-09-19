/**
 * Reads the mesh topology from a running tr-064 instance.
 *
 * - `fetchMesh()` - one request, never throws
 * - `MeshLoader`  - periodic refresh for class components (`start()` / `stop()`)
 * - `useMeshLoader()` - the same as React hook for function components
 */
import { useEffect, useRef, useState } from 'react';

import type { MeshResponse } from './types';

/** The part of the admin/vis socket (`AdminConnection`, `Connection`) which is used here */
export interface MeshSocket {
    getState(id: string): Promise<{ val: unknown } | null | undefined>;
    sendTo(instance: string, command: string, data?: unknown): Promise<unknown>;
}

/** Error codes in `MeshResponse.error`, any other text is an error message */
export const MESH_ERROR_NOT_ALIVE = 'not alive';
export const MESH_ERROR_NOT_CONNECTED = 'not connected';
export const MESH_ERROR_NOT_SUPPORTED = 'not supported';
export const MESH_ERROR_TIMEOUT = 'timeout';

/** Seconds between two refreshes of `MeshLoader` */
export const MESH_REFRESH_INTERVAL = 30;

/**
 * Asks the instance for the mesh topology.
 *
 * Resolves always, errors are in `error`: `not alive` if the instance does not run, `timeout` if
 * it did not answer within `timeoutMs`, `not connected`/`not supported` from the adapter, or the
 * text of an exception.
 *
 * @param socket connection of the host (admin, vis-2, devices)
 * @param instanceId e.g. `tr-064.0`
 * @param timeoutMs time limit of the request
 */
export async function fetchMesh(socket: MeshSocket, instanceId: string, timeoutMs = 20_000): Promise<MeshResponse> {
    try {
        const alive = await socket.getState(`system.adapter.${instanceId}.alive`);
        if (!alive?.val) {
            return { error: MESH_ERROR_NOT_ALIVE, nodes: [], links: [] };
        }

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<typeof MESH_ERROR_TIMEOUT>(resolve => {
            timer = setTimeout(() => resolve(MESH_ERROR_TIMEOUT), timeoutMs);
        });
        const request = socket.sendTo(instanceId, 'mesh', {}) as Promise<MeshResponse | null>;
        const answer = await Promise.race([request, timeout]);
        clearTimeout(timer);

        if (answer === MESH_ERROR_TIMEOUT || !answer || typeof answer !== 'object') {
            return { error: MESH_ERROR_TIMEOUT, nodes: [], links: [] };
        }
        return {
            error: answer.error,
            ts: answer.ts,
            nodes: Array.isArray(answer.nodes) ? answer.nodes : [],
            links: Array.isArray(answer.links) ? answer.links : [],
        };
    } catch (e) {
        return { error: (e as Error)?.message || String(e), nodes: [], links: [] };
    }
}

/** What `MeshLoader` reports - exactly the props `data`, `loading` and `error` of `MeshView` */
export interface MeshLoaderState {
    /** Last successful answer. It stays on a temporary error, and is `null` while the instance is stopped */
    data: MeshResponse | null;
    loading: boolean;
    /** Error code or text of the last request, `null` if it was successful */
    error: string | null;
}

export interface MeshLoaderOptions {
    socket: MeshSocket;
    /** e.g. `tr-064.0` */
    instanceId: string;
    /** Seconds between two refreshes, 0 = only on `refresh()`. Default `MESH_REFRESH_INTERVAL` */
    interval?: number;
    /** Milliseconds for one request, default 20000 */
    timeout?: number;
    /** Called on every change of the state */
    onChange: (state: MeshLoaderState) => void;
}

/**
 * Periodic refresh of the mesh topology, e.g. for a class component:
 *
 * ```ts
 * componentDidMount() { this.loader = new MeshLoader({ socket, instanceId: 'tr-064.0', onChange: s => this.setState(s) }); this.loader.start(); }
 * componentWillUnmount() { this.loader?.stop(); }
 * render() { return <MeshView {...this.state} onRefresh={() => this.loader?.refresh()} t={...} />; }
 * ```
 */
export class MeshLoader {
    private readonly options: MeshLoaderOptions;

    private timer: ReturnType<typeof setInterval> | null = null;

    private running = false;

    private stopped = true;

    private current: MeshLoaderState = { data: null, loading: false, error: null };

    constructor(options: MeshLoaderOptions) {
        this.options = options;
    }

    get state(): MeshLoaderState {
        return this.current;
    }

    /** Reads now and then every `interval` seconds */
    start(): void {
        this.stop();
        this.stopped = false;
        void this.refresh();
        const interval = this.options.interval ?? MESH_REFRESH_INTERVAL;
        if (interval > 0) {
            this.timer = setInterval(() => void this.refresh(), interval * 1000);
        }
    }

    /** Stops the refresh, `onChange` is not called any more */
    stop(): void {
        this.stopped = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Reads now. A request which is still running is not started twice */
    async refresh(): Promise<void> {
        if (this.running || this.stopped) {
            return;
        }
        this.running = true;
        this.update({ loading: true });

        const response = await fetchMesh(this.options.socket, this.options.instanceId, this.options.timeout);
        this.running = false;
        if (this.stopped) {
            return;
        }
        if (!response.error) {
            this.update({ data: response, loading: false, error: null });
        } else if (response.error === MESH_ERROR_NOT_ALIVE) {
            this.update({ data: null, loading: false, error: response.error });
        } else {
            // keep the last data on a temporary error
            this.update({ loading: false, error: response.error });
        }
    }

    private update(changed: Partial<MeshLoaderState>): void {
        this.current = { ...this.current, ...changed };
        if (!this.stopped) {
            this.options.onChange(this.current);
        }
    }
}

/**
 * The same as `MeshLoader` for function components.
 *
 * @param socket connection of the host, `null` until it is available
 * @param instanceId e.g. `tr-064.0`
 * @param interval seconds between two refreshes, 0 = only on `refresh()`
 */
export function useMeshLoader(
    socket: MeshSocket | null | undefined,
    instanceId: string,
    interval = MESH_REFRESH_INTERVAL,
): MeshLoaderState & { refresh: () => void } {
    const [state, setState] = useState<MeshLoaderState>({ data: null, loading: false, error: null });
    const loader = useRef<MeshLoader | null>(null);

    useEffect(() => {
        if (!socket || !instanceId) {
            return undefined;
        }
        const meshLoader = new MeshLoader({ socket, instanceId, interval, onChange: setState });
        loader.current = meshLoader;
        meshLoader.start();
        return () => {
            meshLoader.stop();
            loader.current = null;
        };
    }, [socket, instanceId, interval]);

    return { ...state, refresh: () => void loader.current?.refresh() };
}
