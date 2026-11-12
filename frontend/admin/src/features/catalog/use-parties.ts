import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { api, newIdempotencyKey } from '../api/http';
import { applyApiError } from '../api/apply-field-errors';
import { customerBody, customerDto, customerLedgers, listEnvelope, vendorBody, vendorDto, type Customer, type Vendor } from './types';

type Banner = { message: string; requestId?: string } | null;

export function useVendors(q: string) {
  return useInfiniteQuery({
    queryKey: ['vendors', q], initialPageParam: 1,
    queryFn: async ({ pageParam }) => listEnvelope(vendorDto).parse(await api.get('/vendors', { q, page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useCustomers(q: string) {
  return useInfiniteQuery({
    queryKey: ['customers', q], initialPageParam: 1,
    queryFn: async ({ pageParam }) => listEnvelope(customerDto).parse(await api.get('/customers', { q, page: pageParam, pageSize: 20 })),
    getNextPageParam: (l) => l.nextPage ?? undefined,
  });
}
export function useCustomerLedgers(id: string | undefined) {
  return useQuery({ queryKey: ['customer-ledgers', id], enabled: !!id, queryFn: async () => customerLedgers.parse(await api.get(`/customers/${id}/ledgers`)) });
}

export function useVendorForm(vendor: Vendor | undefined, onDone: () => void) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof vendorBody>>({
    resolver: zodResolver(vendorBody),
    values: vendor ? { name: vendor.name, contactPerson: vendor.contactPerson, email: vendor.email, mobile: vendor.mobile, address: vendor.address, city: vendor.city, stateCode: vendor.stateCode, gstin: vendor.gstin, pan: vendor.pan, paymentTerms: vendor.paymentTerms, glAccount: vendor.glAccount }
      : { name: '', contactPerson: '', email: '', mobile: '', address: '', city: '', stateCode: '33', gstin: '', pan: '', paymentTerms: 'NET30', glAccount: '211001' },
  });
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    mutationFn: (v: z.output<typeof vendorBody>) => (vendor ? api.put(`/vendors/${vendor.id}`, v) : api.post('/vendors', v, { idempotencyKey: key })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
  const submit = form.handleSubmit(async (v) => {
    try { await m.mutateAsync(vendorBody.parse(v)); onDone(); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending };
}

export function useCustomerForm(customer: Customer | undefined, onDone: () => void) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof customerBody>>({
    resolver: zodResolver(customerBody),
    values: customer ? { accountGroup: customer.accountGroup as 'Retail Walk-in', name: customer.name, email: customer.email, mobile: customer.mobile, address: customer.address, city: customer.city, stateCode: customer.stateCode, gstin: customer.gstin, pan: customer.pan, glAccount: customer.glAccount }
      : { accountGroup: 'Retail Walk-in', name: '', email: '', mobile: '', address: '', city: '', stateCode: '33', gstin: '', pan: '', glAccount: '121001' },
  });
  const [banner, setBanner] = useState<Banner>(null);
  const [key] = useState(newIdempotencyKey);
  const m = useMutation({
    mutationFn: (v: z.output<typeof customerBody>) => (customer ? api.put(`/customers/${customer.id}`, v) : api.post('/customers', v, { idempotencyKey: key })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
  const submit = form.handleSubmit(async (v) => {
    try { await m.mutateAsync(customerBody.parse(v)); onDone(); } catch (e) { setBanner(applyApiError(form, e)); }
  });
  return { form, submit, banner, saving: m.isPending };
}
