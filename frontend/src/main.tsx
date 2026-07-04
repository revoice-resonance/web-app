import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";
import { installLogRecorder } from "./lib/logRecorder";

// Mirror console + global errors into an in-memory ring buffer
// so the user can export logs from Settings → "导出诊断日志".
installLogRecorder();

// Global unhandled error logging for mobile debugging
window.addEventListener('error', (e) => {
  console.error('[Global Error]', e.message, e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise]', e.reason);
});

// 部署期 chunk hash 失效时自动重载（Vite 5 原生事件）
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
