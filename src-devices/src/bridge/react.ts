// `react` of the host - see host.ts. Add a name here if bridged code imports another one: the build
// fails with "... is not exported by src/bridge/react.ts" otherwise.
import type * as ReactTypes from 'react';

import { hostModule } from './host';

const React = hostModule<typeof ReactTypes>('react');

export default React;

export const {
    Children,
    Component,
    Fragment,
    PureComponent,
    StrictMode,
    Suspense,
    cloneElement,
    createContext,
    createElement,
    createRef,
    forwardRef,
    isValidElement,
    lazy,
    memo,
    startTransition,
    useCallback,
    useContext,
    useDebugValue,
    useDeferredValue,
    useEffect,
    useId,
    useImperativeHandle,
    useInsertionEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    useSyncExternalStore,
    useTransition,
    version,
} = React;
