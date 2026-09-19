// Only for the simulation (npm start) - never part of the widget build (see ../index.tsx).
// The widgets extend `window.visRxWidget` when their module is evaluated, so the stand-in has to be
// there before they are imported: the app is loaded dynamically afterwards.
import VisRxWidgetMock, { setMockLanguage } from './VisRxWidgetMock';

const params = new URLSearchParams(window.location.search);
setMockLanguage(params.get('lang') || 'en');
(window as unknown as { visRxWidget: unknown }).visRxWidget = VisRxWidgetMock;

void import('./App').then(({ renderApp }) => renderApp());
