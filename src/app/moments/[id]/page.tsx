'use client';

import { useState, useEffect } from 'react';
import { MapPin, Sparkles, Eye, PlusCircle, ArrowUpRight, Radio } from 'lucide-react';
import Link from 'next/link';

interface Moment {
  id: string;
  title: string;
  city: string;
  areaName: string;
  whyNowReason: string;
  missingPiece: string;
  witnessesCount: number;
  anglesCount: number;
  whyNowScore: number;
}

export default function NearbyFeedPage() {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);

  // Fallback Data to ensure UI renders seamlessly
  const fallbackMoments: Moment[] = [
    {
      id: 'm1',
      title: 'Unusual gathering near the city square',
      city: 'Bethlehem',
      areaName: 'Downtown Zone',
      whyNowReason: 'New witness added a video angle 2 minutes ago',
      missingPiece: 'Looking for a camera angle from the west building.. Were you there?',
      witnessesCount: 14,
      anglesCount: 3,
      whyNowScore: 9.8,
    },
    {
      id: 'm2',
      title: 'Public transport block on main street',
      city: 'Jerusalem',
      areaName: 'North Gate Zone',
      whyNowReason: '3 witnesses confirmed activity in the last 10m',
      missingPiece: 'Seeking confirmation if traffic cleared. Any updates?',
      witnessesCount: 8,
      anglesCount: 2,
      whyNowScore: 6.4,
    }
  ];

  useEffect(() => {
    fetch('/api/moments')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
          setMoments(data.data);
        } else {
          setMoments(fallbackMoments);
        }
        setLoading(false);
      })
      .catch(() => {
        setMoments(fallbackMoments);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20 max-w-md mx-auto relative border-x border-slate-800">
      
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse"></div>
          <span className="font-extrabold text-base tracking-wider bg-gradient-to-r from-indigo-400 to-amber-400 bg-clip-text text-transparent">
            MOVA IT
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full flex items-center gap-1">
          <MapPin className="w-3 h-3 text-rose-500" />
          Bethlehem Zone
        </span>
      </header>

      <main className="p-4 space-y-4">
        
        {/* Banner Section */}
        <div className="bg-gradient-to-r from-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Nearby Moments & Witness Engine</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Real-time, location-centric activity happening right now. Share your angle or confirm witness.
          </p>
        </div>

        {/* Moments Feed List */}
        <div className="space-y-3 pt-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Live Moments Priority Feed
          </h2>

          {loading ? (
            <div className="text-center py-12 text-xs text-slate-500">Loading nearby moments...</div>
          ) : (
            moments.map((moment) => (
              <Link key={moment.id} href={`/moment/${moment.id}`} className="block group">
                <div className="bg-slate-900/80 border border-slate-800/90 group-hover:border-indigo-500/50 rounded-2xl p-4 space-y-3 transition-all">
                  
                  {/* Why Now Badge */}
                  <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg p-2 flex items-start gap-2 text-[11px] text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <span><strong className="text-indigo-200">Why now:</strong> {moment.whyNowReason}</span>
                  </div>

                  {/* Title & Info */}
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
                        {moment.witnessesCount} Witnesses
                      </span>
                    </div>
                  </div>

                  {/* Missing Angle Callout */}
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

      {/* Floating Action Button */}
      <div className="fixed bottom-4 left-0 right-0 max-w-md mx-auto px-4 pointer-events-none">
        <button className="pointer-events-auto w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-xs shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 border border-indigo-400/30">
          <PlusCircle className="w-4.5 h-4.5" />
          Create New Moment Around Here
        </button>
      </div>

    </div>
  );
}