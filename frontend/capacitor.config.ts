import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.projectresonance',
  appName: 'project-resonance',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#F7F4F0',
      showSpinner: true,
      spinnerColor: '#4A9E94',
      androidSpinnerStyle: 'small',
    },
  },
  // 开发调试时可启用热更新（指向你自己的开发服务器）：
  // server: {
  //   url: 'https://your-dev-server.example.com',
  //   cleartext: true,
  // },
};

export default config;
