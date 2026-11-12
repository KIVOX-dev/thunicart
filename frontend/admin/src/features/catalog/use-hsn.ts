import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';
import { hsnRuleDto } from './types';

const KEY = ['hsn-rules'] as const;
export function useHsnRules() {
  return useQuery({ queryKey: KEY, queryFn: async () => (await api.get<unknown[]>('/hsn-rules')).map((r) => hsnRuleDto.parse(r)) });
}
export function useConfirmHsn() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api.post('/hsn-rules/confirm'), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
export function useSetEffective() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { hsn: string; effectiveFrom: string }) => api.patch(`/hsn-rules/${v.hsn}`, { effectiveFrom: v.effectiveFrom }), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}
