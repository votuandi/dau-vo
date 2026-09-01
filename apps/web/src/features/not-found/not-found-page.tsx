import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return <main className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-center text-white"><div><p className="font-display text-8xl font-black text-amber-400">404</p><h1 className="mt-3 text-2xl font-black">Không tìm thấy trang</h1><p className="mt-2 text-sm text-slate-400">Địa chỉ này không tồn tại hoặc đã được thay đổi.</p><Link to="/bang-diem"><Button className="mt-6"><ArrowLeft className="h-4 w-4" /> Về bảng điểm</Button></Link></div></main>;
}
