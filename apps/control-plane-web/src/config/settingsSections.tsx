import type { SvgIconComponent } from '@mui/icons-material';
import ExtensionIcon from '@mui/icons-material/Extension';
import GitHubIcon from '@mui/icons-material/GitHub';
import GroupIcon from '@mui/icons-material/Group';
import KeyIcon from '@mui/icons-material/Key';
import LockIcon from '@mui/icons-material/Lock';
import SmartToyIcon from '@mui/icons-material/SmartToy';
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
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: SettingsSectionId.GITHUB,
    label: 'GitHub',
    Icon: GitHubIcon,
    Component: GithubSection,
  },
  {
    id: SettingsSectionId.REPOSITORIES,
    label: 'Repositories',
    Icon: SourceIcon,
    Component: ReposSection,
  },
  {
    id: SettingsSectionId.ENVIRONMENT,
    label: 'Environment',
    Icon: KeyIcon,
    Component: EnvironmentSection,
  },
  {
    id: SettingsSectionId.RUNNER,
    label: 'Default runner',
    Icon: SmartToyIcon,
    Component: RunnerSection,
  },
  {
    id: SettingsSectionId.MCP,
    label: 'MCP access',
    Icon: ExtensionIcon,
    Component: McpSection,
  },
  {
    id: SettingsSectionId.CREDENTIALS,
    label: 'Credentials',
    Icon: LockIcon,
    Component: ChangePasswordSection,
  },
  {
    id: SettingsSectionId.USERS,
    label: 'User management',
    Icon: GroupIcon,
    Component: UserManagementSection,
    isAdminOnly: true,
  },
];
