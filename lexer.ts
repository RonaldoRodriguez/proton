// lexer.ts
export function Lexer(input) {
    const tokenRules = [
        { kind: 'COMMENT', regex: /\/\*[\s\S]*?\*\//, ignore: true },
        { kind: 'COMMENT', regex: /\/\/.*/, ignore: true },
        { kind: 'string', regex: /"([^"\\]|\\.)*"/ },
        { kind: 'string', regex: /'([^'\\]|\\.)*'/ },
        { kind: 'boolean', regex: /\b(true|false)\b/ },
        { kind: 'null', regex: /\bnull\b/ },
        { kind: 'keyword', regex: /\b(string|char|int|int64|uint8|uint16|uint32|uint64|float|double|bool|auto|void|ptr|return|if|else|while|for|switch|case|default|break|continue|class|struct|enum|interface|abstract|namespace|public|private|protected|const|static|delete|new|this|super|virtual|override|using|final|sealed|fn|as|include|from|import)\b/ },
        { kind: 'identifier', regex: /[a-zA-Z_][a-zA-Z0-9_]*/ },
        { kind: 'number', regex: /0[xX][0-9a-fA-F]+/ },
        { kind: 'number', regex: /0[bB][01]+/ },
        { kind: 'number', regex: /\b\d+(\.\d+)?/ },
        // ── operadores ─────────────────────────────────────────────
        // Orden CRÍTICO: los de 2 chars antes que los de 1 char que
        // empiezan igual. `->` antes de `-`; `!=` antes de `!`.
        { kind: 'operator', regex: /(::|<<|>>|<=|>=|==|!=|&&|\|\||\+=|-=|\*=|\/=|%=|\+\+|--|=>|->|!|\?|\+|-|\*|\/|%|=|<|>|:|\||&|\^|~|\.)/ },
        { kind: 'lparen', regex: /\(/ }, { kind: 'rparen', regex: /\)/ },
        { kind: 'lbraken', regex: /\{/ },
        { kind: 'rbraken', regex: /\}/ },
        { kind: 'lbrack', regex: /\[/ }, { kind: 'rbrack', regex: /\]/ },
        { kind: 'comma', regex: /,/ },
        { kind: 'semicolon', regex: /;/ },
        { kind: 'WHITESPACE', regex: /\s+/, ignore: true }
    ];

    let cursor = 0, line = 1, column = 1;
    const tokens = [];

    while (cursor < input.length) {
        let matched = false;
        for (const rule of tokenRules) {
            const residue = input.slice(cursor);
            const match = residue.match(rule.regex);
            if (match && match.index === 0) {
                const value = match[0];
                const tokenLine = line, tokenColumn = column;
                for (let i = 0; i < value.length; i++) {
                    if (value[i] === '\n') { line++; column = 1; } else column++;
                }
                if (!rule.ignore) {
                    tokens.push({ kind: rule.kind, lexeme: value, line: tokenLine, column: tokenColumn });
                }
                cursor += value.length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            throw new Error(`[LexerError] Caracter inesperado "${input[cursor]}" en línea ${line}, columna ${column}`);
        }
    }

    tokens.push({ kind: 'eof', lexeme: '', line, column });
    return tokens;
}