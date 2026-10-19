// Shows the pop-up named in the store (SCR-05–09, TYPE-08). The
// pop-ups read the triple or term afresh from the store, so they never act
// on a stale copy; one whose triple has gone simply closes.

import { useCallback } from 'react';
import type { ProjectSettings } from '../../core/types';
import { useApp } from '../store';
import { DeleteTermDialog, DeleteTripleDialog } from './DeleteDialog';
import { DuplicatesDialog } from './DuplicatesDialog';
import { EditTripleDialog } from './EditTripleDialog';
import { HelpDialog } from './HelpDialog';
import { MergeWithDialog } from './MergeWithDialog';
import { RenameDialog } from './RenameDialog';
import { SetClassDialog } from './SetClassDialog';
import { SettingsDialog } from './SettingsDialog';

export function Dialogs({ settings }: { settings: ProjectSettings }) {
  const dialog = useApp((s) => s.dialog);
  const triples = useApp((s) => s.triples);
  const openDialog = useApp((s) => s.openDialog);
  const close = useCallback(() => openDialog(null), [openDialog]);
  if (!dialog) return null;

  switch (dialog.kind) {
    case 'edit':
    case 'deleteTriple': {
      const triple = triples.find((t) => t.id === dialog.tripleId);
      if (!triple) return null;
      return dialog.kind === 'edit' ? (
        <EditTripleDialog key={triple.id} triple={triple} settings={settings} onClose={close} />
      ) : (
        <DeleteTripleDialog triple={triple} onClose={close} />
      );
    }
    case 'rename':
      return <RenameDialog term={dialog.term} settings={settings} onClose={close} />;
    case 'delete':
      return <DeleteTermDialog term={dialog.term} onClose={close} />;
    case 'setClass':
      return <SetClassDialog term={dialog.term} onClose={close} />;
    case 'settings':
      return <SettingsDialog settings={settings} onClose={close} />;
    case 'duplicates':
      return <DuplicatesDialog key={dialog.pair ? 'pair' : 'all'} settings={settings} focus={dialog.focus} pair={dialog.pair} onClose={close} />;
    case 'help':
      return <HelpDialog onClose={close} />;
    case 'mergeWith':
      return <MergeWithDialog term={dialog.term} settings={settings} onClose={close} />;
  }
}
