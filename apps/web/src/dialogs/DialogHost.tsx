import { useStore } from '../store.ts';
import { AddCliDialog } from './AddCliDialog.tsx';
import { BgTabsDialog } from './BgTabsDialog.tsx';
import { ApprovalDialog } from './ApprovalDialog.tsx';
import { InstallDialog } from './InstallDialog.tsx';
import { NewChangeDialog } from './NewChangeDialog.tsx';
import { OpenProjectDialog } from './OpenProjectDialog.tsx';
import { ConfirmDialog, DirSwitchDialog, ImportLayoutDialog, LayoutEditDialog, RenameDialog } from './MiscDialogs.tsx';

export function DialogHost() {
  const d = useStore((s) => s.dialog);
  const ready = useStore((s) => !!s.registries && !!s.settings);
  if (!d || !ready) return null;
  switch (d.kind) {
    case 'new':
      return <NewChangeDialog />;
    case 'add':
      return <AddCliDialog editTab={d.editTab} />;
    case 'open':
      return <OpenProjectDialog />;
    case 'dir':
      return <DirSwitchDialog />;
    case 'import':
      return <ImportLayoutDialog text={d.text} />;
    case 'layout':
      return <LayoutEditDialog layout={d.layout} isNew={d.isNew} />;
    case 'confirm':
      return <ConfirmDialog d={d} />;
    case 'rename':
      return <RenameDialog d={d} />;
    case 'approval':
      return <ApprovalDialog tabId={d.tab} />;
    case 'install':
      return <InstallDialog service={d.service} />;
    case 'bgtabs':
      return <BgTabsDialog projectId={d.projectId} />;
  }
}
