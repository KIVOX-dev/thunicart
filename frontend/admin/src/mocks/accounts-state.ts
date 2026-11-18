export interface Expense { id: string; date: string; category: string; amount: number; note: string; receiptKey: string | null; by: string }
export interface Receipt { id: string; number: string; customerId: string; customerName: string; date: string; amount: number; mode: string; reference: string }
export interface Job { id: string; kind: 'report' | 'export'; title: string; format: string; path: string; progress: number; status: 'running' | 'done'; by: string; dataset: string }
export interface ExportRecord { id: string; dataset: string; format: string; by: string; at: string; path: string }
export interface AccountsState { expenses: Expense[]; receipts: Receipt[]; jobs: Job[]; exportsHistory: ExportRecord[]; monthlyEmail: boolean }
export const seedAccounts = (): { acc: AccountsState } => ({ acc: { expenses: [], receipts: [], jobs: [], exportsHistory: [] } });
