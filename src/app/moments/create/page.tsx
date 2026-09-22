import React from 'react';
import MediaActions from '@/app/components/MediaActions';
// ... بقية الـ imports والحالة حسب ملفك الحالي

export default function CreateMomentPage() {
  // ... الدوال الخاصة بك مثل handleSubmit و setFormData وما شابه

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-bold mb-4 text-slate-100">إنشاء حدث جديد</h1>
      
      {/* نموذج إنشاء الحدث */}
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

        {/* هنا تم وضع أزرار الوسائط في مكانها الصحيح داخل نموذج الحدث */}
        <div className="pt-2">
          <label className="text-xs font-semibold text-slate-300 block mb-1">Attach Media</label>
          <MediaActions />
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