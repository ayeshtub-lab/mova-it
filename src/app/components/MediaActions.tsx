'use client';

import React from 'react';

interface MediaActionsProps {
  onAddImage?: () => void;
  onAddVideo?: () => void;
}

export default function MediaActions({ onAddImage, onAddVideo }: MediaActionsProps) {
  return (
    <div className="flex gap-4 my-4">
      <button
        onClick={onAddImage}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
      >
        <span>📷</span> إضافة صورة
      </button>
      <button
        onClick={onAddVideo}
        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
      >
        <span>🎥</span> إضافة فيديو
      </button>
    </div>
  );
}