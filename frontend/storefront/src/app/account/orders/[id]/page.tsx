import { OrderDetail } from '@/components/shared/OrderDetail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <OrderDetail id={id} />; }
