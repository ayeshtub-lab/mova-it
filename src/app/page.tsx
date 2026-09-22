'use client';

import { useState, useEffect } from 'react';
import { MapPin, Sparkles, Eye, PlusCircle, ArrowUpRight, Radio, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Moment {
  id: string;
  title: string;
  city: string;
  areaName: string;
  whyNowReason: string;
  missingPiece?: string | null;
  witnessesCount?: number;
  _count?: { witnesses: number };
}

export default function NearbyFeedPage() {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('Bethlehem');
  const [areaName, setAreaName] = useState('Downtown');
  const [whyNowReason, setWhyNowReason] = useState('');
  const [missingPiece, setMissingPiece] = useState('');

  // Fetch real moments from database
  const fetchMoments = async () => {
    try {
      const res = await fetch('/api/moments');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMoments(data.data);
      }
    } catch (err) {
      console.error('Error fetching moments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMoments();
  }, []);

  // Handle Create Moment
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          city,
          areaName,
          whyNowReason: whyNowReason || 'Recently reported by a local user',
          missingPiece: missingPiece || null,
        }),
      });

      if (res.ok) {
        setTitle('');
        setWhyNowReason('');
        setMissingPiece('');
        setIsModalOpen(false);
        fetchMoments(); // Refresh list immediately
      }
    } catch (err) {
      console.error('Failed to create moment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 max-w-md mx-auto relative border-x border-slate-800">
      
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse"></div>
          <span className="font-extrabold text-base tracking-wider bg-gradient-to-r from-indigo-400 to-amber-400 bg-clip-text text-transparent">
            MOVA IT
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full flex items-center gap-1">
          <MapPin className="w-3 h-3 text-rose-500" />
          {city} Zone
        </span>
      </header>

      <main className="p-4 space-y-4">
        
        {/* Banner */}
        <div className="bg-gradient-to-r from-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Nearby Moments & Witness Engine</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Real-time, location-centric activity happening right now. Share your angle or confirm witness.
          </p>
        </div>

        {/* Feed List */}
        <div className="space-y-3 pt-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Live Moments Priority Feed
          </h2>

          {loading ? (
            <div className="text-center py-12 text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              Loading real-time moments...
            </div>
          ) : moments.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/60 p-6 space-y-2">
              <p className="text-slate-300 font-semibold text-sm">No active moments around here yet.</p>
              <p>Be the first witness to post a moment in this zone!</p>
            </div>
          ) : (
            moments.map((moment) => (
              <Link key={moment.id} href={`/moment/${moment.id}`} className="block group">
                <div className="bg-slate-900/80 border border-slate-800/90 group-hover:border-indigo-500/50 rounded-2xl p-4 space-y-3 transition-all">
                  
                  <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg p-2 flex items-start gap-2 text-[11px] text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span><strong className="text-indigo-200">Why now:</strong> {moment.whyNowReason}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-indigo-300 transition-colors leading-snug">
                        {moment.title}
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0" />
                    </div>
                    
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 text-slate-300">
                        <MapPin className="w-3 h-3 text-rose-500" />
                        {moment.city} — {moment.areaName}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3 text-indigo-400" />
                        {moment._count?.witnesses ?? moment.witnessesCount ?? 1} Witnesses
                      </span>
                    </div>
                  </div>

                  {moment.missingPiece && (
                    <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-2.5 text-[11px] text-amber-200/90 font-medium">
                      <span className="text-amber-400 font-bold block mb-0.5">Missing Piece:</span>
                      "{moment.missingPiece}"
                    </div>
                  )}

                </div>
              </Link>
            ))
          )}
        </div>

      </main>

      {/* Trigger Button */}
      <div className="fixed bottom-4 left-0 right-0 max-w-md mx-auto px-4 pointer-events-none z-20">
        <button 
          onClick={() => setIsModalOpen(true)}
          className="pointer-events-auto w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-xs shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 border border-indigo-400/30 transition-all active:scale-[0.98]"
        >
          <PlusCircle className="w-4.5 h-4.5" />
          Create New Moment Around Here
        </button>
      </div>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-indigo-400" />
                Post New Moment
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Moment Title *</label>
                <input
                  type="text"
                  required
                  placeholder="What is happening right now?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Area / Zone</label>
                  <input
                    type="text"
                    value={areaName}
                    onChange={(e) => setAreaName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Why Now? (Reason)</label>
                <input
                  type="text"
                  placeholder="e.g., Crowds gathering in the main street"
                  value={whyNowReason}
                  onChange={(e) => setWhyNowReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Missing Piece / Question (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g., Is the road blocked from the north entrance?"
                  value={missingPiece}
                  onChange={(e) => setMissingPiece(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Publish Live Moment'}
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}