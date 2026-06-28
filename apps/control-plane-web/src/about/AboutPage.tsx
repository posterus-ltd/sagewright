import { Box, Button, Stack, Typography } from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import { type FC, useState } from 'react';

import { MainContainer } from '../components/MainContainer';

const IMPRINT_URL = 'https://posterus.ventures/imprint';

export const AboutPage: FC = () => {
  // Error boundaries only catch errors thrown during render, so flip state on
  // click and throw on the next render to exercise the boundary.
  const [shouldThrow, setShouldThrow] = useState(false);
  if (shouldThrow) {
    throw new Error('Test exception thrown from the About page.');
  }

  return (
    <MainContainer>
      <Stack spacing={3}>
        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="h6" gutterBottom>
            About sagewright
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sagewright is a control plane for running coding agents in isolated
            Docker containers.
          </Typography>
        </Box>

        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="h6" gutterBottom>
            Third-party licenses
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            This app bundles open-source software. The notice below lists every
            runtime dependency together with its license. It is generated at
            build time, so it is available in deployed builds.
          </Typography>
          <Button
            component="a"
            href="/3rd-party-attribution.txt"
            target="_blank"
            rel="noreferrer"
            variant="outlined"
            startIcon={<OpenInNewRoundedIcon />}
          >
            View third-party licenses
          </Button>
        </Box>

        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="h6" gutterBottom>
            Legal
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Sagewright is operated by Posterus Ltd. The legal notice (Impressum)
            with company details and contact information is published below.
          </Typography>
          <Button
            component="a"
            href={IMPRINT_URL}
            target="_blank"
            rel="noreferrer"
            variant="outlined"
            startIcon={<OpenInNewRoundedIcon />}
          >
            Impressum
          </Button>
        </Box>

        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="h6" gutterBottom>
            Diagnostics
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Throw a test exception to verify the error boundary renders its
            fallback page correctly.
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
      </Stack>
    </MainContainer>
  );
};
