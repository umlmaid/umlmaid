import { CanvasRenderer } from './presentation/CanvasRenderer';
import { TextEditor } from './presentation/TextEditor';

export function App() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', height: '100vh' }}>
      <TextEditor />
      <CanvasRenderer />
    </div>
  );
}
