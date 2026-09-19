// `@mui/material` of the host - see host.ts. Add a name here if bridged code imports another one:
// the build fails with "... is not exported by src/bridge/mui-material.ts" otherwise.
import type * as MuiTypes from '@mui/material';

import { hostModule } from './host';

const Mui = hostModule<typeof MuiTypes>('@mui/material');

export default Mui;

export const {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    SvgIcon,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    ThemeProvider,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
    alpha,
    createTheme,
    styled,
    useMediaQuery,
    useTheme,
} = Mui;
