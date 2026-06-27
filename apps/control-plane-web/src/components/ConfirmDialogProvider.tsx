import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import {
  createContext,
  type FC,
  type PropsWithChildren,
  type ReactNode,
  use,
  useCallback,
  useMemo,
  useState,
} from 'react';

export enum ButtonType {
  DANGER = 'DANGER',
  ACTION = 'ACTION',
}

interface ActionBtn {
  label: string;
  onClick?: () => void;
  type?: ButtonType;
}

export interface ConfirmDialogOptions {
  title: string;
  content: ReactNode;
  buttons: ActionBtn[];
  callback?: () => void;
  disablePassiveClose?: boolean;
}

type ConfirmationDialog = {
  confirm: (options: ConfirmDialogOptions) => void;
};

const ConfirmationDialogContext = createContext<ConfirmationDialog | null>(null);

export const useConfirmation = () => {
  const context = use(ConfirmationDialogContext);
  if (!context) {
    throw new Error('useConfirmation must be used within a ConfirmDialogProvider');
  }
  return context;
};

export const ConfirmDialogProvider: FC<Required<PropsWithChildren>> = ({ children }) => {
  const [options, setOptions] = useState<null | ConfirmDialogOptions>(null);
  const confirm = useCallback((options: ConfirmDialogOptions) => {
    setOptions(options);
  }, []);
  const value = useMemo(() => ({ confirm }), [confirm]);

  const handleClose = (active = false) => {
    if (!options?.disablePassiveClose || active) {
      setOptions(null);
      if (options?.callback) {
        options.callback();
      }
    }
  };

  return (
    <>
      <ConfirmationDialogContext value={value}>{children}</ConfirmationDialogContext>

      {!!options && (
        <Dialog
          open={!!options}
          onClose={() => {
            handleClose();
          }}
          aria-labelledby="form-dialog-title"
          slotProps={{
            paper: {
              sx: {
                width: '90%',
                maxWidth: '650px',
              },
            },
          }}
        >
          <DialogTitle id="form-dialog-title">{options.title}</DialogTitle>
          <DialogContent>{options.content}</DialogContent>
          <DialogActions>
            {options.buttons.map((btn, idx) => {
              return (
                <Button
                  key={idx}
                  variant="outlined"
                  color={btn.type === ButtonType.DANGER ? 'error' : 'primary'}
                  onClick={() => {
                    if (btn.onClick) {
                      btn.onClick();
                    }
                    handleClose(true);
                  }}
                >
                  {btn.label}
                </Button>
              );
            })}
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};
