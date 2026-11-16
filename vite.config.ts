import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages는 https://<조직>.github.io/umlmaid/ 처럼 하위 경로에서 서비스된다.
  // 상대 경로로 두면 저장소 이름이 바뀌어도 동작한다.
  base: './',
});
