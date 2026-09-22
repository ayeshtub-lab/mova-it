'use client';

import { useState } from 'react';
import { CheckCircle2, MessageSquare, Plus, Loader2 } from 'lucide-react';

interface WitnessAngle {
  id: string;
  angleText: string;
  createdAt: string;
}

interface WitnessSectionProps {
  momentId: string;
  initialAngles: WitnessAngle[];
}

export default function WitnessSection({ momentId, initialAngles }: WitnessSectionProps) {
  const [angles, setAngles] = useState<WitnessAngle[]>(initialAngles);
  const [hasWitnessed, setHasWitnessed] = useState(false);
  const [witnessing, setWitnessing] = useState(false);
  const [newAngleText, setNewAngleText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleWitness = async () => {
    if (hasWitnessed || witnessing) return;
    setWitnessing(true);
    try {
      const res = await fetch(`/api/moments/${momentId}/witness`, { method: 'POST' });
      if (res.ok) setHasWitnessed(true);
    } catch (err) {
      console.error(err);
    } finally {
      setWitnessing(false);
    }
  };

  const handleAddAngle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAngleText.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/moments/${momentId}/angles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angleText: newAngleText }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAngles([data.data, ...angles]);
        setNewAngleText('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleWitness}
        disabled={hasWitnessed || witnessing}
        className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
          hasWitnessed 
            ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 cursor-default'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
        }`}
      >
        {witnessing ? <Loader2 className="w-4 h-4 animate-spin" /> : hasWitnessed ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> You Confirmed You Were Here</> : <><CheckCircle2 className="w-4 h-4" /> I Was Here / Confirm Witness</>}
      </button>

      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
          Witness Angles & Live Updates
        </h2>

        {angles.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/60 p-4">
            No angles or updates added yet. Add yours below!
          </div>
        ) : (
          <div className="space-y-2.5">
            {angles.map((angle) => (
              <div key={angle.id} className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 space-y-1">
                <p className="text-xs text-slate-200 leading-relaxed">{angle.angleText}</p>
                <div className="text-[10px] text-slate-500 flex justify-between pt-1">
                  <span>Local Witness</span>
                  <span>{new Date(angle.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <Plus className="w-4 h-4 text-indigo-400" />
          Add Your Angle or Missing Answer
        </h3>
        <form onSubmit={handleAddAngle} className="space-y-2.5">
          <textarea
            rows={2}
            required
            placeholder="What do you see? Answer the missing piece..."
            value={newAngleText}
            onChange={(e) => setNewAngleText(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-slate-700"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post Angle'}
          </button>
        </form>
      </div>
    </div>
  );
}