import { Box, Button, Chip, Divider, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import { type FC, useState } from 'react';

import { MainContainer } from '../components/MainContainer';

const BuildInfoSection: FC = () => {
  // Vite inlines these at build time, so they reflect how this bundle was built.
  const entries: Array<[string, string]> = [
    ['Mode', import.meta.env.MODE],
    ['Build', import.meta.env.DEV ? 'development' : 'production'],
    ['Base URL', import.meta.env.BASE_URL],
  ];

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h6" gutterBottom>
        Build info
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        How this bundle was built, inlined by Vite at build time.
      </Typography>
      <List dense>
        {entries.map(([label, value]) => (
          <ListItem key={label} secondaryAction={<Chip size="small" label={value} sx={{ fontFamily: 'monospace' }} />}>
            <ListItemText primary={label} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

const DiagnosticsSection: FC = () => {
  // Error boundaries only catch errors thrown during render, so flip state on
  // click and throw on the next render to exercise the boundary.
  const [shouldThrow, setShouldThrow] = useState(false);
  if (shouldThrow) {
    throw new Error('Test exception thrown from the admin page.');
  }

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h6" gutterBottom>
        Diagnostics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Throw a test exception to verify the error boundary renders its fallback
        page correctly.
      </Typography>
      <Button
        type="button"
        onClick={() => setShouldThrow(true)}
        variant="outlined"
        color="error"
        startIcon={<BugReportRoundedIcon />}
      >
        Throw an exception
      </Button>
    </Box>
  );
};

// Hidden /adm route: dev config and admin tooling, not linked from the sidebar.
export const AdminPage: FC = () => (
  <MainContainer>
    <Stack spacing={3}>
      <Box sx={{ maxWidth: 560 }}>
        <Typography variant="h6" gutterBottom>
          Admin
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Internal dev config and diagnostics. This page is intentionally
          unlinked from navigation.
        </Typography>
      </Box>
      <Divider />
      <BuildInfoSection />
      <Divider />
      <DiagnosticsSection />
    </Stack>
  </MainContainer>
);
