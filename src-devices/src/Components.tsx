// The module ioBroker.devices loads through module federation (`./Components`). It picks the
// component by the name declared in `common.deviceWidgets.components[].name` of io-package.json,
// so the keys here and the names there must match.
import FritzBoxComponent from './FritzBoxComponent';

export default { FritzBoxComponent };
