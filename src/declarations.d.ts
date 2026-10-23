declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

// PWA 설치 프롬프트 (표준 DOM 타입에 없음)
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

