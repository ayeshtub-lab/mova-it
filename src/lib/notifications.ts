// رسائل إشعار آمنة
export function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      return Promise.resolve();
    }
    if (Notification.permission !== "denied") {
      return Notification.requestPermission();
    }
  }
  return Promise.resolve();
}

export function sendMessageNotification(senderName: string, message: string) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(`رسالة من ${senderName}`, {
        body: message,
        icon: "/logo.png",
        badge: "/logo.png",
        tag: "message-notification",
      });

      // تشغيل صوت إشعار آمن
      playNotificationSound();
    } catch (error) {
      console.error("خطأ في الإشعار:", error);
    }
  }
}

function playNotificationSound() {
  try {
    // نغمة بسيطة باستخدام Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error("خطأ في تشغيل الصوت:", error);
  }
}
