// 담당: M5 화면
// 코드 편집기. 오류 줄 표시를 위해 DiagramView.onParseError를 받는다.
// 지금은 M4가 흐름 확인용으로 넣은 임시 textarea다. 구문 강조·오류 줄 강조는 M5가 만든다(FR-01-3, FR-01-4).
import type { SyntaxError } from '../infrastructure/parser/ParseResult';

interface Props {
  value: string;
  onChange: (text: string) => void;
  errors: SyntaxError[];
}

export function TextEditor({ value, onChange, errors }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{ flex: 1, fontFamily: 'monospace', fontSize: 14, padding: 8 }}
      />
      {errors.length > 0 && (
        <ul style={{ margin: 0, padding: 8, color: '#b00020', fontSize: 13, listStyle: 'none' }}>
          {errors.map((e, i) => (
            <li key={i}>
              {e.line}번째 줄: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
