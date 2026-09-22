import Image from "next/image";
import MediaActions from './components/MediaActions';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-6 items-center sm:items-start">
        <h1 className="text-2xl font-bold">مرحباً بك في مشروع Mova-it</h1>
        
        {/* أزرار الوسائط التي أضفناها */}
        <MediaActions />

      </main>
    </div>
  );
}