import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DeleteIcon from '@mui/icons-material/Delete';
import LockResetIcon from '@mui/icons-material/LockReset';
import PersonIcon from '@mui/icons-material/Person';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { UserRole, isAdminRole, type User } from '@sagewright/shared';
import { DateTime } from 'luxon';
import { useSnackbar } from 'notistack';
import { useMemo, useState, type FC } from 'react';

import {
  useDeleteUser,
  useMe,
  useResetPassword,
  useSetUserRole,
  useUsers,
} from '../api/hooks';
import { ButtonType, useConfirmation } from '../components/ConfirmDialogProvider';
import { CreateUserDialog } from './CreateUserDialog';
import { SharePasswordDialog, type SharedPassword } from './SharePasswordDialog';

const roleChipColor = (role: UserRole): 'primary' | 'secondary' | 'default' =>
  role === UserRole.ROOT ? 'primary' : role === UserRole.ADMIN ? 'secondary' : 'default';

// Only root/admins see this section; nothing renders for a plain user.
export const UserManagementSection: FC = () => {
  const { data: me } = useMe();
  const { data: users = [] } = useUsers();
  const resetPassword = useResetPassword();
  const setUserRole = useSetUserRole();
  const deleteUser = useDeleteUser();
  const { confirm } = useConfirmation();
  const { enqueueSnackbar } = useSnackbar();
  const [createKey, setCreateKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [shared, setShared] = useState<SharedPassword | null>(null);

  const openCreate = (): void => {
    setCreateKey((k) => k + 1); // remount so fields reset
    setCreateOpen(true);
  };

  const onReset = async (username: string): Promise<void> => {
    try {
      const result = await resetPassword.mutateAsync(username);
      setShared({ title: 'Password reset', username: result.username, password: result.initialPassword });
    } catch {
      enqueueSnackbar('Could not reset password', { variant: 'error' });
    }
  };

  const onToggleRole = (user: User): void => {
    const next = user.role === UserRole.ADMIN ? UserRole.USER : UserRole.ADMIN;
    setUserRole.mutate(
      { username: user.username, role: next },
      { onError: () => enqueueSnackbar('Could not change role', { variant: 'error' }) },
    );
  };

  const onDelete = (user: User): void => {
    confirm({
      title: 'Delete user',
      content: `Delete “${user.username}”? Their login is removed immediately; their existing sessions and data are kept.`,
      buttons: [
        { label: 'Cancel' },
        {
          label: 'Delete',
          type: ButtonType.DANGER,
          onClick: () =>
            deleteUser.mutate(user.username, {
              onError: () => enqueueSnackbar('Could not delete user', { variant: 'error' }),
            }),
        },
      ],
    });
  };

  const columns = useMemo<GridColDef<User>[]>(
    () => [
      { field: 'username', headerName: 'Username', flex: 1, minWidth: 160 },
      {
        field: 'role',
        headerName: 'Role',
        width: 120,
        renderCell: (params) => (
          <Chip size="small" label={params.row.role} color={roleChipColor(params.row.role)} variant={params.row.role === UserRole.USER ? 'outlined' : 'filled'} />
        ),
      },
      {
        field: 'mustChangePassword',
        headerName: 'Status',
        width: 150,
        sortable: false,
        renderCell: (params) =>
          params.row.mustChangePassword ? <Chip size="small" color="warning" label="Must change" /> : <span>—</span>,
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        width: 180,
        valueGetter: (_v, row) => new Date(row.createdAt),
        renderCell: (params) => <span>{DateTime.fromISO(params.row.createdAt).toLocaleString(DateTime.DATETIME_MED)}</span>,
      },
      {
        field: 'actions',
        headerName: '',
        width: 130,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        renderCell: (params) => {
          const u = params.row;
          // Root is immutable; you can't manage your own row here (use Change password
          // above, and you can't delete/demote yourself into a lockout).
          if (u.role === UserRole.ROOT || u.username === me?.username) return null;
          const isAdmin = u.role === UserRole.ADMIN;
          return (
            <Box className="row-actions" sx={{ display: 'flex', justifyContent: 'flex-end', height: '100%', alignItems: 'center', gap: 0.25 }}>
              <Tooltip title="Reset password">
                <IconButton size="small" aria-label="Reset password" onClick={() => void onReset(u.username)}>
                  <LockResetIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={isAdmin ? 'Demote to user' : 'Promote to admin'}>
                <IconButton size="small" aria-label={isAdmin ? 'Demote to user' : 'Promote to admin'} onClick={() => onToggleRole(u)}>
                  {isAdmin ? <PersonIcon fontSize="small" /> : <AdminPanelSettingsIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete user">
                <IconButton size="small" aria-label="Delete user" onClick={() => onDelete(u)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.username],
  );

  if (!me || !isAdminRole(me.role)) return null;

  return (
    <Box sx={{ maxWidth: 860 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6">User management</Typography>
          <Typography variant="body2" color="text.secondary">
            Create accounts, reset passwords, and grant or revoke admin. Root can't be changed or removed.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={openCreate}>
          Create user
        </Button>
      </Stack>

      <DataGrid
        rows={users}
        columns={columns}
        getRowId={(row) => row.username}
        autoHeight
        disableRowSelectionOnClick
        pageSizeOptions={[25, 50, 100]}
        sx={{
          '& .row-actions': { opacity: 0, transition: 'opacity 0.15s' },
          '& .MuiDataGrid-row:hover .row-actions, & .MuiDataGrid-row:focus-within .row-actions': { opacity: 1 },
        }}
      />

      <CreateUserDialog
        key={createKey}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(result) =>
          setShared({ title: 'User created', username: result.username, password: result.initialPassword })
        }
      />
      <SharePasswordDialog shared={shared} onClose={() => setShared(null)} />
    </Box>
  );
};
