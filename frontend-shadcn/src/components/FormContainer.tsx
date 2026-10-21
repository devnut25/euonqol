import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { Values } from '@/hooks/useCrudDataTable';
import type { ComponentType, ReactNode } from 'react';

export interface FormProps {
  initialValues?: Values;
  readonly?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onSuccess?: (response: { data: Values }) => void;
  submitter?: {
    searchConfig?: {
      submitText?: string;
    };
    resetButtonProps?: {
      style?: React.CSSProperties;
    };
    render?: (props: any, dom: ReactNode) => ReactNode;
  };
  [key: string]: any;
}

interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  FormComponent: ComponentType<FormProps>;
  data?: Values;
  mode: 'view' | 'edit' | 'create';
  title?: string;
}

//TODO: verificare utilizzo FormModal dentro CrudDataTable
export function FormModal({
  open,
  onOpenChange,
  FormComponent,
  data,
  mode,
  title,
}: FormModalProps) {
  const defaultTitles = {
    view: 'View',
    edit: 'Edit',
    create: 'Create new',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title || defaultTitles[mode]}</DialogTitle>
        </DialogHeader>
        <FormComponent
          data={data}
          mode={mode}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface FormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  FormComponent: ComponentType<FormProps>;
  data?: Values;
  mode: 'view' | 'edit' | 'create';
  title?: string;
}

export function FormDrawer({
  open,
  onOpenChange,
  FormComponent,
  data,
  mode,
  title,
}: FormDrawerProps) {
  const defaultTitles = {
    view: 'View',
    edit: 'Edit',
    create: 'Create new',
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[96vh]" onClick={(e) => e.stopPropagation()}>
        <DrawerHeader>
          <DrawerTitle>{title || defaultTitles[mode]}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto p-4">
          <FormComponent
            data={data}
            mode={mode}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
