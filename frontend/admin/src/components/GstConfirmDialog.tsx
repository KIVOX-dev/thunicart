import { BottomSheet, Button, Modal } from '@thunikart/ui';
import { GST_GO_LIVE_CHANGES } from '../features/settings/use-business-profile';

interface Props { kind: 'golive' | 'clear' | null; gstin: string; saving: boolean; onConfirm: () => void; onCancel: () => void; sheet?: boolean }

/** Confirmation that lists what changes when GST goes live (or is switched off). */
export function GstConfirmDialog({ kind, gstin, saving, onConfirm, onCancel, sheet }: Props) {
  const Shell = sheet ? BottomSheet : Modal;
  const live = kind === 'golive';
  return (
    <Shell
      open={!!kind}
      onClose={onCancel}
      title={live ? 'Turn GST on?' : 'Switch GST off?'}
      footer={<><Button onClick={onCancel}>Cancel</Button><Button variant="primary" loading={saving} onClick={onConfirm}>{live ? 'Yes, go live' : 'Yes, switch off'}</Button></>}
    >
      {live ? (
        <>
          <p className="mb-3 text-sm">Saving GSTIN <strong>{gstin}</strong> turns GST on for the whole business. This is what changes:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{GST_GO_LIVE_CHANGES.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      ) : (
        <p className="text-sm">Clearing the GSTIN switches GST off. GST screens, columns and wording will be hidden. Bills already issued keep their tax details.</p>
      )}
    </Shell>
  );
}
