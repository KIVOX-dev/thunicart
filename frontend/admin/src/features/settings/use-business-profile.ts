import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PRINT_SIZES, businessProfileBody, businessProfileDto } from '@thunikart/shared';
import { api } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';
import { ME_KEY, useSession } from '../auth/use-session';

export type BusinessProfile = z.infer<typeof businessProfileDto>;
const PROFILE_KEY = ['business-profile'] as const;

/** Form schema: the address is edited as one text area, one line per row. */
const formSchema = businessProfileBody
  .omit({ addressLines: true, logoKey: true, brandColors: true, confirmGstClear: true })
  .extend({ addressText: z.string().max(750) });
export type BusinessProfileForm = z.input<typeof formSchema>;

export const PRINT_SIZE_LABELS: Record<(typeof PRINT_SIZES)[number], string> = { a4: 'A4 sheet', '2in': 'Thermal 2 inch (58 mm)', '3in': 'Thermal 3 inch (80 mm)', '4x6': 'Thermal 4 x 6 inch' };

/** What changes when GST goes live. Wording only, shown in the confirmation. */
export const GST_GO_LIVE_CHANGES = [
  'New bills become tax invoices with the GSTIN, HSN and a GST summary.',
  'GST columns and tax lines appear in sales, purchase and print screens.',
  'The GST menu and GST reports (GSTR-1, GSTR-3B, HSN summary) become available.',
  'Items without an HSN code are flagged so you can fix them.',
  'Bills already issued stay as they are. Reprints look identical.',
];

export function useBusinessProfile() {
  return useQuery({ queryKey: PROFILE_KEY, queryFn: async () => businessProfileDto.parse(await api.get('/settings/business-profile')) });
}

type Pending = { kind: 'golive' | 'clear'; body: z.input<typeof businessProfileBody> } | null;

export function useBusinessProfileForm(profile: BusinessProfile) {
  const qc = useQueryClient();
  const { data: me } = useSession();
  const gstLive = me?.gst.gstMode === 'on';
  const [pending, setPending] = useState<Pending>(null);
  const [banner, setBanner] = useState<{ message: string; requestId?: string } | null>(null);
  const form = useForm<BusinessProfileForm>({
    resolver: zodResolver(formSchema),
    values: {
      legalName: profile.legalName, brandName: profile.brandName, addressText: profile.addressLines.join('\n'), city: profile.city, state: profile.state,
      stateCode: profile.stateCode, pincode: profile.pincode, phone: profile.phone, email: profile.email, website: profile.website, gstin: profile.gstin,
      pan: profile.pan, defaultPrintSize: profile.defaultPrintSize, termsText: profile.termsText, invoiceFooter: profile.invoiceFooter,
    },
  });
  const save = useMutation({
    mutationFn: (body: z.input<typeof businessProfileBody>) => api.put('/settings/business-profile', body),
    onSuccess: async () => {
      // GST wording and menus follow the API, so refresh the cached status without a page reload.
      await Promise.all([qc.invalidateQueries({ queryKey: PROFILE_KEY }), qc.invalidateQueries({ queryKey: ME_KEY })]);
    },
  });

  const toBody = (v: BusinessProfileForm): z.input<typeof businessProfileBody> => {
    const { addressText, ...rest } = v;
    return { ...rest, addressLines: addressText.split('\n').map((l) => l.trim()).filter(Boolean), logoKey: profile.logoKey, brandColors: profile.brandColors };
  };
  const run = async (body: z.input<typeof businessProfileBody>) => {
    setBanner(null);
    try {
      await save.mutateAsync(body);
      setPending(null);
      return true;
    } catch (e) {
      setPending(null);
      setBanner(applyApiError(form, e));
      return false;
    }
  };
  const submit = form.handleSubmit(async (v) => {
    const body = toBody(v);
    const gstin = (body.gstin ?? '').trim().toUpperCase();
    if (gstin && !gstLive) return setPending({ kind: 'golive', body });
    if (!gstin && gstLive) return setPending({ kind: 'clear', body });
    await run(body);
  });
  const confirm = () => pending && run(pending.kind === 'clear' ? { ...pending.body, confirmGstClear: true } : pending.body);
  return { form, submit, banner, saving: save.isPending, saved: save.isSuccess, pending, confirm, cancel: () => setPending(null), gstLive };
}
