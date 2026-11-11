// 담당: M5 화면 — FR-01-3, FR-01-4
// 구문 색상은 표시용이다. 문법 판단은 M1, 오류 전달은 M4가 담당한다.
import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { SyntaxError } from '../infrastructure/parser/ParseResult';

interface Props {
    value: string;
    onChange: (text: string) => void;
    errors: SyntaxError[];
}

const FONT_SIZE = 14;
const LINE_HEIGHT = 22;
const PADDING = 12;
const FONT_FAMILY = 'Consolas, "Courier New", monospace';

const KEYWORDS = new Set([
    'classDiagram', 'sequenceDiagram', 'class', 'participant', 'actor', 'as',
    'note', 'Note', 'over', 'left', 'right', 'of', 'activate', 'deactivate',
    'create', 'destroy', 'autonumber', 'title', 'direction', 'accTitle', 'accDescr',
    'alt', 'else', 'opt', 'loop', 'par', 'and', 'end', 'rect', 'critical',
    'option', 'break', 'box', 'link', 'links', 'callback',
]);
const TYPES = new Set([
    'String', 'string', 'int', 'Integer', 'void', 'double', 'boolean', 'Boolean',
    'number', 'Number', 'char', 'float', 'long', 'List', 'Map', 'Set', 'DateTime',
]);

type TokenKind = 'plain' | 'keyword' | 'type' | 'string' | 'comment' | 'relation' | 'number' | 'punctuation';
interface Token { text: string; kind: TokenKind }
const TOKEN_COLORS: Record<TokenKind, string> = {
    plain: '#17212b', keyword: '#174ea6', type: '#12645e', string: '#963c15',
    comment: '#59636f', relation: '#7131a1', number: '#135d8c', punctuation: '#555d66',
};

function highlightLine(line: string): Token[] {
    // 주석·문자열을 먼저 소비해 문자열 안의 %%나 화살표를 별도 구문으로 오해하지 않는다.
    const pattern = /%%[^\n]*|"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|<<[^>\n]*>>|<\|--|--\|>|<\|\.\.|\.\.\|>|-->>|->>|-->|<--|\.\.>|<\.\.|o--|--o|\*--|--\*|--|\.\.|->|[{}()[\]:,;~+\-#]|\b\d+(?:\.\d+)?\b|[\p{L}_$][\p{L}\p{N}_$]*/gu;
    const tokens: Token[] = [];
    let offset = 0;
    for (const match of line.matchAll(pattern)) {
        if (match.index > offset) tokens.push({ text: line.slice(offset, match.index), kind: 'plain' });
        const text = match[0];
        let kind: TokenKind = 'plain';
        if (text.startsWith('%%')) kind = 'comment';
        else if (text.startsWith('"') || text.startsWith("'")) kind = 'string';
        else if (text.startsWith('<<')) kind = 'type';
        else if (KEYWORDS.has(text)) kind = 'keyword';
        else if (TYPES.has(text)) kind = 'type';
        else if (/^\d/.test(text)) kind = 'number';
        else if (/^(?:[-.<>|*]+|o--|--o)$/.test(text) && text.length >= 2) kind = 'relation';
        else if (/^[{}()[\]:,;~+\-#]$/.test(text)) kind = 'punctuation';
        tokens.push({ text, kind });
        offset = match.index + text.length;
    }
    if (offset < line.length) tokens.push({ text: line.slice(offset), kind: 'plain' });
    return tokens;
}

const textStyle: CSSProperties = {
    fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px`,
    fontWeight: 400, fontStyle: 'normal', fontVariantLigatures: 'none',
    letterSpacing: 0, wordSpacing: 0, textAlign: 'left', textIndent: 0,
    textTransform: 'none', tabSize: 2, whiteSpace: 'pre', overflowWrap: 'normal',
    boxSizing: 'border-box', padding: PADDING,
};

export function TextEditor({ value, onChange, errors }: Props) {
    const id = `mermaid-editor-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLPreElement>(null);
    const numbersRef = useRef<HTMLDivElement>(null);
    // 브라우저 textarea의 줄바꿈과 맞춘다. 전달받은 value 자체는 변경하지 않는다.
    const lines = useMemo(() => value.replace(/\r\n?/g, '\n').split('\n'), [value]);
    const highlighted = useMemo(() => lines.map(highlightLine), [lines]);
    const errorLines = useMemo(() => new Set(errors.map((error) => error.line)), [errors]);
    const gutterWidth = Math.max(44, String(lines.length).length * 9 + 22);

    const syncScroll = () => {
        const input = inputRef.current;
        if (!input) return;
        if (highlightRef.current) {
            highlightRef.current.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
        }
        if (numbersRef.current) numbersRef.current.style.transform = `translateY(${-input.scrollTop}px)`;
    };

    useLayoutEffect(() => { syncScroll(); }, [value, gutterWidth]);

    const jumpToError = (error: SyntaxError) => {
        const input = inputRef.current;
        if (!input) return;
        const currentLines = input.value.split('\n');
        const lineIndex = Math.min(currentLines.length - 1, Math.max(0, error.line - 1));
        const columnIndex = Math.min(currentLines[lineIndex].length, Math.max(0, error.column - 1));
        const lineStart = currentLines.slice(0, lineIndex).reduce((sum, line) => sum + line.length + 1, 0);
        const start = lineStart + columnIndex;
        const end = Math.min(start + 1, lineStart + currentLines[lineIndex].length);
        input.focus({ preventScroll: true });
        input.setSelectionRange(start, end);

        const lineTop = PADDING + lineIndex * LINE_HEIGHT;
        if (lineTop < input.scrollTop + PADDING) input.scrollTop = Math.max(0, lineTop - PADDING);
        else if (lineTop + LINE_HEIGHT > input.scrollTop + input.clientHeight - PADDING) {
            input.scrollTop = lineTop + LINE_HEIGHT - input.clientHeight + PADDING;
        }
        // 긴 줄의 오른쪽에 있는 오류도 보이도록 가로 스크롤한다.
        const context = document.createElement('canvas').getContext('2d');
        if (context) {
            context.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
            const tabWidth = context.measureText('  ').width;
            let width = 0;
            const chunks = currentLines[lineIndex].slice(0, columnIndex).split('\t');
            chunks.forEach((chunk, index) => {
                if (index > 0 && tabWidth > 0) width = (Math.floor(width / tabWidth) + 1) * tabWidth;
                width += context.measureText(chunk).width;
            });
            if (width < input.scrollLeft) input.scrollLeft = width;
            else if (width + PADDING * 2 > input.scrollLeft + input.clientWidth) {
                input.scrollLeft = width + PADDING * 2 - input.clientWidth;
            }
        }
        syncScroll();
    };

    return (
        <div id={id} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, background: 'white', color: '#17212b' }}>
            <style>{`
        #${id} .editor-surface:focus-within { outline: 2px solid #2864b4; outline-offset: -2px; }
        #${id} textarea::selection { background: #b8d4ff; color: #17212b; }
        #${id} .error-link:hover { text-decoration: underline; }
        #${id} .error-link:focus-visible { outline: 2px solid #2864b4; outline-offset: 2px; }
      `}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13 }}>
                <label htmlFor={`${id}-input`}>Mermaid 코드</label>
                <span id={`${id}-status`} role="status" aria-live="polite" style={{ color: errors.length ? '#a01724' : '#59636f' }}>오류 {errors.length}개</span>
            </div>
            <div className="editor-surface" style={{ position: 'relative', flex: 1, minHeight: 180, border: '1px solid #a5adb6', overflow: 'hidden' }}>
                <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: gutterWidth, overflow: 'hidden', background: '#f5f6f8', borderRight: '1px solid #d8dde3', boxSizing: 'border-box', pointerEvents: 'none' }}>
                    <div ref={numbersRef} style={{ paddingTop: PADDING, fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, lineHeight: `${LINE_HEIGHT}px` }}>
                        {lines.map((_, index) => <div key={index} style={{ height: LINE_HEIGHT, textAlign: 'right', paddingRight: 10, color: errorLines.has(index + 1) ? '#a01724' : '#626d79', background: errorLines.has(index + 1) ? '#ffe8eb' : undefined, fontWeight: errorLines.has(index + 1) ? 700 : 400 }}>{index + 1}</div>)}
                    </div>
                </div>
                <div aria-hidden="true" style={{ position: 'absolute', left: gutterWidth, right: 0, top: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <pre ref={highlightRef} style={{ ...textStyle, position: 'absolute', left: 0, top: 0, margin: 0, minWidth: '100%', width: 'max-content', userSelect: 'none' }}>
            {highlighted.map((tokens, index) => <span key={index} data-line={index + 1} data-error={errorLines.has(index + 1) || undefined} style={{ display: 'block', height: LINE_HEIGHT, minWidth: '100%', background: errorLines.has(index + 1) ? '#ffe8eb' : undefined, boxShadow: errorLines.has(index + 1) ? 'inset 3px 0 #b42335' : undefined }}>
              {tokens.length ? tokens.map((token, tokenIndex) => <span key={tokenIndex} data-token={token.kind} style={{ color: TOKEN_COLORS[token.kind] }}>{token.text}</span>) : '\u200b'}
            </span>)}
          </pre>
                </div>
                <textarea
                    id={`${id}-input`}
                    ref={inputRef}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onScroll={syncScroll}
                    aria-invalid={errors.length > 0}
                    aria-describedby={`${id}-status`}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    wrap="off"
                    style={{ ...textStyle, position: 'absolute', left: gutterWidth, top: 0, width: `calc(100% - ${gutterWidth}px)`, height: '100%', margin: 0, border: 0, borderRadius: 0, outline: 'none', resize: 'none', overflow: 'auto', background: 'transparent', color: 'transparent', caretColor: '#17212b' }}
                />
            </div>
            {errors.length > 0 && (
                <ul aria-label="문법 오류 목록" style={{ flexShrink: 0, maxHeight: 132, overflow: 'auto', margin: 0, padding: '8px 10px', color: '#a01724', fontSize: 13, lineHeight: '22px', listStyle: 'none', background: '#fff5f5' }}>
                    {errors.map((error, index) => <li key={`${error.line}-${error.column}-${index}`}>
                        <button type="button" className="error-link" onClick={() => jumpToError(error)} style={{ display: 'block', maxWidth: '100%', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', padding: '2px 0', whiteSpace: 'normal', overflowWrap: 'anywhere', cursor: 'pointer' }}>
                            {error.line}번째 줄, {error.column}번째 열: {error.message}
                        </button>
                    </li>)}
                </ul>
            )}
        </div>
    );
}
