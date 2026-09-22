'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Sparkles, Send } from 'lucide-react';

export default function CreateMomentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    city: 'Bethlehem',
    areaName: '',
    whyNowReason: '',
    missingPiece: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create moment');
      }

      // الانتقال إلى صفحة اللحظة التي تم إنشاؤها حديثاً
      router.push(`/moment/${data.id}`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 max-w-md mx-auto relative border-x border-slate-800 p-4 space-y-6">
      
      {/* رأس الصفحة وزر العودة */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl transition-all">
          <ArrowLeft className="w-4 h-4" />
          Feed
        </Link>
        <h1 className="text-sm font-bold tracking-wider text-indigo-400 uppercase">MOVA IT — New Moment</h1>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* نموذج إنشاء اللحظة */}
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            What is happening? (Title)
          </label>
          <textarea
            required
            rows={2}
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Unexpected road blockage near the central market..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-all resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-rose-500" />
              City
            </label>
            <input
              type="text"
              required
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Approx. Area</label>
            <input
              type="text"
              required
              placeholder="e.g., Downtown"
              value={formData.areaName}
              onChange={(e) => setFormData({ ...formData, areaName: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Why now? (Reason)</label>
          <input
            type="text"
            required
            placeholder="e.g., Just started 5 minutes ago"
            value={formData.whyNowReason}
            onChange={(e) => setFormData({ ...formData, whyNowReason: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-amber-400">Missing Piece / Question (Optional)</label>
          <input
            type="text"
            placeholder="e.g., Does anyone have a photo from the other side of the street?"
            value={formData.missingPiece}
            onChange={(e) => setFormData({ ...formData, missingPiece: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
        >
          {loading ? (
            <span>Publishing Moment...</span>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Publish Moment (Move with the moment)
            </>
          )}
        </button>

      </form>

    </div>
  );
}