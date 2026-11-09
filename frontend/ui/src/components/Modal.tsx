import { Overlay, type OverlayProps } from './Overlay';

type Base = Omit<OverlayProps, 'position'>;
export const Modal = (p: Base) => <Overlay {...p} position="center" />;
export const Drawer = ({ side = 'left', ...p }: Base & { side?: 'left' | 'right' }) => <Overlay {...p} position={side} />;
export const BottomSheet = (p: Base) => <Overlay {...p} position="bottom" />;
