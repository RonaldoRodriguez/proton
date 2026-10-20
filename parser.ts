// parser.ts
const BUILTIN_TYPES = [
    'void', 'int', 'int64', 'string', 'char', 'float', 'double', 'bool', 'auto', 'ptr',
    'uint8', 'uint16', 'uint32', 'uint64',
];

const COMPOUND_OPS: Record<string, string> = {
    '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%'
};

const STMT_STARTERS = ['if', 'while', 'for', 'switch', 'return', 'break', 'continue', 'delete'];
const CLASS_MODIFIERS = ['public', 'private', 'protected', 'static', 'virtual', 'override'];

function decodeStringEscapes(raw: string): string {
    let out = '';
    let i = 0;
    while (i < raw.length) {
        const c = raw[i];
        if (c !== '\\') { out += c; i++; continue; }
        if (i + 1 >= raw.length) { out += '\\'; break; }
        const nxt = raw[i + 1];
        switch (nxt) {
            case 'n':  out += '\n'; i += 2; break;
            case 'r':  out += '\r'; i += 2; break;
            case 't':  out += '\t'; i += 2; break;
            case '0':  out += '\0'; i += 2; break;
            case '\\': out += '\\'; i += 2; break;
            case '"':  out += '"';  i += 2; break;
            case "'":  out += "'";  i += 2; break;
            case 'u': {
                if (raw[i + 2] === '{') {
                    let j = i + 3;
                    let hex = '';
                    while (j < raw.length && raw[j] !== '}') { hex += raw[j]; j++; }
                    if (j < raw.length && raw[j] === '}' && hex.length > 0) {
                        const cp = parseInt(hex, 16);
                        if (cp >= 0 && cp <= 0x10FFFF) {
                            out += String.fromCodePoint(cp);
                        }
                        i = j + 1;
                    } else {
                        out += '\\u'; i += 2;
                    }
                } else {
                    const hex = raw.slice(i + 2, i + 6);
                    if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
                        out += String.fromCharCode(parseInt(hex, 16));
                        i += 6;
                    } else {
                        out += '\\u'; i += 2;
                    }
                }
                break;
            }
            default:
                out += '\\' + nxt;
                i += 2;
        }
    }
    return out;
}

export class Parser {
    pos = 0;
    tokens: any[];
    errors: any[] = [];
    sourceFile: string = '';

    // Seguimiento de tamaños fijos de array en declaraciones tipo `T[N]`.
    // Cada llamada a parseTypeName() empuja un frame; el resultado del frame
    // más externo queda en _lastTypeSizes.
    private _typeNameFrameStack: number[][] = [];
    private _lastTypeSizes: number[] | null = null;

    constructor(tokens: any[], sourceFile: string = '') {
        this.tokens = tokens;
        this.sourceFile = sourceFile;
    }

    peek() { return this.tokens[this.pos]; }
    previous() { return this.tokens[this.pos - 1]; }
    isAtEnd() { return this.peek().kind === 'eof'; }

    check(kind: string, value?: string) {
        if (this.isAtEnd()) return false;
        const tok = this.peek();
        if (kind !== tok.kind) return false;
        if (value !== undefined && tok.lexeme !== value) return false;
        return true;
    }

    match(kind: string, value?: string) {
        if (this.check(kind, value)) { this.advance(); return true; }
        return false;
    }

    advance() {
        if (!this.isAtEnd()) this.pos++;
        return this.previous();
    }

    consume(kind: string, value?: string, errorMessage?: string) {
        if (this.check(kind, value)) return this.advance();
        const actual = this.peek();
        const expected = value ? `${value}` : `${kind}`;
        const baseMsg = errorMessage || `Se esperaba ${expected}`;
        throw new Error(`[SyntaxError] [${actual.line}:${actual.column}] ${baseMsg}, se encontró '${actual.lexeme}' (${actual.kind})`);
    }

    at<T extends object>(node: T, tok: any): T {
        if (tok && typeof tok.line === 'number') {
            (node as any).line = tok.line;
            (node as any).column = tok.column;
            if (this.sourceFile) (node as any)._sourceFile = this.sourceFile;
        }
        return node;
    }

    synchronize(level: 'top' | 'class' | 'stmt') {
        while (!this.isAtEnd()) {
            const tok = this.peek();
            if (tok.kind === 'rbraken') return;
            if (tok.kind === 'semicolon') { this.advance(); return; }
            if (level === 'top' && tok.kind === 'keyword' &&
                (tok.lexeme === 'include' || tok.lexeme === 'import' || tok.lexeme === 'using' ||
                 tok.lexeme === 'class' || tok.lexeme === 'struct' || tok.lexeme === 'enum' ||
                 tok.lexeme === 'interface' || tok.lexeme === 'abstract' ||
                 tok.lexeme === 'namespace')) return;
            if (level === 'class' && tok.kind === 'keyword' && CLASS_MODIFIERS.includes(tok.lexeme)) return;
            if (level === 'stmt') {
                if (tok.kind === 'lbraken') return;
                if (tok.kind === 'keyword' && STMT_STARTERS.includes(tok.lexeme)) return;
                if (tok.kind === 'keyword' && (tok.lexeme === 'case' || tok.lexeme === 'default')) return;
            }
            this.advance();
        }
    }

    // ── Generic helpers ──────────────────────────────────────────
    /**
     * Consume '>'. Si el lexer fusionó '>>' (caso `Map<K, Box<V>>`),
     * lo parte en dos tokens '>' y consume uno.
     */
    matchGenericClose(): void {
        if (this.check('operator', '>')) { this.advance(); return; }
        if (this.check('operator', '>>')) {
            const tok = this.peek();
            this.tokens[this.pos] = { ...tok, lexeme: '>' };
            this.tokens.splice(this.pos + 1, 0, { ...tok, lexeme: '>' });
            this.advance();
            return;
        }
        const t = this.peek();
        throw new Error(
            `[SyntaxError] [${t.line}:${t.column}] Se esperaba '>' para cerrar tipo genérico, se encontró '${t.lexeme}'`
        );
    }

    parseTypeParams(): { name: string; bound: string | null }[] {
        this.consume('operator', '<', "Se esperaba '<' para iniciar parámetros de tipo");
        const params: { name: string; bound: string | null }[] = [];
        if (this.check('operator', '>')) { this.advance(); return params; }
        do {
            const nameTok = this.consume('identifier', undefined, 'Se esperaba nombre del parámetro de tipo');
            let bound: string | null = null;
            if (this.match('operator', ':')) bound = this.parseTypeName();
            params.push({ name: nameTok.lexeme, bound });
        } while (this.match('comma'));
        this.matchGenericClose();
        return params;
    }

    parseTypeArgs(): string[] {
        this.consume('operator', '<', "Se esperaba '<' para iniciar argumentos de tipo");
        const args: string[] = [];
        if (this.check('operator', '>')) { this.advance(); return args; }
        do {
            args.push(this.parseTypeName());
        } while (this.match('comma'));
        this.matchGenericClose();
        return args;
    }

    /**
     * Escanea desde un token '<' hasta encontrar el '>' o '>>' que cierra
     * balanceando profundidad. Devuelve la posición (índice) inmediatamente
     * posterior al cierre, o null si no se puede cerrar.
     */
    private scanGenericClose(startPos: number): number | null {
        if (this.tokens[startPos]?.kind !== 'operator' || this.tokens[startPos].lexeme !== '<') return null;
        let depth = 0;
        for (let i = startPos; i < this.tokens.length; i++) {
            const tk = this.tokens[i];
            if (tk.kind === 'eof') return null;
            if (tk.kind === 'operator' && tk.lexeme === '<') depth++;
            else if (tk.kind === 'operator' && tk.lexeme === '>') {
                depth--;
                if (depth === 0) return i + 1;
            } else if (tk.kind === 'operator' && tk.lexeme === '>>') {
                depth -= 2;
                if (depth <= 0) return i + 1;
            }
        }
        return null;
    }

    /**
     * Avanza sobre cualquier sufijo de array (`[]` o `[N]`) desde `startPos`.
     * Retorna la posición del primer token que ya no es `[`.
     */
    private skipArraySuffix(startPos: number): number {
        let j = startPos;
        while (this.tokens[j]?.kind === 'lbrack') {
            let depth = 1;
            j++;
            while (depth > 0 && j < this.tokens.length && this.tokens[j].kind !== 'eof') {
                if (this.tokens[j].kind === 'lbrack') depth++;
                else if (this.tokens[j].kind === 'rbrack') depth--;
                j++;
            }
            if (depth !== 0) return startPos; // malformado, no saltar
        }
        return j;
    }

    /**
     * Convierte los tamaños capturados en `T[N]` a nodos AST válidos.
     * Semántica y codegen esperan `NewArrayExpr.sizes` como `Expression[]`,
     * así que sintetizamos `NumberLiteral` en vez de pasar `number`s crudos.
     */
    private _sizesToNodes(sizes: number[]): any[] {
        return sizes.map(n => ({ kind: 'NumberLiteral', value: n }));
    }

    // ── using ────────────────────────────────────────────────────
    parseUsingDecl() {
        const start = this.previous();
        const parts = [this.consume('identifier', undefined, 'Se esperaba un identificador tras using').lexeme];
        while (this.match('operator', '::')) {
            parts.push(this.consume('identifier', undefined, 'Se esperaba un identificador tras ::').lexeme);
        }
        this.consume('semicolon', undefined, "Se esperaba ';' al final de la directiva using");
        const isWildcard = parts.length === 1;
        return this.at({ kind: 'UsingDecl', name: parts.join('::'), parts, isWildcard }, start);
    }

    // ── include ──────────────────────────────────────────────────
    parseIncludeDecl() {
        const start = this.previous();
        const pathTok = this.consume('string', undefined, "Se esperaba un string literal después de 'include'");
        let path = pathTok.lexeme;
        if (path.length >= 2) path = path.slice(1, -1);
        this.consume('semicolon', undefined, "Se esperaba ';' después de include");
        return this.at({ kind: 'IncludeDecl', path }, start);
    }

    // ── import ───────────────────────────────────────────────────
    parseImportDecl() {
        const start = this.previous();

        if (this.check('string')) {
            const t = this.advance();
            let path = t.lexeme;
            if (path.length >= 2) path = path.slice(1, -1);
            this.consume('semicolon', undefined, "Se esperaba ';' después de import");
            return this.at({ kind: 'IncludeDecl', path }, start);
        }

        if (this.match('lbraken', '{')) {
            const imports: { parts: string[] }[] = [];
            if (!this.check('rbraken')) {
                do {
                    const parts = [this.consume('identifier', undefined, 'Se esperaba un nombre').lexeme];
                    while (this.match('operator', '::')) {
                        parts.push(this.consume('identifier', undefined, 'Se esperaba un nombre tras ::').lexeme);
                    }
                    imports.push({ parts });
                } while (this.match('comma'));
            }
            this.consume('rbraken', '}', "Se esperaba '}' en import");
            this.consume('keyword', 'from', "Se esperaba 'from' tras la lista de imports");
            const pathTok = this.consume('string', undefined, "Se esperaba string literal tras 'from'");
            let path = pathTok.lexeme;
            if (path.length >= 2) path = path.slice(1, -1);
            this.consume('semicolon', undefined, "Se esperaba ';' después de import");
            return this.at({ kind: 'ImportDecl', path, imports }, start);
        }

        if (this.check('identifier')) {
            const nameTok = this.advance();
            this.consume('keyword', 'from', "Se esperaba 'from' tras el nombre del import");
            const pathTok = this.consume('string', undefined, "Se esperaba string literal tras 'from'");
            let path = pathTok.lexeme;
            if (path.length >= 2) path = path.slice(1, -1);
            this.consume('semicolon', undefined, "Se esperaba ';' después de import");
            return this.at({
                kind: 'ImportDecl',
                path,
                imports: [{ parts: [nameTok.lexeme] }],
            }, start);
        }

        const tok = this.peek();
        throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Sintaxis de import inválida`);
    }

    // ── Programa ─────────────────────────────────────────────────
    parseProgram() {
        const body = [];
        while (!this.isAtEnd() && !this.check('eof')) {
            const before = this.pos;
            try {
                if (this.match('keyword', 'include')) body.push(this.parseIncludeDecl());
                else if (this.match('keyword', 'import')) body.push(this.parseImportDecl());
                else if (this.match('keyword', 'using')) body.push(this.parseUsingDecl());
                else if (this.match('keyword', 'namespace')) body.push(this.parseNamespace());
                else if (this.match('keyword', 'abstract')) {
                    this.consume('keyword', 'class', "Se esperaba 'class' después de 'abstract'");
                    body.push(this.parseClassDecl(false, true));
                }
                else if (this.match('keyword', 'class')) body.push(this.parseClassDecl(false, false));
                else if (this.match('keyword', 'struct')) body.push(this.parseStructDecl());
                else if (this.match('keyword', 'enum')) body.push(this.parseEnumDecl());
                else if (this.match('keyword', 'interface')) body.push(this.parseClassDecl(true, true));
                else {
                    const tok = this.peek();
                    throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba 'include', 'import', 'using', 'class', 'struct', 'enum', 'interface' o 'namespace', se encontró '${tok.lexeme}'`);
                }
            } catch (e) {
                this.errors.push(e);
                this.synchronize('top');
            }
            if (this.pos === before) this.advance();
        }
        return { kind: 'Program', body };
    }

    parseNamespace() {
        const nameTok = this.consume('identifier', undefined, 'Se esperaba el nombre del namespace');
        this.consume('lbraken', '{', "Se esperaba '{' después del nombre del namespace");
        const body = [];
        while (!this.isAtEnd() && !this.check('rbraken')) {
            const before = this.pos;
            try {
                if (this.match('keyword', 'include')) body.push(this.parseIncludeDecl());
                else if (this.match('keyword', 'import')) body.push(this.parseImportDecl());
                else if (this.match('keyword', 'using')) body.push(this.parseUsingDecl());
                else if (this.match('keyword', 'namespace')) body.push(this.parseNamespace());
                else if (this.match('keyword', 'abstract')) {
                    this.consume('keyword', 'class', "Se esperaba 'class' después de 'abstract'");
                    body.push(this.parseClassDecl(false, true));
                }
                else if (this.match('keyword', 'class')) body.push(this.parseClassDecl(false, false));
                else if (this.match('keyword', 'struct')) body.push(this.parseStructDecl());
                else if (this.match('keyword', 'enum')) body.push(this.parseEnumDecl());
                else if (this.match('keyword', 'interface')) body.push(this.parseClassDecl(true, true));
                else {
                    const tok = this.peek();
                    throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba 'include', 'import', 'using', 'class', 'struct', 'enum', 'interface' o 'namespace' dentro del namespace`);
                }
            } catch (e) {
                this.errors.push(e);
                this.synchronize('top');
            }
            if (this.pos === before) this.advance();
        }
        this.consume('rbraken', '}', "Se esperaba '}' al cerrar el namespace");
        return this.at({ kind: 'NamespaceDecl', name: nameTok.lexeme, body }, nameTok);
    }

    // ── struct ───────────────────────────────────────────────────
    parseStructDecl() {
        const nameTok = this.consume('identifier', undefined, 'Se esperaba el nombre del struct');

        // <T, U: Bound>
        let typeParams: { name: string; bound: string | null }[] = [];
        if (this.check('operator', '<')) typeParams = this.parseTypeParams();

        this.consume('lbraken', '{', "Se esperaba '{' para el cuerpo del struct");
        const members = [];
        while (!this.isAtEnd() && !this.check('rbraken', '}')) {
            if (!this.isTypeName()) {
                const tok = this.peek();
                throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba un tipo de datos para el campo del struct, se encontró '${tok.lexeme}'`);
            }
            const fieldType = this.parseTypeName();
            const fixedSizes = this._lastTypeSizes;
            const fieldName = this.consume('identifier', undefined, 'Se esperaba el nombre del campo del struct');
            let value = null;
            if (this.match('operator', '=')) {
                value = this.parseExpression();
            } else if (fixedSizes && fixedSizes.length > 0) {
                const baseType = fieldType.replace(/\[\]/g, '');
                value = { kind: 'NewArrayExpr', elementType: baseType, sizes: this._sizesToNodes(fixedSizes) };
            }
            this.consume('semicolon', undefined, "Se esperaba ';' al final del campo del struct");
            members.push(this.at({
                kind: 'FieldDecl',
                visibility: 'public',
                isStatic: false,
                isConst: false,
                type: fieldType,
                name: fieldName.lexeme,
                value,
            }, fieldName));
        }
        this.consume('rbraken', '}', "Se esperaba '}' al cerrar el struct");
        return this.at({
            kind: 'ClassDecl',
            name: nameTok.lexeme,
            base: null,
            members,
            isInterface: false,
            isAbstract: false,
            isStruct: true,
            typeParams,
        }, nameTok);
    }

    // ── enum ─────────────────────────────────────────────────────
    parseEnumDecl() {
        const nameTok = this.consume('identifier', undefined, 'Se esperaba el nombre del enum');
        this.consume('lbraken', '{', "Se esperaba '{' para el cuerpo del enum");
        const members = [];
        while (!this.isAtEnd() && !this.check('rbraken', '}')) {
            const mName = this.consume('identifier', undefined, 'Se esperaba el nombre del miembro del enum');
            let valueExpr = null;
            if (this.match('operator', '=')) valueExpr = this.parseExpression();
            if (!this.match('comma') && !this.check('rbraken')) {
                throw new Error(`[SyntaxError] [${mName.line}:${mName.column}] Se esperaba ',' o '}' tras el miembro del enum`);
            }
            members.push(this.at({ name: mName.lexeme, valueExpr }, mName));
        }
        this.consume('rbraken', '}', "Se esperaba '}' al cerrar el enum");
        return this.at({ kind: 'EnumDecl', name: nameTok.lexeme, members }, nameTok);
    }

    // ── class ────────────────────────────────────────────────────
    parseClassDecl(isInterface: boolean, isAbstract: boolean) {
        const nameTok = this.consume('identifier', undefined,
            isInterface ? 'Se esperaba el nombre de la interface' : 'Se esperaba el nombre de la clase');

        let typeParams: { name: string; bound: string | null }[] = [];
        if (this.check('operator', '<')) typeParams = this.parseTypeParams();

        let isFinal = false;
        if (this.match('keyword', 'final') || this.match('keyword', 'sealed')) {
            isFinal = true;
        }
        let base = null;
        if (this.match('operator', ':')) {
            let baseVisibility = 'public';
            if (this.match('keyword', 'public')) baseVisibility = 'public';
            else if (this.match('keyword', 'private')) baseVisibility = 'private';
            else if (this.match('keyword', 'protected')) baseVisibility = 'protected';
            let baseName = this.consume('identifier', undefined, 'Se esperaba el nombre de la clase base').lexeme;
            while (this.match('operator', '::')) {
                baseName += '::' + this.consume('identifier', undefined, 'Se esperaba un nombre tras ::').lexeme;
            }
            if (this.check('operator', '<')) {
                const args = this.parseTypeArgs();
                baseName += '<' + args.join(',') + '>';
            }
            base = { visibility: baseVisibility, name: baseName };
        }
        this.consume('lbraken', '{', `Se esperaba '{' para el cuerpo de ${isInterface ? 'la interface' : 'la clase'}`);

        const members = [];
        let currentVisibility = isInterface ? 'public' : 'private';
        while (!this.isAtEnd() && !this.check('rbraken', '}')) {
            const before = this.pos;
            try {
                if (this.match('keyword', 'public') || this.match('keyword', 'private') || this.match('keyword', 'protected')) {
                    currentVisibility = this.previous().lexeme;
                    if (this.check('operator', ':')) this.advance();
                } else {
                    members.push(this.parseClassMember(nameTok.lexeme, currentVisibility, isInterface));
                }
            } catch (e) {
                this.errors.push(e);
                this.synchronize('class');
            }
            if (this.pos === before) this.advance();
        }
        this.consume('rbraken', '}', `Se esperaba '}' al cerrar ${isInterface ? 'la interface' : 'la clase'}`);
        return this.at({
            kind: 'ClassDecl',
            name: nameTok.lexeme,
            base,
            members,
            isInterface,
            isAbstract: isAbstract || isInterface,
            isFinal,
            typeParams,
        }, nameTok);
    }

    parseClassMember(className: string, visibility: string, isInterface: boolean) {
        let isStatic = false, isVirtual = false, isOverride = false, isConst = false;

        while (this.check('keyword', 'static') || this.check('keyword', 'const') ||
               this.check('keyword', 'public') || this.check('keyword', 'private') ||
               this.check('keyword', 'protected') || this.check('keyword', 'virtual') ||
               this.check('keyword', 'override')) {
            const mod = this.advance().lexeme;
            if (mod === 'static') isStatic = true;
            else if (mod === 'const') isConst = true;
            else if (mod === 'virtual') isVirtual = true;
            else if (mod === 'override') isOverride = true;
            else visibility = mod;
            if (this.check('operator', ':')) this.advance();
        }

        if (this.check('operator', '~')) {
            if (isInterface) throw new Error(`[SyntaxError] [${this.peek().line}:${this.peek().column}] Una interface no puede tener destructor.`);
            const tilde = this.advance();
            if (isStatic) throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor no puede ser 'static'.`);
            if (isVirtual) throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor no puede ser 'virtual'.`);
            if (isOverride) throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor no puede ser 'override'.`);
            const dtorNameTok = this.consume('identifier', undefined, 'Se esperaba el nombre de la clase tras ~');
            if (dtorNameTok.lexeme !== className) {
                throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor debe llamarse '~${className}', se encontró '~${dtorNameTok.lexeme}'.`);
            }
            this.consume('lparen', '(', "Se esperaba '(' en el destructor");
            this.consume('rparen', ')', "El destructor no lleva parámetros");
            this.consume('lbraken', '{', "Se esperaba '{' para el cuerpo del destructor");
            const body = this.parseBeginEnd();
            return this.at({ kind: 'DestructorDecl', visibility, body }, tilde);
        }

        if (this.check('identifier') && this.peek().lexeme === className &&
            this.tokens[this.pos + 1] && this.tokens[this.pos + 1].kind === 'lparen') {
            if (isInterface) throw new Error(`[SyntaxError] [${this.peek().line}:${this.peek().column}] Una interface no puede tener constructor.`);
            const nameTok = this.advance();
            if (isStatic) throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] El constructor no puede ser 'static'.`);
            if (isVirtual) throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] El constructor no puede ser 'virtual'.`);
            if (isOverride) throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] El constructor no puede ser 'override'.`);
            this.consume('lparen', '(', "Se esperaba '(' en el constructor");
            const params = [];
            if (!this.check('rparen')) {
                do {
                    let pIsConst = false;
                    if (this.match('keyword', 'const')) pIsConst = true;
                    if (!this.isTypeName()) {
                        const actual = this.peek();
                        throw new Error(`[SyntaxError] [${actual.line}:${actual.column}] Se esperaba tipo del parámetro`);
                    }
                    const paramType = this.parseTypeName();
                    const paramName = this.consume('identifier', undefined, 'Se esperaba nombre del parámetro');
                    params.push({ name: paramName.lexeme, type: paramType, isConst: pIsConst, line: paramName.line, column: paramName.column });
                } while (this.match('comma'));
            }
            this.consume('rparen', ')', "Se esperaba ')'");
            this.consume('lbraken', '{', "Se esperaba '{' para el cuerpo del constructor");
            const body = this.parseBeginEnd();
            return this.at({ kind: 'ConstructorDecl', visibility, params, body }, nameTok);
        }

        if (!this.isTypeName()) {
            const tok = this.peek();
            throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba un tipo de datos para el miembro, se encontró '${tok.lexeme}'`);
        }
        const declaredType = this.parseTypeName();
        const nameTok = this.consume('identifier', undefined, 'Se esperaba el nombre del método o campo');

        if (nameTok.lexeme === className && !isInterface) {
            throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] Un constructor no debe declarar tipo de retorno.`);
        }

        if (this.check('lparen', '(')) {
            return this.parseMethodDecl(visibility, isStatic, isVirtual, isOverride, declaredType, nameTok);
        }

        if (isInterface) {
            throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] Una interface no puede tener campos de instancia.`);
        }

        return this.parseClassFieldDecl(visibility, isStatic, isConst, declaredType, nameTok);
    }

    parseMethodDecl(visibility: any, isStatic: boolean, isVirtual: boolean, isOverride: boolean, returnType: string, nameTok: any) {
        this.consume('lparen', '(', "Se esperaba '('");
        const params = [];
        if (!this.check('rparen')) {
            do {
                let pIsConst = false;
                if (this.match('keyword', 'const')) pIsConst = true;
                if (!this.isTypeName()) {
                    const actual = this.peek();
                    throw new Error(`[SyntaxError] [${actual.line}:${actual.column}] Se esperaba tipo del parámetro`);
                }
                const paramType = this.parseTypeName();
                const paramName = this.consume('identifier', undefined, 'Se esperaba nombre del parámetro');
                params.push({ name: paramName.lexeme, type: paramType, isConst: pIsConst, line: paramName.line, column: paramName.column });
            } while (this.match('comma'));
        }
        this.consume('rparen', ')', "Se esperaba ')'");

        if (this.match('semicolon')) {
            return this.at({
                kind: 'MethodDecl', visibility, isStatic, isVirtual, isOverride,
                returnType, name: nameTok.lexeme, params, body: null
            }, nameTok);
        }

        this.consume('lbraken', '{', "Se esperaba '{' para el cuerpo del método o ';' para método abstracto");
        const body = this.parseBeginEnd();
        return this.at({
            kind: 'MethodDecl', visibility, isStatic, isVirtual, isOverride,
            returnType, name: nameTok.lexeme, params, body
        }, nameTok);
    }

    parseClassFieldDecl(visibility: string, isStatic: boolean, isConst: boolean, fieldType: string, nameTok: any) {
        const fixedSizes = this._lastTypeSizes;
        let value = null;
        if (this.match('operator', '=')) {
            value = this.parseExpression();
        } else if (fixedSizes && fixedSizes.length > 0) {
            const baseType = fieldType.replace(/\[\]/g, '');
            value = { kind: 'NewArrayExpr', elementType: baseType, sizes: this._sizesToNodes(fixedSizes) };
        }
        this.consume('semicolon', undefined, "Se esperaba ';'");
        return this.at({ kind: 'FieldDecl', visibility, isStatic, isConst, type: fieldType, name: nameTok.lexeme, value }, nameTok);
    }

    // ── Sentencias ───────────────────────────────────────────────
    parseStatement(): any {
        const start = this.peek();
        if (this.match('keyword', 'if')) return this.parseIf(start);
        if (this.match('keyword', 'while')) return this.parseWhile(start);
        if (this.match('keyword', 'for')) return this.parseFor(start);
        if (this.match('keyword', 'switch')) return this.parseSwitch(start);
        if (this.match('keyword', 'break')) {
            this.consume('semicolon', undefined, "Se esperaba ';' después de break");
            return this.at({ kind: 'Break' }, start);
        }
        if (this.match('keyword', 'continue')) {
            this.consume('semicolon', undefined, "Se esperaba ';' después de continue");
            return this.at({ kind: 'Continue' }, start);
        }
        if (this.match('keyword', 'delete')) {
            const target = this.parsePostfix();
            this.consume('semicolon', undefined, "Se esperaba ';' después de delete");
            return this.at({ kind: 'Delete', target }, start);
        }
        if (this.match('keyword', 'return')) return this.parseReturn(start);
        if (this.match('lbraken', '{')) return this.parseBeginEnd(start);

        if (this.match('keyword', 'const')) {
            const varType = this.parseTypeName();
            const fixedSizes = this._lastTypeSizes;
            const ident = this.consume('identifier', undefined, 'Se esperaba un identificador');
            let expr = null;
            if (this.match('operator', '=')) {
                expr = this.parseExpression();
            } else if (fixedSizes && fixedSizes.length > 0) {
                const baseType = varType.replace(/\[\]/g, '');
                expr = { kind: 'NewArrayExpr', elementType: baseType, sizes: this._sizesToNodes(fixedSizes) };
            }
            this.consume('semicolon', undefined, "Se esperaba ';'");
            return this.at({ kind: 'VarDecl', type: varType, name: ident.lexeme, value: expr, isConst: true }, ident);
        }

        if (this.isTypeName()) {
            const varType = this.parseTypeName();
            const fixedSizes = this._lastTypeSizes;
            const ident = this.consume('identifier', undefined, 'Se esperaba un identificador para la variable');
            let expr = null;
            if (this.match('operator', '=')) {
                expr = this.parseExpression();
            } else if (fixedSizes && fixedSizes.length > 0) {
                const baseType = varType.replace(/\[\]/g, '');
                expr = { kind: 'NewArrayExpr', elementType: baseType, sizes: this._sizesToNodes(fixedSizes) };
            }
            this.consume('semicolon', undefined, "Se esperaba ';'");
            return this.at({ kind: 'VarDecl', type: varType, name: ident.lexeme, value: expr }, ident);
        }

        const expr = this.parseExpression();
        this.consume('semicolon', undefined, "Se esperaba ';'");
        return this.at({ kind: 'ExprStatement', expr }, expr?.line ? expr : start);
    }

    isTypeName() {
        const t0 = this.tokens[this.pos];
        if (!t0) return false;
        if (t0.kind === 'keyword' && t0.lexeme === 'fn') return true;
        const t1 = this.tokens[this.pos + 1];
        const t2 = this.tokens[this.pos + 2];
        if (t0.kind === 'keyword' && BUILTIN_TYPES.includes(t0.lexeme)) {
            const after = this.skipArraySuffix(this.pos + 1);
            if (this.tokens[after]?.kind === 'identifier') return true;
            return true;   // builtins también son tipo por sí solos (maneja errores después)
        }
        if (t0.kind === 'identifier' && t1?.kind === 'lbrack' && t2?.kind === 'rbrack') return true;

        // `Point p`, `Point[5] p`, `Point[5][10] p`, `Point[] p`
        if (t0.kind === 'identifier') {
            const after = this.skipArraySuffix(this.pos + 1);
            if (this.tokens[after]?.kind === 'identifier') return true;
            if (t1?.kind === 'identifier') return true;
        }

        // `ns::Point p`, `ns::Point[5] p`
        if (t0.kind === 'identifier' && t1?.kind === 'operator' && t1.lexeme === '::') {
            let i = this.pos + 1;
            while (this.tokens[i]?.kind === 'operator' && this.tokens[i].lexeme === '::' &&
                   this.tokens[i + 1]?.kind === 'identifier') {
                i += 2;
            }
            const after = this.skipArraySuffix(i);
            if (this.tokens[after]?.kind === 'identifier') return true;
        }

        // `Box<int> x`, `Box<int>[5] x`
        if (t0.kind === 'identifier' && t1?.kind === 'operator' && t1.lexeme === '<') {
            const after = this.scanGenericClose(this.pos + 1);
            if (after !== null) {
                const afterArr = this.skipArraySuffix(after);
                if (this.tokens[afterArr]?.kind === 'identifier') return true;
            }
        }

        // `ns::Box<int> x`, `ns::Box<int>[5] x`
        if (t0.kind === 'identifier' && t1?.kind === 'operator' && t1.lexeme === '::') {
            let i = this.pos + 1;
            while (this.tokens[i]?.kind === 'operator' && this.tokens[i].lexeme === '::' &&
                   this.tokens[i + 1]?.kind === 'identifier') {
                i += 2;
            }
            if (this.tokens[i]?.kind === 'operator' && this.tokens[i].lexeme === '<') {
                const after = this.scanGenericClose(i);
                if (after !== null) {
                    const afterArr = this.skipArraySuffix(after);
                    if (this.tokens[afterArr]?.kind === 'identifier') return true;
                }
            }
        }
        return false;
    }

    parseTypeName(): string {
        this._typeNameFrameStack.push([]);
        try {
            return this._parseTypeNameInner();
        } finally {
            this._lastTypeSizes = this._typeNameFrameStack.pop()!;
        }
    }

    private _parseTypeNameInner(): string {
        if (this.check('keyword', 'fn')) {
            this.advance();
            this.consume('lparen', '(', "Se esperaba '(' en tipo fn");
            const paramTypes: string[] = [];
            if (!this.check('rparen')) {
                do {
                    paramTypes.push(this.parseTypeName());
                } while (this.match('comma'));
            }
            this.consume('rparen', ')', "Se esperaba ')' en tipo fn");
            this.consume('operator', '->', "Se esperaba '->' en tipo fn");
            const retType = this.parseTypeName();
            let typeName = `fn(${paramTypes.join(',')})->${retType}`;
            while (this.check('lbrack')) {
                const a1 = this.tokens[this.pos + 1];
                const a2 = this.tokens[this.pos + 2];
                if (a1?.kind === 'rbrack') {
                    this.advance(); this.advance();
                    typeName += '[]';
                } else if (a1?.kind === 'number' && a2?.kind === 'rbrack') {
                    const sizeVal = parseInt(a1.lexeme, 10);
                    this.advance(); this.advance(); this.advance();
                    typeName += '[]';
                    this._typeNameFrameStack[this._typeNameFrameStack.length - 1].push(sizeVal);
                } else break;
            }
            return typeName;
        }

        const typeTok = this.advance();
        let typeName = typeTok.lexeme;
        while (this.match('operator', '::')) {
            const n = this.consume('identifier', undefined, 'Se esperaba un nombre tras ::');
            typeName += '::' + n.lexeme;
        }
        if (this.check('operator', '<')) {
            const args = this.parseTypeArgs();
            typeName += '<' + args.join(',') + '>';
        }
        // Acepta `[]` (dinámico) y `[N]` (fijo). `[N]` registra el tamaño
        // en el frame actual y lo reduce a `[]` para el sistema de tipos.
        while (this.check('lbrack')) {
            const a1 = this.tokens[this.pos + 1];
            const a2 = this.tokens[this.pos + 2];
            if (a1?.kind === 'rbrack') {
                this.advance(); this.advance();
                typeName += '[]';
            } else if (a1?.kind === 'number' && a2?.kind === 'rbrack') {
                const sizeVal = parseInt(a1.lexeme, 10);
                this.advance(); this.advance(); this.advance();
                typeName += '[]';
                this._typeNameFrameStack[this._typeNameFrameStack.length - 1].push(sizeVal);
            } else break;
        }
        return typeName;
    }

    parseReturn(start: any) {
        let expr = null;
        if (!this.check('semicolon')) expr = this.parseExpression();
        this.consume('semicolon', undefined, "Se esperaba ';' después de return");
        return this.at({ kind: 'Return', expr }, start);
    }

    parseBeginEnd(start?: any) {
        const s = start || this.peek();
        const stmts = [];
        while (!this.isAtEnd() && !this.check('rbraken', '}')) {
            const before = this.pos;
            try {
                stmts.push(this.parseStatement());
            } catch (e) {
                this.errors.push(e);
                this.synchronize('stmt');
            }
            if (this.pos === before) this.advance();
        }
        this.consume('rbraken', '}', "Se esperaba '}'");
        return this.at({ kind: 'BeginEnd', statements: stmts }, s);
    }

    parseIf(start: any) {
        this.consume('lparen', '(', "Se esperaba '(' después de if");
        const cond0 = this.parseExpression();
        this.consume('rparen', ')', "Se esperaba ')'");
        const then0 = this.parseStatement();
        const branches = [{ condition: cond0, thenStmt: then0 }];

        let elseStmt = null;
        while (this.match('keyword', 'else')) {
            if (this.match('keyword', 'if')) {
                this.consume('lparen', '(', "Se esperaba '(' después de else if");
                const cond = this.parseExpression();
                this.consume('rparen', ')', "Se esperaba ')'");
                const then = this.parseStatement();
                branches.push({ condition: cond, thenStmt: then });
            } else {
                elseStmt = this.parseStatement();
                break;
            }
        }
        return this.at({ kind: 'If', branches, elseStmt }, start);
    }

    parseWhile(start: any) {
        this.consume('lparen', '(', "Se esperaba '(' después de while");
        const condition = this.parseExpression();
        this.consume('rparen', ')', "Se esperaba ')'");
        const body = this.parseStatement();
        return this.at({ kind: 'While', condition, body }, start);
    }

    parseFor(start: any) {
        this.consume('lparen', '(', "Se esperaba '(' después de 'for'");
        let init = null;
        if (!this.check('semicolon', ';')) {
            if (this.isTypeName()) {
                const varType = this.parseTypeName();
                const fixedSizes = this._lastTypeSizes;
                const ident = this.consume('identifier', undefined, 'Se esperaba un identificador');
                let expr = null;
                if (this.match('operator', '=')) {
                    expr = this.parseExpression();
                } else if (fixedSizes && fixedSizes.length > 0) {
                    const baseType = varType.replace(/\[\]/g, '');
                    expr = { kind: 'NewArrayExpr', elementType: baseType, sizes: this._sizesToNodes(fixedSizes) };
                }
                init = this.at({ kind: 'VarDecl', type: varType, name: ident.lexeme, value: expr }, ident);
            } else {
                init = this.parseExpression();
            }
        }
        this.consume('semicolon', undefined, "Se esperaba ';' después de la inicialización del for");
        let condition = null;
        if (!this.check('semicolon', ';')) condition = this.parseExpression();
        this.consume('semicolon', undefined, "Se esperaba ';' después de la condición del for");
        let update = null;
        if (!this.check('rparen', ')')) update = this.parseExpression();
        this.consume('rparen', ')', "Se esperaba ')' para cerrar el for");
        const body = this.parseStatement();
        return this.at({ kind: 'For', init, condition, update, body }, start);
    }

    parseSwitch(start: any) {
        this.consume('lparen', '(', "Se esperaba '(' después de 'switch'");
        const expr = this.parseExpression();
        this.consume('rparen', ')', "Se esperaba ')'");
        this.consume('lbraken', '{', "Se esperaba '{' después de 'switch(...)'");
        const cases = [];
        while (!this.isAtEnd() && !this.check('rbraken')) {
            const cstart = this.peek();
            if (this.match('keyword', 'case')) {
                const values = [this.parseExpression()];
                while (this.match('comma')) values.push(this.parseExpression());
                this.consume('operator', ':', "Se esperaba ':' después de los valores de 'case'");
                const statements = this.parseCaseBody();
                cases.push({ values, statements, line: cstart.line, column: cstart.column });
            } else if (this.match('keyword', 'default')) {
                this.consume('operator', ':', "Se esperaba ':' después de 'default'");
                const statements = this.parseCaseBody();
                cases.push({ values: null, statements, line: cstart.line, column: cstart.column });
            } else {
                throw new Error(`[SyntaxError] [${cstart.line}:${cstart.column}] Se esperaba 'case' o 'default' dentro de 'switch'`);
            }
        }
        this.consume('rbraken', '}', "Se esperaba '}' al cerrar el 'switch'");
        return this.at({ kind: 'Switch', expr, cases }, start);
    }

    parseCaseBody(): any[] {
        const stmts = [];
        while (!this.isAtEnd() && !this.check('rbraken') &&
               !this.check('keyword', 'case') && !this.check('keyword', 'default')) {
            const before = this.pos;
            try {
                stmts.push(this.parseStatement());
            } catch (e) {
                this.errors.push(e);
                this.synchronize('stmt');
            }
            if (this.pos === before) this.advance();
        }
        return stmts;
    }

    // ── Expresiones ──────────────────────────────────────────────
    parseExpression(): any { return this.parseAssignment(); }

    isLValue(node: any) {
        return node.kind === 'Identifier' || node.kind === 'MemberAccess' ||
               node.kind === 'IndexExpr' || node.kind === 'QualifiedName';
    }

    parseAssignment() {
        const left = this.parseConditional();
        if (this.match('operator', '=')) {
            const value = this.parseAssignment();
            if (!this.isLValue(left)) {
                const tok = this.previous();
                throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] El lado izquierdo de '=' debe ser un lvalue.`);
            }
            return this.at({ kind: 'Assignment', target: left, expr: value }, left);
        }
        if (this.check('operator', '+=') || this.check('operator', '-=') ||
            this.check('operator', '*=') || this.check('operator', '/=') ||
            this.check('operator', '%=')) {
            const opTok = this.advance();
            const op = opTok.lexeme;
            const binOp = COMPOUND_OPS[op];
            if (!this.isLValue(left)) {
                throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] El lado izquierdo de '${op}' debe ser un lvalue.`);
            }
            const value = this.parseAssignment();
            return this.at({ kind: 'CompoundAssignment', op, binOp, target: left, expr: value }, left);
        }
        return left;
    }

    parseConditional() {
        const cond = this.parseLogicalOr();
        if (this.match('operator', '?')) {
            const thenExpr = this.parseExpression();
            this.consume('operator', ':', "Se esperaba ':' en operador ternario");
            const elseExpr = this.parseAssignment();
            return this.at({ kind: 'Ternary', condition: cond, thenExpr, elseExpr }, cond);
        }
        return cond;
    }

    parseLogicalOr() {
        let left = this.parseLogicalAnd();
        while (this.match('operator', '||')) {
            const right = this.parseLogicalAnd();
            left = this.at({ kind: 'BinaryOp', op: '||', left, right }, left);
        }
        return left;
    }

    parseLogicalAnd() {
        let left = this.parseBitwiseOr();
        while (this.match('operator', '&&')) {
            const right = this.parseBitwiseOr();
            left = this.at({ kind: 'BinaryOp', op: '&&', left, right }, left);
        }
        return left;
    }

    parseBitwiseOr() {
        let left = this.parseBitwiseXor();
        while (this.match('operator', '|')) {
            const right = this.parseBitwiseXor();
            left = this.at({ kind: 'BinaryOp', op: '|', left, right }, left);
        }
        return left;
    }

    parseBitwiseXor() {
        let left = this.parseBitwiseAnd();
        while (this.match('operator', '^')) {
            const right = this.parseBitwiseAnd();
            left = this.at({ kind: 'BinaryOp', op: '^', left, right }, left);
        }
        return left;
    }

    parseBitwiseAnd() {
        let left = this.parseEquality();
        while (this.match('operator', '&')) {
            const right = this.parseEquality();
            left = this.at({ kind: 'BinaryOp', op: '&', left, right }, left);
        }
        return left;
    }

    parseEquality() {
        let left = this.parseComparison();
        while (this.check('operator', '==') || this.check('operator', '!=')) {
            const op = this.advance().lexeme;
            const right = this.parseComparison();
            left = this.at({ kind: 'BinaryOp', op, left, right }, left);
        }
        return left;
    }

    parseComparison() {
        let left = this.parseShift();
        while (this.check('operator', '<') || this.check('operator', '>') ||
               this.check('operator', '<=') || this.check('operator', '>=')) {
            const op = this.advance().lexeme;
            const right = this.parseShift();
            left = this.at({ kind: 'BinaryOp', op, left, right }, left);
        }
        return left;
    }

    parseShift() {
        let left = this.parseAddition();
        while (this.check('operator', '<<') || this.check('operator', '>>')) {
            const op = this.advance().lexeme;
            const right = this.parseAddition();
            left = this.at({ kind: 'BinaryOp', op, left, right }, left);
        }
        return left;
    }

    parseAddition() {
        let left = this.parseMultiplication();
        while (this.check('operator', '+') || this.check('operator', '-')) {
            const op = this.advance().lexeme;
            const right = this.parseMultiplication();
            left = this.at({ kind: 'BinaryOp', op, left, right }, left);
        }
        return left;
    }

    parseMultiplication() {
        let left = this.parseUnary();
        while (this.check('operator', '*') || this.check('operator', '/') || this.check('operator', '%')) {
            const op = this.advance().lexeme;
            const right = this.parseUnary();
            left = this.at({ kind: 'BinaryOp', op, left, right }, left);
        }
        return left;
    }

    parseUnary() {
        if (this.check('operator', '!') || this.check('operator', '-') || this.check('operator', '+')) {
            const opTok = this.advance();
            const op = opTok.lexeme;
            const operand = this.parseUnary();
            return this.at({ kind: 'UnaryOp', op, operand }, opTok);
        }
        if (this.check('operator', '~')) {
            const opTok = this.advance();
            const operand = this.parseUnary();
            return this.at({ kind: 'UnaryOp', op: '~', operand }, opTok);
        }
        if (this.check('operator', '++') || this.check('operator', '--')) {
            const opTok = this.advance();
            const op = opTok.lexeme;
            const target = this.parseUnary();
            if (!this.isLValue(target)) {
                throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] Operador '${op}' requiere un lvalue.`);
            }
            return this.at({ kind: 'IncrementExpr', op, target, prefix: true }, opTok);
        }
        if (this.check('operator', '&')) {
            const opTok = this.advance();
            const target = this.parseUnary();
            if (!this.isLValue(target)) {
                throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] Operador '&' requiere un lvalue.`);
            }
            return this.at({ kind: 'AddressOfExpr', target }, opTok);
        }
        return this.parseAs();
    }

    parseAs() {
        let expr = this.parsePostfix();
        while (this.match('keyword', 'as')) {
            const targetType = this.parseTypeName();
            expr = this.at({ kind: 'CastExpr', expr, targetType }, expr);
        }
        return expr;
    }

    parsePostfix() {
        let expr = this.parsePrimary();
        while (true) {
            if (this.match('operator', '.')) {
                const prop = this.consume('identifier', undefined, "Se esperaba un miembro tras '.'");
                expr = this.at({ kind: 'MemberAccess', object: expr, property: prop.lexeme }, prop);
            } else if (this.check('lbrack')) {
                this.advance();
                const index = this.parseExpression();
                this.consume('rbrack', ']', "Se esperaba ']'");
                expr = this.at({ kind: 'IndexExpr', array: expr, index }, expr);
            } else if (this.check('lparen', '(')) {
                this.advance();
                const args = [];
                if (!this.check('rparen')) {
                    do { args.push(this.parseExpression()); } while (this.match('comma'));
                }
                this.consume('rparen', ')', "Se esperaba ')'");
                expr = this.at({ kind: 'Call', callee: expr, args }, expr);
            } else if (this.check('operator', '++') || this.check('operator', '--')) {
                const opTok = this.advance();
                const op = opTok.lexeme;
                if (!this.isLValue(expr)) {
                    throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] Operador '${op}' requiere un lvalue.`);
                }
                expr = this.at({ kind: 'IncrementExpr', op, target: expr, prefix: false }, expr);
            } else break;
        }
        return expr;
    }

    parsePrimary(): any {
        const start = this.peek();

        // struct literal `{ campo: expr, ... }`
        if (this.match('lbraken', '{')) {
            const fields: { name: string; value: any }[] = [];
            if (!this.check('rbraken')) {
                do {
                    const nameTok = this.consume('identifier', undefined, 'Se esperaba nombre del campo del struct literal');
                    this.consume('operator', ':', "Se esperaba ':' después del nombre del campo");
                    const value = this.parseExpression();
                    fields.push({ name: nameTok.lexeme, value });
                } while (this.match('comma'));
            }
            this.consume('rbraken', '}', "Se esperaba '}' al cerrar el struct literal");
            return this.at({ kind: 'StructLiteral', fields }, start);
        }

        if (this.match('keyword', 'this')) return this.at({ kind: 'ThisExpr' }, start);

        if (this.match('keyword', 'super')) {
            this.consume('lparen', '(', "Se esperaba '(' después de 'super'");
            const args = [];
            if (!this.check('rparen')) {
                do { args.push(this.parseExpression()); } while (this.match('comma'));
            }
            this.consume('rparen', ')', "Se esperaba ')' para cerrar la llamada a 'super'");
            return this.at({ kind: 'SuperCall', args }, start);
        }

        if (this.match('keyword', 'new')) {
            const typeTok = this.peek();
            let typeName = null;
            if (typeTok.kind === 'keyword' && typeTok.lexeme === 'fn') {
                typeName = this.parseTypeName();
            } else if (typeTok.kind === 'keyword' && BUILTIN_TYPES.includes(typeTok.lexeme)) {
                // Para builtins NO consumimos `[N]` aquí; el bloque
                // `if (this.check('lbrack'))` de más abajo los procesa.
                typeName = this.advance().lexeme;
            } else if (typeTok.kind === 'identifier') {
                typeName = this.advance().lexeme;
                while (this.match('operator', '::')) {
                    typeName += '::' + this.consume('identifier', undefined, 'Se esperaba un nombre tras ::').lexeme;
                }
                // new Box<int>(...)
                if (this.check('operator', '<')) {
                    const args = this.parseTypeArgs();
                    typeName += '<' + args.join(',') + '>';
                }
            } else {
                throw new Error(`[SyntaxError] [${typeTok.line}:${typeTok.column}] Se esperaba un tipo tras 'new', se encontró '${typeTok.lexeme}'`);
            }

            if (this.check('lbrack')) {
                const sizes = [];
                while (this.match('lbrack')) {
                    sizes.push(this.parseExpression());
                    this.consume('rbrack', ']', "Se esperaba ']' para cerrar el tamaño del array");
                }
                return this.at({ kind: 'NewArrayExpr', elementType: typeName, sizes }, start);
            }

            this.consume('lparen', '(', "Se esperaba '(' para la instanciación");
            const args = [];
            if (!this.check('rparen')) {
                do { args.push(this.parseExpression()); } while (this.match('comma'));
            }
            this.consume('rparen', ')', "Se esperaba ')' para cerrar la instanciación");
            return this.at({ kind: 'NewExpr', className: typeName, args }, start);
        }

        if (this.check('null'))   { const t = this.advance(); return this.at({ kind: 'NullLiteral' }, t); }
        if (this.check('string')) {
            const t = this.advance();
            let value = t.lexeme;
            if (value.length >= 2) value = value.slice(1, -1);
            value = decodeStringEscapes(value);
            return this.at({ kind: 'StringLiteral', value }, t);
        }
        if (this.check('boolean')){ const t = this.advance(); return this.at({ kind: 'BooleanLiteral', value: t.lexeme === 'true' }, t); }

        if (this.check('number')) {
            const t = this.advance();
            const lex = t.lexeme;
            let value: number | bigint;
            if (lex.includes('.')) {
                value = parseFloat(lex);
            } else {
                const bv = BigInt(lex);
                if (bv > 18446744073709551615n || bv < -9223372036854775808n) {
                    throw new Error(`[SyntaxError] [${t.line}:${t.column}] Literal fuera de rango i64/u64: ${lex}`);
                }
                if (bv >= -9007199254740991n && bv <= 9007199254740991n) {
                    value = Number(bv);
                } else {
                    value = bv;
                }
            }
            let isUnsigned = false;
            let isFloat32 = false;
            if (this.check('identifier') && this.peek().lexeme === 'u') {
                this.advance();
                isUnsigned = true;
            } else if (lex.includes('.')
                       && this.check('identifier')
                       && (this.peek().lexeme === 'f' || this.peek().lexeme === 'F')) {
                this.advance();
                isFloat32 = true;
            }
            return this.at({ kind: 'NumberLiteral', value, isUnsigned, isFloat32 }, t);
        }

        if (this.match('lbrack', '[')) {
            const elements = [];
            if (!this.check('rbrack', ']')) {
                do {
                    if (this.check('string')) {
                        const t = this.advance();
                        elements.push(this.at({ kind: 'StringLiteral', value: t.lexeme.slice(1, -1) }, t));
                    } else if (this.check('identifier') &&
                               !(this.tokens[this.pos + 1]?.kind === 'lparen') &&
                               !(this.tokens[this.pos + 1]?.kind === 'operator' && this.tokens[this.pos + 1].lexeme === '.')) {
                        const t = this.advance();
                        elements.push(this.at({ kind: 'Identifier', name: t.lexeme }, t));
                    } else {
                        elements.push(this.parseExpression());
                    }
                } while (this.match('comma', ','));
            }
            this.consume('rbrack', ']', "Se esperaba ']' al cerrar el array literal");
            return this.at({ kind: 'ArrayLiteral', elements }, start);
        }

        // Lambda
        if (this.check('lparen')) {
            const save = this.pos;
            this.advance();
            let looksLikeLambda = false;
            const params: any[] = [];

            if (this.check('rparen')) {
                this.advance();
                if (this.match('operator', '=>')) looksLikeLambda = true;
            } else if (this.isTypeName()) {
                try {
                    do {
                        let pIsConst = false;
                        if (this.match('keyword', 'const')) pIsConst = true;
                        const pType = this.parseTypeName();
                        const pName = this.consume('identifier', undefined, 'Se esperaba nombre del parámetro');
                        params.push({ name: pName.lexeme, type: pType, isConst: pIsConst, line: pName.line, column: pName.column });
                    } while (this.match('comma'));
                    this.consume('rparen', ')', "Se esperaba ')'");
                    if (this.match('operator', '=>')) looksLikeLambda = true;
                } catch (e) {
                    // fall through
                }
            }

            if (looksLikeLambda) {
                let body;
                if (this.check('lbraken')) {
                    this.advance();
                    body = this.parseBeginEnd();
                } else {
                    const expr = this.parseExpression();
                    body = this.at({ kind: 'BeginEnd', statements: [this.at({ kind: 'Return', expr }, expr)] }, expr);
                }
                return this.at({ kind: 'LambdaExpr', params, body }, start);
            }

            this.pos = save;
        }

        if (this.check('identifier')) {
            const t = this.advance();
            if (this.check('operator', '::')) {
                const parts = [t.lexeme];
                while (this.match('operator', '::')) {
                    parts.push(this.consume('identifier', undefined, 'Se esperaba un nombre tras ::').lexeme);
                }
                return this.at({ kind: 'QualifiedName', parts }, t);
            }
            return this.at({ kind: 'Identifier', name: t.lexeme }, t);
        }

        if (this.match('lparen', '(')) {
            const expr = this.parseExpression();
            this.consume('rparen', ')', 'Falta cerrar paréntesis');
            return expr;
        }

        const tok = this.peek();
        throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Expresión inesperada: '${tok.lexeme}' (${tok.kind})`);
    }
}