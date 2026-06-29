import { Box, Button, Stack, Typography } from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { type FC } from 'react';

import { MainContainer } from '../components/MainContainer';

const IMPRINT_URL = 'https://posterus.ventures/imprint';

export const AboutPage: FC = () => {
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
      </Stack>
    </MainContainer>
  );
};
