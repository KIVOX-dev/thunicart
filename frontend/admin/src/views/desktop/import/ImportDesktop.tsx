import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@thunikart/shared';
import { Badge, Button, Checkbox, EmptyState, Modal, Select, Table, TBody, Td, Th, THead, Tr, useToast } from '@thunikart/ui';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { PageHeader } from '../../../components/PageHeader';
import { useCan } from '../../../features/auth/permissions';
import { IMPORT_FIELDS, type ImportBatch } from '../../../features/catalog/types';
import { useImports, useImportWizard, useRollbackBatch } from '../../../features/catalog/use-import';

const STEPS = [['upload', 'Upload'], ['sheet', 'Sheet'], ['mapping', 'Map columns'], ['dry-run', 'Check'], ['commit', 'Import']] as const;
const n = (v: number) => v.toLocaleString('en-IN');

function Steps({ current }: { current: string }) {
  const at = STEPS.findIndex(([k]) => k === current);
  return (
    <ol aria-label="Import steps" className="mb-6 flex gap-2">
      {STEPS.map(([k, label], i) => (
        <li key={k} aria-current={k === current ? 'step' : undefined} className={`flex-1 border-b-2 pb-2 text-xs font-semibold uppercase tracking-wider ${i < at ? 'border-teal text-navy' : k === current ? 'border-orange text-navy' : 'border-line text-muted'}`}>{i + 1}. {label}{i < at && ' ✓'}</li>
      ))}
    </ol>
  );
}

function downloadErrors(b: ImportBatch) {
  const csv = ['row,code,field,message', ...b.errors.map((e) => `${e.row},${e.code},${e.field},"${e.message.replace(/"/g, '""')}"`)].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = `import-errors-${b.id.slice(-6)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function Counts({ b }: { b: ImportBatch }) {
  const c = b.counts!;
  const cards: Array<[string, number, 'neutral' | 'success' | 'warning' | 'danger']> = [['Rows read', c.rows, 'neutral'], ['Items to import', c.items, 'success'], ['Pieces in stock', c.pieces, 'success'], ['For review', c.warnings, 'warning'], ['Errors', c.errors, c.errors ? 'danger' : 'neutral']];
  return (
    <dl className="grid grid-cols-5 gap-3">
      {cards.map(([label, value, tone]) => (
        <div key={label} className="rounded border-2 border-navy-100 p-3"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg font-semibold" data-testid={`count-${label}`}>{n(value)}</dd>{tone !== 'neutral' && value > 0 && <Badge tone={tone} className="mt-1">{tone === 'danger' ? 'Fix or skip' : tone === 'warning' ? 'See review queue' : 'Ready'}</Badge>}</div>
      ))}
    </dl>
  );
}

function History() {
  const q = useImports();
  const rb = useRollbackBatch();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<ImportBatch | null>(null);
  if (!q.data?.length) return null;
  return (
    <section aria-label="Past imports" className="mt-10">
      <h2 className="mb-2 text-xs">Past imports</h2>
      <Table caption="Past imports">
        <THead><Tr><Th>File</Th><Th>When</Th><Th>Status</Th><Th className="text-right">Items</Th><Th className="text-right">Pieces</Th><Th><span className="sr-only">Actions</span></Th></Tr></THead>
        <TBody>{q.data.map((b) => (
          <Tr key={b.id}><Td>{b.fileName}</Td><Td>{formatDate(b.createdAt)}</Td><Td><Badge tone={b.status === 'committed' ? 'success' : b.status === 'rolled-back' ? 'neutral' : 'warning'}>{b.status}</Badge></Td>
            <Td className="text-right">{b.counts ? n(b.counts.items) : '–'}</Td><Td className="text-right">{b.counts ? n(b.counts.pieces) : '–'}</Td>
            <Td className="text-right">{b.status === 'committed' && <Button size="sm" variant="danger" onClick={() => setConfirm(b)} aria-label={`Roll back ${b.fileName}`}>Roll back</Button>}</Td></Tr>
        ))}</TBody>
      </Table>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Roll back this import?" footer={<><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" loading={rb.isPending} onClick={async () => { await rb.mutateAsync(confirm!.id); setConfirm(null); toast('Import rolled back', 'success'); }}>Yes, roll back</Button></>}>
        <p className="text-sm">This removes the {confirm?.counts ? n(confirm.counts.items) : ''} items that were added by <strong>{confirm?.fileName}</strong>. Items created some other way are not touched.</p>
      </Modal>
    </section>
  );
}

export function ImportDesktop() {
  const can = useCan();
  const w = useImportWizard();
  const drop = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rb, setRb] = useState(false);
  const b = w.batch;
  if (!can('items.create')) return <EmptyState title="No permission" body="Importing stock needs the Items create permission." />;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Import stock" description="Load items and opening stock from a spreadsheet. Nothing is saved until you check it and press Import." actions={<Link to="/import/review"><Button>Review queue</Button></Link>} />
      <Steps current={w.step} />

      {w.step === 'upload' && (
        <section aria-label="Upload">
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) w.doUpload.mutate(f); }}
            className={`flex flex-col items-center gap-3 rounded border-2 border-dashed p-12 text-center ${over ? 'border-teal bg-success-bg' : 'border-line bg-mist'}`}
          >
            <p className="text-sm">Drop an Excel file here (.xlsx, .xlsb or .csv)</p>
            <Button variant="primary" size="lg" onClick={() => drop.current?.click()} loading={w.doUpload.isPending}>Choose file</Button>
            <input ref={drop} type="file" accept=".xlsx,.xlsb,.xls,.csv" aria-label="Choose file to import" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) w.doUpload.mutate(f); e.target.value = ''; }} />
          </div>
          {w.upload && (
            <p role="status" className="mt-3 text-sm">{w.upload.error ? <span role="alert" className="text-danger">{w.upload.error} <Button size="sm" onClick={() => drop.current?.click()}>Try again</Button></span> : `Uploading ${w.upload.name}… ${w.upload.progress}%`}</p>
          )}
          {w.doUpload.isError && !w.upload?.error && <div className="mt-3"><ErrorBanner message="Upload failed. Please try again." /></div>}
        </section>
      )}

      {w.step === 'sheet' && b && (
        <section aria-label="Choose sheet" className="max-w-xl">
          <p className="mb-3 text-sm">File <strong>{b.fileName}</strong> has {b.sheets.length} sheets. Choose the one with the items.</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Sheet</legend>
            {b.sheets.map((s) => (
              <label key={s.name} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded border p-3 text-sm ${w.sheet === s.name ? 'border-teal bg-teal-50' : 'border-navy-100'}`}>
                <input type="radio" name="sheet" checked={w.sheet === s.name} onChange={() => w.setSheet(s.name)} className="h-4 w-4 accent-[var(--color-navy)]" />
                <span className="flex-1">{s.name}</span><span className="text-muted">{n(s.rows)} rows</span>
              </label>
            ))}
          </fieldset>
          <p className="mt-3 text-xs text-muted">Import into: <strong>Items and stock</strong></p>
          <div className="mt-5 flex gap-2"><Button onClick={w.reset}>Start over</Button><Button variant="primary" onClick={w.chooseSheet}>Next: map columns</Button></div>
        </section>
      )}

      {w.step === 'mapping' && b && (
        <section aria-label="Map columns">
          <p className="mb-3 text-sm">Match each field to a column in the sheet. {w.hasSaved ? 'Your saved mapping was used where it fits.' : 'We guessed from the column names.'}</p>
          <Table caption="Column mapping">
            <THead><Tr><Th>Field</Th><Th>Sheet column</Th></Tr></THead>
            <TBody>{IMPORT_FIELDS.map((f) => (
              <Tr key={f.key}><Td>{f.label}{f.required && <span aria-hidden className="text-danger"> *</span>}</Td>
                <Td><Select aria-label={`Column for ${f.label}`} className="w-64" value={w.mapping[f.key] ?? ''} onChange={(e) => w.setMapping({ ...w.mapping, [f.key]: e.target.value || undefined })}><option value="">Not mapped</option>{w.columns.map((c) => <option key={c}>{c}</option>)}</Select></Td></Tr>
            ))}</TBody>
          </Table>
          {w.missingRequired.length > 0 && <p role="alert" className="mt-3 text-sm text-warning">Still needed: {w.missingRequired.join(', ')}. The check will list these as errors.</p>}
          <div className="mt-3"><Checkbox label="Save this mapping for next time" checked={w.saveMapping} onChange={(e) => w.setSaveMapping(e.target.checked)} /></div>
          {w.dry.isError && <div className="mt-3"><ErrorBanner message={(w.dry.error as Error).message} /></div>}
          <div className="mt-5 flex gap-2"><Button onClick={() => w.setStep('sheet')}>Back</Button><Button variant="primary" loading={w.dry.isPending} onClick={() => w.dry.mutate()}>Check the file (dry run)</Button></div>
        </section>
      )}

      {w.step === 'dry-run' && b?.counts && (
        <section aria-label="Dry run result">
          <h2 className="mb-3 text-xs">Dry run result. Nothing has been saved yet.</h2>
          <Counts b={b} />
          {b.errors.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-xs">Errors and skipped rows ({n(b.errors.length)})</h3><Button size="sm" onClick={() => downloadErrors(b)}>Download error list</Button></div>
              <Table caption="Import errors"><THead><Tr><Th>Row</Th><Th>Problem</Th><Th>Field</Th><Th>Message</Th></Tr></THead>
                <TBody>{b.errors.slice(0, 50).map((e, i) => <Tr key={i}><Td>{e.row || '–'}</Td><Td className="font-mono text-xs">{e.code}</Td><Td>{e.field}</Td><Td>{e.message}</Td></Tr>)}</TBody></Table>
              {b.errors.length > 50 && <p className="mt-1 text-xs text-muted">Showing the first 50. Download the list to see all.</p>}
            </div>
          )}
          {w.commit.isError && <div className="mt-3"><ErrorBanner message={(w.commit.error as Error).message} /></div>}
          <div className="mt-6 flex gap-2">
            <Button onClick={() => w.setStep('mapping')}>Back to mapping</Button>
            <Button variant="primary" size="lg" disabled={b.counts.items === 0} loading={w.commit.isPending} onClick={() => w.commit.mutate()}>Import {n(b.counts.items)} items ({n(b.counts.pieces)} pieces)</Button>
          </div>
        </section>
      )}

      {w.step === 'commit' && b && (
        <section aria-label="Import progress">
          {b.status === 'committing' && (
            <div role="status"><p className="mb-2 text-sm">Importing… {b.progress}%</p>
              <div className="h-3 overflow-hidden rounded bg-mist" role="progressbar" aria-valuenow={b.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Import progress"><div className="h-full bg-teal transition-all" style={{ width: `${b.progress}%` }} /></div></div>
          )}
          {b.status === 'committed' && b.counts && (
            <div role="status" className="rounded border border-teal bg-success-bg p-5">
              <h2 className="text-lg">Import finished</h2>
              <p className="mt-2 text-lg font-semibold" data-testid="import-result">{n(b.counts.items)} items and {n(b.counts.pieces)} pieces imported</p>
              {b.counts.warnings > 0 && <p className="mt-1 text-sm">{n(b.counts.warnings)} items need a quick fix (missing HSN, size or price).</p>}
              <div className="mt-4 flex gap-2"><Link to="/items"><Button>View items</Button></Link><Link to="/import/review"><Button variant="primary">Open review queue</Button></Link><Button variant="danger" onClick={() => setRb(true)}>Roll back this import</Button><Button variant="ghost" onClick={w.reset}>Import another file</Button></div>
            </div>
          )}
          {b.status === 'rolled-back' && <div role="status" className="rounded border-2 border-navy-100 bg-mist p-5"><h2 className="text-lg">Import rolled back</h2><p className="mt-2 text-sm">The items from this file were removed.</p><Button className="mt-4" onClick={w.reset}>Import another file</Button></div>}
        </section>
      )}

      <Modal open={rb} onClose={() => setRb(false)} title="Roll back this import?" footer={<><Button onClick={() => setRb(false)}>Cancel</Button><Button variant="danger" loading={w.rollback.isPending} onClick={async () => { await w.rollback.mutateAsync(); setRb(false); }}>Yes, roll back</Button></>}>
        <p className="text-sm">All items added by this file will be removed.</p>
      </Modal>
      <History />
    </div>
  );
}
