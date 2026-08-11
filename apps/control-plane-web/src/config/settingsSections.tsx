import type { SvgIconComponent } from '@mui/icons-material';
import ExtensionIcon from '@mui/icons-material/Extension';
import GitHubIcon from '@mui/icons-material/GitHub';
import GroupIcon from '@mui/icons-material/Group';
import KeyIcon from '@mui/icons-material/Key';
import LockIcon from '@mui/icons-material/Lock';
import TerminalIcon from '@mui/icons-material/Terminal';
import SourceIcon from '@mui/icons-material/Source';
import type { FC } from 'react';

import { ChangePasswordSection } from './ChangePasswordSection';
import { EnvironmentSection } from './EnvironmentSection';
import { GithubSection } from './GithubSection';
import { McpSection } from './McpSection';
import { ReposSection } from './ReposSection';
import { RunnerSection } from './RunnerSection';
import { UserManagementSection } from './UserManagementSection';

export enum SettingsSectionId {
  GITHUB = 'github',
  REPOSITORIES = 'repositories',
  ENVIRONMENT = 'environment',
  RUNNER = 'runner',
  MCP = 'mcp',
  CREDENTIALS = 'credentials',
  USERS = 'users',
}

export interface SettingsSection {
  id: SettingsSectionId;
  label: string;
  Icon: SvgIconComponent;
  Component: FC;
  // Only rendered for admins; also hidden from the nav for everyone else.
  isAdminOnly?: boolean;
}

// The order here is the order shown in the left-hand nav.
export const settingsSectionsFactory = (
  t: (key: string) => string,
): SettingsSection[] => [
  {
    id: SettingsSectionId.GITHUB,
    label: t('github'),
    Icon: GitHubIcon,
    Component: GithubSection,
  },
  {
    id: SettingsSectionId.REPOSITORIES,
    label: t('repositories'),
    Icon: SourceIcon,
    Component: ReposSection,
  },
  {
    id: SettingsSectionId.ENVIRONMENT,
    label: t('environment'),
    Icon: KeyIcon,
    Component: EnvironmentSection,
  },
  {
    id: SettingsSectionId.RUNNER,
    label: t('runner'),
    Icon: TerminalIcon,
    Component: RunnerSection,
  },
  {
    id: SettingsSectionId.MCP,
    label: t('mcp'),
    Icon: ExtensionIcon,
    Component: McpSection,
  },
  {
    id: SettingsSectionId.CREDENTIALS,
    label: t('credentials'),
    Icon: LockIcon,
    Component: ChangePasswordSection,
  },
  {
    id: SettingsSectionId.USERS,
    label: t('users'),
    Icon: GroupIcon,
    Component: UserManagementSection,
    isAdminOnly: true,
  },
];
