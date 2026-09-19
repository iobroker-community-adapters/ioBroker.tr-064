// `@mui/icons-material` of the host - see host.ts. Add a name here if bridged code imports another
// one: the build fails with "... is not exported by src/bridge/mui-icons.ts" otherwise.
import type * as IconsTypes from '@mui/icons-material';

import { hostModule } from './host';

const Icons = hostModule<typeof IconsTypes>('@mui/icons-material');

export const { AccountTree, Refresh, TableRows } = Icons;
