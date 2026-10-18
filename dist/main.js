// main.ts
var {WASI} = (() => ({}));

// node:path
function assertPath(path) {
  if (typeof path !== "string")
    throw TypeError("Path must be a string. Received " + JSON.stringify(path));
}
function normalizeStringPosix(path, allowAboveRoot) {
  var res = "", lastSegmentLength = 0, lastSlash = -1, dots = 0, code;
  for (var i = 0;i <= path.length; ++i) {
    if (i < path.length)
      code = path.charCodeAt(i);
    else if (code === 47)
      break;
    else
      code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1)
        ;
      else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            var lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1)
                res = "", lastSegmentLength = 0;
              else
                res = res.slice(0, lastSlashIndex), lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              lastSlash = i, dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "", lastSegmentLength = 0, lastSlash = i, dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0)
            res += "/..";
          else
            res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += "/" + path.slice(lastSlash + 1, i);
        else
          res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i, dots = 0;
    } else if (code === 46 && dots !== -1)
      ++dots;
    else
      dots = -1;
  }
  return res;
}
function _format(sep, pathObject) {
  var dir = pathObject.dir || pathObject.root, base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
  if (!dir)
    return base;
  if (dir === pathObject.root)
    return dir + base;
  return dir + sep + base;
}
function resolve() {
  var resolvedPath = "", resolvedAbsolute = false, cwd;
  for (var i = arguments.length - 1;i >= -1 && !resolvedAbsolute; i--) {
    var path;
    if (i >= 0)
      path = arguments[i];
    else {
      if (cwd === undefined)
        cwd = process.cwd();
      path = cwd;
    }
    if (assertPath(path), path.length === 0)
      continue;
    resolvedPath = path + "/" + resolvedPath, resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  if (resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute), resolvedAbsolute)
    if (resolvedPath.length > 0)
      return "/" + resolvedPath;
    else
      return "/";
  else if (resolvedPath.length > 0)
    return resolvedPath;
  else
    return ".";
}
function normalize(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var isAbsolute = path.charCodeAt(0) === 47, trailingSeparator = path.charCodeAt(path.length - 1) === 47;
  if (path = normalizeStringPosix(path, !isAbsolute), path.length === 0 && !isAbsolute)
    path = ".";
  if (path.length > 0 && trailingSeparator)
    path += "/";
  if (isAbsolute)
    return "/" + path;
  return path;
}
function isAbsolute(path) {
  return assertPath(path), path.length > 0 && path.charCodeAt(0) === 47;
}
function join() {
  if (arguments.length === 0)
    return ".";
  var joined;
  for (var i = 0;i < arguments.length; ++i) {
    var arg = arguments[i];
    if (assertPath(arg), arg.length > 0)
      if (joined === undefined)
        joined = arg;
      else
        joined += "/" + arg;
  }
  if (joined === undefined)
    return ".";
  return normalize(joined);
}
function relative(from, to) {
  if (assertPath(from), assertPath(to), from === to)
    return "";
  if (from = resolve(from), to = resolve(to), from === to)
    return "";
  var fromStart = 1;
  for (;fromStart < from.length; ++fromStart)
    if (from.charCodeAt(fromStart) !== 47)
      break;
  var fromEnd = from.length, fromLen = fromEnd - fromStart, toStart = 1;
  for (;toStart < to.length; ++toStart)
    if (to.charCodeAt(toStart) !== 47)
      break;
  var toEnd = to.length, toLen = toEnd - toStart, length = fromLen < toLen ? fromLen : toLen, lastCommonSep = -1, i = 0;
  for (;i <= length; ++i) {
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === 47)
          return to.slice(toStart + i + 1);
        else if (i === 0)
          return to.slice(toStart + i);
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === 47)
          lastCommonSep = i;
        else if (i === 0)
          lastCommonSep = 0;
      }
      break;
    }
    var fromCode = from.charCodeAt(fromStart + i), toCode = to.charCodeAt(toStart + i);
    if (fromCode !== toCode)
      break;
    else if (fromCode === 47)
      lastCommonSep = i;
  }
  var out = "";
  for (i = fromStart + lastCommonSep + 1;i <= fromEnd; ++i)
    if (i === fromEnd || from.charCodeAt(i) === 47)
      if (out.length === 0)
        out += "..";
      else
        out += "/..";
  if (out.length > 0)
    return out + to.slice(toStart + lastCommonSep);
  else {
    if (toStart += lastCommonSep, to.charCodeAt(toStart) === 47)
      ++toStart;
    return to.slice(toStart);
  }
}
function _makeLong(path) {
  return path;
}
function dirname(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var code = path.charCodeAt(0), hasRoot = code === 47, end = -1, matchedSlash = true;
  for (var i = path.length - 1;i >= 1; --i)
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else
      matchedSlash = false;
  if (end === -1)
    return hasRoot ? "/" : ".";
  if (hasRoot && end === 1)
    return "//";
  return path.slice(0, end);
}
function basename(path, ext) {
  if (ext !== undefined && typeof ext !== "string")
    throw TypeError('"ext" argument must be a string');
  assertPath(path);
  var start = 0, end = -1, matchedSlash = true, i;
  if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
    if (ext.length === path.length && ext === path)
      return "";
    var extIdx = ext.length - 1, firstNonSlashEnd = -1;
    for (i = path.length - 1;i >= 0; --i) {
      var code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1)
          matchedSlash = false, firstNonSlashEnd = i + 1;
        if (extIdx >= 0)
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1)
              end = i;
          } else
            extIdx = -1, end = firstNonSlashEnd;
      }
    }
    if (start === end)
      end = firstNonSlashEnd;
    else if (end === -1)
      end = path.length;
    return path.slice(start, end);
  } else {
    for (i = path.length - 1;i >= 0; --i)
      if (path.charCodeAt(i) === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1)
        matchedSlash = false, end = i + 1;
    if (end === -1)
      return "";
    return path.slice(start, end);
  }
}
function extname(path) {
  assertPath(path);
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, preDotState = 0;
  for (var i = path.length - 1;i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    return "";
  return path.slice(startDot, end);
}
function format(pathObject) {
  if (pathObject === null || typeof pathObject !== "object")
    throw TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
  return _format("/", pathObject);
}
function parse(path) {
  assertPath(path);
  var ret = { root: "", dir: "", base: "", ext: "", name: "" };
  if (path.length === 0)
    return ret;
  var code = path.charCodeAt(0), isAbsolute2 = code === 47, start;
  if (isAbsolute2)
    ret.root = "/", start = 1;
  else
    start = 0;
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, i = path.length - 1, preDotState = 0;
  for (;i >= start; --i) {
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    if (end !== -1)
      if (startPart === 0 && isAbsolute2)
        ret.base = ret.name = path.slice(1, end);
      else
        ret.base = ret.name = path.slice(startPart, end);
  } else {
    if (startPart === 0 && isAbsolute2)
      ret.name = path.slice(1, startDot), ret.base = path.slice(1, end);
    else
      ret.name = path.slice(startPart, startDot), ret.base = path.slice(startPart, end);
    ret.ext = path.slice(startDot, end);
  }
  if (startPart > 0)
    ret.dir = path.slice(0, startPart - 1);
  else if (isAbsolute2)
    ret.dir = "/";
  return ret;
}
var sep = "/";
var delimiter = ":";
var posix = ((p) => (p.posix = p, p))({ resolve, normalize, isAbsolute, join, relative, _makeLong, dirname, basename, extname, format, parse, sep, delimiter, win32: null, posix: null });

// main.ts
var {readFile, writeFile, stat} = (() => ({}));

// lexer.ts
function Lexer(input) {
  const tokenRules = [
    { kind: "COMMENT", regex: /\/\*[\s\S]*?\*\//, ignore: true },
    { kind: "COMMENT", regex: /\/\/.*/, ignore: true },
    { kind: "string", regex: /"([^"\\]|\\.)*"/ },
    { kind: "string", regex: /'([^'\\]|\\.)*'/ },
    { kind: "boolean", regex: /\b(true|false)\b/ },
    { kind: "null", regex: /\bnull\b/ },
    { kind: "keyword", regex: /\b(string|char|int|int64|uint8|uint16|uint32|uint64|float|double|bool|auto|void|ptr|return|if|else|while|for|switch|case|default|break|continue|class|struct|enum|interface|abstract|namespace|public|private|protected|const|static|delete|new|this|super|virtual|override|using|final|sealed|fn|as|include|from|import)\b/ },
    { kind: "identifier", regex: /[a-zA-Z_][a-zA-Z0-9_]*/ },
    { kind: "number", regex: /0[xX][0-9a-fA-F]+/ },
    { kind: "number", regex: /0[bB][01]+/ },
    { kind: "number", regex: /\b\d+(\.\d+)?/ },
    { kind: "operator", regex: /(::|<<|>>|<=|>=|==|!=|&&|\|\||\+=|-=|\*=|\/=|%=|\+\+|--|=>|->|!|\?|\+|-|\*|\/|%|=|<|>|:|\||&|\^|~|\.)/ },
    { kind: "lparen", regex: /\(/ },
    { kind: "rparen", regex: /\)/ },
    { kind: "lbraken", regex: /\{/ },
    { kind: "rbraken", regex: /\}/ },
    { kind: "lbrack", regex: /\[/ },
    { kind: "rbrack", regex: /\]/ },
    { kind: "comma", regex: /,/ },
    { kind: "semicolon", regex: /;/ },
    { kind: "WHITESPACE", regex: /\s+/, ignore: true }
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
        for (let i = 0;i < value.length; i++) {
          if (value[i] === `
`) {
            line++;
            column = 1;
          } else
            column++;
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
  tokens.push({ kind: "eof", lexeme: "", line, column });
  return tokens;
}

// parser.ts
var BUILTIN_TYPES = [
  "void",
  "int",
  "int64",
  "string",
  "char",
  "float",
  "double",
  "bool",
  "auto",
  "ptr",
  "uint8",
  "uint16",
  "uint32",
  "uint64"
];
var COMPOUND_OPS = {
  "+=": "+",
  "-=": "-",
  "*=": "*",
  "/=": "/",
  "%=": "%"
};
var STMT_STARTERS = ["if", "while", "for", "switch", "return", "break", "continue", "delete"];
var CLASS_MODIFIERS = ["public", "private", "protected", "static", "virtual", "override"];
function decodeStringEscapes(raw) {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    if (i + 1 >= raw.length) {
      out += "\\";
      break;
    }
    const nxt = raw[i + 1];
    switch (nxt) {
      case "n":
        out += `
`;
        i += 2;
        break;
      case "r":
        out += "\r";
        i += 2;
        break;
      case "t":
        out += "\t";
        i += 2;
        break;
      case "0":
        out += "\x00";
        i += 2;
        break;
      case "\\":
        out += "\\";
        i += 2;
        break;
      case '"':
        out += '"';
        i += 2;
        break;
      case "'":
        out += "'";
        i += 2;
        break;
      case "u": {
        if (raw[i + 2] === "{") {
          let j = i + 3;
          let hex = "";
          while (j < raw.length && raw[j] !== "}") {
            hex += raw[j];
            j++;
          }
          if (j < raw.length && raw[j] === "}" && hex.length > 0) {
            const cp = parseInt(hex, 16);
            if (cp >= 0 && cp <= 1114111) {
              out += String.fromCodePoint(cp);
            }
            i = j + 1;
          } else {
            out += "\\u";
            i += 2;
          }
        } else {
          const hex = raw.slice(i + 2, i + 6);
          if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
          } else {
            out += "\\u";
            i += 2;
          }
        }
        break;
      }
      default:
        out += "\\" + nxt;
        i += 2;
    }
  }
  return out;
}

class Parser {
  pos = 0;
  tokens;
  errors = [];
  sourceFile = "";
  constructor(tokens, sourceFile = "") {
    this.tokens = tokens;
    this.sourceFile = sourceFile;
  }
  peek() {
    return this.tokens[this.pos];
  }
  previous() {
    return this.tokens[this.pos - 1];
  }
  isAtEnd() {
    return this.peek().kind === "eof";
  }
  check(kind, value) {
    if (this.isAtEnd())
      return false;
    const tok = this.peek();
    if (kind !== tok.kind)
      return false;
    if (value !== undefined && tok.lexeme !== value)
      return false;
    return true;
  }
  match(kind, value) {
    if (this.check(kind, value)) {
      this.advance();
      return true;
    }
    return false;
  }
  advance() {
    if (!this.isAtEnd())
      this.pos++;
    return this.previous();
  }
  consume(kind, value, errorMessage) {
    if (this.check(kind, value))
      return this.advance();
    const actual = this.peek();
    const expected = value ? `${value}` : `${kind}`;
    const baseMsg = errorMessage || `Se esperaba ${expected}`;
    throw new Error(`[SyntaxError] [${actual.line}:${actual.column}] ${baseMsg}, se encontró '${actual.lexeme}' (${actual.kind})`);
  }
  at(node, tok) {
    if (tok && typeof tok.line === "number") {
      node.line = tok.line;
      node.column = tok.column;
      if (this.sourceFile)
        node._sourceFile = this.sourceFile;
    }
    return node;
  }
  synchronize(level) {
    while (!this.isAtEnd()) {
      const tok = this.peek();
      if (tok.kind === "rbraken")
        return;
      if (tok.kind === "semicolon") {
        this.advance();
        return;
      }
      if (level === "top" && tok.kind === "keyword" && (tok.lexeme === "include" || tok.lexeme === "import" || tok.lexeme === "using" || tok.lexeme === "class" || tok.lexeme === "struct" || tok.lexeme === "enum" || tok.lexeme === "interface" || tok.lexeme === "abstract" || tok.lexeme === "namespace"))
        return;
      if (level === "class" && tok.kind === "keyword" && CLASS_MODIFIERS.includes(tok.lexeme))
        return;
      if (level === "stmt") {
        if (tok.kind === "lbraken")
          return;
        if (tok.kind === "keyword" && STMT_STARTERS.includes(tok.lexeme))
          return;
        if (tok.kind === "keyword" && (tok.lexeme === "case" || tok.lexeme === "default"))
          return;
      }
      this.advance();
    }
  }
  matchGenericClose() {
    if (this.check("operator", ">")) {
      this.advance();
      return;
    }
    if (this.check("operator", ">>")) {
      const tok = this.peek();
      this.tokens[this.pos] = { ...tok, lexeme: ">" };
      this.tokens.splice(this.pos + 1, 0, { ...tok, lexeme: ">" });
      this.advance();
      return;
    }
    const t = this.peek();
    throw new Error(`[SyntaxError] [${t.line}:${t.column}] Se esperaba '>' para cerrar tipo genérico, se encontró '${t.lexeme}'`);
  }
  parseTypeParams() {
    this.consume("operator", "<", "Se esperaba '<' para iniciar parámetros de tipo");
    const params = [];
    if (this.check("operator", ">")) {
      this.advance();
      return params;
    }
    do {
      const nameTok = this.consume("identifier", undefined, "Se esperaba nombre del parámetro de tipo");
      let bound = null;
      if (this.match("operator", ":"))
        bound = this.parseTypeName();
      params.push({ name: nameTok.lexeme, bound });
    } while (this.match("comma"));
    this.matchGenericClose();
    return params;
  }
  parseTypeArgs() {
    this.consume("operator", "<", "Se esperaba '<' para iniciar argumentos de tipo");
    const args = [];
    if (this.check("operator", ">")) {
      this.advance();
      return args;
    }
    do {
      args.push(this.parseTypeName());
    } while (this.match("comma"));
    this.matchGenericClose();
    return args;
  }
  scanGenericClose(startPos) {
    if (this.tokens[startPos]?.kind !== "operator" || this.tokens[startPos].lexeme !== "<")
      return null;
    let depth = 0;
    for (let i = startPos;i < this.tokens.length; i++) {
      const tk = this.tokens[i];
      if (tk.kind === "eof")
        return null;
      if (tk.kind === "operator" && tk.lexeme === "<")
        depth++;
      else if (tk.kind === "operator" && tk.lexeme === ">") {
        depth--;
        if (depth === 0)
          return i + 1;
      } else if (tk.kind === "operator" && tk.lexeme === ">>") {
        depth -= 2;
        if (depth <= 0)
          return i + 1;
      }
    }
    return null;
  }
  parseUsingDecl() {
    const start = this.previous();
    const parts = [this.consume("identifier", undefined, "Se esperaba un identificador tras using").lexeme];
    while (this.match("operator", "::")) {
      parts.push(this.consume("identifier", undefined, "Se esperaba un identificador tras ::").lexeme);
    }
    this.consume("semicolon", undefined, "Se esperaba ';' al final de la directiva using");
    const isWildcard = parts.length === 1;
    return this.at({ kind: "UsingDecl", name: parts.join("::"), parts, isWildcard }, start);
  }
  parseIncludeDecl() {
    const start = this.previous();
    const pathTok = this.consume("string", undefined, "Se esperaba un string literal después de 'include'");
    let path = pathTok.lexeme;
    if (path.length >= 2)
      path = path.slice(1, -1);
    this.consume("semicolon", undefined, "Se esperaba ';' después de include");
    return this.at({ kind: "IncludeDecl", path }, start);
  }
  parseImportDecl() {
    const start = this.previous();
    if (this.check("string")) {
      const t = this.advance();
      let path = t.lexeme;
      if (path.length >= 2)
        path = path.slice(1, -1);
      this.consume("semicolon", undefined, "Se esperaba ';' después de import");
      return this.at({ kind: "IncludeDecl", path }, start);
    }
    if (this.match("lbraken", "{")) {
      const imports = [];
      if (!this.check("rbraken")) {
        do {
          const parts = [this.consume("identifier", undefined, "Se esperaba un nombre").lexeme];
          while (this.match("operator", "::")) {
            parts.push(this.consume("identifier", undefined, "Se esperaba un nombre tras ::").lexeme);
          }
          imports.push({ parts });
        } while (this.match("comma"));
      }
      this.consume("rbraken", "}", "Se esperaba '}' en import");
      this.consume("keyword", "from", "Se esperaba 'from' tras la lista de imports");
      const pathTok = this.consume("string", undefined, "Se esperaba string literal tras 'from'");
      let path = pathTok.lexeme;
      if (path.length >= 2)
        path = path.slice(1, -1);
      this.consume("semicolon", undefined, "Se esperaba ';' después de import");
      return this.at({ kind: "ImportDecl", path, imports }, start);
    }
    if (this.check("identifier")) {
      const nameTok = this.advance();
      this.consume("keyword", "from", "Se esperaba 'from' tras el nombre del import");
      const pathTok = this.consume("string", undefined, "Se esperaba string literal tras 'from'");
      let path = pathTok.lexeme;
      if (path.length >= 2)
        path = path.slice(1, -1);
      this.consume("semicolon", undefined, "Se esperaba ';' después de import");
      return this.at({
        kind: "ImportDecl",
        path,
        imports: [{ parts: [nameTok.lexeme] }]
      }, start);
    }
    const tok = this.peek();
    throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Sintaxis de import inválida`);
  }
  parseProgram() {
    const body = [];
    while (!this.isAtEnd() && !this.check("eof")) {
      const before = this.pos;
      try {
        if (this.match("keyword", "include"))
          body.push(this.parseIncludeDecl());
        else if (this.match("keyword", "import"))
          body.push(this.parseImportDecl());
        else if (this.match("keyword", "using"))
          body.push(this.parseUsingDecl());
        else if (this.match("keyword", "namespace"))
          body.push(this.parseNamespace());
        else if (this.match("keyword", "abstract")) {
          this.consume("keyword", "class", "Se esperaba 'class' después de 'abstract'");
          body.push(this.parseClassDecl(false, true));
        } else if (this.match("keyword", "class"))
          body.push(this.parseClassDecl(false, false));
        else if (this.match("keyword", "struct"))
          body.push(this.parseStructDecl());
        else if (this.match("keyword", "enum"))
          body.push(this.parseEnumDecl());
        else if (this.match("keyword", "interface"))
          body.push(this.parseClassDecl(true, true));
        else {
          const tok = this.peek();
          throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba 'include', 'import', 'using', 'class', 'struct', 'enum', 'interface' o 'namespace', se encontró '${tok.lexeme}'`);
        }
      } catch (e) {
        this.errors.push(e);
        this.synchronize("top");
      }
      if (this.pos === before)
        this.advance();
    }
    return { kind: "Program", body };
  }
  parseNamespace() {
    const nameTok = this.consume("identifier", undefined, "Se esperaba el nombre del namespace");
    this.consume("lbraken", "{", "Se esperaba '{' después del nombre del namespace");
    const body = [];
    while (!this.isAtEnd() && !this.check("rbraken")) {
      const before = this.pos;
      try {
        if (this.match("keyword", "include"))
          body.push(this.parseIncludeDecl());
        else if (this.match("keyword", "import"))
          body.push(this.parseImportDecl());
        else if (this.match("keyword", "using"))
          body.push(this.parseUsingDecl());
        else if (this.match("keyword", "namespace"))
          body.push(this.parseNamespace());
        else if (this.match("keyword", "abstract")) {
          this.consume("keyword", "class", "Se esperaba 'class' después de 'abstract'");
          body.push(this.parseClassDecl(false, true));
        } else if (this.match("keyword", "class"))
          body.push(this.parseClassDecl(false, false));
        else if (this.match("keyword", "struct"))
          body.push(this.parseStructDecl());
        else if (this.match("keyword", "enum"))
          body.push(this.parseEnumDecl());
        else if (this.match("keyword", "interface"))
          body.push(this.parseClassDecl(true, true));
        else {
          const tok = this.peek();
          throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba 'include', 'import', 'using', 'class', 'struct', 'enum', 'interface' o 'namespace' dentro del namespace`);
        }
      } catch (e) {
        this.errors.push(e);
        this.synchronize("top");
      }
      if (this.pos === before)
        this.advance();
    }
    this.consume("rbraken", "}", "Se esperaba '}' al cerrar el namespace");
    return this.at({ kind: "NamespaceDecl", name: nameTok.lexeme, body }, nameTok);
  }
  parseStructDecl() {
    const nameTok = this.consume("identifier", undefined, "Se esperaba el nombre del struct");
    let typeParams = [];
    if (this.check("operator", "<"))
      typeParams = this.parseTypeParams();
    this.consume("lbraken", "{", "Se esperaba '{' para el cuerpo del struct");
    const members = [];
    while (!this.isAtEnd() && !this.check("rbraken", "}")) {
      if (!this.isTypeName()) {
        const tok = this.peek();
        throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba un tipo de datos para el campo del struct, se encontró '${tok.lexeme}'`);
      }
      const fieldType = this.parseTypeName();
      const fieldName = this.consume("identifier", undefined, "Se esperaba el nombre del campo del struct");
      let value = null;
      if (this.match("operator", "="))
        value = this.parseExpression();
      this.consume("semicolon", undefined, "Se esperaba ';' al final del campo del struct");
      members.push(this.at({
        kind: "FieldDecl",
        visibility: "public",
        isStatic: false,
        isConst: false,
        type: fieldType,
        name: fieldName.lexeme,
        value
      }, fieldName));
    }
    this.consume("rbraken", "}", "Se esperaba '}' al cerrar el struct");
    return this.at({
      kind: "ClassDecl",
      name: nameTok.lexeme,
      base: null,
      members,
      isInterface: false,
      isAbstract: false,
      isStruct: true,
      typeParams
    }, nameTok);
  }
  parseEnumDecl() {
    const nameTok = this.consume("identifier", undefined, "Se esperaba el nombre del enum");
    this.consume("lbraken", "{", "Se esperaba '{' para el cuerpo del enum");
    const members = [];
    while (!this.isAtEnd() && !this.check("rbraken", "}")) {
      const mName = this.consume("identifier", undefined, "Se esperaba el nombre del miembro del enum");
      let valueExpr = null;
      if (this.match("operator", "="))
        valueExpr = this.parseExpression();
      if (!this.match("comma") && !this.check("rbraken")) {
        throw new Error(`[SyntaxError] [${mName.line}:${mName.column}] Se esperaba ',' o '}' tras el miembro del enum`);
      }
      members.push(this.at({ name: mName.lexeme, valueExpr }, mName));
    }
    this.consume("rbraken", "}", "Se esperaba '}' al cerrar el enum");
    return this.at({ kind: "EnumDecl", name: nameTok.lexeme, members }, nameTok);
  }
  parseClassDecl(isInterface, isAbstract) {
    const nameTok = this.consume("identifier", undefined, isInterface ? "Se esperaba el nombre de la interface" : "Se esperaba el nombre de la clase");
    let typeParams = [];
    if (this.check("operator", "<"))
      typeParams = this.parseTypeParams();
    let isFinal = false;
    if (this.match("keyword", "final") || this.match("keyword", "sealed")) {
      isFinal = true;
    }
    let base = null;
    if (this.match("operator", ":")) {
      let baseVisibility = "public";
      if (this.match("keyword", "public"))
        baseVisibility = "public";
      else if (this.match("keyword", "private"))
        baseVisibility = "private";
      else if (this.match("keyword", "protected"))
        baseVisibility = "protected";
      let baseName = this.consume("identifier", undefined, "Se esperaba el nombre de la clase base").lexeme;
      while (this.match("operator", "::")) {
        baseName += "::" + this.consume("identifier", undefined, "Se esperaba un nombre tras ::").lexeme;
      }
      if (this.check("operator", "<")) {
        const args = this.parseTypeArgs();
        baseName += "<" + args.join(",") + ">";
      }
      base = { visibility: baseVisibility, name: baseName };
    }
    this.consume("lbraken", "{", `Se esperaba '{' para el cuerpo de ${isInterface ? "la interface" : "la clase"}`);
    const members = [];
    let currentVisibility = isInterface ? "public" : "private";
    while (!this.isAtEnd() && !this.check("rbraken", "}")) {
      const before = this.pos;
      try {
        if (this.match("keyword", "public") || this.match("keyword", "private") || this.match("keyword", "protected")) {
          currentVisibility = this.previous().lexeme;
          if (this.check("operator", ":"))
            this.advance();
        } else {
          members.push(this.parseClassMember(nameTok.lexeme, currentVisibility, isInterface));
        }
      } catch (e) {
        this.errors.push(e);
        this.synchronize("class");
      }
      if (this.pos === before)
        this.advance();
    }
    this.consume("rbraken", "}", `Se esperaba '}' al cerrar ${isInterface ? "la interface" : "la clase"}`);
    return this.at({
      kind: "ClassDecl",
      name: nameTok.lexeme,
      base,
      members,
      isInterface,
      isAbstract: isAbstract || isInterface,
      isFinal,
      typeParams
    }, nameTok);
  }
  parseClassMember(className, visibility, isInterface) {
    let isStatic = false, isVirtual = false, isOverride = false, isConst = false;
    while (this.check("keyword", "static") || this.check("keyword", "const") || this.check("keyword", "public") || this.check("keyword", "private") || this.check("keyword", "protected") || this.check("keyword", "virtual") || this.check("keyword", "override")) {
      const mod = this.advance().lexeme;
      if (mod === "static")
        isStatic = true;
      else if (mod === "const")
        isConst = true;
      else if (mod === "virtual")
        isVirtual = true;
      else if (mod === "override")
        isOverride = true;
      else
        visibility = mod;
      if (this.check("operator", ":"))
        this.advance();
    }
    if (this.check("operator", "~")) {
      if (isInterface)
        throw new Error(`[SyntaxError] [${this.peek().line}:${this.peek().column}] Una interface no puede tener destructor.`);
      const tilde = this.advance();
      if (isStatic)
        throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor no puede ser 'static'.`);
      if (isVirtual)
        throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor no puede ser 'virtual'.`);
      if (isOverride)
        throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor no puede ser 'override'.`);
      const dtorNameTok = this.consume("identifier", undefined, "Se esperaba el nombre de la clase tras ~");
      if (dtorNameTok.lexeme !== className) {
        throw new Error(`[SyntaxError] [${tilde.line}:${tilde.column}] El destructor debe llamarse '~${className}', se encontró '~${dtorNameTok.lexeme}'.`);
      }
      this.consume("lparen", "(", "Se esperaba '(' en el destructor");
      this.consume("rparen", ")", "El destructor no lleva parámetros");
      this.consume("lbraken", "{", "Se esperaba '{' para el cuerpo del destructor");
      const body = this.parseBeginEnd();
      return this.at({ kind: "DestructorDecl", visibility, body }, tilde);
    }
    if (this.check("identifier") && this.peek().lexeme === className && this.tokens[this.pos + 1] && this.tokens[this.pos + 1].kind === "lparen") {
      if (isInterface)
        throw new Error(`[SyntaxError] [${this.peek().line}:${this.peek().column}] Una interface no puede tener constructor.`);
      const nameTok = this.advance();
      if (isStatic)
        throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] El constructor no puede ser 'static'.`);
      if (isVirtual)
        throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] El constructor no puede ser 'virtual'.`);
      if (isOverride)
        throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] El constructor no puede ser 'override'.`);
      this.consume("lparen", "(", "Se esperaba '(' en el constructor");
      const params = [];
      if (!this.check("rparen")) {
        do {
          let pIsConst = false;
          if (this.match("keyword", "const"))
            pIsConst = true;
          if (!this.isTypeName()) {
            const actual = this.peek();
            throw new Error(`[SyntaxError] [${actual.line}:${actual.column}] Se esperaba tipo del parámetro`);
          }
          const paramType = this.parseTypeName();
          const paramName = this.consume("identifier", undefined, "Se esperaba nombre del parámetro");
          params.push({ name: paramName.lexeme, type: paramType, isConst: pIsConst, line: paramName.line, column: paramName.column });
        } while (this.match("comma"));
      }
      this.consume("rparen", ")", "Se esperaba ')'");
      this.consume("lbraken", "{", "Se esperaba '{' para el cuerpo del constructor");
      const body = this.parseBeginEnd();
      return this.at({ kind: "ConstructorDecl", visibility, params, body }, nameTok);
    }
    if (!this.isTypeName()) {
      const tok = this.peek();
      throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Se esperaba un tipo de datos para el miembro, se encontró '${tok.lexeme}'`);
    }
    const declaredType = this.parseTypeName();
    const nameTok = this.consume("identifier", undefined, "Se esperaba el nombre del método o campo");
    if (nameTok.lexeme === className && !isInterface) {
      throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] Un constructor no debe declarar tipo de retorno.`);
    }
    if (this.check("lparen", "(")) {
      return this.parseMethodDecl(visibility, isStatic, isVirtual, isOverride, declaredType, nameTok);
    }
    if (isInterface) {
      throw new Error(`[SyntaxError] [${nameTok.line}:${nameTok.column}] Una interface no puede tener campos de instancia.`);
    }
    return this.parseClassFieldDecl(visibility, isStatic, isConst, declaredType, nameTok);
  }
  parseMethodDecl(visibility, isStatic, isVirtual, isOverride, returnType, nameTok) {
    this.consume("lparen", "(", "Se esperaba '('");
    const params = [];
    if (!this.check("rparen")) {
      do {
        let pIsConst = false;
        if (this.match("keyword", "const"))
          pIsConst = true;
        if (!this.isTypeName()) {
          const actual = this.peek();
          throw new Error(`[SyntaxError] [${actual.line}:${actual.column}] Se esperaba tipo del parámetro`);
        }
        const paramType = this.parseTypeName();
        const paramName = this.consume("identifier", undefined, "Se esperaba nombre del parámetro");
        params.push({ name: paramName.lexeme, type: paramType, isConst: pIsConst, line: paramName.line, column: paramName.column });
      } while (this.match("comma"));
    }
    this.consume("rparen", ")", "Se esperaba ')'");
    if (this.match("semicolon")) {
      return this.at({
        kind: "MethodDecl",
        visibility,
        isStatic,
        isVirtual,
        isOverride,
        returnType,
        name: nameTok.lexeme,
        params,
        body: null
      }, nameTok);
    }
    this.consume("lbraken", "{", "Se esperaba '{' para el cuerpo del método o ';' para método abstracto");
    const body = this.parseBeginEnd();
    return this.at({
      kind: "MethodDecl",
      visibility,
      isStatic,
      isVirtual,
      isOverride,
      returnType,
      name: nameTok.lexeme,
      params,
      body
    }, nameTok);
  }
  parseClassFieldDecl(visibility, isStatic, isConst, fieldType, nameTok) {
    let value = null;
    if (this.match("operator", "="))
      value = this.parseExpression();
    this.consume("semicolon", undefined, "Se esperaba ';'");
    return this.at({ kind: "FieldDecl", visibility, isStatic, isConst, type: fieldType, name: nameTok.lexeme, value }, nameTok);
  }
  parseStatement() {
    const start = this.peek();
    if (this.match("keyword", "if"))
      return this.parseIf(start);
    if (this.match("keyword", "while"))
      return this.parseWhile(start);
    if (this.match("keyword", "for"))
      return this.parseFor(start);
    if (this.match("keyword", "switch"))
      return this.parseSwitch(start);
    if (this.match("keyword", "break")) {
      this.consume("semicolon", undefined, "Se esperaba ';' después de break");
      return this.at({ kind: "Break" }, start);
    }
    if (this.match("keyword", "continue")) {
      this.consume("semicolon", undefined, "Se esperaba ';' después de continue");
      return this.at({ kind: "Continue" }, start);
    }
    if (this.match("keyword", "delete")) {
      const target = this.parsePostfix();
      this.consume("semicolon", undefined, "Se esperaba ';' después de delete");
      return this.at({ kind: "Delete", target }, start);
    }
    if (this.match("keyword", "return"))
      return this.parseReturn(start);
    if (this.match("lbraken", "{"))
      return this.parseBeginEnd(start);
    if (this.match("keyword", "const")) {
      const varType = this.parseTypeName();
      const ident = this.consume("identifier", undefined, "Se esperaba un identificador");
      let expr = null;
      if (this.match("operator", "="))
        expr = this.parseExpression();
      this.consume("semicolon", undefined, "Se esperaba ';'");
      return this.at({ kind: "VarDecl", type: varType, name: ident.lexeme, value: expr, isConst: true }, ident);
    }
    if (this.isTypeName()) {
      const varType = this.parseTypeName();
      const ident = this.consume("identifier", undefined, "Se esperaba un identificador para la variable");
      let expr = null;
      if (this.match("operator", "="))
        expr = this.parseExpression();
      this.consume("semicolon", undefined, "Se esperaba ';'");
      return this.at({ kind: "VarDecl", type: varType, name: ident.lexeme, value: expr }, ident);
    }
    const expr = this.parseExpression();
    this.consume("semicolon", undefined, "Se esperaba ';'");
    return this.at({ kind: "ExprStatement", expr }, expr?.line ? expr : start);
  }
  isTypeName() {
    const t0 = this.tokens[this.pos];
    if (!t0)
      return false;
    if (t0.kind === "keyword" && t0.lexeme === "fn")
      return true;
    const t1 = this.tokens[this.pos + 1];
    const t2 = this.tokens[this.pos + 2];
    if (t0.kind === "keyword" && BUILTIN_TYPES.includes(t0.lexeme))
      return true;
    if (t0.kind === "identifier" && t1?.kind === "lbrack" && t2?.kind === "rbrack")
      return true;
    if (t0.kind === "identifier" && t1?.kind === "identifier")
      return true;
    if (t0.kind === "identifier" && t1?.kind === "operator" && t1.lexeme === "::") {
      let i = this.pos + 1;
      while (this.tokens[i]?.kind === "operator" && this.tokens[i].lexeme === "::" && this.tokens[i + 1]?.kind === "identifier") {
        i += 2;
      }
      while (this.tokens[i]?.kind === "lbrack" && this.tokens[i + 1]?.kind === "rbrack")
        i += 2;
      if (this.tokens[i]?.kind === "identifier")
        return true;
    }
    if (t0.kind === "identifier" && t1?.kind === "operator" && t1.lexeme === "<") {
      const after = this.scanGenericClose(this.pos + 1);
      if (after !== null) {
        let j = after;
        while (this.tokens[j]?.kind === "lbrack" && this.tokens[j + 1]?.kind === "rbrack")
          j += 2;
        if (this.tokens[j]?.kind === "identifier")
          return true;
      }
    }
    if (t0.kind === "identifier" && t1?.kind === "operator" && t1.lexeme === "::") {
      let i = this.pos + 1;
      while (this.tokens[i]?.kind === "operator" && this.tokens[i].lexeme === "::" && this.tokens[i + 1]?.kind === "identifier") {
        i += 2;
      }
      if (this.tokens[i]?.kind === "operator" && this.tokens[i].lexeme === "<") {
        const after = this.scanGenericClose(i);
        if (after !== null) {
          let j = after;
          while (this.tokens[j]?.kind === "lbrack" && this.tokens[j + 1]?.kind === "rbrack")
            j += 2;
          if (this.tokens[j]?.kind === "identifier")
            return true;
        }
      }
    }
    return false;
  }
  parseTypeName() {
    if (this.check("keyword", "fn")) {
      this.advance();
      this.consume("lparen", "(", "Se esperaba '(' en tipo fn");
      const paramTypes = [];
      if (!this.check("rparen")) {
        do {
          paramTypes.push(this.parseTypeName());
        } while (this.match("comma"));
      }
      this.consume("rparen", ")", "Se esperaba ')' en tipo fn");
      this.consume("operator", "->", "Se esperaba '->' en tipo fn");
      const retType = this.parseTypeName();
      let typeName = `fn(${paramTypes.join(",")})->${retType}`;
      while (this.check("lbrack") && this.tokens[this.pos + 1]?.kind === "rbrack") {
        this.advance();
        this.advance();
        typeName += "[]";
      }
      return typeName;
    }
    const typeTok = this.advance();
    let typeName = typeTok.lexeme;
    while (this.match("operator", "::")) {
      const n = this.consume("identifier", undefined, "Se esperaba un nombre tras ::");
      typeName += "::" + n.lexeme;
    }
    if (this.check("operator", "<")) {
      const args = this.parseTypeArgs();
      typeName += "<" + args.join(",") + ">";
    }
    while (this.check("lbrack") && this.tokens[this.pos + 1]?.kind === "rbrack") {
      this.advance();
      this.advance();
      typeName += "[]";
    }
    return typeName;
  }
  parseReturn(start) {
    let expr = null;
    if (!this.check("semicolon"))
      expr = this.parseExpression();
    this.consume("semicolon", undefined, "Se esperaba ';' después de return");
    return this.at({ kind: "Return", expr }, start);
  }
  parseBeginEnd(start) {
    const s = start || this.peek();
    const stmts = [];
    while (!this.isAtEnd() && !this.check("rbraken", "}")) {
      const before = this.pos;
      try {
        stmts.push(this.parseStatement());
      } catch (e) {
        this.errors.push(e);
        this.synchronize("stmt");
      }
      if (this.pos === before)
        this.advance();
    }
    this.consume("rbraken", "}", "Se esperaba '}'");
    return this.at({ kind: "BeginEnd", statements: stmts }, s);
  }
  parseIf(start) {
    this.consume("lparen", "(", "Se esperaba '(' después de if");
    const cond0 = this.parseExpression();
    this.consume("rparen", ")", "Se esperaba ')'");
    const then0 = this.parseStatement();
    const branches = [{ condition: cond0, thenStmt: then0 }];
    let elseStmt = null;
    while (this.match("keyword", "else")) {
      if (this.match("keyword", "if")) {
        this.consume("lparen", "(", "Se esperaba '(' después de else if");
        const cond = this.parseExpression();
        this.consume("rparen", ")", "Se esperaba ')'");
        const then = this.parseStatement();
        branches.push({ condition: cond, thenStmt: then });
      } else {
        elseStmt = this.parseStatement();
        break;
      }
    }
    return this.at({ kind: "If", branches, elseStmt }, start);
  }
  parseWhile(start) {
    this.consume("lparen", "(", "Se esperaba '(' después de while");
    const condition = this.parseExpression();
    this.consume("rparen", ")", "Se esperaba ')'");
    const body = this.parseStatement();
    return this.at({ kind: "While", condition, body }, start);
  }
  parseFor(start) {
    this.consume("lparen", "(", "Se esperaba '(' después de 'for'");
    let init = null;
    if (!this.check("semicolon", ";")) {
      if (this.isTypeName()) {
        const varType = this.parseTypeName();
        const ident = this.consume("identifier", undefined, "Se esperaba un identificador");
        let expr = null;
        if (this.match("operator", "="))
          expr = this.parseExpression();
        init = this.at({ kind: "VarDecl", type: varType, name: ident.lexeme, value: expr }, ident);
      } else {
        init = this.parseExpression();
      }
    }
    this.consume("semicolon", undefined, "Se esperaba ';' después de la inicialización del for");
    let condition = null;
    if (!this.check("semicolon", ";"))
      condition = this.parseExpression();
    this.consume("semicolon", undefined, "Se esperaba ';' después de la condición del for");
    let update = null;
    if (!this.check("rparen", ")"))
      update = this.parseExpression();
    this.consume("rparen", ")", "Se esperaba ')' para cerrar el for");
    const body = this.parseStatement();
    return this.at({ kind: "For", init, condition, update, body }, start);
  }
  parseSwitch(start) {
    this.consume("lparen", "(", "Se esperaba '(' después de 'switch'");
    const expr = this.parseExpression();
    this.consume("rparen", ")", "Se esperaba ')'");
    this.consume("lbraken", "{", "Se esperaba '{' después de 'switch(...)'");
    const cases = [];
    while (!this.isAtEnd() && !this.check("rbraken")) {
      const cstart = this.peek();
      if (this.match("keyword", "case")) {
        const values = [this.parseExpression()];
        while (this.match("comma"))
          values.push(this.parseExpression());
        this.consume("operator", ":", "Se esperaba ':' después de los valores de 'case'");
        const statements = this.parseCaseBody();
        cases.push({ values, statements, line: cstart.line, column: cstart.column });
      } else if (this.match("keyword", "default")) {
        this.consume("operator", ":", "Se esperaba ':' después de 'default'");
        const statements = this.parseCaseBody();
        cases.push({ values: null, statements, line: cstart.line, column: cstart.column });
      } else {
        throw new Error(`[SyntaxError] [${cstart.line}:${cstart.column}] Se esperaba 'case' o 'default' dentro de 'switch'`);
      }
    }
    this.consume("rbraken", "}", "Se esperaba '}' al cerrar el 'switch'");
    return this.at({ kind: "Switch", expr, cases }, start);
  }
  parseCaseBody() {
    const stmts = [];
    while (!this.isAtEnd() && !this.check("rbraken") && !this.check("keyword", "case") && !this.check("keyword", "default")) {
      const before = this.pos;
      try {
        stmts.push(this.parseStatement());
      } catch (e) {
        this.errors.push(e);
        this.synchronize("stmt");
      }
      if (this.pos === before)
        this.advance();
    }
    return stmts;
  }
  parseExpression() {
    return this.parseAssignment();
  }
  isLValue(node) {
    return node.kind === "Identifier" || node.kind === "MemberAccess" || node.kind === "IndexExpr" || node.kind === "QualifiedName";
  }
  parseAssignment() {
    const left = this.parseConditional();
    if (this.match("operator", "=")) {
      const value = this.parseAssignment();
      if (!this.isLValue(left)) {
        const tok = this.previous();
        throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] El lado izquierdo de '=' debe ser un lvalue.`);
      }
      return this.at({ kind: "Assignment", target: left, expr: value }, left);
    }
    if (this.check("operator", "+=") || this.check("operator", "-=") || this.check("operator", "*=") || this.check("operator", "/=") || this.check("operator", "%=")) {
      const opTok = this.advance();
      const op = opTok.lexeme;
      const binOp = COMPOUND_OPS[op];
      if (!this.isLValue(left)) {
        throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] El lado izquierdo de '${op}' debe ser un lvalue.`);
      }
      const value = this.parseAssignment();
      return this.at({ kind: "CompoundAssignment", op, binOp, target: left, expr: value }, left);
    }
    return left;
  }
  parseConditional() {
    const cond = this.parseLogicalOr();
    if (this.match("operator", "?")) {
      const thenExpr = this.parseExpression();
      this.consume("operator", ":", "Se esperaba ':' en operador ternario");
      const elseExpr = this.parseAssignment();
      return this.at({ kind: "Ternary", condition: cond, thenExpr, elseExpr }, cond);
    }
    return cond;
  }
  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match("operator", "||")) {
      const right = this.parseLogicalAnd();
      left = this.at({ kind: "BinaryOp", op: "||", left, right }, left);
    }
    return left;
  }
  parseLogicalAnd() {
    let left = this.parseBitwiseOr();
    while (this.match("operator", "&&")) {
      const right = this.parseBitwiseOr();
      left = this.at({ kind: "BinaryOp", op: "&&", left, right }, left);
    }
    return left;
  }
  parseBitwiseOr() {
    let left = this.parseBitwiseXor();
    while (this.match("operator", "|")) {
      const right = this.parseBitwiseXor();
      left = this.at({ kind: "BinaryOp", op: "|", left, right }, left);
    }
    return left;
  }
  parseBitwiseXor() {
    let left = this.parseBitwiseAnd();
    while (this.match("operator", "^")) {
      const right = this.parseBitwiseAnd();
      left = this.at({ kind: "BinaryOp", op: "^", left, right }, left);
    }
    return left;
  }
  parseBitwiseAnd() {
    let left = this.parseEquality();
    while (this.match("operator", "&")) {
      const right = this.parseEquality();
      left = this.at({ kind: "BinaryOp", op: "&", left, right }, left);
    }
    return left;
  }
  parseEquality() {
    let left = this.parseComparison();
    while (this.check("operator", "==") || this.check("operator", "!=")) {
      const op = this.advance().lexeme;
      const right = this.parseComparison();
      left = this.at({ kind: "BinaryOp", op, left, right }, left);
    }
    return left;
  }
  parseComparison() {
    let left = this.parseShift();
    while (this.check("operator", "<") || this.check("operator", ">") || this.check("operator", "<=") || this.check("operator", ">=")) {
      const op = this.advance().lexeme;
      const right = this.parseShift();
      left = this.at({ kind: "BinaryOp", op, left, right }, left);
    }
    return left;
  }
  parseShift() {
    let left = this.parseAddition();
    while (this.check("operator", "<<") || this.check("operator", ">>")) {
      const op = this.advance().lexeme;
      const right = this.parseAddition();
      left = this.at({ kind: "BinaryOp", op, left, right }, left);
    }
    return left;
  }
  parseAddition() {
    let left = this.parseMultiplication();
    while (this.check("operator", "+") || this.check("operator", "-")) {
      const op = this.advance().lexeme;
      const right = this.parseMultiplication();
      left = this.at({ kind: "BinaryOp", op, left, right }, left);
    }
    return left;
  }
  parseMultiplication() {
    let left = this.parseUnary();
    while (this.check("operator", "*") || this.check("operator", "/") || this.check("operator", "%")) {
      const op = this.advance().lexeme;
      const right = this.parseUnary();
      left = this.at({ kind: "BinaryOp", op, left, right }, left);
    }
    return left;
  }
  parseUnary() {
    if (this.check("operator", "!") || this.check("operator", "-") || this.check("operator", "+")) {
      const opTok = this.advance();
      const op = opTok.lexeme;
      const operand = this.parseUnary();
      return this.at({ kind: "UnaryOp", op, operand }, opTok);
    }
    if (this.check("operator", "~")) {
      const opTok = this.advance();
      const operand = this.parseUnary();
      return this.at({ kind: "UnaryOp", op: "~", operand }, opTok);
    }
    if (this.check("operator", "++") || this.check("operator", "--")) {
      const opTok = this.advance();
      const op = opTok.lexeme;
      const target = this.parseUnary();
      if (!this.isLValue(target)) {
        throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] Operador '${op}' requiere un lvalue.`);
      }
      return this.at({ kind: "IncrementExpr", op, target, prefix: true }, opTok);
    }
    if (this.check("operator", "&")) {
      const opTok = this.advance();
      const target = this.parseUnary();
      if (!this.isLValue(target)) {
        throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] Operador '&' requiere un lvalue.`);
      }
      return this.at({ kind: "AddressOfExpr", target }, opTok);
    }
    return this.parseAs();
  }
  parseAs() {
    let expr = this.parsePostfix();
    while (this.match("keyword", "as")) {
      const targetType = this.parseTypeName();
      expr = this.at({ kind: "CastExpr", expr, targetType }, expr);
    }
    return expr;
  }
  parsePostfix() {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match("operator", ".")) {
        const prop = this.consume("identifier", undefined, "Se esperaba un miembro tras '.'");
        expr = this.at({ kind: "MemberAccess", object: expr, property: prop.lexeme }, prop);
      } else if (this.check("lbrack")) {
        this.advance();
        const index = this.parseExpression();
        this.consume("rbrack", "]", "Se esperaba ']'");
        expr = this.at({ kind: "IndexExpr", array: expr, index }, expr);
      } else if (this.check("lparen", "(")) {
        this.advance();
        const args = [];
        if (!this.check("rparen")) {
          do {
            args.push(this.parseExpression());
          } while (this.match("comma"));
        }
        this.consume("rparen", ")", "Se esperaba ')'");
        expr = this.at({ kind: "Call", callee: expr, args }, expr);
      } else if (this.check("operator", "++") || this.check("operator", "--")) {
        const opTok = this.advance();
        const op = opTok.lexeme;
        if (!this.isLValue(expr)) {
          throw new Error(`[SyntaxError] [${opTok.line}:${opTok.column}] Operador '${op}' requiere un lvalue.`);
        }
        expr = this.at({ kind: "IncrementExpr", op, target: expr, prefix: false }, expr);
      } else
        break;
    }
    return expr;
  }
  parsePrimary() {
    const start = this.peek();
    if (this.match("keyword", "this"))
      return this.at({ kind: "ThisExpr" }, start);
    if (this.match("keyword", "super")) {
      this.consume("lparen", "(", "Se esperaba '(' después de 'super'");
      const args = [];
      if (!this.check("rparen")) {
        do {
          args.push(this.parseExpression());
        } while (this.match("comma"));
      }
      this.consume("rparen", ")", "Se esperaba ')' para cerrar la llamada a 'super'");
      return this.at({ kind: "SuperCall", args }, start);
    }
    if (this.match("keyword", "new")) {
      const typeTok = this.peek();
      let typeName = null;
      if (typeTok.kind === "keyword" && (BUILTIN_TYPES.includes(typeTok.lexeme) || typeTok.lexeme === "fn")) {
        typeName = this.parseTypeName();
      } else if (typeTok.kind === "identifier") {
        typeName = this.advance().lexeme;
        while (this.match("operator", "::")) {
          typeName += "::" + this.consume("identifier", undefined, "Se esperaba un nombre tras ::").lexeme;
        }
        if (this.check("operator", "<")) {
          const args = this.parseTypeArgs();
          typeName += "<" + args.join(",") + ">";
        }
      } else {
        throw new Error(`[SyntaxError] [${typeTok.line}:${typeTok.column}] Se esperaba un tipo tras 'new', se encontró '${typeTok.lexeme}'`);
      }
      if (this.check("lbrack")) {
        const sizes = [];
        while (this.match("lbrack")) {
          sizes.push(this.parseExpression());
          this.consume("rbrack", "]", "Se esperaba ']' para cerrar el tamaño del array");
        }
        return this.at({ kind: "NewArrayExpr", elementType: typeName, sizes }, start);
      }
      this.consume("lparen", "(", "Se esperaba '(' para la instanciación");
      const args = [];
      if (!this.check("rparen")) {
        do {
          args.push(this.parseExpression());
        } while (this.match("comma"));
      }
      this.consume("rparen", ")", "Se esperaba ')' para cerrar la instanciación");
      return this.at({ kind: "NewExpr", className: typeName, args }, start);
    }
    if (this.check("null")) {
      const t = this.advance();
      return this.at({ kind: "NullLiteral" }, t);
    }
    if (this.check("string")) {
      const t = this.advance();
      let value = t.lexeme;
      if (value.length >= 2)
        value = value.slice(1, -1);
      value = decodeStringEscapes(value);
      return this.at({ kind: "StringLiteral", value }, t);
    }
    if (this.check("boolean")) {
      const t = this.advance();
      return this.at({ kind: "BooleanLiteral", value: t.lexeme === "true" }, t);
    }
    if (this.check("number")) {
      const t = this.advance();
      const lex = t.lexeme;
      let value;
      if (lex.includes(".")) {
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
      if (this.check("identifier") && this.peek().lexeme === "u") {
        this.advance();
        isUnsigned = true;
      } else if (lex.includes(".") && this.check("identifier") && (this.peek().lexeme === "f" || this.peek().lexeme === "F")) {
        this.advance();
        isFloat32 = true;
      }
      return this.at({ kind: "NumberLiteral", value, isUnsigned, isFloat32 }, t);
    }
    if (this.match("lbrack", "[")) {
      const elements = [];
      if (!this.check("rbrack", "]")) {
        do {
          if (this.check("string")) {
            const t = this.advance();
            elements.push(this.at({ kind: "StringLiteral", value: t.lexeme.slice(1, -1) }, t));
          } else if (this.check("identifier") && !(this.tokens[this.pos + 1]?.kind === "lparen") && !(this.tokens[this.pos + 1]?.kind === "operator" && this.tokens[this.pos + 1].lexeme === ".")) {
            const t = this.advance();
            elements.push(this.at({ kind: "Identifier", name: t.lexeme }, t));
          } else {
            elements.push(this.parseExpression());
          }
        } while (this.match("comma", ","));
      }
      this.consume("rbrack", "]", "Se esperaba ']' al cerrar el array literal");
      return this.at({ kind: "ArrayLiteral", elements }, start);
    }
    if (this.check("lparen")) {
      const save = this.pos;
      this.advance();
      let looksLikeLambda = false;
      const params = [];
      if (this.check("rparen")) {
        this.advance();
        if (this.match("operator", "=>"))
          looksLikeLambda = true;
      } else if (this.isTypeName()) {
        try {
          do {
            let pIsConst = false;
            if (this.match("keyword", "const"))
              pIsConst = true;
            const pType = this.parseTypeName();
            const pName = this.consume("identifier", undefined, "Se esperaba nombre del parámetro");
            params.push({ name: pName.lexeme, type: pType, isConst: pIsConst, line: pName.line, column: pName.column });
          } while (this.match("comma"));
          this.consume("rparen", ")", "Se esperaba ')'");
          if (this.match("operator", "=>"))
            looksLikeLambda = true;
        } catch (e) {}
      }
      if (looksLikeLambda) {
        let body;
        if (this.check("lbraken")) {
          this.advance();
          body = this.parseBeginEnd();
        } else {
          const expr = this.parseExpression();
          body = this.at({ kind: "BeginEnd", statements: [this.at({ kind: "Return", expr }, expr)] }, expr);
        }
        return this.at({ kind: "LambdaExpr", params, body }, start);
      }
      this.pos = save;
    }
    if (this.check("identifier")) {
      const t = this.advance();
      if (this.check("operator", "::")) {
        const parts = [t.lexeme];
        while (this.match("operator", "::")) {
          parts.push(this.consume("identifier", undefined, "Se esperaba un nombre tras ::").lexeme);
        }
        return this.at({ kind: "QualifiedName", parts }, t);
      }
      return this.at({ kind: "Identifier", name: t.lexeme }, t);
    }
    if (this.match("lparen", "(")) {
      const expr = this.parseExpression();
      this.consume("rparen", ")", "Falta cerrar paréntesis");
      return expr;
    }
    const tok = this.peek();
    throw new Error(`[SyntaxError] [${tok.line}:${tok.column}] Expresión inesperada: '${tok.lexeme}' (${tok.kind})`);
  }
}

// error.ts
function fmt(name, message, line, column, file) {
  const loc = line !== undefined && line !== null && column !== undefined && column !== null ? `[${line}:${column}] ` : "";
  const f = file ? `${file}:${loc}` : loc;
  return `[${name}] ${f}${message}`;
}
class SemanticError extends Error {
  constructor(message, line, column, file) {
    super(fmt("SemanticError", message, line, column, file));
    this.name = "SemanticError";
    this.line = line;
    this.column = column;
    this.file = file;
  }
}

// semantic.ts
var NUMERIC_TYPES = new Set(["int", "int64", "float", "double", "char", "uint8", "uint16", "uint32", "uint64"]);
var INTEGER_TYPES = new Set(["int", "int64", "char", "uint8", "uint16", "uint32", "uint64"]);
var BUILTIN_TYPES_NO_VOID = new Set(["int", "int64", "string", "char", "float", "double", "bool", "uint8", "uint16", "uint32", "uint64"]);
var SWITCHABLE_TYPES = new Set(["int", "int64", "char", "bool", "string", "uint8", "uint16", "uint32", "uint64"]);
var UNSIGNED_TYPES = new Set(["uint8", "uint16", "uint32", "uint64"]);
function isNumeric(t) {
  return NUMERIC_TYPES.has(t);
}
function isIntegerType(t) {
  return INTEGER_TYPES.has(t);
}
function isArrayType(t) {
  return typeof t === "string" && t.endsWith("[]");
}
function elementType(t) {
  return t.slice(0, -2);
}
function isFnPtrType(t) {
  return typeof t === "string" && t.startsWith("fn(") && t.includes(")->");
}
function parseFnPtrType(t) {
  const m = /^fn\(([^)]*)\)->(.+)$/.exec(t);
  if (!m)
    return null;
  const params = m[1] === "" ? [] : m[1].split(",");
  return { params, ret: m[2] };
}
function numInfo(t) {
  switch (t) {
    case "char":
      return { bits: 8, signed: true, isFloat: false };
    case "uint8":
      return { bits: 8, signed: false, isFloat: false };
    case "uint16":
      return { bits: 16, signed: false, isFloat: false };
    case "int":
      return { bits: 32, signed: true, isFloat: false };
    case "uint32":
      return { bits: 32, signed: false, isFloat: false };
    case "int64":
      return { bits: 64, signed: true, isFloat: false };
    case "uint64":
      return { bits: 64, signed: false, isFloat: false };
    case "float":
      return { bits: 32, signed: true, isFloat: true };
    case "double":
      return { bits: 64, signed: true, isFloat: true };
    default:
      return null;
  }
}
function promoteNumeric(a, b) {
  if (a === "double" || b === "double")
    return "double";
  if (a === "float" || b === "float")
    return "float";
  const ia = numInfo(a);
  const ib = numInfo(b);
  if (!ia || !ib)
    return null;
  const bits = Math.max(ia.bits, ib.bits);
  const signed = ia.signed && ib.signed;
  if (bits === 8)
    return signed ? "char" : "uint8";
  if (bits === 16)
    return signed ? "int" : "uint16";
  if (bits === 32)
    return signed ? "int" : "uint32";
  return signed ? "int64" : "uint64";
}

class Scope {
  constructor(parent = null, kind = "block") {
    this.symbols = new Map;
    this.parent = parent;
    this.kind = kind;
    this.fullName = null;
  }
  define(name, data) {
    this.symbols.set(name, data);
  }
  lookup(name) {
    if (this.symbols.has(name))
      return this.symbols.get(name);
    if (this.parent)
      return this.parent.lookup(name);
    return null;
  }
  lookupCurrent(name) {
    return this.symbols.has(name) ? this.symbols.get(name) : null;
  }
  hasAnyCtor() {
    for (const key of this.symbols.keys()) {
      if (typeof key === "string" && key.startsWith("__ctor_"))
        return true;
    }
    return false;
  }
}

class SemanticAnalyzer {
  constructor(ast) {
    this.ast = ast;
    this.globalScope = new Scope(null, "global");
    this.currentScope = this.globalScope;
    this.currentMethod = null;
    this.currentClass = null;
    this.errors = [];
    this.loopDepth = 0;
    this.switchDepth = 0;
    this.usingAliases = new Map;
    this.usingWildcards = [];
    this.specializedClasses = new Map;
    this.pendingSpecializations = [];
    this.specializedAstNodes = [];
    this.currentTypeParams = null;
  }
  pushError(msg, node) {
    if (node && typeof node.line === "number" && typeof node.column === "number") {
      this.errors.push(new SemanticError(msg, node.line, node.column, node._sourceFile));
    } else {
      this.errors.push(new SemanticError(msg));
    }
  }
  splitTypeArgs(s) {
    const parts = [];
    let depth = 0, cur = "";
    for (let i = 0;i < s.length; i++) {
      const c = s[i];
      if (c === "<")
        depth++;
      else if (c === ">") {
        if (i > 0 && s[i - 1] === "-") {
          cur += c;
          continue;
        }
        depth--;
      }
      if (c === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
        continue;
      }
      cur += c;
    }
    if (cur.trim())
      parts.push(cur.trim());
    return parts;
  }
  parseGenericType(typeStr) {
    if (typeof typeStr !== "string")
      return null;
    typeStr = typeStr.trim();
    if (isFnPtrType(typeStr))
      return null;
    const lt = typeStr.indexOf("<");
    if (lt === -1)
      return null;
    let depth = 0, end = -1;
    for (let i = lt;i < typeStr.length; i++) {
      const c = typeStr[i];
      if (c === "<")
        depth++;
      else if (c === ">") {
        if (i > 0 && typeStr[i - 1] === "-")
          continue;
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== typeStr.length - 1)
      return null;
    return {
      base: typeStr.slice(0, lt).trim(),
      args: this.splitTypeArgs(typeStr.slice(lt + 1, end))
    };
  }
  substituteType(typeStr, bindings) {
    if (!typeStr)
      return typeStr;
    typeStr = typeStr.trim();
    if (bindings.has(typeStr))
      return bindings.get(typeStr);
    if (typeStr.endsWith("[]"))
      return this.substituteType(typeStr.slice(0, -2), bindings) + "[]";
    if (typeStr.startsWith("fn(") && typeStr.includes(")->")) {
      const m = /^fn\(([^)]*)\)->(.+)$/.exec(typeStr);
      if (m) {
        const ps = m[1] === "" ? [] : m[1].split(",").map((p) => p.trim());
        return `fn(${ps.map((p) => this.substituteType(p, bindings)).join(",")})->${this.substituteType(m[2].trim(), bindings)}`;
      }
    }
    const g = this.parseGenericType(typeStr);
    if (g) {
      const newArgs = g.args.map((a) => this.substituteType(a, bindings));
      return `${g.base}<${newArgs.join(",")}>`;
    }
    return typeStr;
  }
  substituteAstNode(node, bindings) {
    if (node === null || node === undefined)
      return node;
    if (typeof node !== "object")
      return node;
    if (Array.isArray(node))
      return node.map((n) => this.substituteAstNode(n, bindings));
    const out = {};
    for (const key of Object.keys(node)) {
      if (key === "_sourceFile") {
        out[key] = node[key];
        continue;
      }
      const val = node[key];
      if (typeof val === "string" && (key === "type" || key === "returnType" || key === "targetType" || key === "elementType" || key === "className")) {
        out[key] = this.substituteType(val, bindings);
        continue;
      }
      if (key === "line" || key === "column" || key === "kind") {
        out[key] = val;
        continue;
      }
      if (val && typeof val === "object") {
        out[key] = this.substituteAstNode(val, bindings);
      } else {
        out[key] = val;
      }
    }
    if (out.base && typeof out.base === "object" && typeof out.base.name === "string") {
      out.base = { ...out.base, name: this.substituteType(out.base.name, bindings) };
    }
    if (out.kind === "ClassDecl") {
      out.typeParams = [];
      out.isSpecialized = true;
    }
    return out;
  }
  methodSig(name, paramCount, paramTypes) {
    return `${name}#${paramCount}#${paramTypes.join(",")}`;
  }
  lookupMethods(classSym, name) {
    const results = [];
    const seen = new Set;
    let cur = classSym;
    while (cur) {
      for (const [key, member] of cur.scope.symbols) {
        if (member.kind !== "MethodDecl")
          continue;
        if (typeof key === "string" && key.startsWith(name + "#")) {
          if (seen.has(key))
            continue;
          seen.add(key);
          results.push({ member, owner: cur });
        } else if (key === name) {
          if (seen.has("plain:" + name))
            continue;
          seen.add("plain:" + name);
          results.push({ member, owner: cur });
        }
      }
      cur = cur.baseRef;
    }
    return results;
  }
  lookupField(classSym, name) {
    let cur = classSym;
    while (cur) {
      const m = cur.scope.lookupCurrent(name);
      if (m && (m.kind === "FieldDecl" || m.kind === "ConstructorDecl" || m.kind === "DestructorDecl")) {
        return { member: m, owner: cur };
      }
      cur = cur.baseRef;
    }
    return null;
  }
  resolveOverload(candidates, argTypes) {
    const matching = candidates.filter((c) => {
      if (c.member.isVariadic)
        return true;
      if (c.member.paramCount !== argTypes.length)
        return false;
      for (let i = 0;i < argTypes.length; i++) {
        const at = argTypes[i];
        if (at === "error" || at === "any")
          continue;
        const pt = c.member.paramTypes[i] || "any";
        if (pt === "any")
          continue;
        if (!this.canAssignType(pt, at))
          return false;
      }
      return true;
    });
    if (matching.length === 0)
      return { status: "not-found" };
    if (matching.length === 1)
      return { status: "ok", candidate: matching[0] };
    const exact = matching.filter((c) => {
      if (c.member.isVariadic)
        return false;
      for (let i = 0;i < argTypes.length; i++) {
        const at = argTypes[i];
        const pt = c.member.paramTypes[i] || "any";
        if (at !== "any" && pt !== "any" && at !== pt)
          return false;
      }
      return true;
    });
    if (exact.length === 1)
      return { status: "ok", candidate: exact[0] };
    return { status: "ambiguous", candidates: exact.length ? exact : matching };
  }
  collectUsings(nodes) {
    for (const node of nodes) {
      if (node.kind === "UsingDecl") {
        if (node.isWildcard)
          this.usingWildcards.push(node.name);
        else {
          const shortName = node.parts[node.parts.length - 1];
          this.usingAliases.set(shortName, node.parts.join("::"));
        }
      } else if (node.kind === "NamespaceDecl") {
        this.collectUsings(node.body);
      }
    }
  }
  canAssignType(targetType, sourceType) {
    if (targetType === "any" || sourceType === "any")
      return true;
    if (targetType === "error" || sourceType === "error")
      return true;
    if (sourceType === "null")
      return true;
    if (targetType === sourceType)
      return true;
    if (this.parseGenericType(targetType) || this.parseGenericType(sourceType)) {
      const tg = this.parseGenericType(targetType);
      const sg = this.parseGenericType(sourceType);
      if (!tg || !sg)
        return false;
      if (tg.base !== sg.base)
        return false;
      if (tg.args.length !== sg.args.length)
        return false;
      for (let i = 0;i < tg.args.length; i++) {
        if (!this.canAssignType(tg.args[i], sg.args[i]) && !this.canAssignType(sg.args[i], tg.args[i]))
          return false;
      }
      return true;
    }
    const i32ish = (t) => t === "ptr" || t === "string" || t === "int";
    if (i32ish(targetType) && i32ish(sourceType))
      return true;
    if (isFnPtrType(targetType) && isFnPtrType(sourceType)) {
      const t = parseFnPtrType(targetType);
      const s = parseFnPtrType(sourceType);
      if (!t || !s)
        return false;
      if (t.ret !== s.ret)
        return false;
      if (t.params.length !== s.params.length)
        return false;
      for (let i = 0;i < t.params.length; i++) {
        if (t.params[i] !== s.params[i])
          return false;
      }
      return true;
    }
    if (isFnPtrType(targetType) || isFnPtrType(sourceType))
      return false;
    const tEnum = this.lookupEnumCanonical(targetType);
    const sEnum = this.lookupEnumCanonical(sourceType);
    if (tEnum !== null || sEnum !== null) {
      return tEnum !== null && sEnum !== null && tEnum === sEnum;
    }
    if (isArrayType(targetType) || isArrayType(sourceType))
      return false;
    if (targetType === "ptr" || sourceType === "ptr")
      return false;
    const ti = numInfo(targetType);
    const si = numInfo(sourceType);
    if (ti && si) {
      if (ti.isFloat)
        return true;
      if (si.isFloat)
        return false;
      if (ti.bits < si.bits)
        return false;
      if (si.signed && !ti.signed)
        return false;
      return true;
    }
    const tSym = this.lookupClassByFullName(this.resolveTypeName(targetType));
    const sSym = this.lookupClassByFullName(this.resolveTypeName(sourceType));
    if (tSym && tSym.kind === "ClassDecl" && sSym && sSym.kind === "ClassDecl") {
      return this.isSubclassOf(sSym, tSym);
    }
    return false;
  }
  lookupEnumCanonical(typeName) {
    if (typeof typeName !== "string")
      return null;
    if (isFnPtrType(typeName))
      return null;
    const resolved = this.resolveTypeName(typeName);
    const sym = this.lookupClassByFullName(resolved);
    if (sym && sym.kind === "EnumDecl")
      return sym.name;
    return null;
  }
  lookupClassByFullName(fullName) {
    if (typeof fullName !== "string")
      return null;
    if (isFnPtrType(fullName))
      return null;
    if (this.specializedClasses.has(fullName))
      return this.specializedClasses.get(fullName);
    const g = this.parseGenericType(fullName);
    if (g) {
      const base = this.resolveTypeName(g.base);
      const template = this.globalScope.lookup(base);
      if (template && template.kind === "ClassDecl" && template.isGeneric) {
        return this.ensureSpecializedClass(base, g.args);
      }
      return null;
    }
    if (this.usingAliases.has(fullName))
      fullName = this.usingAliases.get(fullName);
    if (!fullName.includes("::"))
      return this.globalScope.lookup(fullName);
    const parts = fullName.split("::");
    return this.resolveQualifiedFrom(this.globalScope, parts);
  }
  resolveQualifiedFrom(startScope, parts) {
    let sym = startScope.lookupCurrent(parts[0]);
    if (!sym)
      return null;
    for (let i = 1;i < parts.length; i++) {
      if (!sym.scope)
        return null;
      sym = sym.scope.lookupCurrent(parts[i]);
      if (!sym)
        return null;
    }
    return sym;
  }
  resolveQualified(parts) {
    let scope = this.currentScope;
    let sym = null;
    while (scope) {
      if (scope.symbols.has(parts[0])) {
        sym = scope.symbols.get(parts[0]);
        break;
      }
      scope = scope.parent;
    }
    if (!sym)
      return null;
    for (let i = 1;i < parts.length; i++) {
      if (!sym.scope)
        return null;
      sym = sym.scope.lookupCurrent(parts[i]);
      if (!sym)
        return null;
    }
    return sym;
  }
  resolveTypeName(name) {
    if (this.currentTypeParams && this.currentTypeParams.size > 0 && typeof name === "string") {
      let needsSub = false;
      for (const tp of this.currentTypeParams.keys()) {
        if (name.includes(tp)) {
          needsSub = true;
          break;
        }
      }
      if (needsSub)
        name = this.substituteType(name, this.currentTypeParams);
    }
    if (isFnPtrType(name))
      return name;
    if (BUILTIN_TYPES_NO_VOID.has(name) || name === "void" || name === "ptr" || name === "any" || name === "auto")
      return name;
    const g = this.parseGenericType(name);
    if (g) {
      const resolvedBase = this.usingAliases.get(g.base) ?? g.base;
      const resolvedArgs = g.args.map((a) => this.resolveTypeName(a));
      return `${resolvedBase}<${resolvedArgs.join(",")}>`;
    }
    if (this.usingAliases.has(name))
      return this.usingAliases.get(name);
    if (this.globalScope.lookup(name))
      return name;
    for (const ns of this.usingWildcards) {
      const candidate = `${ns}::${name}`;
      if (this.lookupClassByFullName(candidate))
        return candidate;
    }
    return name;
  }
  finalizeSpecializedSignatures(sym) {
    if (!sym || sym._signaturesDone)
      return;
    sym._signaturesDone = true;
    if (sym.baseName) {
      const parts = sym.baseName.split("::");
      let baseSym = parts.length === 1 ? this.resolveQualified(parts) : this.resolveQualifiedFrom(this.globalScope, parts);
      if (!baseSym)
        baseSym = this.lookupClassByFullName(sym.baseName);
      if (baseSym && baseSym.kind === "ClassDecl") {
        if (baseSym.isFinal) {
          this.pushError(`La clase '${sym.name}' no puede heredar de '${baseSym.name}' porque es 'final'.`, sym.node);
        } else {
          sym.baseRef = baseSym;
        }
      } else if (!baseSym) {
        this.pushError(`La clase base '${sym.baseName}' usada por '${sym.name}' no está declarada.`, sym.node);
      }
    }
    this.registerClassSignatures(sym.node, sym);
    sym.isEffectivelyAbstract = this.computeAbstractness(sym);
  }
  ensureSpecializedClass(baseName, args) {
    const key = `${baseName}<${args.join(",")}>`;
    if (this.specializedClasses.has(key))
      return this.specializedClasses.get(key);
    const template = this.globalScope.lookup(baseName);
    if (!template || template.kind !== "ClassDecl" || !template.isGeneric) {
      this.pushError(`'${baseName}' no es un tipo genérico.`, null);
      return null;
    }
    if ((template.typeParams || []).length !== args.length) {
      this.pushError(`'${baseName}' espera ${template.typeParams.length} argumento(s) de tipo, se pasaron ${args.length}.`, null);
      return null;
    }
    const resolvedArgs = args.map((a) => this.resolveTypeName(a));
    const bindings = new Map;
    for (let i = 0;i < template.typeParams.length; i++) {
      bindings.set(template.typeParams[i].name, resolvedArgs[i]);
    }
    for (let i = 0;i < template.typeParams.length; i++) {
      const tp = template.typeParams[i];
      if (tp.bound) {
        const boundType = this.substituteType(tp.bound, bindings);
        const argType = resolvedArgs[i];
        if (argType !== "any" && boundType !== "any" && !this.canAssignType(boundType, argType)) {
          this.pushError(`'${argType}' no satisface el bound '${tp.bound}' del parámetro '${tp.name}' en '${baseName}'.`, null);
        }
      }
    }
    const parentScope = template.scope && template.scope.parent || this.globalScope;
    const scope = new Scope(parentScope, "class");
    scope.fullName = key;
    const sym = {
      kind: "ClassDecl",
      name: key,
      shortName: key,
      isInterface: template.isInterface,
      isAbstract: false,
      isStruct: template.isStruct,
      isFinal: false,
      isEffectivelyAbstract: false,
      isGeneric: false,
      isSpecialized: true,
      templateBase: baseName,
      templateNode: template.node,
      typeArgs: resolvedArgs,
      typeParams: [],
      scope,
      baseRef: null,
      node: null,
      baseName: template.baseName ? this.substituteType(template.baseName, bindings) : null,
      baseVisibility: template.baseVisibility || null
    };
    const syntheticNode = this.substituteAstNode(template.node, bindings);
    syntheticNode.name = key;
    sym.node = syntheticNode;
    this.specializedAstNodes.push(syntheticNode);
    this.specializedClasses.set(key, sym);
    this.finalizeSpecializedSignatures(sym);
    this.pendingSpecializations.push(sym);
    return sym;
  }
  completeSpecializationAnalysis(sym) {
    if (!sym || sym._analyzed)
      return;
    sym._analyzed = true;
    if (sym.node) {
      this.analyzeClassBodies(sym.node, sym);
    }
  }
  getSpecializedNodes() {
    return this.specializedAstNodes;
  }
  seedBuiltins() {
    const method = (returnType, paramTypes) => ({
      kind: "MethodDecl",
      visibility: "public",
      isStatic: true,
      isVirtual: false,
      hasBody: true,
      returnType,
      paramCount: paramTypes.length,
      paramTypes
    });
    const variadic = (returnType) => ({
      kind: "MethodDecl",
      visibility: "public",
      isStatic: true,
      isVirtual: false,
      hasBody: true,
      returnType,
      paramCount: 0,
      paramTypes: [],
      isVariadic: true
    });
    const field = (type) => ({
      kind: "FieldDecl",
      visibility: "public",
      isStatic: true,
      type
    });
    const cls = (name, scope) => ({
      kind: "ClassDecl",
      name,
      shortName: name,
      isBuiltin: true,
      isInterface: false,
      isAbstract: false,
      isEffectivelyAbstract: false,
      isStruct: false,
      isFinal: false,
      scope,
      baseRef: null,
      node: null
    });
    const pointerScope = new Scope(this.globalScope, "class");
    pointerScope.define("read8", method("int", ["ptr"]));
    pointerScope.define("read16", method("int", ["ptr"]));
    pointerScope.define("read32", method("int", ["ptr"]));
    pointerScope.define("read64", method("int64", ["ptr"]));
    pointerScope.define("write8", method("void", ["ptr", "int"]));
    pointerScope.define("write16", method("void", ["ptr", "int"]));
    pointerScope.define("write32", method("void", ["ptr", "int"]));
    pointerScope.define("write64", method("void", ["ptr", "int64"]));
    pointerScope.define("offset", method("ptr", ["ptr", "int"]));
    pointerScope.define("isNull", method("bool", ["ptr"]));
    this.globalScope.define("pointer", cls("pointer", pointerScope));
    const memoryScope = new Scope(this.globalScope, "class");
    memoryScope.define("alloc", method("ptr", ["int"]));
    memoryScope.define("realloc", method("ptr", ["ptr", "int"]));
    memoryScope.define("free", method("void", ["ptr"]));
    memoryScope.define("copy", method("void", ["ptr", "ptr", "int"]));
    memoryScope.define("set", method("void", ["ptr", "int", "int"]));
    memoryScope.define("compare", method("int", ["ptr", "ptr", "int"]));
    this.globalScope.define("memory", cls("memory", memoryScope));
    const unsafeScope = new Scope(this.globalScope, "class");
    unsafeScope.define("pointer", field("pointer"));
    unsafeScope.define("memory", field("memory"));
    this.globalScope.define("Unsafe", cls("Unsafe", unsafeScope));
    const wasiScope = new Scope(this.globalScope, "class");
    wasiScope.define("write", method("void", ["string"]));
    wasiScope.define("writeLine", method("void", ["string"]));
    wasiScope.define("println", variadic("void"));
    wasiScope.define("flush", method("void", []));
    wasiScope.define("exit", method("void", ["int"]));
    wasiScope.define("readLine", method("string", []));
    wasiScope.define("readInt", method("int", []));
    wasiScope.define("Import", {
      kind: "MethodDecl",
      visibility: "public",
      isStatic: true,
      isVirtual: false,
      hasBody: true,
      returnType: "void",
      paramCount: 5,
      paramTypes: ["string", "string", "string", "any", "any"],
      isVariadic: true,
      isImportDirective: true
    });
    this.globalScope.define("__wasi_io", cls("__wasi_io", wasiScope));
    const systemScope = new Scope(this.globalScope, "class");
    systemScope.define("wasi", field("__wasi_io"));
    systemScope.define("write", method("void", ["string"]));
    systemScope.define("writeLine", method("void", ["string"]));
    systemScope.define("println", variadic("void"));
    systemScope.define("flush", method("void", []));
    systemScope.define("exit", method("void", ["int"]));
    systemScope.define("readLine", method("string", []));
    systemScope.define("readInt", method("int", []));
    this.globalScope.define("System", cls("System", systemScope));
    const mathScope = new Scope(this.globalScope, "class");
    mathScope.define("abs", method("double", ["double"]));
    mathScope.define("sqrt", method("double", ["double"]));
    mathScope.define("floor", method("double", ["double"]));
    mathScope.define("ceil", method("double", ["double"]));
    mathScope.define("round", method("double", ["double"]));
    mathScope.define("trunc", method("double", ["double"]));
    mathScope.define("min", method("double", ["double", "double"]));
    mathScope.define("max", method("double", ["double", "double"]));
    mathScope.define("copysign", method("double", ["double", "double"]));
    this.globalScope.define("Math", cls("Math", mathScope));
    const fileScope = new Scope(this.globalScope, "class");
    fileScope.define("readAll", method("string", ["string"]));
    fileScope.define("writeAll", method("bool", ["string", "string"]));
    fileScope.define("append", method("bool", ["string", "string"]));
    fileScope.define("exists", method("bool", ["string"]));
    this.globalScope.define("File", cls("File", fileScope));
  }
  analyze() {
    this.seedBuiltins();
    this.collectUsings(this.ast.body);
    this.registerScopes(this.ast.body, this.globalScope);
    const allClasses = [];
    this.collectClassSymbols(this.globalScope, allClasses);
    for (const sym of allClasses) {
      if (sym.isGeneric)
        continue;
      if (!sym.baseName)
        continue;
      const parts = sym.baseName.split("::");
      const baseSym = parts.length === 1 ? this.resolveQualified(parts) : this.resolveQualifiedFrom(this.globalScope, parts);
      const finalBase = baseSym || this.lookupClassByFullName(sym.baseName);
      if (!finalBase) {
        this.pushError(`La clase base '${sym.baseName}' usada por '${sym.name}' no está declarada.`, sym.node);
        continue;
      }
      if (finalBase.isFinal) {
        this.pushError(`La clase '${sym.name}' no puede heredar de '${finalBase.name}' porque '${finalBase.name}' es 'final'.`, sym.node);
        sym.baseRef = null;
        continue;
      }
      sym.baseRef = finalBase;
    }
    for (const sym of allClasses) {
      if (sym.isGeneric)
        continue;
      const visited = new Set;
      let cur = sym;
      while (cur) {
        if (visited.has(cur.name)) {
          this.pushError(`Ciclo de herencia detectado en la jerarquía de '${sym.name}'.`, sym.node);
          sym.baseRef = null;
          break;
        }
        visited.add(cur.name);
        cur = cur.baseRef;
      }
    }
    for (const sym of allClasses) {
      if (sym.isGeneric)
        continue;
      this.registerClassSignatures(sym.node, sym);
    }
    for (const sym of allClasses) {
      if (sym.isGeneric)
        continue;
      sym.isEffectivelyAbstract = this.computeAbstractness(sym);
    }
    for (const sym of allClasses) {
      if (sym.isGeneric)
        continue;
      this.analyzeClassBodies(sym.node, sym);
    }
    while (this.pendingSpecializations.length > 0) {
      const sym = this.pendingSpecializations.shift();
      this.completeSpecializationAnalysis(sym);
    }
    this.verifyEntryPoint();
    if (this.errors.length > 0) {
      const report = this.errors.map((err) => err.message).join(`
`);
      throw new Error(`
--- Errores Semánticos Encontrados (${this.errors.length}) ---
` + report);
    }
    return true;
  }
  registerScopes(nodes, scope) {
    for (const node of nodes) {
      if (node.kind === "NamespaceDecl") {
        const existing = scope.lookupCurrent(node.name);
        if (existing) {
          if (existing.kind === "NamespaceDecl" && existing.scope) {
            this.registerScopes(node.body, existing.scope);
            continue;
          }
          this.pushError(`'${node.name}' ya está declarado en este ámbito.`, node);
          continue;
        }
        const fullName = scope.kind === "global" ? node.name : `${scope.fullName}::${node.name}`;
        const nsScope = new Scope(scope, "namespace");
        nsScope.fullName = fullName;
        scope.define(node.name, {
          kind: "NamespaceDecl",
          name: fullName,
          shortName: node.name,
          scope: nsScope,
          node
        });
        this.registerScopes(node.body, nsScope);
      } else if (node.kind === "ClassDecl") {
        if (scope.lookupCurrent(node.name)) {
          this.pushError(`'${node.name}' ya está declarado en este ámbito.`, node);
          continue;
        }
        const fullName = scope.kind === "global" ? node.name : `${scope.fullName}::${node.name}`;
        const classScope = new Scope(scope, "class");
        classScope.fullName = fullName;
        const typeParams = node.typeParams || [];
        scope.define(node.name, {
          kind: "ClassDecl",
          name: fullName,
          shortName: node.name,
          isInterface: !!node.isInterface,
          isAbstract: !!node.isAbstract,
          isStruct: !!node.isStruct,
          isFinal: !!node.isFinal,
          isEffectivelyAbstract: !!node.isAbstract,
          isGeneric: typeParams.length > 0,
          typeParams,
          baseName: node.base?.name || null,
          baseVisibility: node.base?.visibility || null,
          scope: classScope,
          baseRef: null,
          node
        });
      } else if (node.kind === "EnumDecl") {
        if (scope.lookupCurrent(node.name)) {
          this.pushError(`'${node.name}' ya está declarado en este ámbito.`, node);
          continue;
        }
        const fullName = scope.kind === "global" ? node.name : `${scope.fullName}::${node.name}`;
        const members = new Map;
        let lastValue = 0;
        for (const m of node.members) {
          let v;
          if (m.valueExpr) {
            if (m.valueExpr.kind !== "NumberLiteral") {
              this.pushError(`El valor del miembro '${m.name}' del enum debe ser un literal numérico.`, m);
              v = 0;
            } else {
              v = (typeof m.valueExpr.value === "bigint" ? Number(m.valueExpr.value) : m.valueExpr.value) | 0;
            }
          } else {
            v = lastValue;
          }
          members.set(m.name, v);
          lastValue = v + 1;
        }
        scope.define(node.name, {
          kind: "EnumDecl",
          name: fullName,
          shortName: node.name,
          members,
          node
        });
      }
    }
  }
  collectClassSymbols(scope, out) {
    for (const [, sym] of scope.symbols) {
      if (sym.kind === "ClassDecl" && !sym.isBuiltin)
        out.push(sym);
      else if (sym.kind === "NamespaceDecl" && sym.scope)
        this.collectClassSymbols(sym.scope, out);
    }
  }
  verifyEntryPoint() {
    for (const [, sym] of this.globalScope.symbols) {
      if (sym.kind === "ClassDecl" && sym.scope && !sym.isBuiltin && !sym.isGeneric) {
        const hasMain = this.lookupMethods(sym, "main").some((c) => c.member.isStatic);
        if (hasMain)
          return;
      }
      if (sym.kind === "NamespaceDecl" && sym.scope) {
        if (this.findMainIn(sym.scope))
          return;
      }
    }
    for (const [, sym] of this.specializedClasses) {
      if (sym.scope) {
        const hasMain = this.lookupMethods(sym, "main").some((c) => c.member.isStatic);
        if (hasMain)
          return;
      }
    }
    this.pushError("No se encontró un punto de entrada 'static main(...)' en ninguna clase.");
  }
  findMainIn(scope) {
    for (const [, sym] of scope.symbols) {
      if (sym.kind === "ClassDecl" && sym.scope && !sym.isGeneric) {
        const hasMain = this.lookupMethods(sym, "main").some((c) => c.member.isStatic);
        if (hasMain)
          return true;
      }
      if (sym.kind === "NamespaceDecl" && sym.scope) {
        if (this.findMainIn(sym.scope))
          return true;
      }
    }
    return false;
  }
  computeAbstractness(classSym) {
    if (classSym.isInterface)
      return true;
    if (classSym.isAbstract)
      return true;
    let cur = classSym;
    const seen = new Set;
    while (cur) {
      if (seen.has(cur.name))
        break;
      seen.add(cur.name);
      for (const [key, member] of cur.scope.symbols) {
        if (member.kind !== "MethodDecl")
          continue;
        if (typeof key !== "string" || !key.includes("#"))
          continue;
        if (member.hasBody)
          continue;
        const impl = this.lookupMember(classSym, key);
        if (!impl || !impl.member.hasBody)
          return true;
      }
      cur = cur.baseRef;
    }
    return false;
  }
  registerClassSignatures(node, classSym) {
    for (const member of node.members) {
      if (member.kind === "MethodDecl") {
        const resolvedParamTypes = member.params.map((p) => this.resolveTypeName(p.type || "any"));
        const sig = this.methodSig(member.name, member.params.length, resolvedParamTypes);
        if (classSym.scope.lookupCurrent(sig)) {
          this.pushError(`El método '${member.name}' con esta firma ya está declarado en '${classSym.name}'.`, member);
          continue;
        }
        const baseCandidates = classSym.baseRef ? this.lookupMethods(classSym.baseRef, member.name).filter((c) => c.member.paramCount === member.params.length) : [];
        const baseFound = baseCandidates.length > 0 ? baseCandidates[0] : null;
        const baseIsMethod = baseFound !== null;
        if (member.isOverride) {
          if (!classSym.baseRef) {
            this.pushError(`El método '${member.name}' está marcado como 'override' pero '${classSym.name}' no tiene clase base.`, member);
          } else if (!baseIsMethod) {
            this.pushError(`'${member.name}' está marcado como 'override' pero la clase base '${classSym.baseRef.name}' no tiene un método con esa firma.`, member);
          } else if (!baseFound.member.isVirtual) {
            this.pushError(`'${member.name}' está marcado como 'override' pero '${baseFound.owner.name}.${member.name}' no es 'virtual'.`, member);
          }
        }
        const hasBody = !!member.body;
        const implicitVirtual = baseIsMethod && baseFound.member.isVirtual;
        const isVirtual = (member.isVirtual || implicitVirtual || !hasBody) && !member.isStatic;
        if (baseIsMethod && baseFound.member.returnType !== (member.returnType || "void")) {
          this.pushError(`El método '${member.name}' en '${classSym.name}' sobrescribe uno de '${baseFound.owner.name}' pero cambia el tipo de retorno.`, member);
        }
        classSym.scope.define(sig, {
          kind: "MethodDecl",
          visibility: member.visibility || "private",
          returnType: member.returnType || "void",
          isStatic: member.isStatic || false,
          isVirtual,
          hasBody,
          paramCount: member.params.length,
          paramTypes: resolvedParamTypes
        });
      } else if (member.kind === "FieldDecl") {
        if (classSym.scope.lookupCurrent(member.name)) {
          this.pushError(`El campo '${member.name}' ya está declarado en '${classSym.name}'.`, member);
        } else {
          classSym.scope.define(member.name, {
            kind: "FieldDecl",
            visibility: member.visibility || "private",
            isStatic: member.isStatic || false,
            isConst: member.isConst || false,
            type: member.type || "any"
          });
        }
      } else if (member.kind === "ConstructorDecl") {
        const types = member.params.map((p) => this.resolveTypeName(p.type || "any"));
        const key = `__ctor_${member.params.length}_${types.join(",")}`;
        if (classSym.scope.lookupCurrent(key)) {
          this.pushError(`'${classSym.name}' ya tiene un constructor con ${member.params.length} parámetro(s) de tipos (${types.join(", ")}).`, member);
        } else {
          classSym.scope.define(key, {
            kind: "ConstructorDecl",
            visibility: member.visibility || "private",
            paramCount: member.params.length,
            paramTypes: types
          });
        }
      } else if (member.kind === "DestructorDecl") {
        if (classSym.scope.lookupCurrent("__dtor")) {
          this.pushError(`'${classSym.name}' ya tiene un destructor.`, member);
        } else {
          classSym.scope.define("__dtor", {
            kind: "DestructorDecl",
            visibility: member.visibility || "private"
          });
        }
      }
    }
  }
  analyzeClassBodies(node, classSym) {
    const previousScope = this.currentScope;
    const previousClass = this.currentClass;
    const previousTypeParams = this.currentTypeParams;
    this.currentScope = classSym.scope;
    this.currentClass = { name: classSym.name, sym: classSym, scope: classSym.scope, node };
    this.currentTypeParams = null;
    for (const member of node.members) {
      if (member.kind === "MethodDecl") {
        if (member.body)
          this.analyzeMethodBody(member);
      } else if (member.kind === "FieldDecl")
        this.analyzeFieldInit(member);
      else if (member.kind === "ConstructorDecl")
        this.analyzeConstructorBody(node.name, member);
      else if (member.kind === "DestructorDecl")
        this.analyzeDestructorBody(node.name, member);
    }
    this.currentScope = previousScope;
    this.currentClass = previousClass;
    this.currentTypeParams = previousTypeParams;
  }
  lookupLocalOnly(name) {
    let scope = this.currentScope;
    while (scope && scope.kind !== "class" && scope.kind !== "global" && scope.kind !== "namespace") {
      if (scope.symbols.has(name))
        return scope.symbols.get(name);
      scope = scope.parent;
    }
    return null;
  }
  lookupMember(classSym, name) {
    let cur = classSym;
    while (cur) {
      const m = cur.scope.lookupCurrent(name);
      if (m)
        return { member: m, owner: cur };
      cur = cur.baseRef;
    }
    const methods = this.lookupMethods(classSym, name);
    if (methods.length > 0)
      return methods[0];
    return null;
  }
  isSubclassOf(sub, sup) {
    let cur = sub;
    while (cur) {
      if (cur === sup)
        return true;
      cur = cur.baseRef;
    }
    return false;
  }
  isAccessible(member, ownerSym) {
    const vis = member.visibility || "private";
    if (vis === "public")
      return true;
    if (!this.currentClass)
      return false;
    const fromSym = this.currentClass.sym;
    if (fromSym === ownerSym)
      return true;
    if (vis === "protected" && this.isSubclassOf(fromSym, ownerSym))
      return true;
    return false;
  }
  checkStaticAccess(member, memberName, node) {
    if (!this.currentMethod || !this.currentMethod.isStatic)
      return true;
    if (member.isStatic)
      return true;
    if (member.kind === "ConstructorDecl" || member.kind === "ClassDecl")
      return true;
    this.pushError(`No se puede acceder a '${memberName}' (no estático) desde el contexto estático ${this.describeContext()}.`, node);
    return false;
  }
  checkConstWrite(target, node) {
    if (!target)
      return true;
    const inCtor = this.currentMethod && this.currentMethod.isCtor;
    if (target.kind === "Identifier") {
      const local = this.lookupLocalOnly(target.name);
      if (local) {
        if (local.kind === "Capture") {
          this.pushError(`No se puede modificar '${target.name}': capturado por valor en lambda.`, node);
          return false;
        }
        if (local.isConst) {
          this.pushError(`No se puede modificar '${target.name}' porque es 'const'.`, node);
          return false;
        }
        return true;
      }
      if (this.currentClass) {
        const found = this.lookupField(this.currentClass.sym, target.name);
        if (found && found.member.isConst && !inCtor) {
          this.pushError(`No se puede modificar el campo 'const' '${target.name}' fuera del constructor.`, node);
          return false;
        }
      }
      return true;
    }
    if (target.kind === "MemberAccess") {
      const objClass = this.resolveObjectClass(target.object);
      if (objClass) {
        const found = this.lookupField(objClass.sym, target.property);
        if (found && found.member.isConst) {
          const isThis = target.object.kind === "ThisExpr";
          const isNonStatic = !found.member.isStatic;
          if (!(inCtor && isThis && isNonStatic)) {
            this.pushError(`No se puede modificar el campo 'const' '${target.property}'.`, node);
            return false;
          }
        }
      }
    }
    return true;
  }
  defaultCtorStatus(classSym) {
    let cur = classSym;
    while (cur) {
      let hasAnyCtorHere = false;
      let ctor0 = null;
      for (const [key, member] of cur.scope.symbols) {
        if (member.kind !== "ConstructorDecl")
          continue;
        hasAnyCtorHere = true;
        if (member.paramCount === 0) {
          ctor0 = member;
          break;
        }
      }
      if (hasAnyCtorHere) {
        if (!ctor0)
          return "missing";
        if (!this.isAccessible(ctor0, cur))
          return "inaccessible";
        return "ok";
      }
      cur = cur.baseRef;
    }
    return "ok";
  }
  describeContext() {
    if (this.currentClass && this.currentMethod) {
      return `'${this.currentClass.name}.${this.currentMethod.name}'`;
    }
    if (this.currentClass)
      return `'${this.currentClass.name}'`;
    return `el ámbito global`;
  }
  visitNode(node) {
    if (!node)
      return null;
    switch (node.kind) {
      case "Program":
        for (const c of node.body) {
          try {
            if (c.kind === "UsingDecl") {
              if (c.isWildcard)
                this.usingWildcards.push(c.name);
              else
                this.usingAliases.set(c.parts[c.parts.length - 1], c.parts.join("::"));
            } else {
              this.visitNode(c);
            }
          } catch (e) {
            this.errors.push(e);
          }
        }
        return null;
      case "NamespaceDecl":
        for (const c of node.body) {
          if (c.kind === "UsingDecl") {
            if (c.isWildcard)
              this.usingWildcards.push(c.name);
            else
              this.usingAliases.set(c.parts[c.parts.length - 1], c.parts.join("::"));
          } else
            this.visitNode(c);
        }
        return null;
      case "ClassDecl":
      case "EnumDecl":
        return null;
      case "MethodDecl":
        if (node.body)
          this.analyzeMethodBody(node);
        return null;
      case "ConstructorDecl":
      case "DestructorDecl":
        return null;
      case "FieldDecl":
        return this.analyzeFieldDecl(node);
      case "VarDecl":
        return this.analyzeVarDecl(node);
      case "ExprStatement":
        this.visitNode(node.expr);
        return null;
      case "If":
        return this.analyzeIf(node);
      case "While":
        return this.analyzeWhile(node);
      case "For":
        return this.analyzeFor(node);
      case "Switch":
        return this.analyzeSwitch(node);
      case "BeginEnd":
        return this.analyzeBeginEnd(node);
      case "Return":
        return this.analyzeReturn(node);
      case "Delete":
        return this.analyzeDelete(node);
      case "Break":
        return this.analyzeBreak(node);
      case "Continue":
        return this.analyzeContinue(node);
      case "BinaryOp":
        return this.analyzeBinaryOp(node);
      case "UnaryOp":
        return this.analyzeUnaryOp(node);
      case "Ternary":
        return this.analyzeTernary(node);
      case "CastExpr":
        return this.analyzeCastExpr(node);
      case "IncrementExpr":
        return this.analyzeIncrementExpr(node);
      case "AddressOfExpr":
        return this.analyzeAddressOfExpr(node);
      case "Assignment":
        return this.analyzeAssignment(node);
      case "CompoundAssignment":
        return this.analyzeCompoundAssignment(node);
      case "Call":
        return this.analyzeCall(node);
      case "MemberAccess":
        return this.analyzeMemberAccess(node);
      case "IndexExpr":
        return this.analyzeIndexExpr(node);
      case "ThisExpr":
        return this.analyzeThisExpr(node);
      case "SuperCall":
        return this.analyzeSuperCall(node);
      case "NewExpr":
        return this.analyzeNewExpr(node);
      case "NewArrayExpr":
        return this.analyzeNewArrayExpr(node);
      case "Identifier":
        return this.analyzeIdentifierUse(node);
      case "QualifiedName":
        return this.analyzeQualifiedName(node);
      case "LambdaExpr":
        return this.analyzeLambdaExpr(node);
      case "ArrayLiteral":
        return "any";
      case "NullLiteral":
        return "null";
      case "StringLiteral":
        return "string";
      case "BooleanLiteral":
        return "bool";
      case "NumberLiteral":
        if (typeof node.value === "bigint") {
          if (node.isUnsigned)
            return "uint64";
          if (node.value >= 0n && node.value <= 9223372036854775807n)
            return "int64";
          if (node.value >= 0n && node.value <= 18446744073709551615n)
            return "uint64";
          return "int64";
        }
        if (Number.isInteger(node.value)) {
          if (node.isUnsigned) {
            if (node.value >= 0 && node.value <= 4294967295)
              return "uint32";
            return "uint64";
          }
          if (node.value >= -2147483648 && node.value <= 2147483647)
            return "int";
          if (node.value >= 0 && node.value <= 4294967295)
            return "uint32";
          return "int64";
        }
        return node.isFloat32 ? "float" : "double";
      default:
        return null;
    }
  }
  analyzeFieldDecl(node) {
    return node.type || "any";
  }
  analyzeFieldInit(node) {
    if (!node.value)
      return;
    const sym = this.currentScope.lookupCurrent(node.name);
    let declaredType = sym ? sym.type : node.type || "any";
    const valueType = this.visitNode(node.value);
    if (declaredType === "auto") {
      declaredType = valueType === "error" ? "any" : valueType;
      if (sym)
        sym.type = declaredType;
      return;
    }
    if (valueType && valueType !== "error" && !this.canAssignType(declaredType, valueType)) {
      this.pushError(`No se puede inicializar el campo '${node.name}' de tipo '${declaredType}' con un valor de tipo '${valueType}'.`, node);
    }
  }
  analyzeMethodBody(node) {
    const methodScope = new Scope(this.currentScope, "method");
    const previousScope = this.currentScope;
    const previousMethod = this.currentMethod;
    const prevLoop = this.loopDepth;
    const prevSwitch = this.switchDepth;
    this.currentScope = methodScope;
    this.currentMethod = { name: node.name, returnType: node.returnType || "void", isStatic: node.isStatic || false };
    this.loopDepth = 0;
    this.switchDepth = 0;
    try {
      for (const param of node.params) {
        if (methodScope.lookupCurrent(param.name)) {
          this.pushError(`El parámetro '${param.name}' ya está definido en el método '${node.name}'.`, node);
        } else {
          methodScope.define(param.name, {
            kind: "Parameter",
            type: param.type || "any",
            isConst: param.isConst || false
          });
        }
      }
      if (node.body)
        this.visitNode(node.body);
    } finally {
      this.currentScope = previousScope;
      this.currentMethod = previousMethod;
      this.loopDepth = prevLoop;
      this.switchDepth = prevSwitch;
    }
  }
  analyzeConstructorBody(className, node) {
    const methodScope = new Scope(this.currentScope, "method");
    const previousScope = this.currentScope;
    const previousMethod = this.currentMethod;
    const prevLoop = this.loopDepth;
    const prevSwitch = this.switchDepth;
    const ctorMethod = { name: className, returnType: "void", isStatic: false, isCtor: true, superCallSeen: false };
    this.currentScope = methodScope;
    this.currentMethod = ctorMethod;
    this.loopDepth = 0;
    this.switchDepth = 0;
    try {
      for (const param of node.params) {
        if (methodScope.lookupCurrent(param.name)) {
          this.pushError(`El parámetro '${param.name}' ya está definido en el constructor '${className}'.`, node);
        } else {
          methodScope.define(param.name, {
            kind: "Parameter",
            type: param.type || "any",
            isConst: param.isConst || false
          });
        }
      }
      if (node.body)
        this.visitNode(node.body);
      const baseSym = this.currentClass?.sym.baseRef;
      if (baseSym && !baseSym.isInterface && !ctorMethod.superCallSeen) {
        const status = this.defaultCtorStatus(baseSym);
        if (status === "missing") {
          this.pushError(`El constructor de '${className}' debe llamar explícitamente a 'super(...)' porque '${baseSym.name}' no tiene un constructor por defecto.`, node);
        } else if (status === "inaccessible") {
          this.pushError(`El constructor por defecto de '${baseSym.name}' no es accesible desde '${className}'.`, node);
        }
      }
    } finally {
      this.currentScope = previousScope;
      this.currentMethod = previousMethod;
      this.loopDepth = prevLoop;
      this.switchDepth = prevSwitch;
    }
  }
  analyzeDestructorBody(className, node) {
    const methodScope = new Scope(this.currentScope, "method");
    const previousScope = this.currentScope;
    const previousMethod = this.currentMethod;
    const prevLoop = this.loopDepth;
    const prevSwitch = this.switchDepth;
    this.currentScope = methodScope;
    this.currentMethod = { name: `~${className}`, returnType: "void", isStatic: false, isDtor: true };
    this.loopDepth = 0;
    this.switchDepth = 0;
    try {
      if (node.body)
        this.visitNode(node.body);
    } finally {
      this.currentScope = previousScope;
      this.currentMethod = previousMethod;
      this.loopDepth = prevLoop;
      this.switchDepth = prevSwitch;
    }
  }
  analyzeVarDecl(node) {
    const name = node.name;
    if (this.currentScope.lookupCurrent(name)) {
      this.pushError(`La variable local '${name}' ya ha sido declarada en este ámbito.`, node);
      return node.type || "any";
    }
    let declaredType = node.type || "any";
    if (declaredType === "auto") {
      if (!node.value) {
        this.pushError(`La variable '${name}' declarada con 'auto' requiere un inicializador.`, node);
        this.currentScope.define(name, { kind: "VarDecl", type: "any", isConst: node.isConst || false });
        return "any";
      }
      const valueType = this.visitNode(node.value);
      declaredType = valueType === "error" ? "any" : valueType;
      this.currentScope.define(name, { kind: "VarDecl", type: declaredType, isConst: node.isConst || false });
      return declaredType;
    }
    if (this.parseGenericType(declaredType)) {
      const inst = this.lookupClassByFullName(this.resolveTypeName(declaredType));
      if (!inst) {
        this.pushError(`El tipo genérico '${declaredType}' no se puede instanciar.`, node);
      }
    }
    if (isFnPtrType(declaredType)) {
      const fp = parseFnPtrType(declaredType);
      if (!fp) {
        this.pushError(`Tipo '${declaredType}' inválido.`, node);
      }
    } else if (!BUILTIN_TYPES_NO_VOID.has(declaredType) && declaredType !== "ptr" && !declaredType.startsWith("void") && !this.parseGenericType(declaredType)) {
      const stripped = declaredType.split("[")[0];
      const resolvedName = this.resolveTypeName(stripped);
      const resolved = this.lookupClassByFullName(resolvedName);
      if (!resolved && !BUILTIN_TYPES_NO_VOID.has(stripped) && stripped !== "ptr") {
        this.pushError(`El tipo '${stripped}' no está declarado.`, node);
      }
    }
    this.currentScope.define(name, { kind: "VarDecl", type: declaredType, isConst: node.isConst || false });
    if (!node.value && !declaredType.endsWith("[]") && !isFnPtrType(declaredType)) {
      const sym = this.lookupClassByFullName(this.resolveTypeName(declaredType));
      if (sym && sym.kind === "ClassDecl" && !sym.isStruct) {
        const status = this.defaultCtorStatus(sym);
        if (status === "missing") {
          this.pushError(`No se puede declarar '${name}' de tipo '${declaredType}' sin inicializar: la clase no tiene constructor sin argumentos.`, node);
        } else if (status === "inaccessible") {
          this.pushError(`El constructor por defecto de '${declaredType}' no es accesible desde ${this.describeContext()}.`, node);
        }
      }
    }
    if (node.value) {
      const valueType = this.visitNode(node.value);
      if (valueType && valueType !== "error" && !this.canAssignType(declaredType, valueType)) {
        this.pushError(`No se puede inicializar '${name}' de tipo '${declaredType}' con un valor de tipo '${valueType}'.`, node);
      }
    }
    return declaredType;
  }
  analyzeIf(node) {
    for (const branch of node.branches) {
      const condType = this.visitNode(branch.condition);
      if (condType && condType !== "error" && condType !== "bool" && condType !== "any") {
        this.pushError(`La condición del 'if' debe ser de tipo 'bool', se obtuvo '${condType}'.`, branch.condition);
      }
      this.currentScope = new Scope(this.currentScope, "block");
      this.visitNode(branch.thenStmt);
      this.currentScope = this.currentScope.parent;
    }
    if (node.elseStmt) {
      this.currentScope = new Scope(this.currentScope, "block");
      this.visitNode(node.elseStmt);
      this.currentScope = this.currentScope.parent;
    }
    return null;
  }
  analyzeWhile(node) {
    const condType = this.visitNode(node.condition);
    if (condType && condType !== "error" && condType !== "bool" && condType !== "any") {
      this.pushError(`La condición del 'while' debe ser de tipo 'bool', se obtuvo '${condType}'.`, node.condition);
    }
    this.currentScope = new Scope(this.currentScope, "block");
    this.loopDepth++;
    try {
      this.visitNode(node.body);
    } finally {
      this.loopDepth--;
      this.currentScope = this.currentScope.parent;
    }
    return null;
  }
  analyzeFor(node) {
    this.currentScope = new Scope(this.currentScope, "block");
    this.loopDepth++;
    try {
      if (node.init)
        this.visitNode(node.init);
      if (node.condition) {
        const condType = this.visitNode(node.condition);
        if (condType && condType !== "error" && condType !== "bool" && condType !== "any") {
          this.pushError(`La condición del 'for' debe ser de tipo 'bool', se obtuvo '${condType}'.`, node.condition);
        }
      }
      if (node.update)
        this.visitNode(node.update);
      this.visitNode(node.body);
    } finally {
      this.loopDepth--;
      this.currentScope = this.currentScope.parent;
    }
    return null;
  }
  analyzeSwitch(node) {
    const exprType = this.visitNode(node.expr);
    const exprSym = exprType ? this.lookupClassByFullName(this.resolveTypeName(exprType)) : null;
    const exprIsEnum = exprSym && exprSym.kind === "EnumDecl";
    if (exprType && exprType !== "error" && exprType !== "any" && !SWITCHABLE_TYPES.has(exprType) && !exprIsEnum) {
      this.pushError(`La expresión de 'switch' debe ser de tipo integral, 'bool', 'string' o enum, se obtuvo '${exprType}'.`, node.expr);
    }
    const seenLiterals = new Set;
    let defaultSeen = false;
    this.switchDepth++;
    try {
      for (const c of node.cases) {
        if (c.values === null) {
          if (defaultSeen)
            this.pushError(`Múltiples 'default' en el mismo 'switch'.`, c);
          defaultSeen = true;
        } else {
          for (const v of c.values) {
            const vType = this.visitNode(v);
            if (exprType !== "any" && vType !== "error" && vType !== "any") {
              if (!this.canAssignType(exprType, vType) && !this.canAssignType(vType, exprType)) {
                this.pushError(`El 'case' de tipo '${vType}' no es compatible con el 'switch' de tipo '${exprType}'.`, v);
              }
            }
            const k = v.kind;
            if (k === "NumberLiteral" || k === "StringLiteral" || k === "BooleanLiteral") {
              const key = `${k}:${JSON.stringify(typeof v.value === "bigint" ? v.value.toString() : v.value)}`;
              if (seenLiterals.has(key))
                this.pushError(`Valor de 'case' duplicado: ${JSON.stringify(v.value)}.`, v);
              seenLiterals.add(key);
            }
          }
        }
        this.currentScope = new Scope(this.currentScope, "block");
        try {
          for (const stmt of c.statements)
            this.visitNode(stmt);
        } finally {
          this.currentScope = this.currentScope.parent;
        }
      }
    } finally {
      this.switchDepth--;
    }
    return null;
  }
  analyzeBeginEnd(node) {
    this.currentScope = new Scope(this.currentScope, "block");
    for (const stmt of node.statements)
      this.visitNode(stmt);
    this.currentScope = this.currentScope.parent;
    return null;
  }
  analyzeBreak(node) {
    if (this.loopDepth === 0 && this.switchDepth === 0) {
      this.pushError(`'break' solo puede usarse dentro de un bucle o de un 'switch'.`, node);
    }
    return null;
  }
  analyzeContinue(node) {
    if (this.loopDepth === 0)
      this.pushError(`'continue' solo puede usarse dentro de un bucle.`, node);
    return null;
  }
  analyzeReturn(node) {
    const exprType = node.expr ? this.visitNode(node.expr) : null;
    const method = this.currentMethod;
    if (!method)
      return null;
    if (method.isCtor || method.isDtor) {
      if (node.expr && exprType !== "error") {
        const kind = method.isCtor ? "constructor" : "destructor";
        this.pushError(`El ${kind} '${method.name}' no puede retornar un valor.`, node);
      }
      return null;
    }
    if (method.returnType === "void") {
      if (node.expr && exprType !== "error") {
        this.pushError(`El método '${method.name}' es de tipo 'void' pero retorna un valor de tipo '${exprType}'.`, node);
      }
    } else if (method.returnType === "any") {
      if (node.expr && exprType && exprType !== "error" && exprType !== "any") {
        if (!method._inferredReturn)
          method._inferredReturn = exprType;
      }
    } else {
      if (!node.expr) {
        this.pushError(`El método '${method.name}' debe retornar un valor de tipo '${method.returnType}'.`, node);
      } else if (exprType !== "error" && !this.canAssignType(method.returnType, exprType)) {
        this.pushError(`El método '${method.name}' debe retornar '${method.returnType}', pero se retornó '${exprType}'.`, node);
      }
    }
    return null;
  }
  analyzeDelete(node) {
    this.resolveLValueType(node.target);
    return null;
  }
  resolveLValueType(target) {
    if (target.kind === "Identifier") {
      const local = this.lookupLocalOnly(target.name);
      if (local) {
        if (local.kind === "ClassDecl")
          return local.name;
        return local.type || "any";
      }
      if (this.currentClass) {
        const found = this.lookupField(this.currentClass.sym, target.name);
        if (found) {
          if (!this.isAccessible(found.member, found.owner)) {
            this.pushError(`El miembro '${target.name}' de la clase '${found.owner.name}' es '${found.member.visibility || "private"}' y no es accesible desde ${this.describeContext()}.`, target);
            return "error";
          }
          if (!this.checkStaticAccess(found.member, target.name, target))
            return "error";
          return found.member.type || "any";
        }
      }
      this.pushError(`'${target.name}' no ha sido declarado.`, target);
      return "error";
    }
    if (target.kind === "MemberAccess") {
      if (target.object.kind === "Identifier") {
        let nm = target.object.name;
        if (this.usingAliases.has(nm))
          nm = this.usingAliases.get(nm);
        const es = this.resolveQualified([nm]) || this.resolveQualifiedFrom(this.globalScope, [nm]);
        if (es && es.kind === "EnumDecl") {
          this.pushError(`No se puede asignar a '${target.object.name}.${target.property}': es un miembro de enum (constante).`, target);
          return "error";
        }
      }
      return this.analyzeMemberAccess(target);
    }
    if (target.kind === "IndexExpr")
      return this.analyzeIndexExpr(target);
    if (target.kind === "QualifiedName")
      return this.analyzeQualifiedName(target);
    this.pushError(`Expresión no asignable.`, target);
    return "error";
  }
  analyzeAssignment(node) {
    if (!this.checkConstWrite(node.target, node.target))
      return "error";
    const targetType = this.resolveLValueType(node.target);
    if (targetType === "error") {
      this.visitNode(node.expr);
      return "error";
    }
    const valueType = this.visitNode(node.expr);
    if (valueType && valueType !== "error" && !this.canAssignType(targetType, valueType)) {
      this.pushError(`No se puede asignar '${valueType}' a un lvalue de tipo '${targetType}'.`, node.target);
      return "error";
    }
    return targetType;
  }
  analyzeCompoundAssignment(node) {
    if (!this.checkConstWrite(node.target, node.target))
      return "error";
    const targetType = this.resolveLValueType(node.target);
    if (targetType === "error") {
      this.visitNode(node.expr);
      return "error";
    }
    const valueType = this.visitNode(node.expr);
    if (valueType === "error")
      return "error";
    const resultType = this.applyBinaryOp(node.binOp, targetType, valueType, node);
    if (resultType === "error")
      return "error";
    if (resultType !== "any" && !this.canAssignType(targetType, resultType)) {
      this.pushError(`El resultado de '${node.op}' es de tipo '${resultType}', que no es asignable al lvalue de tipo '${targetType}'.`, node.target);
      return "error";
    }
    return targetType;
  }
  analyzeAddressOfExpr(node) {
    this.resolveLValueType(node.target);
    return "ptr";
  }
  analyzeIndexExpr(node) {
    const arrType = this.visitNode(node.array);
    const idxType = this.visitNode(node.index);
    if (arrType === "error" || idxType === "error")
      return "error";
    if (arrType === "any")
      return "any";
    if (!isArrayType(arrType)) {
      this.pushError(`No se puede indexar un valor de tipo '${arrType}'; se esperaba un array.`, node);
      return "error";
    }
    if (!INTEGER_TYPES.has(idxType) && idxType !== "any") {
      this.pushError(`El índice de un array debe ser entero, se obtuvo '${idxType}'.`, node.index);
    }
    return elementType(arrType);
  }
  analyzeThisExpr(node) {
    if (!this.currentClass) {
      this.pushError(`'this' solo puede usarse dentro de un método de una clase.`, node);
      return "error";
    }
    if (this.currentMethod && (this.currentMethod.isStatic || this.currentMethod.name === "<lambda>")) {
      this.pushError(`'this' no puede usarse dentro de un método 'static' o lambda (${this.describeContext()}).`, node);
      return "error";
    }
    return this.currentClass.name;
  }
  analyzeSuperCall(node) {
    for (const a of node.args)
      this.visitNode(a);
    if (!this.currentMethod || !this.currentMethod.isCtor) {
      this.pushError(`'super(...)' solo puede usarse dentro de un constructor.`, node);
      return "void";
    }
    if (!this.currentClass || !this.currentClass.sym.baseRef) {
      this.pushError(`La clase '${this.currentClass?.name ?? "?"}' no tiene clase base, no se puede llamar a 'super(...)'.`, node);
      return "void";
    }
    const baseSym = this.currentClass.sym.baseRef;
    if (baseSym.isInterface) {
      this.pushError(`'${baseSym.name}' es una interface y no tiene constructores.`, node);
      return "void";
    }
    if (this.currentMethod.superCallSeen) {
      this.pushError(`Ya se ha llamado a 'super(...)' previamente en este constructor.`, node);
      return "void";
    }
    this.currentMethod.superCallSeen = true;
    const argTypes = node.args.map((a) => this.visitNode(a));
    if (argTypes.some((t) => t === "error"))
      return "void";
    const candidates = [];
    for (const [key, member] of baseSym.scope.symbols) {
      if (member.kind === "ConstructorDecl" && member.paramCount === node.args.length) {
        candidates.push({ member, owner: baseSym });
      }
    }
    const resolved = this.resolveOverload(candidates, argTypes);
    if (resolved.status !== "ok") {
      this.pushError(`La clase base '${baseSym.name}' no tiene un constructor compatible con (${argTypes.join(", ")})${resolved.status === "ambiguous" ? " — llamada ambigua" : ""}.`, node);
      return "void";
    }
    if (!this.isAccessible(resolved.candidate.member, baseSym)) {
      this.pushError(`El constructor de '${baseSym.name}' es '${resolved.candidate.member.visibility}' y no es accesible desde ${this.describeContext()}.`, node);
      return "void";
    }
    return "void";
  }
  resolveObjectClass(objectExpr) {
    if (objectExpr.kind === "ThisExpr") {
      if (!this.currentClass)
        return null;
      if (this.currentMethod && this.currentMethod.isStatic) {
        this.pushError(`'this' no puede usarse dentro de un método 'static' (${this.describeContext()}).`, objectExpr);
        return null;
      }
      return { className: this.currentClass.name, sym: this.currentClass.sym };
    }
    if (objectExpr.kind === "Identifier") {
      const local = this.lookupLocalOnly(objectExpr.name);
      if (local) {
        const typeName = local.kind === "ClassDecl" ? local.name : local.type || "any";
        if (typeName && typeName !== "any" && typeName !== "error") {
          const classSym = this.lookupClassByFullName(this.resolveTypeName(typeName));
          if (classSym && classSym.kind === "ClassDecl") {
            return { className: classSym.name, sym: classSym };
          }
        }
        return null;
      }
      if (this.currentClass) {
        const found = this.lookupField(this.currentClass.sym, objectExpr.name);
        if (found) {
          const typeName = found.member.type || "any";
          if (typeName && typeName !== "any" && typeName !== "error") {
            const classSym = this.lookupClassByFullName(this.resolveTypeName(typeName));
            if (classSym && classSym.kind === "ClassDecl") {
              return { className: classSym.name, sym: classSym };
            }
          }
          return null;
        }
      }
    }
    let objType = null;
    if (objectExpr.kind === "Identifier") {
      let name = objectExpr.name;
      if (this.usingAliases.has(name))
        name = this.usingAliases.get(name);
      else if (!name.includes("::")) {
        for (const ns of this.usingWildcards) {
          const candidate = `${ns}::${name}`;
          if (this.lookupClassByFullName(candidate)) {
            name = candidate;
            break;
          }
        }
      }
      objType = name;
    } else {
      objType = this.visitNode(objectExpr);
    }
    if (objType === "error")
      return null;
    const classSym = this.lookupClassByFullName(objType);
    if (!classSym || classSym.kind !== "ClassDecl")
      return null;
    return { className: objType, sym: classSym };
  }
  analyzeMemberAccess(node) {
    if (node.property === "length") {
      const objType = this.visitNode(node.object);
      if (objType === "string" || isArrayType(objType))
        return "int";
      if (objType === "error")
        return "error";
    }
    if (node.object.kind === "Identifier" && !this.lookupLocalOnly(node.object.name)) {
      let nsName = node.object.name;
      if (this.usingAliases.has(nsName))
        nsName = this.usingAliases.get(nsName);
      const nsSym = this.currentScope.lookup(nsName) || this.globalScope.lookup(nsName);
      if (nsSym && nsSym.kind === "NamespaceDecl" && nsSym.scope) {
        const inner = nsSym.scope.lookupCurrent(node.property);
        if (!inner) {
          this.pushError(`El namespace '${node.object.name}' no tiene el miembro '${node.property}'.`, node);
          return "error";
        }
        if (inner.kind === "ClassDecl" || inner.kind === "EnumDecl" || inner.kind === "NamespaceDecl") {
          return inner.name;
        }
        if (inner.kind === "MethodDecl")
          return inner.returnType || "any";
        if (inner.kind === "FieldDecl")
          return inner.type || "any";
      }
    }
    if (node.object.kind === "Identifier") {
      let name = node.object.name;
      if (this.usingAliases.has(name))
        name = this.usingAliases.get(name);
      const enumSym = this.resolveQualified([name]) || this.resolveQualifiedFrom(this.globalScope, [name]);
      if (enumSym && enumSym.kind === "EnumDecl") {
        if (!enumSym.members.has(node.property)) {
          this.pushError(`El enum '${enumSym.name}' no tiene el miembro '${node.property}'.`, node);
          return "error";
        }
        return enumSym.name;
      }
    }
    const objClass = this.resolveObjectClass(node.object);
    if (!objClass) {
      if (node.object.kind === "ThisExpr")
        return "error";
      const objType = this.visitNode(node.object);
      if (objType !== "error") {
        this.pushError(`El tipo '${objType}' no es una clase, no se puede acceder al miembro '${node.property}'.`, node);
      }
      return "error";
    }
    const found = this.lookupField(objClass.sym, node.property);
    if (!found) {
      this.pushError(`La clase '${objClass.className}' no tiene un miembro llamado '${node.property}'.`, node);
      return "error";
    }
    if (!this.isAccessible(found.member, found.owner)) {
      this.pushError(`El miembro '${node.property}' de la clase '${found.owner.name}' es '${found.member.visibility || "private"}' y no es accesible desde ${this.describeContext()}.`, node);
      return "error";
    }
    return found.member.type || "any";
  }
  analyzeCall(node) {
    const callee = node.callee;
    const args = node.args || [];
    if (callee.kind === "MemberAccess" && callee.property === "Import" && callee.object.kind === "MemberAccess" && callee.object.property === "wasi" && callee.object.object.kind === "Identifier" && callee.object.object.name === "System") {
      return this.analyzeImportDirective(args, node);
    }
    const argTypes = args.map((a) => this.visitNode(a));
    if (argTypes.some((t) => t === "error"))
      return "error";
    if (callee.kind === "QualifiedName") {
      const sym = this.resolveQualified(callee.parts) || this.resolveQualifiedFrom(this.globalScope, callee.parts);
      if (!sym) {
        this.pushError(`Llamada a '${callee.parts.join("::")}()' no declarada.`, callee);
        return "error";
      }
      if (sym.kind !== "MethodDecl") {
        this.pushError(`'${callee.parts.join("::")}' no es un método o función.`, callee);
        return "error";
      }
      if (!sym.isVariadic && sym.paramCount !== undefined && sym.paramCount !== args.length) {
        this.pushError(`'${callee.parts.join("::")}' espera ${sym.paramCount} argumento(s), se pasaron ${args.length}.`, node);
      }
      return sym.returnType || "any";
    }
    if (callee.kind === "Identifier") {
      const local = this.lookupLocalOnly(callee.name);
      if (local && isFnPtrType(local.type)) {
        const fp = parseFnPtrType(local.type);
        if (!fp) {
          this.pushError(`Tipo '${local.type}' inválido.`, callee);
          return "error";
        }
        if (fp.params.length !== args.length) {
          this.pushError(`'${callee.name}' espera ${fp.params.length} argumento(s), se pasaron ${args.length}.`, node);
          return "error";
        }
        for (let i = 0;i < args.length; i++) {
          if (argTypes[i] !== "error" && !this.canAssignType(fp.params[i], argTypes[i])) {
            this.pushError(`Argumento ${i + 1} de '${callee.name}': esperaba '${fp.params[i]}', se pasó '${argTypes[i]}'.`, args[i]);
          }
        }
        return fp.ret;
      }
      if (local) {
        this.pushError(`'${callee.name}' no es un método o función.`, callee);
        return "error";
      }
      const candidates = [];
      if (this.currentClass) {
        candidates.push(...this.lookupMethods(this.currentClass.sym, callee.name));
      }
      const globalFn = this.globalScope.lookupCurrent(callee.name);
      if (globalFn && globalFn.kind === "MethodDecl") {
        candidates.push({ member: globalFn, owner: null });
      }
      if (candidates.length === 0) {
        this.pushError(`Llamada a '${callee.name}()' no declarada.`, callee);
        return "error";
      }
      const resolved = this.resolveOverload(candidates, argTypes);
      if (resolved.status === "not-found") {
        this.pushError(`No hay sobrecarga de '${callee.name}' compatible con (${argTypes.join(", ")}).`, node);
        return "error";
      }
      if (resolved.status === "ambiguous") {
        this.pushError(`Llamada a '${callee.name}' ambigua: múltiples sobrecargas compatibles.`, node);
        return "error";
      }
      const m = resolved.candidate.member;
      if (resolved.candidate.owner) {
        if (!this.isAccessible(m, resolved.candidate.owner)) {
          this.pushError(`El método '${callee.name}' de '${resolved.candidate.owner.name}' es '${m.visibility || "private"}' y no es accesible desde ${this.describeContext()}.`, callee);
          return "error";
        }
        if (!this.checkStaticAccess(m, callee.name, callee))
          return "error";
        node._resolvedMethodSig = this.methodSig(callee.name, m.paramCount, m.paramTypes);
        node._resolvedMethodClass = resolved.candidate.owner.name;
      } else {
        node._resolvedMethodSig = null;
        node._resolvedMethodClass = null;
      }
      return m.returnType || "any";
    }
    if (callee.kind === "MemberAccess") {
      const objClass = this.resolveObjectClass(callee.object);
      if (!objClass) {
        if (callee.object.kind === "ThisExpr")
          return "error";
        const objType = this.visitNode(callee.object);
        if (objType !== "error") {
          this.pushError(`El tipo '${objType}' no es una clase, no se puede llamar '${callee.property}()'.`, callee);
        }
        return "error";
      }
      const candidates = this.lookupMethods(objClass.sym, callee.property);
      if (candidates.length === 0) {
        this.pushError(`La clase '${objClass.className}' no tiene un método '${callee.property}()'.`, callee);
        return "error";
      }
      const resolved = this.resolveOverload(candidates, argTypes);
      if (resolved.status === "not-found") {
        this.pushError(`No hay sobrecarga de '${callee.property}' compatible con (${argTypes.join(", ")}).`, node);
        return "error";
      }
      if (resolved.status === "ambiguous") {
        this.pushError(`Llamada a '${callee.property}' ambigua: múltiples sobrecargas compatibles.`, node);
        return "error";
      }
      const m = resolved.candidate.member;
      if (!this.isAccessible(m, resolved.candidate.owner)) {
        this.pushError(`El método '${callee.property}' de '${resolved.candidate.owner.name}' es '${m.visibility || "private"}' y no es accesible desde ${this.describeContext()}.`, callee);
        return "error";
      }
      node._resolvedMethodSig = this.methodSig(callee.property, m.paramCount, m.paramTypes);
      node._resolvedMethodClass = resolved.candidate.owner.name;
      return m.returnType || "any";
    }
    this.pushError(`Expresión no llamable.`, node);
    return "error";
  }
  analyzeImportDirective(args, node) {
    if (args.length !== 5) {
      this.pushError(`System.wasi.Import espera 5 argumentos: (module, name, alias, paramTypes[], returnTypes[])`, node);
      return "void";
    }
    const [modArg, nameArg, aliasArg, paramsArg, returnsArg] = args;
    const isStr = (a) => a.kind === "StringLiteral";
    const isArr = (a) => a.kind === "ArrayLiteral";
    if (!isStr(modArg) || !isStr(nameArg) || !isStr(aliasArg)) {
      this.pushError(`System.wasi.Import: los 3 primeros args deben ser strings literales.`, node);
      return "void";
    }
    if (!isArr(paramsArg) || !isArr(returnsArg)) {
      this.pushError(`System.wasi.Import: los 2 últimos args deben ser array literals.`, node);
      return "void";
    }
    const alias = aliasArg.value;
    const extract = (arr) => arr.elements.filter((e) => e.kind === "StringLiteral" || e.kind === "Identifier").map((e) => e.kind === "StringLiteral" ? e.value : e.name);
    const params = extract(paramsArg);
    const returns = extract(returnsArg);
    if (this.globalScope.lookupCurrent(alias)) {
      this.pushError(`System.wasi.Import: el alias '${alias}' ya está declarado.`, node);
      return "void";
    }
    this.globalScope.define(alias, {
      kind: "MethodDecl",
      visibility: "public",
      returnType: returns[0] || "void",
      isStatic: true,
      isVirtual: false,
      hasBody: false,
      isVariadic: false,
      paramCount: params.length,
      paramTypes: params,
      isImport: true
    });
    return "void";
  }
  analyzeNewExpr(node) {
    for (const a of node.args || [])
      this.visitNode(a);
    const rawName = typeof node.className === "string" ? node.className : node.className.kind === "QualifiedName" ? node.className.parts.join("::") : String(node.className);
    const resolvedName = this.resolveTypeName(rawName);
    const genericParsed = this.parseGenericType(resolvedName);
    if (genericParsed) {
      this.lookupClassByFullName(resolvedName);
    }
    const parts = resolvedName.split("::");
    let classSym = this.resolveQualified(parts) || this.resolveQualifiedFrom(this.globalScope, parts);
    if (!classSym || classSym.kind !== "ClassDecl") {
      classSym = this.lookupClassByFullName(resolvedName);
    }
    if (!classSym || classSym.kind !== "ClassDecl") {
      this.pushError(`'${rawName}' no es una clase declarada.`, node);
      return "error";
    }
    if (classSym.isBuiltin) {
      this.pushError(`'${rawName}' es un tipo interno del compilador y no puede instanciarse con 'new'.`, node);
      return "error";
    }
    if (classSym.isInterface) {
      this.pushError(`No se puede instanciar la interface '${rawName}' con 'new'.`, node);
      return "error";
    }
    if (classSym.isEffectivelyAbstract) {
      this.pushError(`No se puede instanciar '${rawName}': la clase es abstracta.`, node);
      return "error";
    }
    node._resolvedClassName = classSym.name;
    const argTypes = (node.args || []).map((a) => this.visitNode(a));
    if (argTypes.some((t) => t === "error"))
      return "error";
    if (argTypes.length === 0) {
      const status = this.defaultCtorStatus(classSym);
      if (status === "missing") {
        this.pushError(`La clase '${rawName}' no tiene un constructor sin argumentos.`, node);
        return "error";
      }
      if (status === "inaccessible") {
        this.pushError(`El constructor por defecto de '${rawName}' no es accesible desde ${this.describeContext()}.`, node);
        return "error";
      }
      node._resolvedCtorSig = null;
      return classSym.name;
    }
    const candidates = [];
    for (const [, member] of classSym.scope.symbols) {
      if (member.kind === "ConstructorDecl" && member.paramCount === argTypes.length) {
        candidates.push({ member, owner: classSym });
      }
    }
    const resolved = this.resolveOverload(candidates, argTypes);
    if (resolved.status !== "ok") {
      this.pushError(`La clase '${rawName}' no tiene un constructor compatible con (${argTypes.join(", ")})${resolved.status === "ambiguous" ? " — llamada ambigua" : ""}.`, node);
      return "error";
    }
    if (!this.isAccessible(resolved.candidate.member, classSym)) {
      this.pushError(`El constructor de '${rawName}' es '${resolved.candidate.member.visibility}' y no es accesible desde ${this.describeContext()}.`, node);
      return "error";
    }
    node._resolvedCtorSig = `__ctor_${argTypes.length}_${resolved.candidate.member.paramTypes.join(",")}`;
    return classSym.name;
  }
  analyzeNewArrayExpr(node) {
    const sizes = node.sizes || [];
    for (const sz of sizes) {
      const szType = this.visitNode(sz);
      if (!INTEGER_TYPES.has(szType) && szType !== "any") {
        this.pushError(`El tamaño de 'new[]' debe ser entero, se obtuvo '${szType}'.`, sz);
      }
    }
    const rawElem = typeof node.elementType === "string" ? node.elementType : String(node.elementType);
    if (BUILTIN_TYPES_NO_VOID.has(rawElem) || rawElem === "ptr" || isFnPtrType(rawElem)) {
      node._resolvedElementType = this.resolveTypeName(rawElem);
      return rawElem + "[]".repeat(sizes.length);
    }
    const resolvedElem = this.resolveTypeName(rawElem);
    if (this.parseGenericType(resolvedElem)) {
      this.lookupClassByFullName(resolvedElem);
    }
    const parts = resolvedElem.split("::");
    let classSym = this.resolveQualified(parts) || this.resolveQualifiedFrom(this.globalScope, parts);
    if (!classSym || classSym.kind !== "ClassDecl") {
      classSym = this.lookupClassByFullName(resolvedElem);
    }
    if (!classSym || classSym.kind !== "ClassDecl") {
      this.pushError(`'${rawElem}' no es un tipo válido para 'new[]'.`, node);
      return "error";
    }
    node._resolvedElementType = classSym.name;
    return classSym.name + "[]".repeat(sizes.length);
  }
  analyzeIncrementExpr(node) {
    if (!this.checkConstWrite(node.target, node.target))
      return "error";
    const targetType = this.resolveLValueType(node.target);
    if (targetType === "error")
      return "error";
    if (!isNumeric(targetType) && targetType !== "any") {
      this.pushError(`Operador '${node.op}' requiere un lvalue numérico, se obtuvo '${targetType}'.`, node);
      return "error";
    }
    return targetType;
  }
  analyzeQualifiedName(node) {
    const sym = this.resolveQualified(node.parts) || this.resolveQualifiedFrom(this.globalScope, node.parts);
    if (!sym) {
      this.pushError(`Nombre calificado no encontrado: '${node.parts.join("::")}'.`, node);
      return "error";
    }
    if (sym.kind === "NamespaceDecl") {
      this.pushError(`'${node.parts.join("::")}' es un namespace, no un valor.`, node);
      return "error";
    }
    if (sym.kind === "EnumDecl") {
      this.pushError(`'${node.parts.join("::")}' es un enum, no un valor (usa Color.RED).`, node);
      return "error";
    }
    if (sym.kind === "ClassDecl")
      return sym.name;
    return sym.type || "any";
  }
  applyBinaryOp(op, leftType, rightType, node) {
    if (leftType === "error" || rightType === "error")
      return "error";
    if (leftType === "any" || rightType === "any")
      return "any";
    if (isFnPtrType(leftType) || isFnPtrType(rightType)) {
      if (op === "==" || op === "!=")
        return "bool";
      this.pushError(`Operador '${op}' no aplicable a tipos fn pointer.`, node);
      return "error";
    }
    if (["<", ">", "<=", ">="].includes(op)) {
      if (!isNumeric(leftType))
        this.pushError(`Operador '${op}' requiere operandos numéricos, se obtuvo '${leftType}'.`, node);
      if (!isNumeric(rightType))
        this.pushError(`Operador '${op}' requiere operandos numéricos, se obtuvo '${rightType}'.`, node);
      return "bool";
    }
    if (op === "==" || op === "!=") {
      if (!this.canAssignType(leftType, rightType) && !this.canAssignType(rightType, leftType)) {
        this.pushError(`No se pueden comparar '${leftType}' y '${rightType}' con '${op}'.`, node);
      }
      return "bool";
    }
    if (op === "&&" || op === "||") {
      if (leftType !== "bool")
        this.pushError(`Operador '${op}' requiere operandos booleanos, se obtuvo '${leftType}'.`, node);
      if (rightType !== "bool")
        this.pushError(`Operador '${op}' requiere operandos booleanos, se obtuvo '${rightType}'.`, node);
      return "bool";
    }
    if (op === "+") {
      if (leftType === "string" || rightType === "string")
        return "string";
      const r = promoteNumeric(leftType, rightType);
      if (!r) {
        this.pushError(`Operador '+' no aplicable a '${leftType}' y '${rightType}'.`, node);
        return "error";
      }
      return r;
    }
    if (["-", "*", "/", "%"].includes(op)) {
      if (op === "-" && leftType === "ptr" && rightType === "ptr")
        return "int";
      if (op === "%") {
        if (!isIntegerType(leftType)) {
          this.pushError(`Operador '%' requiere operandos enteros, se obtuvo '${leftType}'.`, node);
          return "error";
        }
        if (!isIntegerType(rightType)) {
          this.pushError(`Operador '%' requiere operandos enteros, se obtuvo '${rightType}'.`, node);
          return "error";
        }
      }
      const r = promoteNumeric(leftType, rightType);
      if (!r) {
        this.pushError(`Operador '${op}' requiere operandos numéricos, se obtuvo '${leftType}' y '${rightType}'.`, node);
        return "error";
      }
      return r;
    }
    if (["&", "|", "^", "<<", ">>"].includes(op)) {
      if (!isIntegerType(leftType)) {
        this.pushError(`Operador '${op}' requiere operandos enteros, se obtuvo '${leftType}'.`, node);
        return "error";
      }
      if (!isIntegerType(rightType)) {
        this.pushError(`Operador '${op}' requiere operandos enteros, se obtuvo '${rightType}'.`, node);
        return "error";
      }
      return promoteNumeric(leftType, rightType);
    }
    return "any";
  }
  analyzeBinaryOp(node) {
    const leftType = this.visitNode(node.left);
    const rightType = this.visitNode(node.right);
    return this.applyBinaryOp(node.op, leftType, rightType, node);
  }
  analyzeUnaryOp(node) {
    const operandType = this.visitNode(node.operand);
    if (!node.op)
      return operandType;
    if (node.op === "!") {
      if (operandType !== "bool" && operandType !== "any" && operandType !== "error") {
        this.pushError(`Operador '!' requiere un operando booleano, se obtuvo '${operandType}'.`, node);
        return "error";
      }
      return "bool";
    }
    if (node.op === "~") {
      if (!isIntegerType(operandType) && operandType !== "any" && operandType !== "error") {
        this.pushError(`Operador '~' requiere un operando entero, se obtuvo '${operandType}'.`, node);
        return "error";
      }
      return operandType;
    }
    if (node.op === "-" || node.op === "+") {
      if (!isNumeric(operandType) && operandType !== "any" && operandType !== "error") {
        this.pushError(`Operador '${node.op}' requiere un operando numérico, se obtuvo '${operandType}'.`, node);
        return "error";
      }
      if (node.op === "-" && operandType === "uint64")
        return "int64";
      return operandType;
    }
    return operandType;
  }
  analyzeTernary(node) {
    const condType = this.visitNode(node.condition);
    if (condType && condType !== "error" && condType !== "bool" && condType !== "any") {
      this.pushError(`La condición del operador '?:' debe ser de tipo 'bool', se obtuvo '${condType}'.`, node.condition);
    }
    const thenType = this.visitNode(node.thenExpr);
    const elseType = this.visitNode(node.elseExpr);
    if (thenType === "error" || elseType === "error")
      return "error";
    if (thenType === "any" || elseType === "any")
      return "any";
    if (thenType === elseType)
      return thenType;
    if (thenType === "null")
      return elseType;
    if (elseType === "null")
      return thenType;
    const promoted = promoteNumeric(thenType, elseType);
    if (promoted)
      return promoted;
    if (this.canAssignType(thenType, elseType))
      return thenType;
    if (this.canAssignType(elseType, thenType))
      return elseType;
    this.pushError(`Las ramas del operador '?:' tienen tipos incompatibles: '${thenType}' y '${elseType}'.`, node);
    return "error";
  }
  analyzeCastExpr(node) {
    const fromType = this.visitNode(node.expr);
    const toType = node.targetType;
    if (fromType === "error")
      return "error";
    if (isNumeric(fromType) && isNumeric(toType))
      return toType;
    const reinterp = (t) => t === "ptr" || t === "string" || t === "int";
    if (reinterp(fromType) && reinterp(toType))
      return toType;
    this.pushError(`Cast '${fromType} as ${toType}' inválido.`, node);
    return "error";
  }
  containsThis(node) {
    if (!node || typeof node !== "object")
      return false;
    if (Array.isArray(node))
      return node.some((c) => this.containsThis(c));
    if (node.kind === "ThisExpr")
      return true;
    if (node.kind === "LambdaExpr")
      return false;
    for (const key of Object.keys(node)) {
      if (key === "line" || key === "column" || key === "kind" || key.startsWith("_"))
        continue;
      const child = node[key];
      if (child && typeof child === "object" && this.containsThis(child))
        return true;
    }
    return false;
  }
  collectLambdaIdents(node, used, declared) {
    if (!node || typeof node !== "object")
      return;
    if (Array.isArray(node)) {
      for (const child of node)
        this.collectLambdaIdents(child, used, declared);
      return;
    }
    if (node.kind === "VarDecl") {
      declared.add(node.name);
      if (node.value)
        this.collectLambdaIdents(node.value, used, declared);
      return;
    }
    if (node.kind === "Identifier") {
      used.add(node.name);
      return;
    }
    if (node.kind === "LambdaExpr")
      return;
    for (const key of Object.keys(node)) {
      if (key === "line" || key === "column" || key === "kind" || key.startsWith("_"))
        continue;
      const child = node[key];
      if (child && typeof child === "object")
        this.collectLambdaIdents(child, used, declared);
    }
  }
  isCapturableType(t) {
    if (!t)
      return false;
    if (t === "int" || t === "int64" || t === "float" || t === "double" || t === "bool" || t === "char" || t === "uint8" || t === "uint16" || t === "uint32" || t === "uint64" || t === "ptr" || t === "string")
      return true;
    if (isFnPtrType(t))
      return true;
    const sym = this.lookupClassByFullName(this.resolveTypeName(t));
    if (sym && sym.kind === "EnumDecl")
      return true;
    if (sym && sym.kind === "ClassDecl" && !sym.isStruct)
      return true;
    return false;
  }
  analyzeLambdaExpr(node) {
    const paramTypes = node.params.map((p) => p.type || "any");
    const paramNames = new Set(node.params.map((p) => p.name));
    const savedMethod = this.currentMethod;
    const savedScope = this.currentScope;
    const savedLoop = this.loopDepth;
    const savedSwitch = this.switchDepth;
    const used = new Set;
    const declared = new Set;
    this.collectLambdaIdents(node.body, used, declared);
    const usesThis = this.containsThis(node.body);
    const captures = [];
    let validThis = false;
    if (usesThis) {
      const thisInScope = this.lookupLocalOnly("this");
      if (thisInScope) {
        captures.push({ name: "this", type: this.currentClass.name });
        validThis = true;
      } else if (!this.currentClass) {
        this.pushError(`'this' usado en lambda fuera de una clase.`, node);
      } else if (savedMethod && savedMethod.isStatic) {
        this.pushError(`'this' no puede usarse dentro de un método 'static'.`, node);
      } else {
        captures.push({ name: "this", type: this.currentClass.name });
        validThis = true;
      }
    }
    for (const name of used) {
      if (paramNames.has(name))
        continue;
      if (declared.has(name))
        continue;
      const local = this.lookupLocalOnly(name);
      if (local) {
        const t = local.type || "any";
        if (!this.isCapturableType(t)) {
          this.pushError(`No se puede capturar '${name}' de tipo '${t}' en lambda (usa primitivos, string, ptr, enum, class o fn).`, node);
          continue;
        }
        captures.push({ name, type: t });
        continue;
      }
      if (this.currentClass) {
        const found = this.lookupField(this.currentClass.sym, name);
        if (found && !found.member.isStatic && found.member.kind === "FieldDecl") {
          const t = found.member.type || "any";
          if (!this.isCapturableType(t)) {
            this.pushError(`No se puede capturar '${name}' de tipo '${t}' en lambda (usa primitivos, string, ptr, enum, class o fn).`, node);
            continue;
          }
          captures.push({ name, type: t });
          continue;
        }
        if (found)
          continue;
      }
      const globalSym = this.resolveQualified([name]) || this.resolveQualifiedFrom(this.globalScope, [name]);
      if (globalSym)
        continue;
      let foundAsFn = false;
      for (const [, clsSym] of this.globalScope.symbols) {
        if (clsSym.kind === "ClassDecl" && clsSym.scope && !clsSym.isBuiltin) {
          if (this.lookupMethods(clsSym, name).some((c) => c.member.isStatic && c.member.hasBody)) {
            foundAsFn = true;
            break;
          }
        }
      }
      if (foundAsFn)
        continue;
      this.pushError(`Identificador '${name}' usado en lambda no está declarado.`, node);
    }
    node._captures = captures;
    const lambdaScope = new Scope(this.currentScope, "method");
    this.currentScope = lambdaScope;
    const tempMethod = {
      name: "<lambda>",
      returnType: "any",
      isStatic: !validThis,
      _inferredReturn: null,
      _isLambda: true
    };
    this.currentMethod = tempMethod;
    this.loopDepth = 0;
    this.switchDepth = 0;
    try {
      for (const p of node.params) {
        if (lambdaScope.lookupCurrent(p.name)) {
          this.pushError(`Parámetro duplicado '${p.name}' en lambda.`, p);
        } else {
          lambdaScope.define(p.name, { kind: "Parameter", type: p.type || "any", isConst: p.isConst || false });
        }
      }
      for (const c of captures) {
        lambdaScope.define(c.name, { kind: "Capture", type: c.type });
      }
      if (node.body)
        this.visitNode(node.body);
      const retType = tempMethod._inferredReturn || "void";
      const fnPtrType = `fn(${paramTypes.join(",")})->${retType}`;
      node._resolvedFnPtrType = fnPtrType;
      return fnPtrType;
    } finally {
      this.currentScope = savedScope;
      this.currentMethod = savedMethod;
      this.loopDepth = savedLoop;
      this.switchDepth = savedSwitch;
    }
  }
  analyzeIdentifierUse(node) {
    let name = node.name;
    if (this.usingAliases.has(name)) {
      name = this.usingAliases.get(name);
    }
    const local = this.lookupLocalOnly(name);
    if (local) {
      if (local.kind === "ClassDecl")
        return local.name;
      return local.type || "any";
    }
    if (this.currentClass) {
      const found = this.lookupMember(this.currentClass.sym, name);
      if (found) {
        if (!this.isAccessible(found.member, found.owner)) {
          this.pushError(`El miembro '${name}' de la clase '${found.owner.name}' es '${found.member.visibility || "private"}' y no es accesible desde ${this.describeContext()}.`, node);
          return "error";
        }
        if (!this.checkStaticAccess(found.member, name, node))
          return "error";
        if (found.member.kind === "MethodDecl" && found.member.isStatic && found.member.hasBody) {
          return `fn(${found.member.paramTypes.join(",")})->${found.member.returnType}`;
        }
        return found.member.type || "any";
      }
    }
    let resolvedParts = [name];
    if (!name.includes("::")) {
      for (const ns of this.usingWildcards) {
        const candidateParts = [ns, name];
        const symCandidate = this.resolveQualified(candidateParts) || this.resolveQualifiedFrom(this.globalScope, candidateParts);
        if (symCandidate) {
          resolvedParts = candidateParts;
          break;
        }
      }
    } else {
      resolvedParts = name.split("::");
    }
    const sym = this.resolveQualified(resolvedParts) || this.resolveQualifiedFrom(this.globalScope, resolvedParts);
    if (sym) {
      if (sym.kind === "ClassDecl" || sym.kind === "EnumDecl")
        return sym.name;
      if (sym.kind === "NamespaceDecl") {
        this.pushError(`'${name}' es un namespace, no un valor.`, node);
        return "error";
      }
      if (sym.kind === "MethodDecl" && sym.isStatic && sym.hasBody) {
        return `fn(${sym.paramTypes.join(",")})->${sym.returnType}`;
      }
      return sym.type || "any";
    }
    for (const [, clsSym] of this.globalScope.symbols) {
      if (clsSym.kind === "ClassDecl" && clsSym.scope && !clsSym.isBuiltin) {
        const methods = this.lookupMethods(clsSym, name);
        const m = methods.find((c) => c.member.isStatic && c.member.hasBody);
        if (m)
          return `fn(${m.member.paramTypes.join(",")})->${m.member.returnType}`;
      }
    }
    this.pushError(`Uso de variable o identificador no declarado '${node.name}'.`, node);
    return "error";
  }
}

// wasmSimd.ts
var SIMD_NOIMM = {
  I8X16_SWIZZLE: 14,
  I8X16_SPLAT: 15,
  I16X8_SPLAT: 16,
  I32X4_SPLAT: 17,
  I64X2_SPLAT: 18,
  F32X4_SPLAT: 19,
  F64X2_SPLAT: 20,
  I8X16_EQ: 35,
  I8X16_NE: 36,
  I8X16_LT_S: 37,
  I8X16_LT_U: 38,
  I8X16_GT_S: 39,
  I8X16_GT_U: 40,
  I8X16_LE_S: 41,
  I8X16_LE_U: 42,
  I8X16_GE_S: 43,
  I8X16_GE_U: 44,
  I16X8_EQ: 45,
  I16X8_NE: 46,
  I16X8_LT_S: 47,
  I16X8_LT_U: 48,
  I16X8_GT_S: 49,
  I16X8_GT_U: 50,
  I16X8_LE_S: 51,
  I16X8_LE_U: 52,
  I16X8_GE_S: 53,
  I16X8_GE_U: 54,
  I32X4_EQ: 55,
  I32X4_NE: 56,
  I32X4_LT_S: 57,
  I32X4_LT_U: 58,
  I32X4_GT_S: 59,
  I32X4_GT_U: 60,
  I32X4_LE_S: 61,
  I32X4_LE_U: 62,
  I32X4_GE_S: 63,
  I32X4_GE_U: 64,
  F32X4_EQ: 65,
  F32X4_NE: 66,
  F32X4_LT: 67,
  F32X4_GT: 68,
  F32X4_LE: 69,
  F32X4_GE: 70,
  F64X2_EQ: 71,
  F64X2_NE: 72,
  F64X2_LT: 73,
  F64X2_GT: 74,
  F64X2_LE: 75,
  F64X2_GE: 76,
  V128_NOT: 77,
  V128_AND: 78,
  V128_ANDNOT: 79,
  V128_OR: 80,
  V128_XOR: 81,
  V128_BITSELECT: 82,
  V128_ANY_TRUE: 83,
  I8X16_ABS: 96,
  I8X16_NEG: 97,
  I8X16_POPCNT: 98,
  I8X16_ALL_TRUE: 99,
  I8X16_BITMASK: 100,
  I8X16_NARROW_I16X8_S: 101,
  I8X16_NARROW_I16X8_U: 102,
  F32X4_CEIL: 103,
  F32X4_FLOOR: 104,
  F32X4_TRUNC: 105,
  F32X4_NEAREST: 106,
  I8X16_SHL: 107,
  I8X16_SHR_S: 108,
  I8X16_SHR_U: 109,
  I8X16_ADD: 110,
  I8X16_ADD_SAT_S: 111,
  I8X16_ADD_SAT_U: 112,
  I8X16_SUB: 113,
  I8X16_SUB_SAT_S: 114,
  I8X16_SUB_SAT_U: 115,
  F64X2_CEIL: 116,
  F64X2_FLOOR: 117,
  I8X16_MIN_S: 118,
  I8X16_MIN_U: 119,
  I8X16_MAX_S: 120,
  I8X16_MAX_U: 121,
  F64X2_TRUNC: 122,
  I8X16_AVGR_U: 123,
  I16X8_EXTADD_PAIRWISE_I8X16_S: 124,
  I16X8_EXTADD_PAIRWISE_I8X16_U: 125,
  I32X4_EXTADD_PAIRWISE_I16X8_S: 126,
  I32X4_EXTADD_PAIRWISE_I16X8_U: 127,
  I16X8_ABS: 128,
  I16X8_NEG: 129,
  I16X8_Q15MULR_SAT_S: 130,
  I16X8_ALL_TRUE: 131,
  I16X8_BITMASK: 132,
  I16X8_NARROW_I32X4_S: 133,
  I16X8_NARROW_I32X4_U: 134,
  I16X8_EXTEND_LOW_I8X16_S: 135,
  I16X8_EXTEND_HIGH_I8X16_S: 136,
  I16X8_EXTEND_LOW_I8X16_U: 137,
  I16X8_EXTEND_HIGH_I8X16_U: 138,
  I16X8_SHL: 139,
  I16X8_SHR_S: 140,
  I16X8_SHR_U: 141,
  I16X8_ADD: 142,
  I16X8_ADD_SAT_S: 143,
  I16X8_ADD_SAT_U: 144,
  I16X8_SUB: 145,
  I16X8_SUB_SAT_S: 146,
  I16X8_SUB_SAT_U: 147,
  F64X2_NEAREST: 148,
  I16X8_MUL: 149,
  I16X8_MIN_S: 150,
  I16X8_MIN_U: 151,
  I16X8_MAX_S: 152,
  I16X8_MAX_U: 153,
  I16X8_AVGR_U: 155,
  I16X8_EXTMUL_LOW_I8X16_S: 156,
  I16X8_EXTMUL_HIGH_I8X16_S: 157,
  I16X8_EXTMUL_LOW_I8X16_U: 158,
  I16X8_EXTMUL_HIGH_I8X16_U: 159,
  I32X4_ABS: 160,
  I32X4_NEG: 161,
  I32X4_ALL_TRUE: 163,
  I32X4_BITMASK: 164,
  I32X4_EXTEND_LOW_I16X8_S: 167,
  I32X4_EXTEND_HIGH_I16X8_S: 168,
  I32X4_EXTEND_LOW_I16X8_U: 169,
  I32X4_EXTEND_HIGH_I16X8_U: 170,
  I32X4_SHL: 171,
  I32X4_SHR_S: 172,
  I32X4_SHR_U: 173,
  I32X4_ADD: 174,
  I32X4_SUB: 177,
  I32X4_MUL: 181,
  I32X4_MIN_S: 182,
  I32X4_MIN_U: 183,
  I32X4_MAX_S: 184,
  I32X4_MAX_U: 185,
  I32X4_DOT_I16X8_S: 186,
  I32X4_EXTMUL_LOW_I16X8_S: 188,
  I32X4_EXTMUL_HIGH_I16X8_S: 189,
  I32X4_EXTMUL_LOW_I16X8_U: 190,
  I32X4_EXTMUL_HIGH_I16X8_U: 191,
  I64X2_ABS: 192,
  I64X2_NEG: 193,
  I64X2_ALL_TRUE: 195,
  I64X2_BITMASK: 196,
  I64X2_EXTEND_LOW_I32X4_S: 199,
  I64X2_EXTEND_HIGH_I32X4_S: 200,
  I64X2_EXTEND_LOW_I32X4_U: 201,
  I64X2_EXTEND_HIGH_I32X4_U: 202,
  I64X2_SHL: 203,
  I64X2_SHR_S: 204,
  I64X2_SHR_U: 205,
  I64X2_ADD: 206,
  I64X2_SUB: 209,
  I64X2_MUL: 213,
  I64X2_EQ: 214,
  I64X2_NE: 215,
  I64X2_LT_S: 216,
  I64X2_GT_S: 217,
  I64X2_LE_S: 218,
  I64X2_GE_S: 219,
  I64X2_EXTMUL_LOW_I32X4_S: 220,
  I64X2_EXTMUL_HIGH_I32X4_S: 221,
  I64X2_EXTMUL_LOW_I32X4_U: 222,
  I64X2_EXTMUL_HIGH_I32X4_U: 223,
  F32X4_ABS: 224,
  F32X4_NEG: 225,
  F32X4_SQRT: 227,
  F32X4_ADD: 228,
  F32X4_SUB: 229,
  F32X4_MUL: 230,
  F32X4_DIV: 231,
  F32X4_MIN: 232,
  F32X4_MAX: 233,
  F32X4_PMIN: 234,
  F32X4_PMAX: 235,
  F64X2_ABS: 236,
  F64X2_NEG: 237,
  F64X2_SQRT: 239,
  F64X2_ADD: 240,
  F64X2_SUB: 241,
  F64X2_MUL: 242,
  F64X2_DIV: 243,
  F64X2_MIN: 244,
  F64X2_MAX: 245,
  F64X2_PMIN: 246,
  F64X2_PMAX: 247,
  I32X4_TRUNC_SAT_F32X4_S: 248,
  I32X4_TRUNC_SAT_F32X4_U: 249,
  F32X4_CONVERT_I32X4_S: 250,
  F32X4_CONVERT_I32X4_U: 251,
  I32X4_TRUNC_SAT_F64X2_S_ZERO: 252,
  I32X4_TRUNC_SAT_F64X2_U_ZERO: 253,
  F64X2_CONVERT_LOW_I32X4_S: 254,
  F64X2_CONVERT_LOW_I32X4_U: 255
};
var SIMD_MEMARG = {
  V128_LOAD: 0,
  V128_LOAD8X8_S: 1,
  V128_LOAD8X8_U: 2,
  V128_LOAD16X4_S: 3,
  V128_LOAD16X4_U: 4,
  V128_LOAD32X2_S: 5,
  V128_LOAD32X2_U: 6,
  V128_LOAD8_SPLAT: 7,
  V128_LOAD16_SPLAT: 8,
  V128_LOAD32_SPLAT: 9,
  V128_LOAD64_SPLAT: 10,
  V128_STORE: 11,
  V128_LOAD32_ZERO: 92,
  V128_LOAD64_ZERO: 93
};
var SIMD_MEMARG_LANE = {
  V128_LOAD8_LANE: 84,
  V128_LOAD16_LANE: 85,
  V128_LOAD32_LANE: 86,
  V128_LOAD64_LANE: 87,
  V128_STORE8_LANE: 88,
  V128_STORE16_LANE: 89,
  V128_STORE32_LANE: 90,
  V128_STORE64_LANE: 91
};
var SIMD_LANE = {
  I8X16_EXTRACT_LANE_S: 21,
  I8X16_EXTRACT_LANE_U: 22,
  I8X16_REPLACE_LANE: 23,
  I16X8_EXTRACT_LANE_S: 24,
  I16X8_EXTRACT_LANE_U: 25,
  I16X8_REPLACE_LANE: 26,
  I32X4_EXTRACT_LANE: 27,
  I32X4_REPLACE_LANE: 28,
  I64X2_EXTRACT_LANE: 29,
  I64X2_REPLACE_LANE: 30,
  F32X4_EXTRACT_LANE: 31,
  F32X4_REPLACE_LANE: 32,
  F64X2_EXTRACT_LANE: 33,
  F64X2_REPLACE_LANE: 34
};
var SIMD_CONST_SUBOP = 12;
var SIMD_SHUFFLE_SUBOP = 13;
var SIMD_REVERSE = (() => {
  const m = new Map;
  for (const [name, v] of Object.entries(SIMD_NOIMM))
    m.set(v, { name, kind: "noimm" });
  for (const [name, v] of Object.entries(SIMD_MEMARG)) {
    m.set(v, { name, kind: "memarg", naturalAlign: simdNaturalAlign(name) });
  }
  for (const [name, v] of Object.entries(SIMD_MEMARG_LANE)) {
    m.set(v, { name, kind: "memarg_lane", naturalAlign: simdNaturalAlignLane(name) });
  }
  for (const [name, v] of Object.entries(SIMD_LANE))
    m.set(v, { name, kind: "lane" });
  m.set(SIMD_CONST_SUBOP, { kind: "const" });
  m.set(SIMD_SHUFFLE_SUBOP, { kind: "shuffle" });
  return m;
})();
function simdNaturalAlign(name) {
  if (name.endsWith("_LOAD8_SPLAT"))
    return 0;
  if (name.endsWith("_LOAD16_SPLAT"))
    return 1;
  if (name.endsWith("_LOAD32_SPLAT"))
    return 2;
  if (name.endsWith("_LOAD64_SPLAT"))
    return 3;
  if (name.endsWith("_LOAD32_ZERO"))
    return 2;
  if (name.endsWith("_LOAD64_ZERO"))
    return 3;
  if (name.includes("_LOAD8X8_") || name.includes("_LOAD16X4_") || name.includes("_LOAD32X2_")) {
    return 3;
  }
  return 4;
}
function simdNaturalAlignLane(name) {
  if (name.includes("8_LANE"))
    return 0;
  if (name.includes("16_LANE"))
    return 1;
  if (name.includes("32_LANE"))
    return 2;
  if (name.includes("64_LANE"))
    return 3;
  return 0;
}
function simdMaxLane(name) {
  if (name.startsWith("I8X16_"))
    return 15;
  if (name.startsWith("I16X8_"))
    return 7;
  if (name.startsWith("I32X4_") || name.startsWith("F32X4_"))
    return 3;
  if (name.startsWith("I64X2_") || name.startsWith("F64X2_"))
    return 1;
  if (name.endsWith("8_LANE"))
    return 15;
  if (name.endsWith("16_LANE"))
    return 7;
  if (name.endsWith("32_LANE"))
    return 3;
  if (name.endsWith("64_LANE"))
    return 1;
  return 255;
}
function simdWatName(name) {
  const idx = name.indexOf("_");
  if (idx === -1)
    return name.toLowerCase();
  return name.slice(0, idx).toLowerCase() + "." + name.slice(idx + 1).toLowerCase();
}

// wasmInspector.ts
class BinaryReader {
  buf;
  pos = 0;
  constructor(buf) {
    this.buf = buf;
  }
  readByte() {
    if (this.pos >= this.buf.length)
      throw new Error("EOF");
    return this.buf[this.pos++];
  }
  readBytes(n) {
    if (this.pos + n > this.buf.length)
      throw new Error("EOF");
    const slice = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }
  get position() {
    return this.pos;
  }
  set position(p) {
    this.pos = p;
  }
  readU32() {
    let result = 0, shift = 0;
    while (true) {
      const byte = this.readByte();
      result |= (byte & 127) << shift;
      if (!(byte & 128))
        return result >>> 0;
      shift += 7;
    }
  }
  readS32() {
    let result = 0, shift = 0;
    while (true) {
      const byte = this.readByte();
      result |= (byte & 127) << shift;
      shift += 7;
      if (!(byte & 128)) {
        if (shift < 32 && byte & 64)
          result |= -(1 << shift);
        return result;
      }
    }
  }
  readS64() {
    let result = 0n, shift = 0n;
    while (true) {
      const byte = this.readByte();
      result |= BigInt(byte & 127) << shift;
      shift += 7n;
      if (!(byte & 128)) {
        if (shift < 64n && byte & 64)
          result |= -1n << shift;
        return result;
      }
    }
  }
  readName() {
    const len = this.readU32();
    return new TextDecoder().decode(this.readBytes(len));
  }
  eof() {
    return this.pos >= this.buf.length;
  }
}
var OPCODE_MAP = {
  0: "unreachable",
  1: "nop",
  2: "block",
  3: "loop",
  4: "if",
  5: "else",
  11: "end",
  12: "br",
  13: "br_if",
  14: "br_table",
  15: "return",
  16: "call",
  17: "call_indirect",
  20: "call_ref",
  21: "return_call_ref",
  26: "drop",
  27: "select",
  28: "select_t",
  32: "local.get",
  33: "local.set",
  34: "local.tee",
  35: "global.get",
  36: "global.set",
  37: "table.get",
  38: "table.set",
  40: "i32.load",
  41: "i64.load",
  42: "f32.load",
  43: "f64.load",
  44: "i32.load8_s",
  45: "i32.load8_u",
  46: "i32.load16_s",
  47: "i32.load16_u",
  48: "i64.load8_s",
  49: "i64.load8_u",
  50: "i64.load16_s",
  51: "i64.load16_u",
  52: "i64.load32_s",
  53: "i64.load32_u",
  54: "i32.store",
  55: "i64.store",
  56: "f32.store",
  57: "f64.store",
  58: "i32.store8",
  59: "i32.store16",
  60: "i64.store8",
  61: "i64.store16",
  62: "i64.store32",
  63: "memory.size",
  64: "memory.grow",
  65: "i32.const",
  66: "i64.const",
  67: "f32.const",
  68: "f64.const",
  69: "i32.eqz",
  80: "i64.eqz",
  70: "i32.eq",
  71: "i32.ne",
  72: "i32.lt_s",
  73: "i32.lt_u",
  74: "i32.gt_s",
  75: "i32.gt_u",
  76: "i32.le_s",
  77: "i32.le_u",
  78: "i32.ge_s",
  79: "i32.ge_u",
  81: "i64.eq",
  82: "i64.ne",
  83: "i64.lt_s",
  84: "i64.lt_u",
  85: "i64.gt_s",
  86: "i64.gt_u",
  87: "i64.le_s",
  88: "i64.le_u",
  89: "i64.ge_s",
  90: "i64.ge_u",
  91: "f32.eq",
  92: "f32.ne",
  93: "f32.lt",
  94: "f32.gt",
  95: "f32.le",
  96: "f32.ge",
  97: "f64.eq",
  98: "f64.ne",
  99: "f64.lt",
  100: "f64.gt",
  101: "f64.le",
  102: "f64.ge",
  103: "i32.clz",
  104: "i32.ctz",
  105: "i32.popcnt",
  106: "i32.add",
  107: "i32.sub",
  108: "i32.mul",
  109: "i32.div_s",
  110: "i32.div_u",
  111: "i32.rem_s",
  112: "i32.rem_u",
  113: "i32.and",
  114: "i32.or",
  115: "i32.xor",
  116: "i32.shl",
  117: "i32.shr_s",
  118: "i32.shr_u",
  119: "i32.rotl",
  120: "i32.rotr",
  121: "i64.clz",
  122: "i64.ctz",
  123: "i64.popcnt",
  124: "i64.add",
  125: "i64.sub",
  126: "i64.mul",
  127: "i64.div_s",
  128: "i64.div_u",
  129: "i64.rem_s",
  130: "i64.rem_u",
  131: "i64.and",
  132: "i64.or",
  133: "i64.xor",
  134: "i64.shl",
  135: "i64.shr_s",
  136: "i64.shr_u",
  137: "i64.rotl",
  138: "i64.rotr",
  139: "f32.abs",
  140: "f32.neg",
  141: "f32.ceil",
  142: "f32.floor",
  143: "f32.trunc",
  144: "f32.nearest",
  145: "f32.sqrt",
  146: "f32.add",
  147: "f32.sub",
  148: "f32.mul",
  149: "f32.div",
  150: "f32.min",
  151: "f32.max",
  152: "f32.copysign",
  153: "f64.abs",
  154: "f64.neg",
  155: "f64.ceil",
  156: "f64.floor",
  157: "f64.trunc",
  158: "f64.nearest",
  159: "f64.sqrt",
  160: "f64.add",
  161: "f64.sub",
  162: "f64.mul",
  163: "f64.div",
  164: "f64.min",
  165: "f64.max",
  166: "f64.copysign",
  167: "i32.wrap_i64",
  168: "i32.trunc_f32_s",
  169: "i32.trunc_f32_u",
  170: "i32.trunc_f64_s",
  171: "i32.trunc_f64_u",
  172: "i64.extend_i32_s",
  173: "i64.extend_i32_u",
  174: "i64.trunc_f32_s",
  175: "i64.trunc_f32_u",
  176: "i64.trunc_f64_s",
  177: "i64.trunc_f64_u",
  178: "f32.convert_i32_s",
  179: "f32.convert_i32_u",
  180: "f32.convert_i64_s",
  181: "f32.convert_i64_u",
  182: "f32.demote_f64",
  183: "f64.convert_i32_s",
  184: "f64.convert_i32_u",
  185: "f64.convert_i64_s",
  186: "f64.convert_i64_u",
  187: "f64.promote_f32",
  188: "i32.reinterpret_f32",
  189: "i64.reinterpret_f64",
  190: "f32.reinterpret_i32",
  191: "f64.reinterpret_i64",
  208: "ref.null",
  209: "ref.is_null",
  210: "ref.func"
};
var MISC_SUBOP_MAP = {
  0: "i32.trunc_sat_f32_s",
  1: "i32.trunc_sat_f32_u",
  2: "i32.trunc_sat_f64_s",
  3: "i32.trunc_sat_f64_u",
  4: "i64.trunc_sat_f32_s",
  5: "i64.trunc_sat_f32_u",
  6: "i64.trunc_sat_f64_s",
  7: "i64.trunc_sat_f64_u",
  8: "memory.init",
  9: "data.drop",
  10: "memory.copy",
  11: "memory.fill",
  12: "table.init",
  13: "elem.drop",
  14: "table.copy",
  15: "table.grow",
  16: "table.size",
  17: "table.fill"
};
function valTypeToStr(type) {
  const map = {
    127: "i32",
    126: "i64",
    125: "f32",
    124: "f64",
    123: "v128",
    112: "funcref",
    111: "externref"
  };
  return map[type] ?? "unknown";
}
function formatFuncType(idx, params, results) {
  const p = params.map(valTypeToStr).join(" ");
  const r = results.map(valTypeToStr).join(" ");
  let text = `(type (;${idx};) (func`;
  if (p)
    text += ` (param ${p})`;
  if (r)
    text += ` (result ${r})`;
  text += "))";
  return text;
}
function f32ToWat(bits) {
  return `0x${(bits >>> 0).toString(16).padStart(8, "0")}`;
}
function f64ToWat(bits) {
  return `0x${bits.toString(16).padStart(16, "0")}`;
}
function parseInitExpr(r) {
  const instrs = [];
  while (true) {
    const b = r.readByte();
    if (b === 11)
      break;
    r.position--;
    instrs.push(disassembleInstruction(r));
  }
  return instrs.join(" ");
}
function disassembleInstruction(r) {
  const opcode = r.readByte();
  if (opcode === 253) {
    const sub = r.readU32();
    const entry = SIMD_REVERSE.get(sub);
    if (!entry)
      throw new Error(`Subopcode SIMD desconocido: 0x${sub.toString(16)}`);
    switch (entry.kind) {
      case "noimm":
        return simdWatName(entry.name);
      case "memarg": {
        const alignExp = r.readU32();
        const offset = r.readU32();
        return `${simdWatName(entry.name)} offset=${offset} align=${1 << alignExp}`;
      }
      case "memarg_lane": {
        const alignExp = r.readU32();
        const offset = r.readU32();
        const lane = r.readByte();
        return `${simdWatName(entry.name)} ${lane} offset=${offset} align=${1 << alignExp}`;
      }
      case "lane": {
        const lane = r.readByte();
        return `${simdWatName(entry.name)} ${lane}`;
      }
      case "const": {
        const b = Array.from(r.readBytes(16));
        return `v128.const i8x16 ${b.join(" ")}`;
      }
      case "shuffle": {
        const b = Array.from(r.readBytes(16));
        return `i8x16.shuffle ${b.join(" ")}`;
      }
    }
  }
  if (opcode === 252) {
    const sub = r.readByte();
    const name = MISC_SUBOP_MAP[sub];
    if (!name)
      throw new Error(`Subopcode FC desconocido: 0x${sub.toString(16)}`);
    switch (sub) {
      case 8: {
        const d = r.readU32();
        r.readByte();
        return `memory.init ${d}`;
      }
      case 9:
        return `data.drop ${r.readU32()}`;
      case 10:
        r.readByte();
        r.readByte();
        return "memory.copy";
      case 11:
        r.readByte();
        return "memory.fill";
      case 12:
        return `table.init ${r.readU32()} ${r.readU32()}`;
      case 13:
        return `elem.drop ${r.readU32()}`;
      case 14:
        return `table.copy ${r.readU32()} ${r.readU32()}`;
      case 15:
        return `table.grow ${r.readU32()}`;
      case 16:
        return `table.size ${r.readU32()}`;
      case 17:
        return `table.fill ${r.readU32()}`;
      default:
        return name;
    }
  }
  const mnemonic = OPCODE_MAP[opcode];
  if (!mnemonic)
    throw new Error(`Opcode desconocido: 0x${opcode.toString(16)}`);
  switch (opcode) {
    case 2:
    case 3:
    case 4: {
      const bt = r.readByte();
      if (bt === 64)
        return mnemonic;
      if ([127, 126, 125, 124, 123, 112, 111].includes(bt))
        return `${mnemonic} (result ${valTypeToStr(bt)})`;
      r.position--;
      const typeIdx = r.readS32();
      return `${mnemonic} (type ${typeIdx})`;
    }
    case 12:
    case 13:
      return `${mnemonic} ${r.readU32()}`;
    case 14: {
      const count = r.readU32();
      const labels = [];
      for (let i = 0;i < count; i++)
        labels.push(r.readU32());
      const def = r.readU32();
      return `br_table ${labels.join(" ")} ${def}`;
    }
    case 16:
      return `call ${r.readU32()}`;
    case 17: {
      const typeIdx = r.readU32();
      r.readU32();
      return `call_indirect (type ${typeIdx})`;
    }
    case 20:
      return `call_ref ${r.readU32()}`;
    case 21:
      return `return_call_ref ${r.readU32()}`;
    case 28: {
      const n = r.readU32();
      const types = [];
      for (let i = 0;i < n; i++)
        types.push(valTypeToStr(r.readByte()));
      return `select (result ${types.join(" ")})`;
    }
    case 32:
    case 33:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
      return `${mnemonic} ${r.readU32()}`;
    case 65:
      return `i32.const ${r.readS32()}`;
    case 66:
      return `i64.const ${r.readS64()}`;
    case 67: {
      const b = r.readBytes(4);
      const bits = new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
      return `f32.const ${f32ToWat(bits)}`;
    }
    case 68: {
      const b = r.readBytes(8);
      const bits = new DataView(b.buffer, b.byteOffset, 8).getBigUint64(0, true);
      return `f64.const ${f64ToWat(bits)}`;
    }
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
    case 48:
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
    case 54:
    case 55:
    case 56:
    case 57:
    case 58:
    case 59:
    case 60:
    case 61:
    case 62: {
      const alignExp = r.readU32();
      const offset = r.readU32();
      return `${mnemonic} offset=${offset} align=${1 << alignExp}`;
    }
    case 63:
    case 64:
      r.readByte();
      return mnemonic;
    case 208:
      return `ref.null ${valTypeToStr(r.readByte())}`;
    case 209:
      return "ref.is_null";
    case 210:
      return `ref.func ${r.readU32()}`;
    default:
      return mnemonic;
  }
}
function parseLocals(r) {
  const count = r.readU32();
  const locals = [];
  for (let i = 0;i < count; i++) {
    const n = r.readU32();
    const type = r.readByte();
    for (let j = 0;j < n; j++)
      locals.push(`(local ${valTypeToStr(type)})`);
  }
  return locals;
}
function disassembleInstructions(r, endPos) {
  const instrs = [];
  let blockDepth = 0;
  while (r.position < endPos) {
    const opcode = r.readByte();
    if (opcode === 2 || opcode === 3 || opcode === 4) {
      blockDepth++;
      r.position--;
      instrs.push(disassembleInstruction(r));
    } else if (opcode === 5) {
      r.position--;
      instrs.push(disassembleInstruction(r));
    } else if (opcode === 11) {
      blockDepth--;
      if (blockDepth < 0)
        break;
      instrs.push("end");
    } else {
      r.position--;
      instrs.push(disassembleInstruction(r));
    }
  }
  return instrs;
}
function dataToWatString(bytes) {
  let str = "";
  for (const b of bytes) {
    switch (b) {
      case 9:
        str += "\\t";
        break;
      case 10:
        str += "\\n";
        break;
      case 13:
        str += "\\r";
        break;
      case 34:
        str += "\\\"";
        break;
      case 92:
        str += "\\\\";
        break;
      default:
        if (b >= 32 && b <= 126)
          str += String.fromCharCode(b);
        else
          str += "\\" + b.toString(16).padStart(2, "0");
    }
  }
  return str;
}
function readElementSegment(r, flag, index) {
  switch (flag) {
    case 0: {
      const offsetExpr = parseInitExpr(r);
      const n = r.readU32();
      const idx = [];
      for (let j = 0;j < n; j++)
        idx.push(r.readU32());
      return `(elem (${offsetExpr}) ${idx.join(" ")})`;
    }
    case 1: {
      const k = r.readByte();
      if (k !== 0)
        throw new Error(`elemkind inesperado: ${k}`);
      const n = r.readU32();
      const idx = [];
      for (let j = 0;j < n; j++)
        idx.push(r.readU32());
      return `(elem func ${idx.join(" ")})`;
    }
    case 2: {
      const t = r.readU32();
      const offsetExpr = parseInitExpr(r);
      const k = r.readByte();
      if (k !== 0)
        throw new Error(`elemkind inesperado: ${k}`);
      const n = r.readU32();
      const idx = [];
      for (let j = 0;j < n; j++)
        idx.push(r.readU32());
      return `(elem (table ${t}) (${offsetExpr}) func ${idx.join(" ")})`;
    }
    case 3: {
      const k = r.readByte();
      if (k !== 0)
        throw new Error(`elemkind inesperado: ${k}`);
      const n = r.readU32();
      const idx = [];
      for (let j = 0;j < n; j++)
        idx.push(r.readU32());
      return `(elem declare func ${idx.join(" ")})`;
    }
    case 4: {
      const offsetExpr = parseInitExpr(r);
      const n = r.readU32();
      const exprs = [];
      for (let j = 0;j < n; j++)
        exprs.push(`(${parseInitExpr(r)})`);
      return `(elem (${offsetExpr}) ${exprs.join(" ")})`;
    }
    case 5: {
      const rt = valTypeToStr(r.readByte());
      const n = r.readU32();
      const exprs = [];
      for (let j = 0;j < n; j++)
        exprs.push(`(${parseInitExpr(r)})`);
      return `(elem ${rt} ${exprs.join(" ")})`;
    }
    case 6: {
      const t = r.readU32();
      const offsetExpr = parseInitExpr(r);
      const rt = valTypeToStr(r.readByte());
      const n = r.readU32();
      const exprs = [];
      for (let j = 0;j < n; j++)
        exprs.push(`(${parseInitExpr(r)})`);
      return `(elem (table ${t}) (${offsetExpr}) ${rt} ${exprs.join(" ")})`;
    }
    case 7: {
      const rt = valTypeToStr(r.readByte());
      const n = r.readU32();
      const exprs = [];
      for (let j = 0;j < n; j++)
        exprs.push(`(${parseInitExpr(r)})`);
      return `(elem declare ${rt} ${exprs.join(" ")})`;
    }
    default:
      throw new Error(`Element flag ${flag} (index ${index}) desconocido.`);
  }
}
function decodeModuleToWat(buffer) {
  const r = new BinaryReader(buffer);
  r.readBytes(4);
  r.readBytes(4);
  const types = [];
  const imports = [];
  const funcTypeIndices = [];
  let memoryDef = null;
  let memoryIsImported = false;
  const globals = [];
  const exports = [];
  const tableDefs = [];
  const codeBodies = [];
  const dataSegments = [];
  const elemSegments = [];
  const customComments = [];
  let startLine = null;
  while (!r.eof()) {
    const id = r.readByte();
    const size = r.readU32();
    const endPos = r.position + size;
    switch (id) {
      case 0: {
        const secName = r.readName();
        const remaining = endPos - r.position;
        const data = Array.from(r.readBytes(remaining));
        if (secName === "name") {
          const nr = new BinaryReader(new Uint8Array(data));
          const parts = [];
          while (!nr.eof()) {
            const subId = nr.readByte();
            const subSize = nr.readU32();
            const subEnd = nr.position + subSize;
            if (subId === 0) {
              parts.push(`module="${nr.readName()}"`);
            } else if (subId === 1) {
              const n = nr.readU32();
              const entries = [];
              for (let i = 0;i < n; i++) {
                const idx = nr.readU32();
                entries.push(`${idx}="${nr.readName()}"`);
              }
              parts.push(`funcs=[${entries.join(",")}]`);
            } else if (subId === 2) {
              const n = nr.readU32();
              const entries = [];
              for (let i = 0;i < n; i++) {
                const fi = nr.readU32();
                const m = nr.readU32();
                const locals = [];
                for (let j = 0;j < m; j++) {
                  locals.push(`${nr.readU32()}="${nr.readName()}"`);
                }
                entries.push(`f${fi}:[${locals.join(",")}]`);
              }
              parts.push(`locals=[${entries.join(",")}]`);
            } else {
              nr.position = subEnd;
            }
            nr.position = subEnd;
          }
          customComments.push(`;; name section: ${parts.join(" ")}`);
        } else if (secName === "producers") {
          customComments.push(`;; producers section (${data.length} bytes)`);
        } else {
          customComments.push(`;; custom section "${secName}" (${data.length} bytes)`);
        }
        break;
      }
      case 1: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const form = r.readByte();
          if (form !== 96) {
            throw new Error(`Functype form inesperado: 0x${form.toString(16)} (se esperaba 0x60)`);
          }
          const pc = r.readU32();
          const params = [];
          for (let j = 0;j < pc; j++)
            params.push(r.readByte());
          const rc = r.readU32();
          const results = [];
          for (let j = 0;j < rc; j++)
            results.push(r.readByte());
          types.push(formatFuncType(i, params, results));
        }
        break;
      }
      case 2: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const mod = r.readName();
          const name = r.readName();
          const kind = r.readByte();
          if (kind === 0) {
            const typeIdx = r.readU32();
            imports.push(`(import "${mod}" "${name}" (func (type ${typeIdx})))`);
          } else if (kind === 1) {
            const rt = valTypeToStr(r.readByte());
            const flags = r.readByte();
            const initial = r.readU32();
            const maximum = flags & 1 ? r.readU32() : undefined;
            tableDefs.push(`(import "${mod}" "${name}" (table ${initial}${maximum !== undefined ? " " + maximum : ""} ${rt}))`);
          } else if (kind === 2) {
            memoryIsImported = true;
            const flags = r.readByte();
            const initial = r.readU32();
            const maximum = flags & 1 ? r.readU32() : undefined;
            memoryDef = `(import "${mod}" "${name}" (memory ${initial}${maximum !== undefined ? " " + maximum : ""}))`;
          } else if (kind === 3) {
            const type = r.readByte();
            const mut = r.readByte() === 1;
            imports.push(`(import "${mod}" "${name}" (global ${mut ? `(mut ${valTypeToStr(type)})` : valTypeToStr(type)}))`);
          }
        }
        break;
      }
      case 3: {
        const count = r.readU32();
        for (let i = 0;i < count; i++)
          funcTypeIndices.push(r.readU32());
        break;
      }
      case 4: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const elemType = r.readByte();
          const flags = r.readByte();
          const initial = r.readU32();
          const maximum = flags & 1 ? r.readU32() : undefined;
          tableDefs.push(`(table ${initial}${maximum !== undefined ? " " + maximum : ""} ${valTypeToStr(elemType)})`);
        }
        break;
      }
      case 5: {
        r.readU32();
        const flags = r.readByte();
        const initial = r.readU32();
        const maximum = flags & 1 ? r.readU32() : undefined;
        memoryDef = `(memory ${initial}${maximum !== undefined ? " " + maximum : ""})`;
        break;
      }
      case 6: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const type = r.readByte();
          const mut = r.readByte() === 1;
          const initExpr = parseInitExpr(r);
          globals.push(`(global (;${i};) ${mut ? `(mut ${valTypeToStr(type)})` : valTypeToStr(type)} ${initExpr})`);
        }
        break;
      }
      case 7: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const name = r.readName();
          const kind = r.readByte();
          const index = r.readU32();
          const k = ["func", "table", "memory", "global"][kind] ?? "func";
          exports.push(`(export "${name}" (${k} ${index}))`);
        }
        break;
      }
      case 8: {
        const startIdx = r.readU32();
        startLine = `(start ${startIdx})`;
        break;
      }
      case 9: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const flag = r.readU32();
          elemSegments.push(readElementSegment(r, flag, i));
        }
        break;
      }
      case 10: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const bodySize = r.readU32();
          const bodyEnd = r.position + bodySize;
          const locals = parseLocals(r);
          const instructions = disassembleInstructions(r, bodyEnd);
          codeBodies.push({ locals, instructions });
          r.position = bodyEnd;
        }
        break;
      }
      case 11: {
        const count = r.readU32();
        for (let i = 0;i < count; i++) {
          const mode = r.readU32();
          if (mode === 0) {
            const offsetExpr = parseInitExpr(r);
            const dataSize = r.readU32();
            const data = Array.from(r.readBytes(dataSize));
            dataSegments.push(`(data (${offsetExpr}) "${dataToWatString(data)}")`);
          } else if (mode === 1) {
            const dataSize = r.readU32();
            const data = Array.from(r.readBytes(dataSize));
            dataSegments.push(`(data "${dataToWatString(data)}")`);
          } else if (mode === 2) {
            const memIdx = r.readU32();
            const offsetExpr = parseInitExpr(r);
            const dataSize = r.readU32();
            const data = Array.from(r.readBytes(dataSize));
            dataSegments.push(`(data (memory ${memIdx}) (${offsetExpr}) "${dataToWatString(data)}")`);
          } else {
            throw new Error(`Data segment con modo ${mode} no soportado`);
          }
        }
        break;
      }
      default:
        r.position = endPos;
    }
    r.position = endPos;
  }
  const lines = [];
  for (const c of customComments)
    lines.push(c);
  lines.push("(module");
  const ind = "  ";
  for (const t of types)
    lines.push(ind + t);
  for (const imp of imports)
    lines.push(ind + imp);
  if (memoryDef && !memoryIsImported)
    lines.push(ind + memoryDef);
  for (const td of tableDefs)
    lines.push(ind + td);
  if (startLine)
    lines.push(ind + startLine);
  for (const es of elemSegments)
    lines.push(ind + es);
  for (const g of globals)
    lines.push(ind + g);
  for (const e of exports)
    lines.push(ind + e);
  for (const ds of dataSegments)
    lines.push(ind + ds);
  const importFuncCount = imports.filter((imp) => imp.includes("(func")).length;
  for (let i = 0;i < funcTypeIndices.length; i++) {
    const body = codeBodies[i];
    lines.push(ind + `(func (;${importFuncCount + i};) (type ${funcTypeIndices[i]})`);
    for (const local of body.locals)
      lines.push(ind + ind + local);
    for (const instr of body.instructions)
      lines.push(ind + ind + instr);
    lines.push(ind + ")");
  }
  lines.push(")");
  return lines.join(`
`);
}
function parseBinaryTree(buffer) {
  const r = new BinaryReader(buffer);
  r.readBytes(4);
  r.readBytes(4);
  const moduleNode = { type: "module", name: "Module", children: [] };
  while (!r.eof()) {
    const id = r.readByte();
    const size = r.readU32();
    const endPos = r.position + size;
    switch (id) {
      case 0: {
        const secName = r.readName();
        const remaining = endPos - r.position;
        r.readBytes(remaining);
        moduleNode.children.push({ type: "custom", name: `Custom "${secName}" (${remaining} bytes)`, children: [] });
        break;
      }
      case 1: {
        const count = r.readU32();
        const node = { type: "section", name: "Type Section", children: [] };
        for (let i = 0;i < count; i++) {
          const form = r.readByte();
          if (form !== 96)
            throw new Error(`Functype form inesperado: 0x${form.toString(16)}`);
          const pc = r.readU32();
          const params = [];
          for (let j = 0;j < pc; j++)
            params.push(r.readByte());
          const rc = r.readU32();
          const results = [];
          for (let j = 0;j < rc; j++)
            results.push(r.readByte());
          node.children.push({ type: "type", name: `Type ${i}: func (${params.map(valTypeToStr).join(" ")}) -> (${results.map(valTypeToStr).join(" ")})` });
        }
        moduleNode.children.push(node);
        break;
      }
      case 2: {
        const count = r.readU32();
        const node = { type: "section", name: "Import Section", children: [] };
        for (let i = 0;i < count; i++) {
          const mod = r.readName();
          const name = r.readName();
          const kind = r.readByte();
          let desc = "";
          if (kind === 0)
            desc = `func type ${r.readU32()}`;
          else if (kind === 1) {
            const rt = valTypeToStr(r.readByte());
            const flags = r.readByte();
            const initial = r.readU32();
            const maximum = flags & 1 ? r.readU32() : undefined;
            desc = `table min=${initial}` + (maximum !== undefined ? ` max=${maximum}` : "") + ` ${rt}`;
          } else if (kind === 2) {
            const flags = r.readByte();
            const initial = r.readU32();
            const maximum = flags & 1 ? r.readU32() : undefined;
            desc = `memory min=${initial}` + (maximum !== undefined ? ` max=${maximum}` : "");
          } else if (kind === 3) {
            const type = r.readByte();
            const mut = r.readByte() === 1;
            desc = `global ${valTypeToStr(type)}${mut ? " mutable" : ""}`;
          }
          node.children.push({ type: "import", name: `"${mod}" "${name}" (${desc})` });
        }
        moduleNode.children.push(node);
        break;
      }
      case 3: {
        const count = r.readU32();
        const node = { type: "section", name: "Function Section", children: [] };
        for (let i = 0;i < count; i++) {
          node.children.push({ type: "func", name: `Function ${i}: type ${r.readU32()}` });
        }
        moduleNode.children.push(node);
        break;
      }
      case 4: {
        const count = r.readU32();
        const node = { type: "section", name: "Table Section", children: [] };
        for (let i = 0;i < count; i++) {
          const elemType = r.readByte();
          const flags = r.readByte();
          const initial = r.readU32();
          const maximum = flags & 1 ? r.readU32() : undefined;
          node.children.push({ type: "table", name: `Table ${i}: min=${initial}` + (maximum !== undefined ? ` max=${maximum}` : "") + ` ${valTypeToStr(elemType)}` });
        }
        moduleNode.children.push(node);
        break;
      }
      case 5: {
        const count = r.readU32();
        const node = { type: "section", name: "Memory Section", children: [] };
        for (let i = 0;i < count; i++) {
          const flags = r.readByte();
          const initial = r.readU32();
          const maximum = flags & 1 ? r.readU32() : undefined;
          node.children.push({ type: "memory", name: `Memory ${i}: min=${initial}` + (maximum !== undefined ? ` max=${maximum}` : "") });
        }
        moduleNode.children.push(node);
        break;
      }
      case 6: {
        const count = r.readU32();
        const node = { type: "section", name: "Global Section", children: [] };
        for (let i = 0;i < count; i++) {
          const type = r.readByte();
          const mut = r.readByte() === 1;
          const initExpr = parseInitExpr(r);
          node.children.push({ type: "global", name: `Global ${i}: ${valTypeToStr(type)}${mut ? " mutable" : ""} = ${initExpr}` });
        }
        moduleNode.children.push(node);
        break;
      }
      case 7: {
        const count = r.readU32();
        const node = { type: "section", name: "Export Section", children: [] };
        for (let i = 0;i < count; i++) {
          const name = r.readName();
          const kind = r.readByte();
          const index = r.readU32();
          const k = ["func", "table", "memory", "global"][kind] ?? "?";
          node.children.push({ type: "export", name: `"${name}" (${k} ${index})` });
        }
        moduleNode.children.push(node);
        break;
      }
      case 8: {
        const startIdx = r.readU32();
        moduleNode.children.push({ type: "section", name: "Start Section", children: [{ type: "start", name: `start func ${startIdx}` }] });
        break;
      }
      case 9: {
        const count = r.readU32();
        const node = { type: "section", name: "Element Section", children: [] };
        for (let i = 0;i < count; i++) {
          const flag = r.readU32();
          node.children.push({ type: "element", name: readElementSegment(r, flag, i) });
        }
        moduleNode.children.push(node);
        break;
      }
      case 10: {
        const count = r.readU32();
        const node = { type: "section", name: "Code Section", children: [] };
        for (let i = 0;i < count; i++) {
          const bodySize = r.readU32();
          const bodyEnd = r.position + bodySize;
          const localCount = r.readU32();
          const locals = [];
          for (let j = 0;j < localCount; j++) {
            const n = r.readU32();
            const type = r.readByte();
            locals.push(`${n} x ${valTypeToStr(type)}`);
          }
          const funcNode = { type: "function", name: `Function ${i}`, children: [] };
          if (locals.length > 0)
            funcNode.children.push({ type: "locals", name: `Locals: ${locals.join(", ")}` });
          const instructions = disassembleInstructions(r, bodyEnd);
          if (instructions.length > 0) {
            const instrNode = { type: "instructions", name: "Instructions", children: [] };
            for (const instr of instructions)
              instrNode.children.push({ type: "instr", name: instr });
            funcNode.children.push(instrNode);
          }
          r.position = bodyEnd;
          node.children.push(funcNode);
        }
        moduleNode.children.push(node);
        break;
      }
      case 11: {
        const count = r.readU32();
        const node = { type: "section", name: "Data Section", children: [] };
        for (let i = 0;i < count; i++) {
          const mode = r.readU32();
          if (mode === 0) {
            const offsetExpr = parseInitExpr(r);
            const dataSize = r.readU32();
            const data = Array.from(r.readBytes(dataSize));
            node.children.push({ type: "data", name: `offset=${offsetExpr}, "${dataToWatString(data)}"` });
          } else if (mode === 1) {
            const dataSize = r.readU32();
            const data = Array.from(r.readBytes(dataSize));
            node.children.push({ type: "data", name: `"${dataToWatString(data)}"` });
          } else if (mode === 2) {
            const memIdx = r.readU32();
            const offsetExpr = parseInitExpr(r);
            const dataSize = r.readU32();
            const data = Array.from(r.readBytes(dataSize));
            node.children.push({ type: "data", name: `memory=${memIdx} offset=${offsetExpr}, "${dataToWatString(data)}"` });
          } else {
            r.position = endPos;
          }
        }
        moduleNode.children.push(node);
        break;
      }
      default: {
        r.position = endPos;
        moduleNode.children.push({ type: "section", name: `Unknown Section (id: ${id})`, children: [] });
      }
    }
    r.position = endPos;
  }
  return moduleNode;
}
function formatBinaryTree(node, prefix = "", isLast = true) {
  const connector = isLast ? "└── " : "├── ";
  let result = prefix + connector + node.name + `
`;
  if (node.children && node.children.length > 0) {
    const newPrefix = prefix + (isLast ? "    " : "│   ");
    node.children.forEach((child, index) => {
      result += formatBinaryTree(child, newPrefix, index === node.children.length - 1);
    });
  }
  return result;
}

// compiler.ts
var ENABLE_OPTIMIZER = true;
var OP = {
  UNREACHABLE: 0,
  NOP: 1,
  BLOCK: 2,
  LOOP: 3,
  IF: 4,
  ELSE: 5,
  END: 11,
  BR: 12,
  BR_IF: 13,
  BR_TABLE: 14,
  RETURN: 15,
  CALL: 16,
  CALL_INDIRECT: 17,
  CALL_REF: 20,
  RETURN_CALL_REF: 21,
  DROP: 26,
  SELECT: 27,
  SELECT_T: 28,
  LOCAL_GET: 32,
  LOCAL_SET: 33,
  LOCAL_TEE: 34,
  GLOBAL_GET: 35,
  GLOBAL_SET: 36,
  TABLE_GET: 37,
  TABLE_SET: 38,
  I32_LOAD: 40,
  I64_LOAD: 41,
  F32_LOAD: 42,
  F64_LOAD: 43,
  I32_LOAD8_S: 44,
  I32_LOAD8_U: 45,
  I32_LOAD16_S: 46,
  I32_LOAD16_U: 47,
  I64_LOAD8_S: 48,
  I64_LOAD8_U: 49,
  I64_LOAD16_S: 50,
  I64_LOAD16_U: 51,
  I64_LOAD32_S: 52,
  I64_LOAD32_U: 53,
  I32_STORE: 54,
  I64_STORE: 55,
  F32_STORE: 56,
  F64_STORE: 57,
  I32_STORE8: 58,
  I32_STORE16: 59,
  I64_STORE8: 60,
  I64_STORE16: 61,
  I64_STORE32: 62,
  MEMORY_SIZE: 63,
  MEMORY_GROW: 64,
  I32_CONST: 65,
  I64_CONST: 66,
  F32_CONST: 67,
  F64_CONST: 68,
  I32_EQZ: 69,
  I64_EQZ: 80,
  I32_EQ: 70,
  I32_NE: 71,
  I32_LT_S: 72,
  I32_LT_U: 73,
  I32_GT_S: 74,
  I32_GT_U: 75,
  I32_LE_S: 76,
  I32_LE_U: 77,
  I32_GE_S: 78,
  I32_GE_U: 79,
  I64_EQ: 81,
  I64_NE: 82,
  I64_LT_S: 83,
  I64_LT_U: 84,
  I64_GT_S: 85,
  I64_GT_U: 86,
  I64_LE_S: 87,
  I64_LE_U: 88,
  I64_GE_S: 89,
  I64_GE_U: 90,
  F32_EQ: 91,
  F32_NE: 92,
  F32_LT: 93,
  F32_GT: 94,
  F32_LE: 95,
  F32_GE: 96,
  F64_EQ: 97,
  F64_NE: 98,
  F64_LT: 99,
  F64_GT: 100,
  F64_LE: 101,
  F64_GE: 102,
  I32_CLZ: 103,
  I32_CTZ: 104,
  I32_POPCNT: 105,
  I32_ADD: 106,
  I32_SUB: 107,
  I32_MUL: 108,
  I32_DIV_S: 109,
  I32_DIV_U: 110,
  I32_REM_S: 111,
  I32_REM_U: 112,
  I32_AND: 113,
  I32_OR: 114,
  I32_XOR: 115,
  I32_SHL: 116,
  I32_SHR_S: 117,
  I32_SHR_U: 118,
  I32_ROTL: 119,
  I32_ROTR: 120,
  I64_CLZ: 121,
  I64_CTZ: 122,
  I64_POPCNT: 123,
  I64_ADD: 124,
  I64_SUB: 125,
  I64_MUL: 126,
  I64_DIV_S: 127,
  I64_DIV_U: 128,
  I64_REM_S: 129,
  I64_REM_U: 130,
  I64_AND: 131,
  I64_OR: 132,
  I64_XOR: 133,
  I64_SHL: 134,
  I64_SHR_S: 135,
  I64_SHR_U: 136,
  I64_ROTL: 137,
  I64_ROTR: 138,
  F32_ABS: 139,
  F32_NEG: 140,
  F32_CEIL: 141,
  F32_FLOOR: 142,
  F32_TRUNC: 143,
  F32_NEAREST: 144,
  F32_SQRT: 145,
  F32_ADD: 146,
  F32_SUB: 147,
  F32_MUL: 148,
  F32_DIV: 149,
  F32_MIN: 150,
  F32_MAX: 151,
  F32_COPYSIGN: 152,
  F64_ABS: 153,
  F64_NEG: 154,
  F64_CEIL: 155,
  F64_FLOOR: 156,
  F64_TRUNC: 157,
  F64_NEAREST: 158,
  F64_SQRT: 159,
  F64_ADD: 160,
  F64_SUB: 161,
  F64_MUL: 162,
  F64_DIV: 163,
  F64_MIN: 164,
  F64_MAX: 165,
  F64_COPYSIGN: 166,
  I32_WRAP_I64: 167,
  I32_TRUNC_F32_S: 168,
  I32_TRUNC_F32_U: 169,
  I32_TRUNC_F64_S: 170,
  I32_TRUNC_F64_U: 171,
  I64_EXTEND_I32_S: 172,
  I64_EXTEND_I32_U: 173,
  I64_TRUNC_F32_S: 174,
  I64_TRUNC_F32_U: 175,
  I64_TRUNC_F64_S: 176,
  I64_TRUNC_F64_U: 177,
  F32_CONVERT_I32_S: 178,
  F32_CONVERT_I32_U: 179,
  F32_CONVERT_I64_S: 180,
  F32_CONVERT_I64_U: 181,
  F32_DEMOTE_F64: 182,
  F64_CONVERT_I32_S: 183,
  F64_CONVERT_I32_U: 184,
  F64_CONVERT_I64_S: 185,
  F64_CONVERT_I64_U: 186,
  F64_PROMOTE_F32: 187,
  I32_REINTERPRET_F32: 188,
  I64_REINTERPRET_F64: 189,
  F32_REINTERPRET_I32: 190,
  F64_REINTERPRET_I64: 191,
  REF_NULL: 208,
  REF_IS_NULL: 209,
  REF_FUNC: 210,
  MISC_PREFIX: 252,
  SAT_I32_TRUNC_SAT_F32_S: 0,
  SAT_I32_TRUNC_SAT_F32_U: 1,
  SAT_I32_TRUNC_SAT_F64_S: 2,
  SAT_I32_TRUNC_SAT_F64_U: 3,
  SAT_I64_TRUNC_SAT_F32_S: 4,
  SAT_I64_TRUNC_SAT_F32_U: 5,
  SAT_I64_TRUNC_SAT_F64_S: 6,
  SAT_I64_TRUNC_SAT_F64_U: 7,
  MEMORY_INIT: 8,
  DATA_DROP: 9,
  MEMORY_COPY: 10,
  MEMORY_FILL: 11,
  TABLE_INIT: 12,
  ELEM_DROP: 13,
  TABLE_COPY: 14,
  TABLE_GROW: 15,
  TABLE_SIZE: 16,
  TABLE_FILL: 17,
  SIMD_PREFIX: 253
};
var opToType = {
  127: "i32",
  126: "i64",
  125: "f32",
  124: "f64",
  123: "v128",
  112: "funcref",
  111: "externref"
};
function encodeLEB128(n) {
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`encodeLEB128: valor inválido ${n}`);
  let bytes = [];
  let value = n >>> 0;
  do {
    let byte = value & 127;
    value >>>= 7;
    if (value !== 0)
      byte |= 128;
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
}
function encodeSignedLEB128(value) {
  const bytes = [];
  if (typeof value === "bigint") {
    let val = value;
    let more = true;
    while (more) {
      let byte = Number(val & 0x7Fn);
      val >>= 7n;
      if (val === 0n && (byte & 64) === 0 || val === -1n && (byte & 64) !== 0) {
        more = false;
      } else {
        byte |= 128;
      }
      bytes.push(byte);
    }
  } else {
    let val = value | 0;
    let more = true;
    while (more) {
      let byte = val & 127;
      val >>= 7;
      if (val === 0 && (byte & 64) === 0 || val === -1 && (byte & 64) !== 0) {
        more = false;
      } else {
        byte |= 128;
      }
      bytes.push(byte);
    }
  }
  return bytes;
}
function encodeName(str) {
  const bytes = new TextEncoder().encode(str);
  return [...encodeLEB128(bytes.length), ...bytes];
}
function typeToOp(t) {
  const map = {
    i32: 127,
    i64: 126,
    f32: 125,
    f64: 124,
    v128: 123,
    funcref: 112,
    externref: 111
  };
  if (!(t in map))
    throw new Error(`Tipo no válido: ${t}`);
  return map[t];
}
function refTypeToOp(t) {
  return t === "funcref" ? 112 : 111;
}
function floatToBytes(value, bits) {
  const buf = new ArrayBuffer(bits / 8);
  const view = new DataView(buf);
  if (bits === 32)
    view.setFloat32(0, value, true);
  else
    view.setFloat64(0, value, true);
  return Array.from(new Uint8Array(buf));
}
function toI32(value) {
  if (value === undefined || value === null) {
    console.error("toI32 con valor inválido:", value);
    console.trace();
    throw new Error("toI32: valor inválido");
  }
  return Number(BigInt.asIntN(32, BigInt(value)));
}
function toI64(value) {
  if (value === undefined || value === null) {
    console.error("toI64 con valor inválido:", value);
    console.trace();
    throw new Error("toI64: valor inválido");
  }
  return BigInt.asIntN(64, BigInt(value));
}
class StringPool {
  data = [];
  offsets = new Map;
  baseOffset;
  constructor(baseOffset = 0) {
    this.baseOffset = baseOffset;
  }
  getBaseOffset() {
    return this.baseOffset;
  }
  add(str) {
    const cached = this.offsets.get(str);
    if (cached) {
      return { offset: this.baseOffset + cached.offset + 4, length: cached.length };
    }
    const bytes = new TextEncoder().encode(str);
    const internalOffset = this.data.length;
    const len = bytes.length;
    this.data.push(len & 255, len >> 8 & 255, len >> 16 & 255, len >> 24 & 255);
    for (let i = 0;i < bytes.length; i++)
      this.data.push(bytes[i]);
    this.offsets.set(str, { offset: internalOffset, length: len });
    return { offset: this.baseOffset + internalOffset + 4, length: len };
  }
  getDataSegments() {
    if (this.data.length === 0)
      return [];
    return [{ offset: this.baseOffset, data: new Uint8Array(this.data) }];
  }
  getAllEntries() {
    const entries = [];
    for (const [text, { offset }] of this.offsets) {
      entries.push({ text, userOffset: this.baseOffset + offset + 4 });
    }
    return entries;
  }
  reset() {
    this.data = [];
    this.offsets.clear();
  }
  rawBytes() {
    return new Uint8Array(this.data);
  }
  fromString(context, text) {
    const ref = this.add(text);
    context.i32DataConst(ref.offset);
  }
  connect(module) {
    module.attachStringPool(this);
  }
}

class FunctionIRBuilder {
  paramTypes;
  returnType;
  instructions;
  nextLocalIdx;
  localNames;
  localTypes;
  blockLabelStack;
  lastInstructionWasTerminator;
  needsMemory;
  finalized = false;
  moduleRef = null;
  constructor(paramTypes = [], returnType = [], paramNames = [], moduleRef) {
    this.paramTypes = paramTypes;
    this.returnType = returnType;
    this.instructions = [];
    this.nextLocalIdx = paramTypes.length;
    this.localNames = new Map;
    this.localTypes = paramTypes.slice();
    this.blockLabelStack = [];
    this.lastInstructionWasTerminator = false;
    this.needsMemory = false;
    this.moduleRef = moduleRef ?? null;
    if (paramNames.length > 0) {
      if (paramNames.length !== paramTypes.length) {
        throw new Error(`Longitud de paramNames (${paramNames.length}) no coincide con paramTypes (${paramTypes.length})`);
      }
      for (let i = 0;i < paramNames.length; i++)
        this.setParamName(i, paramNames[i]);
    }
  }
  addString(text) {
    this.needsMemory = true;
    if (!this.moduleRef)
      throw new Error("addString requiere ModuleBuilder");
    const ref = this.moduleRef.addString(text);
    this.i32DataConst(ref.offset);
  }
  functionIndexByName(name) {
    this._checkNotFinalized();
    this.instructions.push({ op: "FUNCTION_INDEX_BY_NAME", name });
    this.lastInstructionWasTerminator = false;
  }
  envAddrByName(name) {
    this._checkNotFinalized();
    this.instructions.push({ op: "ENV_ADDR_BY_NAME", name });
    this.lastInstructionWasTerminator = false;
  }
  setParamName(index, name) {
    if (index < 0 || index >= this.paramTypes.length) {
      throw new Error(`Índice de parámetro fuera de rango: ${index}`);
    }
    this.localNames.set(name, { index, type: this.paramTypes[index] });
  }
  addLocal(name, type = "i32") {
    if (this.finalized)
      throw new Error("No se pueden añadir locales después de finalizar");
    const idx = this.nextLocalIdx++;
    this.localNames.set(name, { index: idx, type });
    this.localTypes[idx] = type;
    return idx;
  }
  getTempLocal(slot = 0) {
    const name = `__temp${slot}`;
    const entry = this.localNames.get(name);
    if (entry)
      return entry.index;
    return this.addLocal(name, "i32");
  }
  getTempF64Local() {
    const name = "__temp_f64";
    const entry = this.localNames.get(name);
    if (entry)
      return entry.index;
    return this.addLocal(name, "f64");
  }
  _checkNotFinalized() {
    if (this.finalized)
      throw new Error("No se pueden añadir instrucciones después de finalizar");
  }
  setReturnType(...types) {
    this._checkNotFinalized();
    if (types.length === 0) {
      this.returnType = [];
      return;
    }
    const first = types[0];
    if (types.length === 1 && first === null) {
      this.returnType = [];
      return;
    }
    if (types.length === 1 && Array.isArray(first)) {
      this.returnType = [...first];
      return;
    }
    this.returnType = types;
  }
  setReturnTypes(...types) {
    this._checkNotFinalized();
    this.returnType = [...types];
  }
  _resolveLocal(nameOrIndex) {
    if (typeof nameOrIndex === "number")
      return nameOrIndex;
    const entry = this.localNames.get(nameOrIndex);
    if (entry)
      return entry.index;
    throw new Error(`Variable local no definida: ${nameOrIndex}`);
  }
  getLocal(n) {
    this._checkNotFinalized();
    this.instructions.push({ op: "LOCAL_GET", index: this._resolveLocal(n) });
    this.lastInstructionWasTerminator = false;
  }
  setLocal(n) {
    this._checkNotFinalized();
    this.instructions.push({ op: "LOCAL_SET", index: this._resolveLocal(n) });
    this.lastInstructionWasTerminator = false;
  }
  teeLocal(n) {
    this._checkNotFinalized();
    this.instructions.push({ op: "LOCAL_TEE", index: this._resolveLocal(n) });
    this.lastInstructionWasTerminator = false;
  }
  globalGet(n) {
    this._checkNotFinalized();
    this.instructions.push({ op: "GLOBAL_GET", index: n });
    this.lastInstructionWasTerminator = false;
  }
  globalSet(n) {
    this._checkNotFinalized();
    this.instructions.push({ op: "GLOBAL_SET", index: n });
    this.lastInstructionWasTerminator = false;
  }
  i32Const(v) {
    this._checkNotFinalized();
    this.instructions.push({ op: "I32_CONST", val: v });
    this.lastInstructionWasTerminator = false;
  }
  i64Const(v) {
    this._checkNotFinalized();
    this.instructions.push({ op: "I64_CONST", val: v });
    this.lastInstructionWasTerminator = false;
  }
  f32Const(v) {
    this._checkNotFinalized();
    this.instructions.push({ op: "F32_CONST", val: v });
    this.lastInstructionWasTerminator = false;
  }
  f64Const(v) {
    this._checkNotFinalized();
    this.instructions.push({ op: "F64_CONST", val: v });
    this.lastInstructionWasTerminator = false;
  }
  _u(op) {
    this._checkNotFinalized();
    this.instructions.push({ op });
    this.lastInstructionWasTerminator = false;
  }
  i32Clz() {
    this._u("I32_CLZ");
  }
  i32Ctz() {
    this._u("I32_CTZ");
  }
  i32Popcnt() {
    this._u("I32_POPCNT");
  }
  i64Clz() {
    this._u("I64_CLZ");
  }
  i64Ctz() {
    this._u("I64_CTZ");
  }
  i64Popcnt() {
    this._u("I64_POPCNT");
  }
  i32Rotl() {
    this._u("I32_ROTL");
  }
  i32Rotr() {
    this._u("I32_ROTR");
  }
  i64Rotl() {
    this._u("I64_ROTL");
  }
  i64Rotr() {
    this._u("I64_ROTR");
  }
  i32Eqz() {
    this._u("I32_EQZ");
  }
  i64Eqz() {
    this._u("I64_EQZ");
  }
  i32Eq() {
    this._u("I32_EQ");
  }
  i32Ne() {
    this._u("I32_NE");
  }
  i32LtS() {
    this._u("I32_LT_S");
  }
  i32LtU() {
    this._u("I32_LT_U");
  }
  i32GtS() {
    this._u("I32_GT_S");
  }
  i32GtU() {
    this._u("I32_GT_U");
  }
  i32LeS() {
    this._u("I32_LE_S");
  }
  i32LeU() {
    this._u("I32_LE_U");
  }
  i32GeS() {
    this._u("I32_GE_S");
  }
  i32GeU() {
    this._u("I32_GE_U");
  }
  i32Add() {
    this._u("I32_ADD");
  }
  i32Sub() {
    this._u("I32_SUB");
  }
  i32Mul() {
    this._u("I32_MUL");
  }
  i32DivS() {
    this._u("I32_DIV_S");
  }
  i32DivU() {
    this._u("I32_DIV_U");
  }
  i32RemS() {
    this._u("I32_REM_S");
  }
  i32RemU() {
    this._u("I32_REM_U");
  }
  i32And() {
    this._u("I32_AND");
  }
  i32Or() {
    this._u("I32_OR");
  }
  i32Xor() {
    this._u("I32_XOR");
  }
  i32Shl() {
    this._u("I32_SHL");
  }
  i32ShrS() {
    this._u("I32_SHR_S");
  }
  i32ShrU() {
    this._u("I32_SHR_U");
  }
  i32DataConst(val) {
    this._checkNotFinalized();
    this.instructions.push({ op: "I32_DATA_CONST", val });
    this.lastInstructionWasTerminator = false;
  }
  i64Eq() {
    this._u("I64_EQ");
  }
  i64Ne() {
    this._u("I64_NE");
  }
  i64LtS() {
    this._u("I64_LT_S");
  }
  i64LtU() {
    this._u("I64_LT_U");
  }
  i64GtS() {
    this._u("I64_GT_S");
  }
  i64GtU() {
    this._u("I64_GT_U");
  }
  i64LeS() {
    this._u("I64_LE_S");
  }
  i64LeU() {
    this._u("I64_LE_U");
  }
  i64GeS() {
    this._u("I64_GE_S");
  }
  i64GeU() {
    this._u("I64_GE_U");
  }
  i64Add() {
    this._u("I64_ADD");
  }
  i64Sub() {
    this._u("I64_SUB");
  }
  i64Mul() {
    this._u("I64_MUL");
  }
  i64DivS() {
    this._u("I64_DIV_S");
  }
  i64DivU() {
    this._u("I64_DIV_U");
  }
  i64RemS() {
    this._u("I64_REM_S");
  }
  i64RemU() {
    this._u("I64_REM_U");
  }
  i64And() {
    this._u("I64_AND");
  }
  i64Or() {
    this._u("I64_OR");
  }
  i64Xor() {
    this._u("I64_XOR");
  }
  i64Shl() {
    this._u("I64_SHL");
  }
  i64ShrS() {
    this._u("I64_SHR_S");
  }
  i64ShrU() {
    this._u("I64_SHR_U");
  }
  f32Abs() {
    this._u("F32_ABS");
  }
  f32Neg() {
    this._u("F32_NEG");
  }
  f32Ceil() {
    this._u("F32_CEIL");
  }
  f32Floor() {
    this._u("F32_FLOOR");
  }
  f32Trunc() {
    this._u("F32_TRUNC");
  }
  f32Nearest() {
    this._u("F32_NEAREST");
  }
  f32Sqrt() {
    this._u("F32_SQRT");
  }
  f32Add() {
    this._u("F32_ADD");
  }
  f32Sub() {
    this._u("F32_SUB");
  }
  f32Mul() {
    this._u("F32_MUL");
  }
  f32Div() {
    this._u("F32_DIV");
  }
  f32Min() {
    this._u("F32_MIN");
  }
  f32Max() {
    this._u("F32_MAX");
  }
  f32Copysign() {
    this._u("F32_COPYSIGN");
  }
  f32Eq() {
    this._u("F32_EQ");
  }
  f32Ne() {
    this._u("F32_NE");
  }
  f32Lt() {
    this._u("F32_LT");
  }
  f32Gt() {
    this._u("F32_GT");
  }
  f32Le() {
    this._u("F32_LE");
  }
  f32Ge() {
    this._u("F32_GE");
  }
  f64Abs() {
    this._u("F64_ABS");
  }
  f64Neg() {
    this._u("F64_NEG");
  }
  f64Ceil() {
    this._u("F64_CEIL");
  }
  f64Floor() {
    this._u("F64_FLOOR");
  }
  f64Trunc() {
    this._u("F64_TRUNC");
  }
  f64Nearest() {
    this._u("F64_NEAREST");
  }
  f64Sqrt() {
    this._u("F64_SQRT");
  }
  f64Add() {
    this._u("F64_ADD");
  }
  f64Sub() {
    this._u("F64_SUB");
  }
  f64Mul() {
    this._u("F64_MUL");
  }
  f64Div() {
    this._u("F64_DIV");
  }
  f64Min() {
    this._u("F64_MIN");
  }
  f64Max() {
    this._u("F64_MAX");
  }
  f64Copysign() {
    this._u("F64_COPYSIGN");
  }
  f64Eq() {
    this._u("F64_EQ");
  }
  f64Ne() {
    this._u("F64_NE");
  }
  f64Lt() {
    this._u("F64_LT");
  }
  f64Gt() {
    this._u("F64_GT");
  }
  f64Le() {
    this._u("F64_LE");
  }
  f64Ge() {
    this._u("F64_GE");
  }
  i32WrapI64() {
    this._u("I32_WRAP_I64");
  }
  i32TruncF32S() {
    this._u("I32_TRUNC_F32_S");
  }
  i32TruncF32U() {
    this._u("I32_TRUNC_F32_U");
  }
  i32TruncF64S() {
    this._u("I32_TRUNC_F64_S");
  }
  i32TruncF64U() {
    this._u("I32_TRUNC_F64_U");
  }
  i64TruncF32S() {
    this._u("I64_TRUNC_F32_S");
  }
  i64TruncF32U() {
    this._u("I64_TRUNC_F32_U");
  }
  i64TruncF64S() {
    this._u("I64_TRUNC_F64_S");
  }
  i64TruncF64U() {
    this._u("I64_TRUNC_F64_U");
  }
  f32ConvertI32S() {
    this._u("F32_CONVERT_I32_S");
  }
  f32ConvertI32U() {
    this._u("F32_CONVERT_I32_U");
  }
  f32ConvertI64S() {
    this._u("F32_CONVERT_I64_S");
  }
  f32ConvertI64U() {
    this._u("F32_CONVERT_I64_U");
  }
  f64ConvertI32S() {
    this._u("F64_CONVERT_I32_S");
  }
  f64ConvertI32U() {
    this._u("F64_CONVERT_I32_U");
  }
  f64ConvertI64S() {
    this._u("F64_CONVERT_I64_S");
  }
  f64ConvertI64U() {
    this._u("F64_CONVERT_I64_U");
  }
  f32DemoteF64() {
    this._u("F32_DEMOTE_F64");
  }
  f64PromoteF32() {
    this._u("F64_PROMOTE_F32");
  }
  i32ReinterpretF32() {
    this._u("I32_REINTERPRET_F32");
  }
  i64ReinterpretF64() {
    this._u("I64_REINTERPRET_F64");
  }
  f32ReinterpretI32() {
    this._u("F32_REINTERPRET_I32");
  }
  f64ReinterpretI64() {
    this._u("F64_REINTERPRET_I64");
  }
  i64ExtendI32S() {
    this._u("I64_EXTEND_I32_S");
  }
  i64ExtendI32U() {
    this._u("I64_EXTEND_I32_U");
  }
  i32TruncSatF32S() {
    this._u("I32_TRUNC_SAT_F32_S");
  }
  i32TruncSatF32U() {
    this._u("I32_TRUNC_SAT_F32_U");
  }
  i32TruncSatF64S() {
    this._u("I32_TRUNC_SAT_F64_S");
  }
  i32TruncSatF64U() {
    this._u("I32_TRUNC_SAT_F64_U");
  }
  i64TruncSatF32S() {
    this._u("I64_TRUNC_SAT_F32_S");
  }
  i64TruncSatF32U() {
    this._u("I64_TRUNC_SAT_F32_U");
  }
  i64TruncSatF64S() {
    this._u("I64_TRUNC_SAT_F64_S");
  }
  i64TruncSatF64U() {
    this._u("I64_TRUNC_SAT_F64_U");
  }
  select() {
    this._u("SELECT");
  }
  selectT(types) {
    this._checkNotFinalized();
    this.instructions.push({ op: "SELECT_T", types });
    this.lastInstructionWasTerminator = false;
  }
  refNull(type) {
    this._checkNotFinalized();
    this.instructions.push({ op: "REF_NULL", type });
    this.lastInstructionWasTerminator = false;
  }
  refIsNull() {
    this._u("REF_IS_NULL");
  }
  refFunc(index) {
    this._checkNotFinalized();
    this.instructions.push({ op: "REF_FUNC", index });
    this.lastInstructionWasTerminator = false;
  }
  refFuncByName(name) {
    this._checkNotFinalized();
    this.instructions.push({ op: "REF_FUNC_BY_NAME", name });
    this.lastInstructionWasTerminator = false;
  }
  tableGet(t = 0) {
    this._checkNotFinalized();
    this.instructions.push({ op: "TABLE_GET", tableIdx: t });
    this.lastInstructionWasTerminator = false;
  }
  tableSet(t = 0) {
    this._checkNotFinalized();
    this.instructions.push({ op: "TABLE_SET", tableIdx: t });
    this.lastInstructionWasTerminator = false;
  }
  tableGrow(t = 0) {
    this._checkNotFinalized();
    this.instructions.push({ op: "TABLE_GROW", tableIdx: t });
    this.lastInstructionWasTerminator = false;
  }
  tableSize(t = 0) {
    this._checkNotFinalized();
    this.instructions.push({ op: "TABLE_SIZE", tableIdx: t });
    this.lastInstructionWasTerminator = false;
  }
  tableFill(t = 0) {
    this._checkNotFinalized();
    this.instructions.push({ op: "TABLE_FILL", tableIdx: t });
    this.lastInstructionWasTerminator = false;
  }
  tableCopy(dst = 0, src = 0) {
    this._checkNotFinalized();
    this.instructions.push({ op: "TABLE_COPY", dstIdx: dst, srcIdx: src });
    this.lastInstructionWasTerminator = false;
  }
  tableInit(tableIdx = 0, elemIdx = 0) {
    this._checkNotFinalized();
    this.instructions.push({ op: "TABLE_INIT", tableIdx, elemIdx });
    this.lastInstructionWasTerminator = false;
  }
  elemDrop(elemIdx) {
    this._checkNotFinalized();
    this.instructions.push({ op: "ELEM_DROP", elemIdx });
    this.lastInstructionWasTerminator = false;
  }
  memoryInit(dataIdx) {
    this._checkNotFinalized();
    this.needsMemory = true;
    this.instructions.push({ op: "MEMORY_INIT", dataIdx });
    this.lastInstructionWasTerminator = false;
  }
  dataDrop(dataIdx) {
    this._checkNotFinalized();
    this.instructions.push({ op: "DATA_DROP", dataIdx });
    this.lastInstructionWasTerminator = false;
  }
  memoryFill() {
    this._checkNotFinalized();
    this.needsMemory = true;
    this.instructions.push({ op: "MEMORY_FILL" });
    this.lastInstructionWasTerminator = false;
  }
  memoryCopy() {
    this._checkNotFinalized();
    this.needsMemory = true;
    this.instructions.push({ op: "MEMORY_COPY" });
    this.lastInstructionWasTerminator = false;
  }
  ensureTableCapacity(tableIdx, indexLocal, fillRefType = "funcref") {
    this._checkNotFinalized();
    const idx = this._resolveLocal(indexLocal);
    this.getLocal(idx);
    this.tableSize(tableIdx);
    this.i32GeU();
    this.if_("void");
    this.refNull(fillRefType);
    this.getLocal(idx);
    this.i32Const(1);
    this.i32Add();
    this.tableSize(tableIdx);
    this.i32Sub();
    this.tableGrow(tableIdx);
    this.drop();
    this.end();
  }
  _memOp(op, offset = 0, align = 0) {
    this._checkNotFinalized();
    this.needsMemory = true;
    this.instructions.push({ op, offset, align });
    this.lastInstructionWasTerminator = false;
  }
  i32Load(o = 0, a = 0) {
    this._memOp("I32_LOAD", o, a);
  }
  i64Load(o = 0, a = 0) {
    this._memOp("I64_LOAD", o, a);
  }
  f32Load(o = 0, a = 0) {
    this._memOp("F32_LOAD", o, a);
  }
  f64Load(o = 0, a = 0) {
    this._memOp("F64_LOAD", o, a);
  }
  i32Load8S(o = 0, a = 0) {
    this._memOp("I32_LOAD8_S", o, a);
  }
  i32Load8U(o = 0, a = 0) {
    this._memOp("I32_LOAD8_U", o, a);
  }
  i32Load16S(o = 0, a = 0) {
    this._memOp("I32_LOAD16_S", o, a);
  }
  i32Load16U(o = 0, a = 0) {
    this._memOp("I32_LOAD16_U", o, a);
  }
  i64Load8S(o = 0, a = 0) {
    this._memOp("I64_LOAD8_S", o, a);
  }
  i64Load8U(o = 0, a = 0) {
    this._memOp("I64_LOAD8_U", o, a);
  }
  i64Load16S(o = 0, a = 0) {
    this._memOp("I64_LOAD16_S", o, a);
  }
  i64Load16U(o = 0, a = 0) {
    this._memOp("I64_LOAD16_U", o, a);
  }
  i64Load32S(o = 0, a = 0) {
    this._memOp("I64_LOAD32_S", o, a);
  }
  i64Load32U(o = 0, a = 0) {
    this._memOp("I64_LOAD32_U", o, a);
  }
  i32Store(o = 0, a = 0) {
    this._memOp("I32_STORE", o, a);
  }
  i64Store(o = 0, a = 0) {
    this._memOp("I64_STORE", o, a);
  }
  f32Store(o = 0, a = 0) {
    this._memOp("F32_STORE", o, a);
  }
  f64Store(o = 0, a = 0) {
    this._memOp("F64_STORE", o, a);
  }
  i32Store8(o = 0, a = 0) {
    this._memOp("I32_STORE8", o, a);
  }
  i32Store16(o = 0, a = 0) {
    this._memOp("I32_STORE16", o, a);
  }
  i64Store8(o = 0, a = 0) {
    this._memOp("I64_STORE8", o, a);
  }
  i64Store16(o = 0, a = 0) {
    this._memOp("I64_STORE16", o, a);
  }
  i64Store32(o = 0, a = 0) {
    this._memOp("I64_STORE32", o, a);
  }
  memorySize() {
    this._memOp("MEMORY_SIZE");
  }
  memoryGrow() {
    this._memOp("MEMORY_GROW");
  }
  call(index) {
    this._checkNotFinalized();
    this.instructions.push({ op: "CALL", index });
    this.lastInstructionWasTerminator = false;
  }
  callByName(name) {
    this._checkNotFinalized();
    this.instructions.push({ op: "CALL_BY_NAME", name });
    this.lastInstructionWasTerminator = false;
  }
  callIndirect(typeIdx) {
    this._checkNotFinalized();
    this.instructions.push({ op: "CALL_INDIRECT", typeIdx });
    this.lastInstructionWasTerminator = false;
  }
  callRef(typeIdx) {
    this._checkNotFinalized();
    this.instructions.push({ op: "CALL_REF", typeIdx });
    this.lastInstructionWasTerminator = false;
  }
  returnCallRef(typeIdx) {
    this._checkNotFinalized();
    this.instructions.push({ op: "RETURN_CALL_REF", typeIdx });
    this.lastInstructionWasTerminator = true;
  }
  _blockTypeToOp(type) {
    if (typeof type === "number")
      return type;
    if (type === "void")
      return 64;
    return typeToOp(type);
  }
  block(type = "void", label = null) {
    this._checkNotFinalized();
    this.instructions.push({ op: "BLOCK", blocktype: this._blockTypeToOp(type) });
    this.blockLabelStack.push(label);
    this.lastInstructionWasTerminator = false;
  }
  loop(type = "void", label = null) {
    this._checkNotFinalized();
    this.instructions.push({ op: "LOOP", blocktype: this._blockTypeToOp(type) });
    this.blockLabelStack.push(label);
    this.lastInstructionWasTerminator = false;
  }
  if_(type = "void", label = null) {
    this._checkNotFinalized();
    this.instructions.push({ op: "IF", blocktype: this._blockTypeToOp(type) });
    this.blockLabelStack.push(label);
    this.lastInstructionWasTerminator = false;
  }
  else_() {
    this._checkNotFinalized();
    this.instructions.push({ op: "ELSE" });
    this.lastInstructionWasTerminator = false;
  }
  end() {
    this._checkNotFinalized();
    this.instructions.push({ op: "END" });
    this.blockLabelStack.pop();
    this.lastInstructionWasTerminator = false;
  }
  _getDepthToLabel(label) {
    for (let i = this.blockLabelStack.length - 1, depth = 0;i >= 0; i--, depth++) {
      if (this.blockLabelStack[i] === label)
        return depth;
    }
    throw new Error(`Etiqueta de bloque no encontrada: ${label}`);
  }
  brTo(label) {
    this._checkNotFinalized();
    this.instructions.push({ op: "BR", depth: this._getDepthToLabel(label) });
    this.lastInstructionWasTerminator = true;
  }
  brIfTo(label) {
    this._checkNotFinalized();
    this.instructions.push({ op: "BR_IF", depth: this._getDepthToLabel(label) });
    this.lastInstructionWasTerminator = false;
  }
  br(depth) {
    this._checkNotFinalized();
    this.instructions.push({ op: "BR", depth });
    this.lastInstructionWasTerminator = true;
  }
  brIf(depth) {
    this._checkNotFinalized();
    this.instructions.push({ op: "BR_IF", depth });
    this.lastInstructionWasTerminator = false;
  }
  br_table(targets, defaultTarget) {
    this._checkNotFinalized();
    let labels;
    let defaultDepth;
    if (targets.length > 0 && typeof targets[0] === "string") {
      labels = targets.map((l) => this._getDepthToLabel(l));
      defaultDepth = typeof defaultTarget === "string" ? this._getDepthToLabel(defaultTarget) : defaultTarget;
    } else {
      labels = targets;
      defaultDepth = defaultTarget;
    }
    this.instructions.push({ op: "BR_TABLE", labels, default: defaultDepth });
    this.lastInstructionWasTerminator = true;
  }
  return_() {
    this._checkNotFinalized();
    this.instructions.push({ op: "RETURN" });
    this.lastInstructionWasTerminator = true;
  }
  drop() {
    this._checkNotFinalized();
    this.instructions.push({ op: "DROP" });
    this.lastInstructionWasTerminator = false;
  }
  unreachable() {
    this._checkNotFinalized();
    this.instructions.push({ op: "UNREACHABLE" });
    this.lastInstructionWasTerminator = true;
  }
  nop() {
    this._checkNotFinalized();
    this.instructions.push({ op: "NOP" });
    this.lastInstructionWasTerminator = false;
  }
  simd(name) {
    this._checkNotFinalized();
    this.instructions.push({ op: "SIMD_NOIMM", name });
    this.lastInstructionWasTerminator = false;
  }
  simdMem(name, offset = 0, align = 0) {
    this._checkNotFinalized();
    this.needsMemory = true;
    this.instructions.push({ op: "SIMD_MEMARG", name, offset, align });
    this.lastInstructionWasTerminator = false;
  }
  simdMemLane(name, lane, offset = 0, align = 0) {
    this._checkNotFinalized();
    const max = simdMaxLane(name);
    if (!Number.isInteger(lane) || lane < 0 || lane > max) {
      throw new Error(`simdMemLane: lane fuera de rango para ${name} (0..${max}, recibido ${lane})`);
    }
    this.needsMemory = true;
    this.instructions.push({ op: "SIMD_MEMARG_LANE", name, offset, align, lane });
    this.lastInstructionWasTerminator = false;
  }
  simdLane(name, lane) {
    this._checkNotFinalized();
    const max = simdMaxLane(name);
    if (!Number.isInteger(lane) || lane < 0 || lane > max) {
      throw new Error(`simdLane: lane fuera de rango para ${name} (0..${max}, recibido ${lane})`);
    }
    this.instructions.push({ op: "SIMD_LANE", name, lane });
    this.lastInstructionWasTerminator = false;
  }
  v128Const(bytes) {
    if (bytes.length !== 16)
      throw new Error("v128.const requiere exactamente 16 bytes");
    this._checkNotFinalized();
    this.instructions.push({ op: "SIMD_CONST", bytes: [...bytes] });
    this.lastInstructionWasTerminator = false;
  }
  v128ConstI32x4(a, b, c, d) {
    const bytes = [];
    for (const v of [a, b, c, d]) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, v | 0, true);
      bytes.push(...new Uint8Array(buf));
    }
    this.v128Const(bytes);
  }
  v128ConstF32x4(a, b, c, d) {
    const bytes = [];
    for (const v of [a, b, c, d]) {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, v, true);
      bytes.push(...new Uint8Array(buf));
    }
    this.v128Const(bytes);
  }
  v128ConstF64x2(a, b) {
    const bytes = [];
    for (const v of [a, b]) {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, v, true);
      bytes.push(...new Uint8Array(buf));
    }
    this.v128Const(bytes);
  }
  v128ConstI64x2(a, b) {
    const bytes = [];
    for (const v of [a, b]) {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setBigInt64(0, BigInt.asIntN(64, BigInt(v)), true);
      bytes.push(...new Uint8Array(buf));
    }
    this.v128Const(bytes);
  }
  v128ConstI16x8(...vals) {
    if (vals.length !== 8)
      throw new Error("v128ConstI16x8 requiere 8 valores");
    const bytes = [];
    for (const v of vals) {
      const buf = new ArrayBuffer(2);
      new DataView(buf).setInt16(0, v | 0, true);
      bytes.push(...new Uint8Array(buf));
    }
    this.v128Const(bytes);
  }
  v128ConstI8x16(...vals) {
    if (vals.length !== 16)
      throw new Error("v128ConstI8x16 requiere 16 valores");
    this.v128Const(vals.map((v) => v & 255));
  }
  i8x16Shuffle(lanes) {
    if (lanes.length !== 16)
      throw new Error("i8x16.shuffle requiere 16 lane indices");
    for (const l of lanes)
      if (l < 0 || l > 31)
        throw new Error(`lane fuera de rango: ${l}`);
    this._checkNotFinalized();
    this.instructions.push({ op: "SIMD_SHUFFLE", lanes: [...lanes] });
    this.lastInstructionWasTerminator = false;
  }
  finalize() {
    if (this.finalized)
      return;
    if (this.blockLabelStack.length > 0) {
      throw new Error(`Hay ${this.blockLabelStack.length} bloque(s) sin cerrar al finalizar la función`);
    }
    this.finalized = true;
  }
  getLocals() {
    const locals = [];
    let currentType = null;
    let currentCount = 0;
    for (let i = this.paramTypes.length;i < this.nextLocalIdx; i++) {
      const type = this.localTypes[i];
      if (type === undefined)
        continue;
      if (currentType === type)
        currentCount++;
      else {
        if (currentType !== null)
          locals.push({ count: currentCount, type: typeToOp(currentType) });
        currentType = type;
        currentCount = 1;
      }
    }
    if (currentType !== null)
      locals.push({ count: currentCount, type: typeToOp(currentType) });
    return locals;
  }
  pruneUnusedLocals() {
    if (!this.finalized) {
      throw new Error("pruneUnusedLocals: la función debe estar finalizada");
    }
    const paramCount = this.paramTypes.length;
    const instrs = this.instructions;
    const read = new Set;
    for (const instr of instrs) {
      if (instr.op === "LOCAL_GET" || instr.op === "LOCAL_TEE") {
        read.add(instr.index);
      }
    }
    const keep = new Set;
    for (let i = 0;i < paramCount; i++)
      keep.add(i);
    for (const i of read)
      keep.add(i);
    const remap = new Map;
    let next = 0;
    for (let i = 0;i < this.nextLocalIdx; i++) {
      if (keep.has(i))
        remap.set(i, next++);
    }
    const newInstrs = [];
    for (const instr of instrs) {
      if (instr.op === "LOCAL_GET" || instr.op === "LOCAL_SET" || instr.op === "LOCAL_TEE") {
        const mapped = remap.get(instr.index);
        if (mapped === undefined) {
          if (instr.op === "LOCAL_SET") {
            newInstrs.push({ op: "DROP" });
          } else if (instr.op === "LOCAL_TEE") {
            newInstrs.push({ op: "NOP" });
          } else {
            throw new Error("pruneUnusedLocals: LOCAL_GET de local eliminado");
          }
        } else {
          instr.index = mapped;
          newInstrs.push(instr);
        }
      } else {
        newInstrs.push(instr);
      }
    }
    this.instructions = newInstrs;
    const newTypes = this.paramTypes.slice();
    for (const [oldIdx, newIdx] of remap) {
      if (oldIdx < paramCount)
        continue;
      newTypes[newIdx] = this.localTypes[oldIdx];
    }
    this.localTypes = newTypes;
    this.nextLocalIdx = next;
  }
}
var I32_SAFE_PRODUCERS = new Set([
  "I32_CONST",
  "I32_DATA_CONST",
  "LOCAL_GET",
  "LOCAL_TEE",
  "GLOBAL_GET",
  "I32_LOAD",
  "I32_LOAD8_S",
  "I32_LOAD8_U",
  "I32_LOAD16_S",
  "I32_LOAD16_U",
  "I32_ADD",
  "I32_SUB",
  "I32_MUL",
  "I32_DIV_S",
  "I32_DIV_U",
  "I32_REM_S",
  "I32_REM_U",
  "I32_AND",
  "I32_OR",
  "I32_XOR",
  "I32_SHL",
  "I32_SHR_S",
  "I32_SHR_U",
  "I32_ROTL",
  "I32_ROTR",
  "I32_CLZ",
  "I32_CTZ",
  "I32_POPCNT",
  "I32_EQZ",
  "I32_EQ",
  "I32_NE",
  "I32_LT_S",
  "I32_LT_U",
  "I32_GT_S",
  "I32_GT_U",
  "I32_LE_S",
  "I32_LE_U",
  "I32_GE_S",
  "I32_GE_U",
  "I32_WRAP_I64",
  "I32_TRUNC_F32_S",
  "I32_TRUNC_F32_U",
  "I32_TRUNC_F64_S",
  "I32_TRUNC_F64_U",
  "I32_REINTERPRET_F32",
  "I32_TRUNC_SAT_F32_S",
  "I32_TRUNC_SAT_F32_U",
  "I32_TRUNC_SAT_F64_S",
  "I32_TRUNC_SAT_F64_U",
  "MEMORY_SIZE"
]);
var IR_TERMINATORS = new Set([
  "RETURN",
  "UNREACHABLE",
  "BR",
  "BR_TABLE",
  "RETURN_CALL_REF"
]);
var IR_BLOCK_OPENERS = new Set(["BLOCK", "LOOP", "IF"]);
function removeDeadCode(ir) {
  const out = [];
  const deadStack = [false];
  const savedOuter = [false];
  const isDead = () => deadStack[deadStack.length - 1];
  for (const instr of ir) {
    const op = instr.op;
    if (IR_BLOCK_OPENERS.has(op)) {
      const outerDead = isDead();
      savedOuter.push(outerDead);
      deadStack.push(outerDead);
      if (!outerDead)
        out.push(instr);
      continue;
    }
    if (op === "ELSE") {
      const outerDead = savedOuter[savedOuter.length - 1];
      deadStack[deadStack.length - 1] = outerDead;
      if (!outerDead)
        out.push(instr);
      continue;
    }
    if (op === "END") {
      deadStack.pop();
      const wasEnteredLive = !savedOuter.pop();
      if (wasEnteredLive)
        out.push(instr);
      continue;
    }
    if (IR_TERMINATORS.has(op)) {
      if (!isDead()) {
        out.push(instr);
        deadStack[deadStack.length - 1] = true;
      }
      continue;
    }
    if (!isDead())
      out.push(instr);
  }
  return out;
}
function tryFoldI32Binop(a, b, op) {
  switch (op) {
    case "I32_ADD":
      return a + b | 0;
    case "I32_SUB":
      return a - b | 0;
    case "I32_MUL":
      return Math.imul(a, b);
    case "I32_DIV_S":
      return b === 0 ? null : a / b | 0;
    case "I32_DIV_U":
      return b === 0 ? null : (a >>> 0) / (b >>> 0) >>> 0;
    case "I32_REM_S":
      return b === 0 ? null : a % b | 0;
    case "I32_REM_U":
      return b === 0 ? null : (a >>> 0) % (b >>> 0) >>> 0;
    case "I32_AND":
      return a & b;
    case "I32_OR":
      return a | b;
    case "I32_XOR":
      return a ^ b;
    case "I32_SHL":
      return a << (b & 31) | 0;
    case "I32_SHR_S":
      return a >> (b & 31);
    case "I32_SHR_U":
      return a >>> (b & 31);
    case "I32_ROTL": {
      const n = b & 31;
      return a << n | a >>> 32 - n | 0;
    }
    case "I32_ROTR": {
      const n = b & 31;
      return a >>> n | a << 32 - n | 0;
    }
    case "I32_EQ":
      return a === b ? 1 : 0;
    case "I32_NE":
      return a !== b ? 1 : 0;
    case "I32_LT_S":
      return a < b ? 1 : 0;
    case "I32_LT_U":
      return a >>> 0 < b >>> 0 ? 1 : 0;
    case "I32_GT_S":
      return a > b ? 1 : 0;
    case "I32_GT_U":
      return a >>> 0 > b >>> 0 ? 1 : 0;
    case "I32_LE_S":
      return a <= b ? 1 : 0;
    case "I32_LE_U":
      return a >>> 0 <= b >>> 0 ? 1 : 0;
    case "I32_GE_S":
      return a >= b ? 1 : 0;
    case "I32_GE_U":
      return a >>> 0 >= b >>> 0 ? 1 : 0;
    default:
      return null;
  }
}
function peephole(ir) {
  const out = [];
  for (let i = 0;i < ir.length; i++) {
    const a = ir[i];
    const b = ir[i + 1];
    const c = ir[i + 2];
    if (a && b && c && I32_SAFE_PRODUCERS.has(a.op) && b.op === "I32_CONST" && b.val === 0 && c.op === "I32_ADD") {
      out.push(a);
      i += 2;
      continue;
    }
    if (a && b && c && I32_SAFE_PRODUCERS.has(a.op) && b.op === "I32_CONST" && b.val === 1 && c.op === "I32_MUL") {
      out.push(a);
      i += 2;
      continue;
    }
    if (a && b && c && I32_SAFE_PRODUCERS.has(a.op) && b.op === "I32_CONST" && b.val === 0 && c.op === "I32_OR") {
      out.push(a);
      i += 2;
      continue;
    }
    if (a && b && c && I32_SAFE_PRODUCERS.has(a.op) && b.op === "I32_CONST" && b.val === -1 && c.op === "I32_AND") {
      out.push(a);
      i += 2;
      continue;
    }
    if (a && b && c && (a.op === "I32_CONST" || a.op === "I32_DATA_CONST") && (b.op === "I32_CONST" || b.op === "I32_DATA_CONST") && typeof a.val === "number" && typeof b.val === "number") {
      const folded = tryFoldI32Binop(a.val, b.val, c.op);
      if (folded !== null) {
        out.push({ op: "I32_CONST", val: folded });
        i += 2;
        continue;
      }
    }
    if (a && b && a.op === "LOCAL_SET" && b.op === "LOCAL_GET" && a.index === b.index) {
      out.push({ op: "LOCAL_TEE", index: a.index });
      i += 1;
      continue;
    }
    if (a && b && a.op === "LOCAL_GET" && b.op === "LOCAL_SET" && a.index === b.index) {
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}
function optimizeIR(ir) {
  let cur = ir;
  for (let iter = 0;iter < 8; iter++) {
    const next = peephole(removeDeadCode(cur));
    if (next.length === cur.length)
      break;
    cur = next;
  }
  return cur;
}

class ModuleBuilder {
  types = [];
  externals = [];
  functions = [];
  globals = [];
  tables = [];
  funcNameToIndex = new Map;
  globalNameToIndex = new Map;
  hasMemory = false;
  memoryInitial = 1;
  memoryMax;
  dataSegments = [];
  elements = [];
  pendingElements = [];
  funcAliasToIndex = new Map;
  functionTableIndices = new Map;
  customSections = [];
  startFunction = null;
  lambdaCounter = 0;
  typeNameToIdx = new Map;
  dynamicTableMin = 0;
  tableAuto = false;
  stringPool = null;
  setFunctionTableIndex(funcName, tableIndex) {
    this.functionTableIndices.set(funcName, tableIndex);
  }
  getFunctionTableIndex(funcName) {
    const idx = this.functionTableIndices.get(funcName);
    if (idx === undefined)
      throw new Error(`Función sin índice de tabla: ${funcName}`);
    return idx;
  }
  addFunctionToTable(funcName, tableIndex, offset) {
    const actualOffset = offset ?? tableIndex;
    this.setFunctionTableIndex(funcName, actualOffset);
    this.addElementSegment(0, actualOffset, [funcName]);
  }
  setStart(funcNameOrIndex) {
    this.startFunction = funcNameOrIndex;
  }
  addCustomSection(name, data, atEnd = false) {
    this.customSections.push({ name, data, atEnd });
  }
  addNameSection(moduleName, funcNames, localNames) {
    const buf = [];
    if (moduleName !== null) {
      const sub = [...encodeName(moduleName)];
      buf.push(0, ...encodeLEB128(sub.length), ...sub);
    }
    if (funcNames.size > 0) {
      const sub = [...encodeLEB128(funcNames.size)];
      const entries = [...funcNames.entries()].sort((a, b) => a[0] - b[0]);
      for (const [idx, name] of entries) {
        sub.push(...encodeLEB128(idx), ...encodeName(name));
      }
      buf.push(1, ...encodeLEB128(sub.length), ...sub);
    }
    if (localNames && localNames.size > 0) {
      const sub = [...encodeLEB128(localNames.size)];
      const funcs = [...localNames.entries()].sort((a, b) => a[0] - b[0]);
      for (const [funcIdx, locals] of funcs) {
        sub.push(...encodeLEB128(funcIdx), ...encodeLEB128(locals.size));
        const sorted = [...locals.entries()].sort((a, b) => a[0] - b[0]);
        for (const [localIdx, name] of sorted) {
          sub.push(...encodeLEB128(localIdx), ...encodeName(name));
        }
      }
      buf.push(2, ...encodeLEB128(sub.length), ...sub);
    }
    this.addCustomSection("name", buf, true);
  }
  addProducersSection(producers) {
    const buf = [...encodeLEB128(producers.length)];
    for (const p of producers) {
      buf.push(...encodeName(p.field));
      buf.push(...encodeLEB128(p.values.length));
      for (const v of p.values) {
        buf.push(...encodeName(v.name), ...encodeName(v.version));
      }
    }
    this.addCustomSection("producers", buf, true);
  }
  getStringPool(baseOffset) {
    if (!this.stringPool) {
      this.stringPool = new StringPool(baseOffset ?? 0);
    } else if (baseOffset !== undefined && baseOffset !== this.stringPool.getBaseOffset()) {
      throw new Error(`StringPool ya tiene baseOffset=${this.stringPool.getBaseOffset()}, no se puede cambiar a ${baseOffset}`);
    }
    return this.stringPool;
  }
  getStringPoolOrNull() {
    return this.stringPool;
  }
  attachStringPool(pool) {
    if (this.stringPool && this.stringPool !== pool) {
      throw new Error("Ya existe un StringPool asociado al módulo");
    }
    this.stringPool = pool;
  }
  ensureStringData() {
    this.prepareStringData();
  }
  addString(text) {
    return this.getStringPool().add(text);
  }
  getTypeIndex(paramTypes, returnTypes) {
    return this._getTypeIdx(paramTypes, returnTypes);
  }
  getStaticDataSize() {
    return this.dataSegments.reduce((max, seg) => Math.max(max, seg.offset + seg.data.length), 0);
  }
  getMemoryInitialPages() {
    return this.memoryInitial;
  }
  getStaticDataEnd(align = 8) {
    let end = 0;
    for (const seg of this.dataSegments) {
      const e = seg.offset + seg.data.length;
      if (e > end)
        end = e;
    }
    if (this.stringPool) {
      for (const seg of this.stringPool.getDataSegments()) {
        const e = seg.offset + seg.data.length;
        if (e > end)
          end = e;
      }
    }
    if (align <= 1)
      return end;
    return end + (align - 1) & ~(align - 1);
  }
  prepareStringData() {
    if (!this.stringPool)
      return;
    this.dataSegments = this.dataSegments.filter((ds) => !ds.fromStringPool);
    const segments = this.stringPool.getDataSegments();
    if (segments.length === 0)
      return;
    this.hasMemory = true;
    for (const seg of segments) {
      const newSeg = {
        offset: seg.offset,
        data: Array.from(seg.data),
        fromStringPool: true
      };
      this.dataSegments.push(newSeg);
      this._updateMemoryForData(newSeg.offset, newSeg.data.length);
    }
  }
  _getTypeIdx(paramTypes, returnTypes) {
    const params = paramTypes.map(typeToOp);
    const results = returnTypes.map(typeToOp);
    const key = JSON.stringify({ params, results });
    let idx = this.types.findIndex((t) => JSON.stringify(t) === key);
    if (idx !== -1)
      return idx;
    idx = this.types.length;
    this.types.push({ params, results });
    return idx;
  }
  hasMemoryImport() {
    return this.externals.some((e) => e.section === "import" && e.kind === "memory");
  }
  hasTableImport() {
    return this.externals.some((e) => e.section === "import" && e.kind === "table");
  }
  addType(nameOrParams, paramTypesOrReturn, returnTypes) {
    if (typeof nameOrParams === "string") {
      const name = nameOrParams;
      if (this.typeNameToIdx.has(name))
        throw new Error(`El tipo con nombre "${name}" ya está definido.`);
      const idx = this._getTypeIdx(paramTypesOrReturn, returnTypes);
      this.typeNameToIdx.set(name, idx);
      return idx;
    }
    return this._getTypeIdx(nameOrParams, paramTypesOrReturn);
  }
  addElementSegment(tableIndex, offset, funcNames) {
    const offsetBytes = [OP.I32_CONST, ...encodeSignedLEB128(offset), OP.END];
    this.addElementSegmentByName(tableIndex, offsetBytes, funcNames);
  }
  addElementSegmentByName(tableIndex, offsetExprBytes, funcNames) {
    const offset = this._decodeOffset(offsetExprBytes);
    const requiredMin = offset + funcNames.length;
    if (requiredMin > this.dynamicTableMin)
      this.dynamicTableMin = requiredMin;
    if (this.tables.length === 0 && !this.hasTableImport())
      this.tableAuto = true;
    const mode = tableIndex === 0 ? 0 : 2;
    this.pendingElements.push({
      mode,
      tableIndex,
      offsetBytes: offsetExprBytes,
      funcNames,
      exprs: null,
      refType: "funcref",
      elemKind: 0
    });
  }
  addPassiveElementSegment(funcNames) {
    this.pendingElements.push({
      mode: 1,
      tableIndex: 0,
      offsetBytes: null,
      funcNames,
      exprs: null,
      refType: "funcref",
      elemKind: 0
    });
  }
  addDeclarativeElementSegment(funcNames) {
    this.pendingElements.push({
      mode: 3,
      tableIndex: 0,
      offsetBytes: null,
      funcNames,
      exprs: null,
      refType: "funcref",
      elemKind: 0
    });
  }
  addElementSegmentExprs(mode, tableIndex, offsetExprBytes, exprs, refType = "funcref") {
    const elemKind = refType === "funcref" ? 0 : 1;
    if ((mode === 4 || mode === 6) && offsetExprBytes === null) {
      throw new Error(`Element mode ${mode} requiere offsetExprBytes`);
    }
    if ((mode === 5 || mode === 7) && offsetExprBytes !== null) {
      throw new Error(`Element mode ${mode} no acepta offsetExprBytes`);
    }
    if ((mode === 4 || mode === 5) && tableIndex !== 0) {
      throw new Error(`Element mode ${mode} implica table 0`);
    }
    if (mode === 4 || mode === 6) {
      const offset = this._decodeOffset(offsetExprBytes);
      const requiredMin = offset + exprs.length;
      if (requiredMin > this.dynamicTableMin)
        this.dynamicTableMin = requiredMin;
      if (this.tables.length === 0 && !this.hasTableImport())
        this.tableAuto = true;
    }
    this.pendingElements.push({
      mode,
      tableIndex,
      offsetBytes: offsetExprBytes,
      funcNames: null,
      exprs,
      refType,
      elemKind
    });
  }
  addFunctionInstance(name, builder) {
    builder.finalize();
    const typeIdx = this._getTypeIdx(builder.paramTypes, builder.returnType);
    this.functions.push({
      name,
      builder,
      paramTypes: builder.paramTypes,
      returnType: builder.returnType,
      typeIdx
    });
  }
  addFunctionImportAlias(module, field, localName, paramTypes, returnType) {
    const idx = this.addFunctionImport(module, field, paramTypes, returnType);
    this.funcAliasToIndex.set(localName, idx);
    return idx;
  }
  addFunctionImport(module, name, paramTypes, returnType) {
    const returnTypes = returnType ? Array.isArray(returnType) ? returnType : [returnType] : [];
    const typeIdx = this._getTypeIdx(paramTypes, returnTypes);
    const idx = this.externals.length;
    this.externals.push({ section: "import", name, kind: "function", module, typeIdx });
    return idx;
  }
  addMemoryImport(module, name, initial, maximum) {
    const idx = this.externals.length;
    this.externals.push({ section: "import", name, kind: "memory", module, initial, maximum });
    this.hasMemory = true;
    if (initial > this.memoryInitial)
      this.memoryInitial = initial;
    if (maximum !== undefined)
      this.memoryMax = maximum;
    return idx;
  }
  addTableImport(module, name, initial, maximum, refType = "funcref") {
    if (this.tables.length > 0) {
      throw new Error("No se puede importar tabla si ya hay una tabla local definida");
    }
    const idx = this.externals.length;
    this.externals.push({ section: "import", name, kind: "table", module, initial, maximum, refType });
    return idx;
  }
  addGlobalImport(module, name, type, mutable = false) {
    const idx = this.externals.length;
    this.externals.push({ section: "import", name, kind: "global", module, valueType: type, mutable });
    return idx;
  }
  addMemory(initial, max) {
    this.hasMemory = true;
    if (initial > this.memoryInitial)
      this.memoryInitial = initial;
    this.memoryMax = max;
  }
  _updateMemoryForData(offset, size) {
    if (this.hasMemoryImport())
      return;
    const need = Math.max(1, Math.ceil((offset + size) / 65536));
    if (need > this.memoryInitial)
      this.memoryInitial = need;
  }
  addDataSegment(offset, dataBytes) {
    this.hasMemory = true;
    this.dataSegments.push({ offset, data: dataBytes });
    this._updateMemoryForData(offset, dataBytes.length);
  }
  addStaticData(dataBuilder, baseOffset = 0) {
    const bytes = Array.from(dataBuilder.build());
    if (bytes.length === 0)
      return baseOffset;
    this.addDataSegment(baseOffset, bytes);
    return baseOffset;
  }
  addData32(offset, value) {
    this.addDataSegment(offset, [
      value & 255,
      value >> 8 & 255,
      value >> 16 & 255,
      value >> 24 & 255
    ]);
  }
  addData64(offset, value) {
    const bytes = [];
    let val = value;
    for (let i = 0;i < 8; i++) {
      bytes.push(Number(val & 0xFFn));
      val >>= 8n;
    }
    this.addDataSegment(offset, bytes);
  }
  addDataString(offset, text) {
    this.addDataSegment(offset, Array.from(new TextEncoder().encode(text)));
  }
  addGlobal(name, type, mutable, initialValue) {
    if ((Array.isArray(initialValue) || initialValue instanceof Uint8Array) && type !== "v128") {
      throw new Error(`addGlobal: initialValue tipo array/Uint8Array solo es válido para v128 (recibido para ${type})`);
    }
    let initBytes;
    if (type === "funcref" || type === "externref") {
      if (initialValue !== null) {
        throw new Error(`addGlobal: para tipo ${type} solo se permite initialValue = null (ref.null)`);
      }
      initBytes = [OP.REF_NULL, refTypeToOp(type), OP.END];
    } else if (type === "v128") {
      if (initialValue === null) {
        const zeros = new Array(16).fill(0);
        initBytes = [OP.SIMD_PREFIX, ...encodeLEB128(SIMD_CONST_SUBOP), ...zeros, OP.END];
      } else if (typeof initialValue === "number" || typeof initialValue === "bigint") {
        if (BigInt(initialValue) !== 0n) {
          throw new Error("addGlobal: v128 con initialValue escalar solo acepta 0; " + "usa un Uint8Array/number[] de 16 bytes para valores no-cero");
        }
        const zeros = new Array(16).fill(0);
        initBytes = [OP.SIMD_PREFIX, ...encodeLEB128(SIMD_CONST_SUBOP), ...zeros, OP.END];
      } else {
        const arr = initialValue instanceof Uint8Array ? Array.from(initialValue) : initialValue;
        if (arr.length !== 16) {
          throw new Error(`addGlobal: v128 initialValue requiere 16 bytes (recibido ${arr.length})`);
        }
        initBytes = [OP.SIMD_PREFIX, ...encodeLEB128(SIMD_CONST_SUBOP), ...arr, OP.END];
      }
    } else if (type === "i32") {
      if (initialValue === null)
        throw new Error("addGlobal: i32 no acepta initialValue = null");
      initBytes = [OP.I32_CONST, ...encodeSignedLEB128(toI32(initialValue)), OP.END];
    } else if (type === "i64") {
      if (initialValue === null)
        throw new Error("addGlobal: i64 no acepta initialValue = null");
      initBytes = [OP.I64_CONST, ...encodeSignedLEB128(toI64(initialValue)), OP.END];
    } else if (type === "f64") {
      if (initialValue === null)
        throw new Error("addGlobal: f64 no acepta initialValue = null");
      initBytes = [OP.F64_CONST, ...floatToBytes(Number(initialValue), 64), OP.END];
    } else if (type === "f32") {
      if (initialValue === null)
        throw new Error("addGlobal: f32 no acepta initialValue = null");
      initBytes = [OP.F32_CONST, ...floatToBytes(Number(initialValue), 32), OP.END];
    } else {
      throw new Error(`Tipo de global no soportado: ${type}`);
    }
    this.globals.push({ name, type, mutable, initExprBytes: initBytes });
  }
  addFunction(name, paramTypes, returnType, buildFn, paramNames = []) {
    const effectiveName = name ?? `__lambda_${this.lambdaCounter++}`;
    let finalParamTypes;
    let finalReturnTypes;
    let forcedTypeIdx;
    if (typeof paramTypes === "string") {
      if (returnType !== null)
        throw new Error(`addFunction con tipo nombrado "${paramTypes}" debe recibir returnType = null`);
      const idx = this.typeNameToIdx.get(paramTypes);
      if (idx === undefined)
        throw new Error(`Tipo con nombre "${paramTypes}" no definido.`);
      const t = this.types[idx];
      finalParamTypes = t.params.map((op) => opToType[op]);
      finalReturnTypes = t.results.map((op) => opToType[op]);
      forcedTypeIdx = idx;
    } else {
      finalParamTypes = paramTypes;
      finalReturnTypes = returnType ? Array.isArray(returnType) ? returnType : [returnType] : [];
    }
    const builder = new FunctionIRBuilder(finalParamTypes, finalReturnTypes, paramNames, this);
    if (buildFn)
      buildFn(builder);
    builder.finalize();
    const actualReturnTypes = builder.returnType;
    const typeIdx = forcedTypeIdx ?? this._getTypeIdx(finalParamTypes, actualReturnTypes);
    if (forcedTypeIdx !== undefined) {
      const expected = this.types[forcedTypeIdx].results.map((op) => opToType[op]);
      if (JSON.stringify(expected) !== JSON.stringify(actualReturnTypes)) {
        throw new Error(`El retorno inferido de "${effectiveName}" no coincide con el tipo nombrado. ` + `Esperado: [${expected.join(", ")}], actual: [${actualReturnTypes.join(", ")}].`);
      }
    }
    this.functions.push({ name: effectiveName, builder, paramTypes: finalParamTypes, returnType: actualReturnTypes, typeIdx });
    return builder;
  }
  addExport(name, kind, indexOrName) {
    this.externals.push({ section: "export", name, kind, index: indexOrName });
  }
  addTable(minSize, maxSize, refType = "funcref") {
    if (this.hasTableImport()) {
      throw new Error("No se puede definir tabla local si ya hay una importada");
    }
    const idx = this.tables.length;
    this.tables.push({ min: minSize, max: maxSize, refType });
    this.tableAuto = false;
    return idx;
  }
  _decodeOffset(offsetBytes) {
    if (offsetBytes.length < 2)
      throw new Error("Offset muy corto para i32.const");
    if (offsetBytes[0] !== OP.I32_CONST)
      throw new Error("Offset debe comenzar con i32.const");
    let pos = 1;
    let result = 0;
    let shift = 0;
    while (pos < offsetBytes.length) {
      const byte = offsetBytes[pos++];
      result |= (byte & 127) << shift;
      if (!(byte & 128))
        break;
      shift += 7;
    }
    if (offsetBytes[offsetBytes.length - 1] !== OP.END)
      throw new Error("Offset debe terminar con END");
    return result >>> 0;
  }
  build() {
    this.prepareStringData();
    this.elements = [];
    const usedTypeIndexes = new Set;
    for (const fn of this.functions) {
      if (fn.typeIdx !== undefined)
        usedTypeIndexes.add(fn.typeIdx);
    }
    for (const ext of this.externals) {
      if (ext.typeIdx !== undefined)
        usedTypeIndexes.add(ext.typeIdx);
    }
    for (const fn of this.functions) {
      if (fn.builder && Array.isArray(fn.builder.instructions)) {
        for (const instr of fn.builder.instructions) {
          if (instr.op === "CALL_INDIRECT" && instr.typeIdx !== undefined) {
            usedTypeIndexes.add(instr.typeIdx);
          }
        }
      }
    }
    if (usedTypeIndexes.size < this.types.length) {
      const typeRemap = new Map;
      const newTypes = [];
      for (let oldIdx = 0;oldIdx < this.types.length; oldIdx++) {
        if (usedTypeIndexes.has(oldIdx)) {
          typeRemap.set(oldIdx, newTypes.length);
          newTypes.push(this.types[oldIdx]);
        }
      }
      this.types = newTypes;
      for (const fn of this.functions) {
        if (fn.typeIdx !== undefined && typeRemap.has(fn.typeIdx)) {
          fn.typeIdx = typeRemap.get(fn.typeIdx);
        }
      }
      for (const ext of this.externals) {
        if (ext.typeIdx !== undefined && typeRemap.has(ext.typeIdx)) {
          ext.typeIdx = typeRemap.get(ext.typeIdx);
        }
      }
      for (const fn of this.functions) {
        if (fn.builder && Array.isArray(fn.builder.instructions)) {
          for (const instr of fn.builder.instructions) {
            if (instr.op === "CALL_INDIRECT" && instr.typeIdx !== undefined && typeRemap.has(instr.typeIdx)) {
              instr.typeIdx = typeRemap.get(instr.typeIdx);
            }
          }
        }
      }
    }
    const importEntries = this.externals.filter((e) => e.section === "import");
    const exportEntries = this.externals.filter((e) => e.section === "export");
    const importFuncCount = importEntries.filter((e) => e.kind === "function").length;
    const importGlobalCount = importEntries.filter((e) => e.kind === "global").length;
    const extToFuncIdx = new Map;
    {
      let funcIdx = 0;
      for (let i = 0;i < this.externals.length; i++) {
        const e = this.externals[i];
        if (e.section === "import" && e.kind === "function")
          extToFuncIdx.set(i, funcIdx++);
      }
    }
    this.funcNameToIndex.clear();
    for (const [alias, extIdx] of this.funcAliasToIndex) {
      const wasmIdx = extToFuncIdx.get(extIdx);
      if (wasmIdx === undefined)
        throw new Error(`Alias '${alias}': no apunta a una función importada`);
      const existing = this.funcNameToIndex.get(alias);
      if (existing !== undefined && existing !== wasmIdx) {
        throw new Error(`Nombre de función duplicado: ${alias} (${existing} vs ${wasmIdx})`);
      }
      this.funcNameToIndex.set(alias, wasmIdx);
    }
    for (let i = 0;i < this.functions.length; i++) {
      const name = this.functions[i].name;
      if (this.funcNameToIndex.has(name))
        throw new Error(`Nombre de función duplicado con import: ${name}`);
      this.funcNameToIndex.set(name, importFuncCount + i);
    }
    this.globalNameToIndex.clear();
    let globalImportIdx = 0;
    for (const imp of importEntries) {
      if (imp.kind === "global") {
        if (this.globalNameToIndex.has(imp.name))
          throw new Error(`Global duplicada: ${imp.name}`);
        this.globalNameToIndex.set(imp.name, globalImportIdx++);
      }
    }
    for (let i = 0;i < this.globals.length; i++) {
      const name = this.globals[i].name;
      if (this.globalNameToIndex.has(name))
        throw new Error(`Global duplicada: ${name}`);
      this.globalNameToIndex.set(name, importGlobalCount + i);
    }
    const resolvedExports = exportEntries.map((exp) => {
      let index;
      if (exp.kind === "memory")
        index = 0;
      else if (exp.kind === "table") {
        if (typeof exp.index === "string")
          throw new Error(`Export '${exp.name}': tablas no tienen nombre; usa índice numérico`);
        index = exp.index;
      } else if (typeof exp.index === "string") {
        if (exp.kind === "function")
          index = this.funcNameToIndex.get(exp.index);
        else if (exp.kind === "global")
          index = this.globalNameToIndex.get(exp.index);
        if (index === undefined)
          throw new Error(`Export '${exp.name}': nombre no encontrado`);
      } else {
        index = exp.index;
      }
      return { name: exp.name, kind: exp.kind, index };
    });
    for (const fn of this.functions) {
      fn.builder.instructions = fn.builder.instructions.map((instr) => {
        if (instr.op === "CALL_BY_NAME") {
          const absIdx = this.funcNameToIndex.get(instr.name);
          if (absIdx === undefined)
            throw new Error(`Función no definida: ${instr.name}`);
          return { op: "CALL", index: absIdx };
        }
        if (instr.op === "REF_FUNC_BY_NAME") {
          const absIdx = this.funcNameToIndex.get(instr.name);
          if (absIdx === undefined)
            throw new Error(`Función no definida: ${instr.name}`);
          return { op: "REF_FUNC", index: absIdx };
        }
        if (instr.op === "FUNCTION_INDEX_BY_NAME") {
          const tableIdx = this.functionTableIndices.get(instr.name);
          if (tableIdx === undefined)
            throw new Error(`Función sin índice de tabla: ${instr.name}`);
          return { op: "I32_CONST", val: tableIdx };
        }
        return instr;
      });
    }
    for (const fn of this.functions) {
      fn.builder.instructions = fn.builder.instructions.map((instr) => {
        if ((instr.op === "GLOBAL_GET" || instr.op === "GLOBAL_SET") && typeof instr.index === "string") {
          const absIdx = this.globalNameToIndex.get(instr.index);
          if (absIdx === undefined)
            throw new Error(`Global no definida: ${instr.index}`);
          return { op: instr.op, index: absIdx };
        }
        return instr;
      });
    }
    if (ENABLE_OPTIMIZER) {
      for (const fn of this.functions) {
        fn.builder.instructions = optimizeIR(fn.builder.instructions);
        fn.builder.pruneUnusedLocals();
        fn.builder.instructions = optimizeIR(fn.builder.instructions);
      }
    }
    const hasMemoryImport = this.hasMemoryImport();
    if (!this.hasMemory && !hasMemoryImport) {
      for (const fn of this.functions) {
        if (fn.builder.needsMemory) {
          this.addMemory(1);
          break;
        }
      }
    }
    const hasTableImport = this.hasTableImport();
    if (this.pendingElements.length > 0) {
      const needsActiveTable = this.pendingElements.some((p) => p.mode === 0 || p.mode === 2 || p.mode === 4 || p.mode === 6);
      if (this.tableAuto && this.tables.length === 0 && !hasTableImport) {
        this.tables.push({ min: this.dynamicTableMin, max: undefined, refType: "funcref" });
      } else if (needsActiveTable && this.tables.length === 0 && !hasTableImport) {
        throw new Error("Se agregaron elementos de tabla activos sin definir una tabla");
      }
      for (const seg of this.pendingElements) {
        const resolvedFuncIdx = seg.funcNames ? seg.funcNames.map((name) => {
          const idx = this.funcNameToIndex.get(name);
          if (idx === undefined)
            throw new Error(`Función no encontrada: ${name}`);
          return idx;
        }) : null;
        const resolvedExprBytes = seg.exprs ? seg.exprs.map((e) => this._encodeElementExpr(e)) : null;
        this.elements.push({
          mode: seg.mode,
          tableIndex: seg.tableIndex,
          offsetBytes: seg.offsetBytes,
          funcIndices: resolvedFuncIdx,
          exprsBytes: resolvedExprBytes,
          refType: seg.refType,
          elemKind: seg.elemKind
        });
      }
    }
    const codeEntries = [];
    for (const fn of this.functions) {
      const bytecode = emitirBytecode(fn.builder.instructions);
      bytecode.push(OP.END);
      const locals = fn.builder.getLocals();
      const body = [];
      body.push(...encodeLEB128(locals.length));
      for (const loc of locals) {
        body.push(...encodeLEB128(loc.count));
        body.push(loc.type);
      }
      body.push(...bytecode);
      codeEntries.push({ size: body.length, body });
    }
    const sections = [];
    if (this.types.length) {
      const buf = [...encodeLEB128(this.types.length)];
      for (const t of this.types) {
        buf.push(96);
        buf.push(...encodeLEB128(t.params.length), ...t.params);
        buf.push(...encodeLEB128(t.results.length), ...t.results);
      }
      sections.push({ id: 1, bytes: buf });
    }
    if (importEntries.length) {
      const buf = [...encodeLEB128(importEntries.length)];
      for (const imp of importEntries) {
        buf.push(...encodeName(imp.module), ...encodeName(imp.name));
        if (imp.kind === "function") {
          buf.push(0, ...encodeLEB128(imp.typeIdx));
        } else if (imp.kind === "table") {
          const refOp = refTypeToOp(imp.refType ?? "funcref");
          buf.push(1, refOp);
          const flags = imp.maximum !== undefined ? 1 : 0;
          buf.push(flags, ...encodeLEB128(imp.initial));
          if (imp.maximum !== undefined)
            buf.push(...encodeLEB128(imp.maximum));
        } else if (imp.kind === "memory") {
          buf.push(2);
          const flags = imp.maximum !== undefined ? 1 : 0;
          buf.push(flags, ...encodeLEB128(imp.initial));
          if (imp.maximum !== undefined)
            buf.push(...encodeLEB128(imp.maximum));
        } else if (imp.kind === "global") {
          buf.push(3, typeToOp(imp.valueType), imp.mutable ? 1 : 0);
        }
      }
      sections.push({ id: 2, bytes: buf });
    }
    if (this.functions.length) {
      const buf = [...encodeLEB128(this.functions.length)];
      for (const fn of this.functions)
        buf.push(...encodeLEB128(fn.typeIdx));
      sections.push({ id: 3, bytes: buf });
    }
    if (this.tables.length > 0) {
      const buf = [...encodeLEB128(this.tables.length)];
      for (const t of this.tables) {
        buf.push(refTypeToOp(t.refType));
        const flags = t.max !== undefined ? 1 : 0;
        buf.push(flags, ...encodeLEB128(t.min));
        if (t.max !== undefined)
          buf.push(...encodeLEB128(t.max));
      }
      sections.push({ id: 4, bytes: buf });
    }
    if (this.hasMemory && !hasMemoryImport) {
      const flags = this.memoryMax !== undefined ? 1 : 0;
      const memBytes = [1, flags, ...encodeLEB128(this.memoryInitial)];
      if (this.memoryMax !== undefined)
        memBytes.push(...encodeLEB128(this.memoryMax));
      sections.push({ id: 5, bytes: memBytes });
    }
    if (this.globals.length) {
      const buf = [...encodeLEB128(this.globals.length)];
      for (const g of this.globals) {
        buf.push(typeToOp(g.type), g.mutable ? 1 : 0, ...g.initExprBytes);
      }
      sections.push({ id: 6, bytes: buf });
    }
    if (resolvedExports.length) {
      const buf = [...encodeLEB128(resolvedExports.length)];
      for (const exp of resolvedExports) {
        buf.push(...encodeName(exp.name));
        if (exp.kind === "function")
          buf.push(0);
        else if (exp.kind === "table")
          buf.push(1);
        else if (exp.kind === "memory")
          buf.push(2);
        else if (exp.kind === "global")
          buf.push(3);
        buf.push(...encodeLEB128(exp.index));
      }
      sections.push({ id: 7, bytes: buf });
    }
    if (this.startFunction !== null) {
      let startIdx;
      if (typeof this.startFunction === "string") {
        const idx = this.funcNameToIndex.get(this.startFunction);
        if (idx === undefined)
          throw new Error(`Start: función no encontrada: ${this.startFunction}`);
        startIdx = idx;
      } else {
        startIdx = this.startFunction;
      }
      sections.push({ id: 8, bytes: [...encodeLEB128(startIdx)] });
    }
    if (this.elements.length > 0) {
      const buf = [...encodeLEB128(this.elements.length)];
      for (const seg of this.elements) {
        buf.push(...encodeLEB128(seg.mode));
        switch (seg.mode) {
          case 0:
            buf.push(...seg.offsetBytes);
            buf.push(...encodeLEB128(seg.funcIndices.length));
            for (const fi of seg.funcIndices)
              buf.push(...encodeLEB128(fi));
            break;
          case 1:
            buf.push(seg.elemKind);
            buf.push(...encodeLEB128(seg.funcIndices.length));
            for (const fi of seg.funcIndices)
              buf.push(...encodeLEB128(fi));
            break;
          case 2:
            buf.push(...encodeLEB128(seg.tableIndex));
            buf.push(...seg.offsetBytes);
            buf.push(seg.elemKind);
            buf.push(...encodeLEB128(seg.funcIndices.length));
            for (const fi of seg.funcIndices)
              buf.push(...encodeLEB128(fi));
            break;
          case 3:
            buf.push(seg.elemKind);
            buf.push(...encodeLEB128(seg.funcIndices.length));
            for (const fi of seg.funcIndices)
              buf.push(...encodeLEB128(fi));
            break;
          case 4:
            buf.push(...seg.offsetBytes);
            buf.push(...encodeLEB128(seg.exprsBytes.length));
            for (const expr of seg.exprsBytes)
              buf.push(...expr);
            break;
          case 5:
            buf.push(refTypeToOp(seg.refType));
            buf.push(...encodeLEB128(seg.exprsBytes.length));
            for (const expr of seg.exprsBytes)
              buf.push(...expr);
            break;
          case 6:
            buf.push(...encodeLEB128(seg.tableIndex));
            buf.push(...seg.offsetBytes);
            buf.push(refTypeToOp(seg.refType));
            buf.push(...encodeLEB128(seg.exprsBytes.length));
            for (const expr of seg.exprsBytes)
              buf.push(...expr);
            break;
          case 7:
            buf.push(refTypeToOp(seg.refType));
            buf.push(...encodeLEB128(seg.exprsBytes.length));
            for (const expr of seg.exprsBytes)
              buf.push(...expr);
            break;
          default:
            throw new Error(`Element mode ${seg.mode} no soportado`);
        }
      }
      sections.push({ id: 9, bytes: buf });
    }
    if (this.functions.length) {
      const buf = [...encodeLEB128(this.functions.length)];
      for (const entry of codeEntries) {
        buf.push(...encodeLEB128(entry.size), ...entry.body);
      }
      sections.push({ id: 10, bytes: buf });
    }
    if (this.dataSegments.length > 0) {
      const buf = [...encodeLEB128(this.dataSegments.length)];
      for (const seg of this.dataSegments) {
        buf.push(0);
        buf.push(OP.I32_CONST, ...encodeSignedLEB128(seg.offset), OP.END);
        buf.push(...encodeLEB128(seg.data.length), ...seg.data);
      }
      sections.push({ id: 11, bytes: buf });
    }
    const header = [0, 97, 115, 109, 1, 0, 0, 0];
    const binary = [...header];
    const customSectionsBefore = this.customSections.filter((cs) => !cs.atEnd);
    const customSectionsAfter = this.customSections.filter((cs) => cs.atEnd);
    for (const cs of customSectionsBefore) {
      const content = [...encodeName(cs.name), ...cs.data];
      binary.push(0, ...encodeLEB128(content.length), ...content);
    }
    sections.sort((a, b) => a.id - b.id);
    for (const { id, bytes } of sections) {
      binary.push(id, ...encodeLEB128(bytes.length), ...bytes);
    }
    for (const cs of customSectionsAfter) {
      const content = [...encodeName(cs.name), ...cs.data];
      binary.push(0, ...encodeLEB128(content.length), ...content);
    }
    return new Uint8Array(binary);
  }
  _encodeElementExpr(e) {
    switch (e.kind) {
      case "ref.func": {
        const idx = this.funcNameToIndex.get(e.funcName);
        if (idx === undefined)
          throw new Error(`Element expr: función no encontrada: ${e.funcName}`);
        return [OP.REF_FUNC, ...encodeLEB128(idx), OP.END];
      }
      case "ref.null":
        return [OP.REF_NULL, refTypeToOp(e.type), OP.END];
      case "raw":
        return [...e.bytes];
      default: {
        const _exhaustive = e;
        throw new Error(`ElementExpr desconocido: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  toWat() {
    return decodeModuleToWat(this.build());
  }
  toBinaryTree() {
    return formatBinaryTree(parseBinaryTree(this.build()));
  }
}
function naturalAlign(op) {
  switch (op) {
    case "I32_LOAD":
    case "I32_STORE":
    case "F32_LOAD":
    case "F32_STORE":
    case "I64_LOAD32_S":
    case "I64_LOAD32_U":
    case "I64_STORE32":
      return 2;
    case "I64_LOAD":
    case "I64_STORE":
    case "F64_LOAD":
    case "F64_STORE":
      return 3;
    case "I32_LOAD16_S":
    case "I32_LOAD16_U":
    case "I32_STORE16":
    case "I64_LOAD16_S":
    case "I64_LOAD16_U":
    case "I64_STORE16":
      return 1;
    default:
      return 0;
  }
}
function emitirBytecode(ir) {
  const bytes = [];
  for (const instr of ir) {
    switch (instr.op) {
      case "UNREACHABLE":
        bytes.push(OP.UNREACHABLE);
        break;
      case "NOP":
        bytes.push(OP.NOP);
        break;
      case "BLOCK":
      case "LOOP":
      case "IF": {
        const op = instr.op === "BLOCK" ? OP.BLOCK : instr.op === "LOOP" ? OP.LOOP : OP.IF;
        bytes.push(op);
        const bt = instr.blocktype;
        if (bt === 64 || bt === 127 || bt === 126 || bt === 125 || bt === 124 || bt === 123 || bt === 112 || bt === 111) {
          bytes.push(bt);
        } else {
          bytes.push(...encodeSignedLEB128(bt));
        }
        break;
      }
      case "ELSE":
        bytes.push(OP.ELSE);
        break;
      case "END":
        bytes.push(OP.END);
        break;
      case "BR":
        bytes.push(OP.BR, ...encodeLEB128(instr.depth));
        break;
      case "BR_IF":
        bytes.push(OP.BR_IF, ...encodeLEB128(instr.depth));
        break;
      case "BR_TABLE":
        bytes.push(OP.BR_TABLE);
        bytes.push(...encodeLEB128(instr.labels.length));
        for (const label of instr.labels)
          bytes.push(...encodeLEB128(label));
        bytes.push(...encodeLEB128(instr.default));
        break;
      case "RETURN":
        bytes.push(OP.RETURN);
        break;
      case "CALL":
        bytes.push(OP.CALL, ...encodeLEB128(instr.index));
        break;
      case "CALL_INDIRECT":
        bytes.push(OP.CALL_INDIRECT, ...encodeLEB128(instr.typeIdx), 0);
        break;
      case "CALL_REF":
        bytes.push(OP.CALL_REF, ...encodeLEB128(instr.typeIdx));
        break;
      case "RETURN_CALL_REF":
        bytes.push(OP.RETURN_CALL_REF, ...encodeLEB128(instr.typeIdx));
        break;
      case "DROP":
        bytes.push(OP.DROP);
        break;
      case "SELECT":
        bytes.push(OP.SELECT);
        break;
      case "SELECT_T": {
        bytes.push(OP.SELECT_T, ...encodeLEB128(instr.types.length));
        for (const t of instr.types)
          bytes.push(typeToOp(t));
        break;
      }
      case "LOCAL_GET":
        bytes.push(OP.LOCAL_GET, ...encodeLEB128(instr.index));
        break;
      case "LOCAL_SET":
        bytes.push(OP.LOCAL_SET, ...encodeLEB128(instr.index));
        break;
      case "LOCAL_TEE":
        bytes.push(OP.LOCAL_TEE, ...encodeLEB128(instr.index));
        break;
      case "GLOBAL_GET":
        bytes.push(OP.GLOBAL_GET, ...encodeLEB128(instr.index));
        break;
      case "GLOBAL_SET":
        bytes.push(OP.GLOBAL_SET, ...encodeLEB128(instr.index));
        break;
      case "TABLE_GET":
        bytes.push(OP.TABLE_GET, ...encodeLEB128(instr.tableIdx ?? 0));
        break;
      case "TABLE_SET":
        bytes.push(OP.TABLE_SET, ...encodeLEB128(instr.tableIdx ?? 0));
        break;
      case "TABLE_GROW":
        bytes.push(OP.MISC_PREFIX, OP.TABLE_GROW, ...encodeLEB128(instr.tableIdx ?? 0));
        break;
      case "TABLE_SIZE":
        bytes.push(OP.MISC_PREFIX, OP.TABLE_SIZE, ...encodeLEB128(instr.tableIdx ?? 0));
        break;
      case "TABLE_FILL":
        bytes.push(OP.MISC_PREFIX, OP.TABLE_FILL, ...encodeLEB128(instr.tableIdx ?? 0));
        break;
      case "TABLE_COPY":
        bytes.push(OP.MISC_PREFIX, OP.TABLE_COPY, ...encodeLEB128(instr.dstIdx), ...encodeLEB128(instr.srcIdx));
        break;
      case "TABLE_INIT":
        bytes.push(OP.MISC_PREFIX, OP.TABLE_INIT, ...encodeLEB128(instr.tableIdx), ...encodeLEB128(instr.elemIdx));
        break;
      case "ELEM_DROP":
        bytes.push(OP.MISC_PREFIX, OP.ELEM_DROP, ...encodeLEB128(instr.elemIdx));
        break;
      case "MEMORY_INIT":
        bytes.push(OP.MISC_PREFIX, OP.MEMORY_INIT, ...encodeLEB128(instr.dataIdx), 0);
        break;
      case "DATA_DROP":
        bytes.push(OP.MISC_PREFIX, OP.DATA_DROP, ...encodeLEB128(instr.dataIdx));
        break;
      case "MEMORY_FILL":
        bytes.push(OP.MISC_PREFIX, OP.MEMORY_FILL, 0);
        break;
      case "MEMORY_COPY":
        bytes.push(OP.MISC_PREFIX, OP.MEMORY_COPY, 0, 0);
        break;
      case "SIMD_NOIMM": {
        const sub = SIMD_NOIMM[instr.name];
        if (sub === undefined)
          throw new Error(`SIMD_NOIMM desconocido: ${instr.name}`);
        bytes.push(OP.SIMD_PREFIX, ...encodeLEB128(sub));
        break;
      }
      case "SIMD_MEMARG": {
        const sub = SIMD_MEMARG[instr.name];
        if (sub === undefined)
          throw new Error(`SIMD_MEMARG desconocido: ${instr.name}`);
        const align = instr.align !== undefined && instr.align !== 0 ? instr.align : simdNaturalAlign(instr.name);
        bytes.push(OP.SIMD_PREFIX, ...encodeLEB128(sub), ...encodeLEB128(align), ...encodeLEB128(instr.offset ?? 0));
        break;
      }
      case "SIMD_MEMARG_LANE": {
        const sub = SIMD_MEMARG_LANE[instr.name];
        if (sub === undefined)
          throw new Error(`SIMD_MEMARG_LANE desconocido: ${instr.name}`);
        const align = instr.align !== undefined && instr.align !== 0 ? instr.align : simdNaturalAlignLane(instr.name);
        bytes.push(OP.SIMD_PREFIX, ...encodeLEB128(sub), ...encodeLEB128(align), ...encodeLEB128(instr.offset ?? 0), instr.lane);
        break;
      }
      case "SIMD_LANE": {
        const sub = SIMD_LANE[instr.name];
        if (sub === undefined)
          throw new Error(`SIMD_LANE desconocido: ${instr.name}`);
        bytes.push(OP.SIMD_PREFIX, ...encodeLEB128(sub), instr.lane);
        break;
      }
      case "SIMD_CONST":
        bytes.push(OP.SIMD_PREFIX, ...encodeLEB128(SIMD_CONST_SUBOP), ...instr.bytes);
        break;
      case "SIMD_SHUFFLE":
        bytes.push(OP.SIMD_PREFIX, ...encodeLEB128(SIMD_SHUFFLE_SUBOP), ...instr.lanes);
        break;
      case "I32_LOAD":
      case "I64_LOAD":
      case "F32_LOAD":
      case "F64_LOAD":
      case "I32_LOAD8_S":
      case "I32_LOAD8_U":
      case "I32_LOAD16_S":
      case "I32_LOAD16_U":
      case "I64_LOAD8_S":
      case "I64_LOAD8_U":
      case "I64_LOAD16_S":
      case "I64_LOAD16_U":
      case "I64_LOAD32_S":
      case "I64_LOAD32_U":
      case "I32_STORE":
      case "I64_STORE":
      case "F32_STORE":
      case "F64_STORE":
      case "I32_STORE8":
      case "I32_STORE16":
      case "I64_STORE8":
      case "I64_STORE16":
      case "I64_STORE32": {
        const opName = instr.op;
        const opcode = OP[opName];
        const align = instr.align !== undefined && instr.align !== 0 ? instr.align : naturalAlign(opName);
        bytes.push(opcode, ...encodeLEB128(align), ...encodeLEB128(instr.offset ?? 0));
        break;
      }
      case "MEMORY_SIZE":
        bytes.push(OP.MEMORY_SIZE, 0);
        break;
      case "MEMORY_GROW":
        bytes.push(OP.MEMORY_GROW, 0);
        break;
      case "FUNCTION_INDEX_BY_NAME":
        throw new Error("FUNCTION_INDEX_BY_NAME debe ser resuelto antes de emitir bytecode");
      case "ENV_ADDR_BY_NAME":
        throw new Error("ENV_ADDR_BY_NAME debe ser resuelto antes de emitir bytecode");
      case "I32_CONST":
        bytes.push(OP.I32_CONST, ...encodeSignedLEB128(toI32(instr.val)));
        break;
      case "I64_CONST":
        bytes.push(OP.I64_CONST, ...encodeSignedLEB128(toI64(instr.val)));
        break;
      case "F32_CONST":
        bytes.push(OP.F32_CONST, ...floatToBytes(instr.val, 32));
        break;
      case "F64_CONST":
        bytes.push(OP.F64_CONST, ...floatToBytes(instr.val, 64));
        break;
      case "I32_DATA_CONST":
        bytes.push(OP.I32_CONST, ...encodeSignedLEB128(toI32(instr.val)));
        break;
      case "I32_CLZ":
        bytes.push(OP.I32_CLZ);
        break;
      case "I32_CTZ":
        bytes.push(OP.I32_CTZ);
        break;
      case "I32_POPCNT":
        bytes.push(OP.I32_POPCNT);
        break;
      case "I64_CLZ":
        bytes.push(OP.I64_CLZ);
        break;
      case "I64_CTZ":
        bytes.push(OP.I64_CTZ);
        break;
      case "I64_POPCNT":
        bytes.push(OP.I64_POPCNT);
        break;
      case "I32_ROTL":
        bytes.push(OP.I32_ROTL);
        break;
      case "I32_ROTR":
        bytes.push(OP.I32_ROTR);
        break;
      case "I64_ROTL":
        bytes.push(OP.I64_ROTL);
        break;
      case "I64_ROTR":
        bytes.push(OP.I64_ROTR);
        break;
      case "I32_EQZ":
        bytes.push(OP.I32_EQZ);
        break;
      case "I64_EQZ":
        bytes.push(OP.I64_EQZ);
        break;
      case "I32_EQ":
        bytes.push(OP.I32_EQ);
        break;
      case "I32_NE":
        bytes.push(OP.I32_NE);
        break;
      case "I32_LT_S":
        bytes.push(OP.I32_LT_S);
        break;
      case "I32_LT_U":
        bytes.push(OP.I32_LT_U);
        break;
      case "I32_GT_S":
        bytes.push(OP.I32_GT_S);
        break;
      case "I32_GT_U":
        bytes.push(OP.I32_GT_U);
        break;
      case "I32_LE_S":
        bytes.push(OP.I32_LE_S);
        break;
      case "I32_LE_U":
        bytes.push(OP.I32_LE_U);
        break;
      case "I32_GE_S":
        bytes.push(OP.I32_GE_S);
        break;
      case "I32_GE_U":
        bytes.push(OP.I32_GE_U);
        break;
      case "I32_ADD":
        bytes.push(OP.I32_ADD);
        break;
      case "I32_SUB":
        bytes.push(OP.I32_SUB);
        break;
      case "I32_MUL":
        bytes.push(OP.I32_MUL);
        break;
      case "I32_DIV_S":
        bytes.push(OP.I32_DIV_S);
        break;
      case "I32_DIV_U":
        bytes.push(OP.I32_DIV_U);
        break;
      case "I32_REM_S":
        bytes.push(OP.I32_REM_S);
        break;
      case "I32_REM_U":
        bytes.push(OP.I32_REM_U);
        break;
      case "I32_AND":
        bytes.push(OP.I32_AND);
        break;
      case "I32_OR":
        bytes.push(OP.I32_OR);
        break;
      case "I32_XOR":
        bytes.push(OP.I32_XOR);
        break;
      case "I32_SHL":
        bytes.push(OP.I32_SHL);
        break;
      case "I32_SHR_S":
        bytes.push(OP.I32_SHR_S);
        break;
      case "I32_SHR_U":
        bytes.push(OP.I32_SHR_U);
        break;
      case "I64_EQ":
        bytes.push(OP.I64_EQ);
        break;
      case "I64_NE":
        bytes.push(OP.I64_NE);
        break;
      case "I64_LT_S":
        bytes.push(OP.I64_LT_S);
        break;
      case "I64_LT_U":
        bytes.push(OP.I64_LT_U);
        break;
      case "I64_GT_S":
        bytes.push(OP.I64_GT_S);
        break;
      case "I64_GT_U":
        bytes.push(OP.I64_GT_U);
        break;
      case "I64_LE_S":
        bytes.push(OP.I64_LE_S);
        break;
      case "I64_LE_U":
        bytes.push(OP.I64_LE_U);
        break;
      case "I64_GE_S":
        bytes.push(OP.I64_GE_S);
        break;
      case "I64_GE_U":
        bytes.push(OP.I64_GE_U);
        break;
      case "I64_ADD":
        bytes.push(OP.I64_ADD);
        break;
      case "I64_SUB":
        bytes.push(OP.I64_SUB);
        break;
      case "I64_MUL":
        bytes.push(OP.I64_MUL);
        break;
      case "I64_DIV_S":
        bytes.push(OP.I64_DIV_S);
        break;
      case "I64_DIV_U":
        bytes.push(OP.I64_DIV_U);
        break;
      case "I64_REM_S":
        bytes.push(OP.I64_REM_S);
        break;
      case "I64_REM_U":
        bytes.push(OP.I64_REM_U);
        break;
      case "I64_AND":
        bytes.push(OP.I64_AND);
        break;
      case "I64_OR":
        bytes.push(OP.I64_OR);
        break;
      case "I64_XOR":
        bytes.push(OP.I64_XOR);
        break;
      case "I64_SHL":
        bytes.push(OP.I64_SHL);
        break;
      case "I64_SHR_S":
        bytes.push(OP.I64_SHR_S);
        break;
      case "I64_SHR_U":
        bytes.push(OP.I64_SHR_U);
        break;
      case "F32_ABS":
        bytes.push(OP.F32_ABS);
        break;
      case "F32_NEG":
        bytes.push(OP.F32_NEG);
        break;
      case "F32_CEIL":
        bytes.push(OP.F32_CEIL);
        break;
      case "F32_FLOOR":
        bytes.push(OP.F32_FLOOR);
        break;
      case "F32_TRUNC":
        bytes.push(OP.F32_TRUNC);
        break;
      case "F32_NEAREST":
        bytes.push(OP.F32_NEAREST);
        break;
      case "F32_SQRT":
        bytes.push(OP.F32_SQRT);
        break;
      case "F32_ADD":
        bytes.push(OP.F32_ADD);
        break;
      case "F32_SUB":
        bytes.push(OP.F32_SUB);
        break;
      case "F32_MUL":
        bytes.push(OP.F32_MUL);
        break;
      case "F32_DIV":
        bytes.push(OP.F32_DIV);
        break;
      case "F32_MIN":
        bytes.push(OP.F32_MIN);
        break;
      case "F32_MAX":
        bytes.push(OP.F32_MAX);
        break;
      case "F32_COPYSIGN":
        bytes.push(OP.F32_COPYSIGN);
        break;
      case "F32_EQ":
        bytes.push(OP.F32_EQ);
        break;
      case "F32_NE":
        bytes.push(OP.F32_NE);
        break;
      case "F32_LT":
        bytes.push(OP.F32_LT);
        break;
      case "F32_GT":
        bytes.push(OP.F32_GT);
        break;
      case "F32_LE":
        bytes.push(OP.F32_LE);
        break;
      case "F32_GE":
        bytes.push(OP.F32_GE);
        break;
      case "F64_ABS":
        bytes.push(OP.F64_ABS);
        break;
      case "F64_NEG":
        bytes.push(OP.F64_NEG);
        break;
      case "F64_CEIL":
        bytes.push(OP.F64_CEIL);
        break;
      case "F64_FLOOR":
        bytes.push(OP.F64_FLOOR);
        break;
      case "F64_TRUNC":
        bytes.push(OP.F64_TRUNC);
        break;
      case "F64_NEAREST":
        bytes.push(OP.F64_NEAREST);
        break;
      case "F64_SQRT":
        bytes.push(OP.F64_SQRT);
        break;
      case "F64_ADD":
        bytes.push(OP.F64_ADD);
        break;
      case "F64_SUB":
        bytes.push(OP.F64_SUB);
        break;
      case "F64_MUL":
        bytes.push(OP.F64_MUL);
        break;
      case "F64_DIV":
        bytes.push(OP.F64_DIV);
        break;
      case "F64_MIN":
        bytes.push(OP.F64_MIN);
        break;
      case "F64_MAX":
        bytes.push(OP.F64_MAX);
        break;
      case "F64_COPYSIGN":
        bytes.push(OP.F64_COPYSIGN);
        break;
      case "F64_EQ":
        bytes.push(OP.F64_EQ);
        break;
      case "F64_NE":
        bytes.push(OP.F64_NE);
        break;
      case "F64_LT":
        bytes.push(OP.F64_LT);
        break;
      case "F64_GT":
        bytes.push(OP.F64_GT);
        break;
      case "F64_LE":
        bytes.push(OP.F64_LE);
        break;
      case "F64_GE":
        bytes.push(OP.F64_GE);
        break;
      case "I32_WRAP_I64":
        bytes.push(OP.I32_WRAP_I64);
        break;
      case "I32_TRUNC_F32_S":
        bytes.push(OP.I32_TRUNC_F32_S);
        break;
      case "I32_TRUNC_F32_U":
        bytes.push(OP.I32_TRUNC_F32_U);
        break;
      case "I32_TRUNC_F64_S":
        bytes.push(OP.I32_TRUNC_F64_S);
        break;
      case "I32_TRUNC_F64_U":
        bytes.push(OP.I32_TRUNC_F64_U);
        break;
      case "I64_TRUNC_F32_S":
        bytes.push(OP.I64_TRUNC_F32_S);
        break;
      case "I64_TRUNC_F32_U":
        bytes.push(OP.I64_TRUNC_F32_U);
        break;
      case "I64_TRUNC_F64_S":
        bytes.push(OP.I64_TRUNC_F64_S);
        break;
      case "I64_TRUNC_F64_U":
        bytes.push(OP.I64_TRUNC_F64_U);
        break;
      case "F32_CONVERT_I32_S":
        bytes.push(OP.F32_CONVERT_I32_S);
        break;
      case "F32_CONVERT_I32_U":
        bytes.push(OP.F32_CONVERT_I32_U);
        break;
      case "F32_CONVERT_I64_S":
        bytes.push(OP.F32_CONVERT_I64_S);
        break;
      case "F32_CONVERT_I64_U":
        bytes.push(OP.F32_CONVERT_I64_U);
        break;
      case "F64_CONVERT_I32_S":
        bytes.push(OP.F64_CONVERT_I32_S);
        break;
      case "F64_CONVERT_I32_U":
        bytes.push(OP.F64_CONVERT_I32_U);
        break;
      case "F64_CONVERT_I64_S":
        bytes.push(OP.F64_CONVERT_I64_S);
        break;
      case "F64_CONVERT_I64_U":
        bytes.push(OP.F64_CONVERT_I64_U);
        break;
      case "F32_DEMOTE_F64":
        bytes.push(OP.F32_DEMOTE_F64);
        break;
      case "F64_PROMOTE_F32":
        bytes.push(OP.F64_PROMOTE_F32);
        break;
      case "I32_REINTERPRET_F32":
        bytes.push(OP.I32_REINTERPRET_F32);
        break;
      case "I64_REINTERPRET_F64":
        bytes.push(OP.I64_REINTERPRET_F64);
        break;
      case "F32_REINTERPRET_I32":
        bytes.push(OP.F32_REINTERPRET_I32);
        break;
      case "F64_REINTERPRET_I64":
        bytes.push(OP.F64_REINTERPRET_I64);
        break;
      case "I64_EXTEND_I32_S":
        bytes.push(OP.I64_EXTEND_I32_S);
        break;
      case "I64_EXTEND_I32_U":
        bytes.push(OP.I64_EXTEND_I32_U);
        break;
      case "I32_TRUNC_SAT_F32_S":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I32_TRUNC_SAT_F32_S);
        break;
      case "I32_TRUNC_SAT_F32_U":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I32_TRUNC_SAT_F32_U);
        break;
      case "I32_TRUNC_SAT_F64_S":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I32_TRUNC_SAT_F64_S);
        break;
      case "I32_TRUNC_SAT_F64_U":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I32_TRUNC_SAT_F64_U);
        break;
      case "I64_TRUNC_SAT_F32_S":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I64_TRUNC_SAT_F32_S);
        break;
      case "I64_TRUNC_SAT_F32_U":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I64_TRUNC_SAT_F32_U);
        break;
      case "I64_TRUNC_SAT_F64_S":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I64_TRUNC_SAT_F64_S);
        break;
      case "I64_TRUNC_SAT_F64_U":
        bytes.push(OP.MISC_PREFIX, OP.SAT_I64_TRUNC_SAT_F64_U);
        break;
      case "REF_NULL":
        bytes.push(OP.REF_NULL, refTypeToOp(instr.type));
        break;
      case "REF_IS_NULL":
        bytes.push(OP.REF_IS_NULL);
        break;
      case "REF_FUNC":
        bytes.push(OP.REF_FUNC, ...encodeLEB128(instr.index));
        break;
      case "CALL_BY_NAME":
      case "REF_FUNC_BY_NAME":
        throw new Error(`${instr.op} debe ser resuelto antes de emitir bytecode`);
      default:
        throw new Error(`Opcode IR desconocido: ${instr.op}`);
    }
  }
  return bytes;
}

// wasm-runtime.ts
var HEADER_BYTES = 8;
var FOOTER_BYTES = 8;
var OVERHEAD = HEADER_BYTES + FOOTER_BYTES;
var MIN_PAYLOAD = 8;
function injectAllocator(mod, heapStart, heapLimit) {
  const MALLOC = "__malloc";
  const FREE = "__free";
  const G_START = "__heap_start";
  const G_TOP = "__heap_top";
  const G_LIMIT = "__heap_limit";
  mod.addGlobal(G_START, "i32", true, heapStart);
  mod.addGlobal(G_TOP, "i32", true, heapStart);
  mod.addGlobal(G_LIMIT, "i32", true, heapLimit);
  mod.addFunction(MALLOC, ["i32"], "i32", (b) => {
    const size = 0;
    const aligned = b.addLocal("aligned", "i32");
    const block = b.addLocal("block", "i32");
    const sz = b.addLocal("sz", "i32");
    const flg = b.addLocal("flg", "i32");
    const need = b.addLocal("need", "i32");
    const leftover = b.addLocal("leftover", "i32");
    const newBlk = b.addLocal("newBlk", "i32");
    b.getLocal(size);
    b.i32Const(7);
    b.i32Add();
    b.i32Const(-8);
    b.i32And();
    b.setLocal(aligned);
    b.globalGet(G_START);
    b.setLocal(block);
    b.block("i32", "done");
    b.block("void", "scan_end");
    b.loop("void", "scan_loop");
    b.getLocal(block);
    b.globalGet(G_TOP);
    b.i32GeU();
    b.brIfTo("scan_end");
    b.getLocal(block);
    b.i32Load(0, 2);
    b.setLocal(sz);
    b.getLocal(block);
    b.i32Load(4, 2);
    b.setLocal(flg);
    b.getLocal(flg);
    b.i32Eqz();
    b.if_("void");
    b.getLocal(sz);
    b.getLocal(aligned);
    b.i32GeU();
    b.if_("void");
    b.getLocal(sz);
    b.getLocal(aligned);
    b.i32Const(OVERHEAD + MIN_PAYLOAD);
    b.i32Add();
    b.i32GeU();
    b.if_("void");
    b.getLocal(sz);
    b.i32Const(OVERHEAD);
    b.i32Sub();
    b.getLocal(aligned);
    b.i32Sub();
    b.setLocal(leftover);
    b.getLocal(block);
    b.getLocal(aligned);
    b.i32Store(0, 2);
    b.getLocal(block);
    b.i32Const(1);
    b.i32Store(4, 2);
    b.getLocal(block);
    b.i32Const(HEADER_BYTES);
    b.i32Add();
    b.getLocal(aligned);
    b.i32Add();
    b.getLocal(aligned);
    b.i32Store(0, 2);
    b.getLocal(block);
    b.i32Const(OVERHEAD);
    b.i32Add();
    b.getLocal(aligned);
    b.i32Add();
    b.setLocal(newBlk);
    b.getLocal(newBlk);
    b.getLocal(leftover);
    b.i32Store(0, 2);
    b.getLocal(newBlk);
    b.i32Const(0);
    b.i32Store(4, 2);
    b.getLocal(newBlk);
    b.i32Const(HEADER_BYTES);
    b.i32Add();
    b.getLocal(leftover);
    b.i32Add();
    b.getLocal(leftover);
    b.i32Store(0, 2);
    b.else_();
    b.getLocal(block);
    b.i32Const(1);
    b.i32Store(4, 2);
    b.end();
    b.getLocal(block);
    b.i32Const(HEADER_BYTES);
    b.i32Add();
    b.brTo("done");
    b.end();
    b.end();
    b.getLocal(block);
    b.i32Const(OVERHEAD);
    b.i32Add();
    b.getLocal(sz);
    b.i32Add();
    b.setLocal(block);
    b.brTo("scan_loop");
    b.end();
    b.end();
    b.getLocal(aligned);
    b.i32Const(OVERHEAD);
    b.i32Add();
    b.setLocal(need);
    b.globalGet(G_TOP);
    b.getLocal(need);
    b.i32Add();
    b.globalGet(G_LIMIT);
    b.i32GtU();
    b.if_("void");
    b.unreachable();
    b.end();
    b.globalGet(G_TOP);
    b.setLocal(block);
    b.globalGet(G_TOP);
    b.getLocal(need);
    b.i32Add();
    b.globalSet(G_TOP);
    b.getLocal(block);
    b.getLocal(aligned);
    b.i32Store(0, 2);
    b.getLocal(block);
    b.i32Const(1);
    b.i32Store(4, 2);
    b.getLocal(block);
    b.i32Const(HEADER_BYTES);
    b.i32Add();
    b.getLocal(aligned);
    b.i32Add();
    b.getLocal(aligned);
    b.i32Store(0, 2);
    b.getLocal(block);
    b.i32Const(HEADER_BYTES);
    b.i32Add();
    b.end();
  }, ["size"]);
  mod.addFunction(FREE, ["i32"], null, (b) => {
    const p = 0;
    const header = b.addLocal("header", "i32");
    const size = b.addLocal("size", "i32");
    const flags = b.addLocal("flags", "i32");
    const next = b.addLocal("next", "i32");
    const nextFlags = b.addLocal("nextFlags", "i32");
    const nextSize = b.addLocal("nextSize", "i32");
    const prevSize = b.addLocal("prevSize", "i32");
    const prevHdr = b.addLocal("prevHdr", "i32");
    const prevFlags = b.addLocal("prevFlags", "i32");
    b.getLocal(p);
    b.i32Const(0);
    b.i32LeS();
    b.if_("void");
    b.return_();
    b.end();
    b.getLocal(p);
    b.i32Const(HEADER_BYTES);
    b.i32Sub();
    b.setLocal(header);
    b.getLocal(header);
    b.i32Load(4, 2);
    b.setLocal(flags);
    b.getLocal(flags);
    b.i32Eqz();
    b.if_("void");
    b.return_();
    b.end();
    b.getLocal(header);
    b.i32Load(0, 2);
    b.setLocal(size);
    b.block("void", "fw_done");
    b.loop("void", "fw_loop");
    b.getLocal(header);
    b.i32Const(OVERHEAD);
    b.i32Add();
    b.getLocal(size);
    b.i32Add();
    b.setLocal(next);
    b.getLocal(next);
    b.globalGet(G_TOP);
    b.i32GeU();
    b.brIfTo("fw_done");
    b.getLocal(next);
    b.i32Load(4, 2);
    b.setLocal(nextFlags);
    b.getLocal(nextFlags);
    b.i32Eqz();
    b.i32Eqz();
    b.brIfTo("fw_done");
    b.getLocal(next);
    b.i32Load(0, 2);
    b.setLocal(nextSize);
    b.getLocal(size);
    b.i32Const(OVERHEAD);
    b.i32Add();
    b.getLocal(nextSize);
    b.i32Add();
    b.setLocal(size);
    b.brTo("fw_loop");
    b.end();
    b.end();
    b.block("void", "bw_done");
    b.loop("void", "bw_loop");
    b.getLocal(header);
    b.globalGet(G_START);
    b.i32LeU();
    b.brIfTo("bw_done");
    b.getLocal(header);
    b.i32Const(FOOTER_BYTES);
    b.i32Sub();
    b.i32Load(0, 2);
    b.setLocal(prevSize);
    b.getLocal(header);
    b.i32Const(OVERHEAD);
    b.i32Sub();
    b.getLocal(prevSize);
    b.i32Sub();
    b.setLocal(prevHdr);
    b.getLocal(prevHdr);
    b.globalGet(G_START);
    b.i32LtU();
    b.brIfTo("bw_done");
    b.getLocal(prevHdr);
    b.i32Load(4, 2);
    b.setLocal(prevFlags);
    b.getLocal(prevFlags);
    b.i32Eqz();
    b.i32Eqz();
    b.brIfTo("bw_done");
    b.getLocal(size);
    b.i32Const(OVERHEAD);
    b.i32Add();
    b.getLocal(prevSize);
    b.i32Add();
    b.setLocal(size);
    b.getLocal(prevHdr);
    b.setLocal(header);
    b.brTo("bw_loop");
    b.end();
    b.end();
    b.getLocal(header);
    b.getLocal(size);
    b.i32Store(0, 2);
    b.getLocal(header);
    b.i32Const(0);
    b.i32Store(4, 2);
    b.getLocal(header);
    b.i32Const(HEADER_BYTES);
    b.i32Add();
    b.getLocal(size);
    b.i32Add();
    b.getLocal(size);
    b.i32Store(0, 2);
    b.return_();
  }, ["p"]);
  return {
    malloc: MALLOC,
    free: FREE,
    heapStart: G_START,
    heapTop: G_TOP,
    heapLimit: G_LIMIT
  };
}
function injectStringRuntime(mod) {
  const STR_EQ = "__str_eq";
  mod.addFunction(STR_EQ, ["i32", "i32"], "i32", (b) => {
    const a = 0;
    const bb = 1;
    const lenA = b.addLocal("lenA", "i32");
    const lenB = b.addLocal("lenB", "i32");
    const iLoc = b.addLocal("i", "i32");
    b.getLocal(a);
    b.i32Const(4);
    b.i32Sub();
    b.i32Load(0, 2);
    b.setLocal(lenA);
    b.getLocal(bb);
    b.i32Const(4);
    b.i32Sub();
    b.i32Load(0, 2);
    b.setLocal(lenB);
    b.getLocal(lenA);
    b.getLocal(lenB);
    b.i32Ne();
    b.if_("void");
    b.i32Const(0);
    b.return_();
    b.end();
    b.i32Const(0);
    b.setLocal(iLoc);
    b.block("void", "eq_end");
    b.loop("void", "eq_top");
    b.getLocal(iLoc);
    b.getLocal(lenA);
    b.i32GeU();
    b.brIfTo("eq_end");
    b.getLocal(a);
    b.getLocal(iLoc);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.getLocal(bb);
    b.getLocal(iLoc);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Ne();
    b.if_("void");
    b.i32Const(0);
    b.return_();
    b.end();
    b.getLocal(iLoc);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(iLoc);
    b.brTo("eq_top");
    b.end();
    b.end();
    b.i32Const(1);
  }, ["a", "b"]);
  return { strEq: STR_EQ };
}
function injectWasiRuntime(mod, iovScratch, nwrittenScratch, fdWriteAlias) {
  const WRITE_BUF = "__wasi_write_buf";
  mod.addFunction(WRITE_BUF, ["i32", "i32"], null, (b) => {
    const ptr = 0;
    const len = 1;
    b.i32Const(iovScratch);
    b.getLocal(ptr);
    b.i32Store(0, 2);
    b.i32Const(iovScratch + 4);
    b.getLocal(len);
    b.i32Store(0, 2);
    b.i32Const(1);
    b.i32Const(iovScratch);
    b.i32Const(1);
    b.i32Const(nwrittenScratch);
    b.callByName(fdWriteAlias);
    b.drop();
  }, ["ptr", "len"]);
  return { writeBuf: WRITE_BUF };
}
function injectIntToString(mod, bufOffset) {
  const FN = "__i32_to_string";
  const REV = bufOffset + 16;
  mod.addFunction(FN, ["i32"], "i32", (b) => {
    const v = 0;
    const neg = b.addLocal("neg", "i32");
    const i = b.addLocal("i", "i32");
    const j = b.addLocal("j", "i32");
    const digit = b.addLocal("digit", "i32");
    b.getLocal(v);
    b.i32Eqz();
    b.if_("void");
    b.i32Const(bufOffset);
    b.i32Const(48);
    b.i32Store8(0, 0);
    b.i32Const(1);
    b.return_();
    b.end();
    b.getLocal(v);
    b.i32Const(0);
    b.i32LtS();
    b.setLocal(neg);
    b.getLocal(neg);
    b.if_("void");
    b.i32Const(0);
    b.getLocal(v);
    b.i32Sub();
    b.setLocal(v);
    b.end();
    b.i32Const(0);
    b.setLocal(i);
    b.block("void", "i32digits_done");
    b.loop("void", "i32digits_loop");
    b.getLocal(v);
    b.i32Eqz();
    b.brIfTo("i32digits_done");
    b.i32Const(48);
    b.getLocal(v);
    b.i32Const(10);
    b.i32RemU();
    b.i32Add();
    b.setLocal(digit);
    b.i32Const(REV);
    b.getLocal(i);
    b.i32Add();
    b.getLocal(digit);
    b.i32Store8(0, 0);
    b.getLocal(v);
    b.i32Const(10);
    b.i32DivU();
    b.setLocal(v);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(i);
    b.brTo("i32digits_loop");
    b.end();
    b.end();
    b.getLocal(neg);
    b.if_("void");
    b.i32Const(REV);
    b.getLocal(i);
    b.i32Add();
    b.i32Const(45);
    b.i32Store8(0, 0);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(i);
    b.end();
    b.i32Const(0);
    b.setLocal(j);
    b.block("void", "i32rev_done");
    b.loop("void", "i32rev_loop");
    b.getLocal(j);
    b.getLocal(i);
    b.i32GeU();
    b.brIfTo("i32rev_done");
    b.i32Const(bufOffset);
    b.getLocal(j);
    b.i32Add();
    b.i32Const(REV);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Sub();
    b.getLocal(j);
    b.i32Sub();
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(j);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(j);
    b.brTo("i32rev_loop");
    b.end();
    b.end();
    b.getLocal(i);
  }, ["value"]);
  return { i32ToStr: FN };
}
function injectFloatToString(mod, bufOffset) {
  const FN = "__f64_to_string";
  mod.addFunction(FN, ["f64"], "i32", (b) => {
    const negL = b.addLocal("neg", "i32");
    const intPartL = b.addLocal("intPart", "i32");
    const fracPartL = b.addLocal("fracPart", "i32");
    const lenL = b.addLocal("len", "i32");
    const posL = b.addLocal("pos", "i32");
    b.getLocal(0);
    b.f64Const(0);
    b.f64Lt();
    b.setLocal(negL);
    b.getLocal(negL);
    b.if_("void");
    b.getLocal(0);
    b.f64Neg();
    b.setLocal(0);
    b.end();
    b.getLocal(0);
    b.f64Trunc();
    b.i32TruncF64S();
    b.setLocal(intPartL);
    b.getLocal(0);
    b.getLocal(0);
    b.f64Trunc();
    b.f64Sub();
    b.f64Const(100);
    b.f64Mul();
    b.f64Const(0.5);
    b.f64Add();
    b.i32TruncF64S();
    b.setLocal(fracPartL);
    b.getLocal(fracPartL);
    b.i32Const(100);
    b.i32GeS();
    b.if_("void");
    b.getLocal(intPartL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(intPartL);
    b.i32Const(0);
    b.setLocal(fracPartL);
    b.end();
    b.getLocal(intPartL);
    b.callByName("__i32_to_string");
    b.setLocal(lenL);
    b.i32Const(bufOffset);
    b.getLocal(lenL);
    b.i32Add();
    b.i32Const(46);
    b.i32Store8(0, 0);
    b.getLocal(lenL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(lenL);
    b.i32Const(bufOffset);
    b.getLocal(lenL);
    b.i32Add();
    b.getLocal(fracPartL);
    b.i32Const(10);
    b.i32DivU();
    b.i32Const(48);
    b.i32Add();
    b.i32Store8(0, 0);
    b.getLocal(lenL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(lenL);
    b.i32Const(bufOffset);
    b.getLocal(lenL);
    b.i32Add();
    b.getLocal(fracPartL);
    b.i32Const(10);
    b.i32RemU();
    b.i32Const(48);
    b.i32Add();
    b.i32Store8(0, 0);
    b.getLocal(lenL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(lenL);
    b.getLocal(negL);
    b.if_("void");
    b.getLocal(lenL);
    b.setLocal(posL);
    b.block("void", "f64shift_end");
    b.loop("void", "f64shift_loop");
    b.getLocal(posL);
    b.i32Eqz();
    b.brIfTo("f64shift_end");
    b.i32Const(bufOffset);
    b.getLocal(posL);
    b.i32Add();
    b.i32Const(bufOffset);
    b.getLocal(posL);
    b.i32Const(1);
    b.i32Sub();
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(posL);
    b.i32Const(1);
    b.i32Sub();
    b.setLocal(posL);
    b.brTo("f64shift_loop");
    b.end();
    b.end();
    b.i32Const(bufOffset);
    b.i32Const(45);
    b.i32Store8(0, 0);
    b.getLocal(lenL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(lenL);
    b.end();
    b.getLocal(lenL);
  }, ["value"]);
  return { f64ToStr: FN };
}
function injectI64ToString(mod, bufOffset, revOffset) {
  const FN = "__i64_to_string";
  mod.addFunction(FN, ["i64"], "i32", (b) => {
    const v = 0;
    const neg = b.addLocal("neg", "i32");
    const i = b.addLocal("i", "i32");
    const j = b.addLocal("j", "i32");
    const digit = b.addLocal("digit", "i32");
    b.getLocal(v);
    b.i64Eqz();
    b.if_("void");
    b.i32Const(bufOffset);
    b.i32Const(48);
    b.i32Store8(0, 0);
    b.i32Const(1);
    b.return_();
    b.end();
    b.getLocal(v);
    b.i64Const(0);
    b.i64LtS();
    b.setLocal(neg);
    b.getLocal(neg);
    b.if_("void");
    b.i64Const(0);
    b.getLocal(v);
    b.i64Sub();
    b.setLocal(v);
    b.end();
    b.i32Const(0);
    b.setLocal(i);
    b.block("void", "i64digits_done");
    b.loop("void", "i64digits_loop");
    b.getLocal(v);
    b.i64Eqz();
    b.brIfTo("i64digits_done");
    b.i32Const(48);
    b.getLocal(v);
    b.i64Const(10);
    b.i64RemU();
    b.i32WrapI64();
    b.i32Add();
    b.setLocal(digit);
    b.i32Const(revOffset);
    b.getLocal(i);
    b.i32Add();
    b.getLocal(digit);
    b.i32Store8(0, 0);
    b.getLocal(v);
    b.i64Const(10);
    b.i64DivU();
    b.setLocal(v);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(i);
    b.brTo("i64digits_loop");
    b.end();
    b.end();
    b.getLocal(neg);
    b.if_("void");
    b.i32Const(revOffset);
    b.getLocal(i);
    b.i32Add();
    b.i32Const(45);
    b.i32Store8(0, 0);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(i);
    b.end();
    b.i32Const(0);
    b.setLocal(j);
    b.block("void", "i64rev_done");
    b.loop("void", "i64rev_loop");
    b.getLocal(j);
    b.getLocal(i);
    b.i32GeU();
    b.brIfTo("i64rev_done");
    b.i32Const(bufOffset);
    b.getLocal(j);
    b.i32Add();
    b.i32Const(revOffset);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Sub();
    b.getLocal(j);
    b.i32Sub();
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(j);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(j);
    b.brTo("i64rev_loop");
    b.end();
    b.end();
    b.getLocal(i);
  }, ["value"]);
  return { i64ToStr: FN };
}
function injectU64ToString(mod, bufOffset, revOffset) {
  const FN = "__u64_to_string";
  mod.addFunction(FN, ["i64"], "i32", (b) => {
    const v = 0;
    const i = b.addLocal("i", "i32");
    const j = b.addLocal("j", "i32");
    const digit = b.addLocal("digit", "i32");
    b.getLocal(v);
    b.i64Eqz();
    b.if_("void");
    b.i32Const(bufOffset);
    b.i32Const(48);
    b.i32Store8(0, 0);
    b.i32Const(1);
    b.return_();
    b.end();
    b.i32Const(0);
    b.setLocal(i);
    b.block("void", "u64digits_done");
    b.loop("void", "u64digits_loop");
    b.getLocal(v);
    b.i64Eqz();
    b.brIfTo("u64digits_done");
    b.i32Const(48);
    b.getLocal(v);
    b.i64Const(10);
    b.i64RemU();
    b.i32WrapI64();
    b.i32Add();
    b.setLocal(digit);
    b.i32Const(revOffset);
    b.getLocal(i);
    b.i32Add();
    b.getLocal(digit);
    b.i32Store8(0, 0);
    b.getLocal(v);
    b.i64Const(10);
    b.i64DivU();
    b.setLocal(v);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(i);
    b.brTo("u64digits_loop");
    b.end();
    b.end();
    b.i32Const(0);
    b.setLocal(j);
    b.block("void", "u64rev_done");
    b.loop("void", "u64rev_loop");
    b.getLocal(j);
    b.getLocal(i);
    b.i32GeU();
    b.brIfTo("u64rev_done");
    b.i32Const(bufOffset);
    b.getLocal(j);
    b.i32Add();
    b.i32Const(revOffset);
    b.getLocal(i);
    b.i32Const(1);
    b.i32Sub();
    b.getLocal(j);
    b.i32Sub();
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(j);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(j);
    b.brTo("u64rev_loop");
    b.end();
    b.end();
    b.getLocal(i);
  }, ["value"]);
  return { u64ToStr: FN };
}
function injectHeapStringConv(mod, bufOffset, i32ToStrName, f64ToStrName, i64ToStrName, u64ToStrName, mallocName) {
  const I32H = "__i32_to_heap_string";
  const F64H = "__f64_to_heap_string";
  const I64H = "__i64_to_heap_string";
  const U64H = "__u64_to_heap_string";
  mod.addFunction(I32H, ["i32"], "i32", (b) => {
    const lenL = b.addLocal("len", "i32"), blockL = b.addLocal("block", "i32"), iL = b.addLocal("i", "i32");
    const topL = "i32h_top", endL = "i32h_end";
    b.getLocal(0);
    b.callByName(i32ToStrName);
    b.setLocal(lenL);
    b.getLocal(lenL);
    b.i32Const(4);
    b.i32Add();
    b.callByName(mallocName);
    b.setLocal(blockL);
    b.getLocal(blockL);
    b.getLocal(lenL);
    b.i32Store(0, 2);
    b.i32Const(0);
    b.setLocal(iL);
    b.block("void", endL);
    b.loop("void", topL);
    b.getLocal(iL);
    b.getLocal(lenL);
    b.i32GeU();
    b.brIfTo(endL);
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
    b.getLocal(iL);
    b.i32Add();
    b.i32Const(bufOffset);
    b.getLocal(iL);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(iL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(iL);
    b.brTo(topL);
    b.end();
    b.end();
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
  }, ["value"]);
  mod.addFunction(F64H, ["f64"], "i32", (b) => {
    const lenL = b.addLocal("len", "i32"), blockL = b.addLocal("block", "i32"), iL = b.addLocal("i", "i32");
    const topL = "f64h_top", endL = "f64h_end";
    b.getLocal(0);
    b.callByName(f64ToStrName);
    b.setLocal(lenL);
    b.getLocal(lenL);
    b.i32Const(4);
    b.i32Add();
    b.callByName(mallocName);
    b.setLocal(blockL);
    b.getLocal(blockL);
    b.getLocal(lenL);
    b.i32Store(0, 2);
    b.i32Const(0);
    b.setLocal(iL);
    b.block("void", endL);
    b.loop("void", topL);
    b.getLocal(iL);
    b.getLocal(lenL);
    b.i32GeU();
    b.brIfTo(endL);
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
    b.getLocal(iL);
    b.i32Add();
    b.i32Const(bufOffset);
    b.getLocal(iL);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(iL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(iL);
    b.brTo(topL);
    b.end();
    b.end();
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
  }, ["value"]);
  mod.addFunction(I64H, ["i64"], "i32", (b) => {
    const lenL = b.addLocal("len", "i32"), blockL = b.addLocal("block", "i32"), iL = b.addLocal("i", "i32");
    const topL = "i64h_top", endL = "i64h_end";
    b.getLocal(0);
    b.callByName(i64ToStrName);
    b.setLocal(lenL);
    b.getLocal(lenL);
    b.i32Const(4);
    b.i32Add();
    b.callByName(mallocName);
    b.setLocal(blockL);
    b.getLocal(blockL);
    b.getLocal(lenL);
    b.i32Store(0, 2);
    b.i32Const(0);
    b.setLocal(iL);
    b.block("void", endL);
    b.loop("void", topL);
    b.getLocal(iL);
    b.getLocal(lenL);
    b.i32GeU();
    b.brIfTo(endL);
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
    b.getLocal(iL);
    b.i32Add();
    b.i32Const(bufOffset);
    b.getLocal(iL);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(iL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(iL);
    b.brTo(topL);
    b.end();
    b.end();
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
  }, ["value"]);
  mod.addFunction(U64H, ["i64"], "i32", (b) => {
    const lenL = b.addLocal("len", "i32"), blockL = b.addLocal("block", "i32"), iL = b.addLocal("i", "i32");
    const topL = "u64h_top", endL = "u64h_end";
    b.getLocal(0);
    b.callByName(u64ToStrName);
    b.setLocal(lenL);
    b.getLocal(lenL);
    b.i32Const(4);
    b.i32Add();
    b.callByName(mallocName);
    b.setLocal(blockL);
    b.getLocal(blockL);
    b.getLocal(lenL);
    b.i32Store(0, 2);
    b.i32Const(0);
    b.setLocal(iL);
    b.block("void", endL);
    b.loop("void", topL);
    b.getLocal(iL);
    b.getLocal(lenL);
    b.i32GeU();
    b.brIfTo(endL);
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
    b.getLocal(iL);
    b.i32Add();
    b.i32Const(bufOffset);
    b.getLocal(iL);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(iL);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(iL);
    b.brTo(topL);
    b.end();
    b.end();
    b.getLocal(blockL);
    b.i32Const(4);
    b.i32Add();
  }, ["value"]);
  return { i32ToHeap: I32H, f64ToHeap: F64H, i64ToHeap: I64H, u64ToHeap: U64H };
}
function injectLocalArena(mod, arenaStart) {
  const TOP = "__larena_top";
  mod.addGlobal(TOP, "i32", true, arenaStart);
  return { arenaTop: TOP };
}
function injectReadLine(mod, mallocName, freeName, fdReadAlias) {
  const READLINE = "__read_line";
  mod.addFunction(READLINE, [], "i32", (b) => {
    const bufLoc = b.addLocal("buf", "i32");
    const iovLoc = b.addLocal("iov", "i32");
    const nreadLoc = b.addLocal("nread", "i32");
    const maxLoc = b.addLocal("max", "i32");
    const realLoc = b.addLocal("real", "i32");
    const chLoc = b.addLocal("ch", "i32");
    const resultLoc = b.addLocal("result", "i32");
    const iLoc = b.addLocal("i", "i32");
    const topL = "rl_top", endL = "rl_end";
    const copyTopL = "rl_c_top", copyEndL = "rl_c_end";
    b.i32Const(1024);
    b.callByName(mallocName);
    b.setLocal(bufLoc);
    b.i32Const(8);
    b.callByName(mallocName);
    b.setLocal(iovLoc);
    b.i32Const(4);
    b.callByName(mallocName);
    b.setLocal(nreadLoc);
    b.getLocal(iovLoc);
    b.getLocal(bufLoc);
    b.i32Store(0, 2);
    b.getLocal(iovLoc);
    b.i32Const(1024);
    b.i32Store(4, 2);
    b.i32Const(0);
    b.getLocal(iovLoc);
    b.i32Const(1);
    b.getLocal(nreadLoc);
    b.callByName(fdReadAlias);
    b.drop();
    b.getLocal(nreadLoc);
    b.i32Load(0, 2);
    b.setLocal(maxLoc);
    b.i32Const(0);
    b.setLocal(realLoc);
    b.block("void", endL);
    b.loop("void", topL);
    b.getLocal(realLoc);
    b.getLocal(maxLoc);
    b.i32GeU();
    b.brIfTo(endL);
    b.getLocal(bufLoc);
    b.getLocal(realLoc);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.setLocal(chLoc);
    b.getLocal(chLoc);
    b.i32Const(10);
    b.i32Eq();
    b.if_("void");
    b.brTo(endL);
    b.end();
    b.getLocal(chLoc);
    b.i32Const(13);
    b.i32Eq();
    b.if_("void");
    b.brTo(endL);
    b.end();
    b.getLocal(realLoc);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(realLoc);
    b.brTo(topL);
    b.end();
    b.end();
    b.i32Const(4);
    b.getLocal(realLoc);
    b.i32Add();
    b.callByName(mallocName);
    b.setLocal(resultLoc);
    b.getLocal(resultLoc);
    b.getLocal(realLoc);
    b.i32Store(0, 2);
    b.i32Const(0);
    b.setLocal(iLoc);
    b.block("void", copyEndL);
    b.loop("void", copyTopL);
    b.getLocal(iLoc);
    b.getLocal(realLoc);
    b.i32GeU();
    b.brIfTo(copyEndL);
    b.getLocal(resultLoc);
    b.i32Const(4);
    b.i32Add();
    b.getLocal(iLoc);
    b.i32Add();
    b.getLocal(bufLoc);
    b.getLocal(iLoc);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.i32Store8(0, 0);
    b.getLocal(iLoc);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(iLoc);
    b.brTo(copyTopL);
    b.end();
    b.end();
    b.getLocal(bufLoc);
    b.callByName(freeName);
    b.getLocal(iovLoc);
    b.callByName(freeName);
    b.getLocal(nreadLoc);
    b.callByName(freeName);
    b.getLocal(resultLoc);
    b.i32Const(4);
    b.i32Add();
  });
  return { readLine: READLINE };
}
function injectParseInt(mod) {
  const PARSE = "__parse_int";
  mod.addFunction(PARSE, ["i32"], "i32", (b) => {
    const sLoc = 0;
    const nLoc = b.addLocal("n", "i32");
    const iLoc = b.addLocal("i", "i32");
    const signLoc = b.addLocal("sign", "i32");
    const resultLoc = b.addLocal("result", "i32");
    const chLoc = b.addLocal("ch", "i32");
    const topL = "pi_top", endL = "pi_end";
    b.getLocal(sLoc);
    b.i32Const(4);
    b.i32Sub();
    b.i32Load(0, 2);
    b.setLocal(nLoc);
    b.i32Const(1);
    b.setLocal(signLoc);
    b.i32Const(0);
    b.setLocal(iLoc);
    b.getLocal(nLoc);
    b.i32Const(0);
    b.i32GtS();
    b.if_("void");
    b.getLocal(sLoc);
    b.i32Load8U(0, 0);
    b.i32Const(45);
    b.i32Eq();
    b.if_("void");
    b.i32Const(-1);
    b.setLocal(signLoc);
    b.i32Const(1);
    b.setLocal(iLoc);
    b.end();
    b.end();
    b.i32Const(0);
    b.setLocal(resultLoc);
    b.block("void", endL);
    b.loop("void", topL);
    b.getLocal(iLoc);
    b.getLocal(nLoc);
    b.i32GeU();
    b.brIfTo(endL);
    b.getLocal(sLoc);
    b.getLocal(iLoc);
    b.i32Add();
    b.i32Load8U(0, 0);
    b.setLocal(chLoc);
    b.getLocal(chLoc);
    b.i32Const(48);
    b.i32LtS();
    b.if_("void");
    b.brTo(endL);
    b.end();
    b.getLocal(chLoc);
    b.i32Const(57);
    b.i32GtS();
    b.if_("void");
    b.brTo(endL);
    b.end();
    b.getLocal(resultLoc);
    b.i32Const(10);
    b.i32Mul();
    b.getLocal(chLoc);
    b.i32Const(48);
    b.i32Sub();
    b.i32Add();
    b.setLocal(resultLoc);
    b.getLocal(iLoc);
    b.i32Const(1);
    b.i32Add();
    b.setLocal(iLoc);
    b.brTo(topL);
    b.end();
    b.end();
    b.getLocal(resultLoc);
    b.getLocal(signLoc);
    b.i32Mul();
  }, ["s"]);
  return { parseInt: PARSE };
}
function injectFileIO(mod, mallocName, freeName, fdReadAlias, fdWriteAlias, pathOpenAlias, fdCloseAlias, fdSeekAlias) {
  const FS_OPEN_READ = "__fs_open_read";
  const FS_OPEN_WRITE = "__fs_open_write";
  const FS_READ_ALL = "__fs_read_all";
  const FS_WRITE_STR = "__fs_write_str";
  const FS_EXISTS = "__fs_exists";
  const RIGHTS_READ_BASE = 6n;
  const RIGHTS_WRITE_BASE = 64n;
  const RIGHTS_INHERIT = 0n;
  mod.addFunction(FS_OPEN_READ, ["i32"], "i32", (b) => {
    const pathLoc = 0;
    const fdOutLoc = b.addLocal("fdOut", "i32");
    const fdLoc = b.addLocal("fd", "i32");
    const errLoc = b.addLocal("err", "i32");
    b.i32Const(4);
    b.callByName(mallocName);
    b.setLocal(fdOutLoc);
    b.i32Const(3);
    b.i32Const(0);
    b.getLocal(pathLoc);
    b.getLocal(pathLoc);
    b.i32Const(4);
    b.i32Sub();
    b.i32Load(0, 2);
    b.i32Const(0);
    b.i64Const(RIGHTS_READ_BASE);
    b.i64Const(RIGHTS_INHERIT);
    b.i32Const(0);
    b.getLocal(fdOutLoc);
    b.callByName(pathOpenAlias);
    b.setLocal(errLoc);
    b.getLocal(errLoc);
    b.if_("void");
    b.i32Const(-1);
    b.setLocal(fdLoc);
    b.else_();
    b.getLocal(fdOutLoc);
    b.i32Load(0, 2);
    b.setLocal(fdLoc);
    b.end();
    b.getLocal(fdOutLoc);
    b.callByName(freeName);
    b.getLocal(fdLoc);
  }, ["path"]);
  mod.addFunction(FS_OPEN_WRITE, ["i32", "i32"], "i32", (b) => {
    const pathLoc = 0;
    const modeLoc = 1;
    const fdOutLoc = b.addLocal("fdOut", "i32");
    const fdLoc = b.addLocal("fd", "i32");
    const errLoc = b.addLocal("err", "i32");
    const oflagsLoc = b.addLocal("oflags", "i32");
    const fdflagsLoc = b.addLocal("fdflags", "i32");
    b.i32Const(4);
    b.callByName(mallocName);
    b.setLocal(fdOutLoc);
    b.i32Const(1);
    b.getLocal(modeLoc);
    b.i32Const(0);
    b.i32Eq();
    b.if_("i32");
    b.i32Const(8);
    b.else_();
    b.i32Const(0);
    b.end();
    b.i32Add();
    b.setLocal(oflagsLoc);
    b.getLocal(modeLoc);
    b.i32Const(1);
    b.i32Eq();
    b.if_("i32");
    b.i32Const(1);
    b.else_();
    b.i32Const(0);
    b.end();
    b.setLocal(fdflagsLoc);
    b.i32Const(3);
    b.i32Const(0);
    b.getLocal(pathLoc);
    b.getLocal(pathLoc);
    b.i32Const(4);
    b.i32Sub();
    b.i32Load(0, 2);
    b.getLocal(oflagsLoc);
    b.i64Const(RIGHTS_WRITE_BASE);
    b.i64Const(RIGHTS_INHERIT);
    b.getLocal(fdflagsLoc);
    b.getLocal(fdOutLoc);
    b.callByName(pathOpenAlias);
    b.setLocal(errLoc);
    b.getLocal(errLoc);
    b.if_("void");
    b.i32Const(-1);
    b.setLocal(fdLoc);
    b.else_();
    b.getLocal(fdOutLoc);
    b.i32Load(0, 2);
    b.setLocal(fdLoc);
    b.end();
    b.getLocal(fdOutLoc);
    b.callByName(freeName);
    b.getLocal(fdLoc);
  }, ["path", "mode"]);
  mod.addFunction(FS_READ_ALL, ["i32"], "i32", (b) => {
    const fdLoc = 0;
    const newoffLoc = b.addLocal("newoff", "i32");
    const sizeLoc = b.addLocal("size", "i32");
    const bufLoc = b.addLocal("buf", "i32");
    const iovLoc = b.addLocal("iov", "i32");
    const nreadLoc = b.addLocal("nread", "i32");
    const totalLoc = b.addLocal("total", "i32");
    const errLoc = b.addLocal("err", "i32");
    const topL = "ra_top", endL = "ra_end";
    b.i32Const(8);
    b.callByName(mallocName);
    b.setLocal(newoffLoc);
    b.i32Const(8);
    b.callByName(mallocName);
    b.setLocal(iovLoc);
    b.i32Const(4);
    b.callByName(mallocName);
    b.setLocal(nreadLoc);
    b.getLocal(newoffLoc);
    b.i64Const(0n);
    b.i64Store(0, 3);
    b.getLocal(fdLoc);
    b.i64Const(0n);
    b.i32Const(2);
    b.getLocal(newoffLoc);
    b.callByName(fdSeekAlias);
    b.setLocal(errLoc);
    b.getLocal(errLoc);
    b.i32Eqz();
    b.if_("void");
    b.getLocal(newoffLoc);
    b.i32Load(0, 2);
    b.setLocal(sizeLoc);
    b.else_();
    b.i32Const(0);
    b.setLocal(sizeLoc);
    b.end();
    b.getLocal(fdLoc);
    b.i64Const(0n);
    b.i32Const(0);
    b.getLocal(newoffLoc);
    b.callByName(fdSeekAlias);
    b.drop();
    b.i32Const(4);
    b.getLocal(sizeLoc);
    b.i32Add();
    b.callByName(mallocName);
    b.setLocal(bufLoc);
    b.getLocal(bufLoc);
    b.getLocal(sizeLoc);
    b.i32Store(0, 2);
    b.i32Const(0);
    b.setLocal(totalLoc);
    b.block("void", endL);
    b.loop("void", topL);
    b.getLocal(totalLoc);
    b.getLocal(sizeLoc);
    b.i32GeS();
    b.brIfTo(endL);
    b.getLocal(iovLoc);
    b.getLocal(bufLoc);
    b.i32Const(4);
    b.i32Add();
    b.getLocal(totalLoc);
    b.i32Add();
    b.i32Store(0, 2);
    b.getLocal(iovLoc);
    b.getLocal(sizeLoc);
    b.getLocal(totalLoc);
    b.i32Sub();
    b.i32Store(4, 2);
    b.getLocal(fdLoc);
    b.getLocal(iovLoc);
    b.i32Const(1);
    b.getLocal(nreadLoc);
    b.callByName(fdReadAlias);
    b.setLocal(errLoc);
    b.getLocal(errLoc);
    b.if_("void");
    b.brTo(endL);
    b.end();
    b.getLocal(nreadLoc);
    b.i32Load(0, 2);
    b.i32Eqz();
    b.if_("void");
    b.brTo(endL);
    b.end();
    b.getLocal(totalLoc);
    b.getLocal(nreadLoc);
    b.i32Load(0, 2);
    b.i32Add();
    b.setLocal(totalLoc);
    b.brTo(topL);
    b.end();
    b.end();
    b.getLocal(bufLoc);
    b.getLocal(totalLoc);
    b.i32Store(0, 2);
    b.getLocal(newoffLoc);
    b.callByName(freeName);
    b.getLocal(iovLoc);
    b.callByName(freeName);
    b.getLocal(nreadLoc);
    b.callByName(freeName);
    b.getLocal(bufLoc);
    b.i32Const(4);
    b.i32Add();
  }, ["fd"]);
  mod.addFunction(FS_WRITE_STR, ["i32", "i32"], "i32", (b) => {
    const fdLoc = 0;
    const strLoc = 1;
    const iovLoc = b.addLocal("iov", "i32");
    const writtenLoc = b.addLocal("written", "i32");
    const errLoc = b.addLocal("err", "i32");
    const resLoc = b.addLocal("res", "i32");
    b.i32Const(8);
    b.callByName(mallocName);
    b.setLocal(iovLoc);
    b.i32Const(4);
    b.callByName(mallocName);
    b.setLocal(writtenLoc);
    b.getLocal(iovLoc);
    b.getLocal(strLoc);
    b.i32Store(0, 2);
    b.getLocal(iovLoc);
    b.getLocal(strLoc);
    b.i32Const(4);
    b.i32Sub();
    b.i32Load(0, 2);
    b.i32Store(4, 2);
    b.getLocal(fdLoc);
    b.getLocal(iovLoc);
    b.i32Const(1);
    b.getLocal(writtenLoc);
    b.callByName(fdWriteAlias);
    b.setLocal(errLoc);
    b.getLocal(errLoc);
    b.if_("void");
    b.i32Const(-1);
    b.setLocal(resLoc);
    b.else_();
    b.getLocal(writtenLoc);
    b.i32Load(0, 2);
    b.setLocal(resLoc);
    b.end();
    b.getLocal(iovLoc);
    b.callByName(freeName);
    b.getLocal(writtenLoc);
    b.callByName(freeName);
    b.getLocal(resLoc);
  }, ["fd", "str"]);
  mod.addFunction(FS_EXISTS, ["i32"], "i32", (b) => {
    const pathLoc = 0;
    const fdLoc = b.addLocal("fd", "i32");
    b.getLocal(pathLoc);
    b.callByName(FS_OPEN_READ);
    b.setLocal(fdLoc);
    b.getLocal(fdLoc);
    b.i32Const(0);
    b.i32GeS();
    b.if_("i32");
    b.getLocal(fdLoc);
    b.callByName(fdCloseAlias);
    b.drop();
    b.i32Const(1);
    b.else_();
    b.i32Const(0);
    b.end();
  }, ["path"]);
  return {
    fsOpenRead: FS_OPEN_READ,
    fsOpenWrite: FS_OPEN_WRITE,
    fsReadAll: FS_READ_ALL,
    fsWriteStr: FS_WRITE_STR,
    fsExists: FS_EXISTS
  };
}

// wasm-codegen.ts
class WasmCodeGen {
  mod = new ModuleBuilder;
  classInfo = new Map;
  enumInfo = new Map;
  importedFunctions = new Map;
  usingAliases = new Map;
  usingWildcards = [];
  allocator;
  strEq;
  wasiWriteBuf;
  i32ToStr;
  i64ToStr;
  u64ToStr;
  stringPool;
  emittedHelpers = new Set;
  f64ToStr;
  i32ToHeapStr;
  f64ToHeapStr;
  i64ToHeapStr;
  u64ToHeapStr;
  localArenaTop;
  readLineFn;
  parseIntFn;
  fileIO;
  curFn = null;
  curClass = null;
  curRetType = "void";
  curRetTypeName = "void";
  locals = new Map;
  tmpCounter = 0;
  breakStack = [];
  continueStack = [];
  larenaSavedIndex = null;
  stackAllocs = [];
  captures = new Map;
  envLocalIdx = -1;
  enumNextAddress = 0;
  computedLayouts = new Set;
  nextTypeTag = 0;
  totalVirtualSlots = 0;
  virtualSlotsBySig = new Map;
  funcTableIndex = new Map;
  lambdaCounter = 0;
  lambdaEmitted = new Set;
  tableFuncNames = new Set;
  staticClosureAddr = new Map;
  nextStaticClosureAddr = 0;
  static MEM_PAGES = 20;
  static LOCAL_ARENA_START = 65536;
  static ENUM_BASE = 131072;
  static ENUM_LIMIT = 163840;
  static VTABLE_BASE = 163840;
  static VTABLE_STRIDE = 256;
  static VTABLE_MAX_CLASSES = 128;
  static VTABLE_LIMIT = WasmCodeGen.VTABLE_BASE + WasmCodeGen.VTABLE_STRIDE * WasmCodeGen.VTABLE_MAX_CLASSES;
  static HEAP_START = 196608;
  static HEAP_LIMIT = 1179648;
  static STATIC_CLOSURE_BASE = 1179648;
  static STATIC_CLOSURE_LIMIT = 1310720;
  static IOV_SCRATCH = 512;
  static NWRITTEN_SCRATCH = 520;
  static NL_OFFSET = 524;
  static SPACE_OFFSET = 525;
  static INT_BUF_OFFSET = 528;
  static I64_REV_OFFSET = 592;
  builtinReturnTypes = {
    "Unsafe.pointer.read8": "int",
    "Unsafe.pointer.read16": "int",
    "Unsafe.pointer.read32": "int",
    "Unsafe.pointer.read64": "int64",
    "Unsafe.pointer.write8": "void",
    "Unsafe.pointer.write16": "void",
    "Unsafe.pointer.write32": "void",
    "Unsafe.pointer.write64": "void",
    "Unsafe.pointer.offset": "ptr",
    "Unsafe.pointer.isNull": "bool",
    "Unsafe.memory.alloc": "ptr",
    "Unsafe.memory.realloc": "ptr",
    "Unsafe.memory.free": "void",
    "Unsafe.memory.set": "void",
    "Unsafe.memory.copy": "void",
    "Unsafe.memory.compare": "int",
    "System.readLine": "string",
    "System.wasi.readLine": "string",
    "System.readInt": "int",
    "System.wasi.readInt": "int",
    "Math.abs": "double",
    "Math.sqrt": "double",
    "Math.floor": "double",
    "Math.ceil": "double",
    "Math.round": "double",
    "Math.trunc": "double",
    "Math.min": "double",
    "Math.max": "double",
    "Math.copysign": "double",
    "File.readAll": "string",
    "File.writeAll": "bool",
    "File.append": "bool",
    "File.exists": "bool"
  };
  constructor() {
    this.mod.addMemory(WasmCodeGen.MEM_PAGES, 256);
    this.mod.addExport("memory", "memory", 0);
    this.mod.addFunctionImportAlias("wasi_snapshot_preview1", "proc_exit", "proc_exit", ["i32"], null);
    this.mod.addFunctionImportAlias("wasi_snapshot_preview1", "fd_write", "wasi_fd_write", ["i32", "i32", "i32", "i32"], "i32");
    this.mod.addFunctionImportAlias("wasi_snapshot_preview1", "fd_read", "wasi_fd_read", ["i32", "i32", "i32", "i32"], "i32");
    this.mod.addFunctionImportAlias("wasi_snapshot_preview1", "path_open", "wasi_path_open", ["i32", "i32", "i32", "i32", "i32", "i64", "i64", "i32", "i32"], "i32");
    this.mod.addFunctionImportAlias("wasi_snapshot_preview1", "fd_close", "wasi_fd_close", ["i32"], "i32");
    this.mod.addFunctionImportAlias("wasi_snapshot_preview1", "fd_seek", "wasi_fd_seek", ["i32", "i64", "i32", "i32"], "i32");
    this.mod.addDataSegment(WasmCodeGen.IOV_SCRATCH, new Array(13).fill(0));
    this.mod.addDataSegment(WasmCodeGen.NL_OFFSET, [10]);
    this.mod.addDataSegment(WasmCodeGen.SPACE_OFFSET, [32]);
    this.mod.addDataSegment(WasmCodeGen.INT_BUF_OFFSET, new Array(96).fill(0));
    this.stringPool = this.mod.getStringPool(1024);
    this.allocator = injectAllocator(this.mod, WasmCodeGen.HEAP_START, WasmCodeGen.HEAP_LIMIT);
    this.strEq = injectStringRuntime(this.mod).strEq;
    this.wasiWriteBuf = injectWasiRuntime(this.mod, WasmCodeGen.IOV_SCRATCH, WasmCodeGen.NWRITTEN_SCRATCH, "wasi_fd_write").writeBuf;
    this.i32ToStr = injectIntToString(this.mod, WasmCodeGen.INT_BUF_OFFSET).i32ToStr;
    this.f64ToStr = injectFloatToString(this.mod, WasmCodeGen.INT_BUF_OFFSET).f64ToStr;
    this.i64ToStr = injectI64ToString(this.mod, WasmCodeGen.INT_BUF_OFFSET, WasmCodeGen.I64_REV_OFFSET).i64ToStr;
    this.u64ToStr = injectU64ToString(this.mod, WasmCodeGen.INT_BUF_OFFSET, WasmCodeGen.I64_REV_OFFSET).u64ToStr;
    const heapRt = injectHeapStringConv(this.mod, WasmCodeGen.INT_BUF_OFFSET, this.i32ToStr, this.f64ToStr, this.i64ToStr, this.u64ToStr, this.allocator.malloc);
    this.i32ToHeapStr = heapRt.i32ToHeap;
    this.f64ToHeapStr = heapRt.f64ToHeap;
    this.i64ToHeapStr = heapRt.i64ToHeap;
    this.u64ToHeapStr = heapRt.u64ToHeap;
    this.localArenaTop = injectLocalArena(this.mod, WasmCodeGen.LOCAL_ARENA_START).arenaTop;
    const rlRt = injectReadLine(this.mod, this.allocator.malloc, this.allocator.free, "wasi_fd_read");
    this.readLineFn = rlRt.readLine;
    this.parseIntFn = injectParseInt(this.mod).parseInt;
    this.fileIO = injectFileIO(this.mod, this.allocator.malloc, this.allocator.free, "wasi_fd_read", "wasi_fd_write", "wasi_path_open", "wasi_fd_close", "wasi_fd_seek");
    this.enumNextAddress = WasmCodeGen.ENUM_BASE;
  }
  methodSig(name, paramTypes) {
    return `${name}#${paramTypes.length}#${paramTypes.join(",")}`;
  }
  ctorSig(paramTypes) {
    return `__ctor_${paramTypes.length}_${paramTypes.join(",")}`;
  }
  sigToWasmSuffix(types) {
    if (types.length === 0)
      return `0`;
    return `${types.length}$${types.map((t) => t.replace(/[^a-zA-Z0-9_]/g, "_")).join("$")}`;
  }
  sanitizeIdent(name) {
    return name.replace(/[<>,\s]/g, (c) => ({
      "<": "_lt_",
      ">": "_gt_",
      ",": "_",
      " ": "_"
    })[c] ?? "_");
  }
  findMethodByName(ci, name) {
    for (const [sig, m] of ci.methods) {
      if (typeof sig === "string" && sig.startsWith(name + "#"))
        return m;
    }
    return null;
  }
  findStaticMethod(ci, name) {
    for (const [sig, m] of ci.methods) {
      if (typeof sig === "string" && sig.startsWith(name + "#") && m.isStatic)
        return m;
    }
    return null;
  }
  findCtorForArgCount(ci, argCount) {
    const prefix = `__ctor_${argCount}_`;
    for (const [sig, c] of ci.ctors) {
      if (typeof sig === "string" && sig.startsWith(prefix))
        return c;
    }
    return null;
  }
  resolveClassNameForStatic(name) {
    if (this.classInfo.has(name))
      return name;
    if (this.usingAliases.has(name)) {
      const a = this.usingAliases.get(name);
      if (this.classInfo.has(a))
        return a;
    }
    for (const ns of this.usingWildcards) {
      const c = `${ns}::${name}`;
      if (this.classInfo.has(c))
        return c;
    }
    return null;
  }
  resolveEnumName(name) {
    if (this.enumInfo.has(name))
      return name;
    if (this.usingAliases.has(name)) {
      const a = this.usingAliases.get(name);
      if (this.enumInfo.has(a))
        return a;
    }
    for (const ns of this.usingWildcards) {
      const c = `${ns}::${name}`;
      if (this.enumInfo.has(c))
        return c;
    }
    return null;
  }
  resolveEnumMember(node) {
    if (!node || node.kind !== "MemberAccess")
      return null;
    if (node.object.kind !== "Identifier")
      return null;
    if (this.locals.has(node.object.name))
      return null;
    const enumName = this.resolveEnumName(node.object.name);
    if (!enumName)
      return null;
    const ei = this.enumInfo.get(enumName);
    const member = ei.members.get(node.property);
    if (!member)
      return null;
    return { enumName, member };
  }
  resolveStaticMember(node, resolvedSig) {
    if (!node || node.kind !== "MemberAccess")
      return null;
    if (node.object.kind === "Identifier" && !this.locals.has(node.object.name)) {
      const clsName = this.resolveClassNameForStatic(node.object.name);
      if (clsName) {
        const ci = this.classInfo.get(clsName);
        if (ci.statics.has(node.property)) {
          return { ci, kind: "field", fieldInfo: ci.statics.get(node.property) };
        }
        let m = null;
        if (resolvedSig) {
          const candidate = ci.methods.get(resolvedSig) || null;
          if (candidate && candidate.isStatic)
            m = candidate;
        }
        if (!m)
          m = this.findStaticMethod(ci, node.property);
        if (m)
          return { ci, kind: "method", methodInfo: m };
      }
    }
    if (node.object.kind === "ThisExpr" && this.curClass) {
      const ci = this.classInfo.get(this.curClass);
      if (ci) {
        if (ci.statics.has(node.property))
          return { ci, kind: "field", fieldInfo: ci.statics.get(node.property) };
        let m = null;
        if (resolvedSig) {
          const candidate = ci.methods.get(resolvedSig) || null;
          if (candidate && candidate.isStatic)
            m = candidate;
        }
        if (!m)
          m = this.findStaticMethod(ci, node.property);
        if (m)
          return { ci, kind: "method", methodInfo: m };
      }
    }
    const objT = this.getExprType(node.object);
    if (objT && this.classInfo.has(objT)) {
      const ci = this.classInfo.get(objT);
      if (ci.statics.has(node.property))
        return { ci, kind: "field", fieldInfo: ci.statics.get(node.property) };
      let m = null;
      if (resolvedSig) {
        const candidate = ci.methods.get(resolvedSig) || null;
        if (candidate && candidate.isStatic)
          m = candidate;
      }
      if (!m)
        m = this.findStaticMethod(ci, node.property);
      if (m)
        return { ci, kind: "method", methodInfo: m };
    }
    return null;
  }
  isEnumType(t) {
    if (!t)
      return false;
    return this.enumInfo.has(this.resolveTypeName(t));
  }
  isFnPtrType(t) {
    return !!t && t.startsWith("fn(") && t.includes(")->");
  }
  parseFnPtrType(t) {
    const m = /^fn\(([^)]*)\)->(.+)$/.exec(t);
    if (!m)
      return null;
    const params = m[1] === "" ? [] : m[1].split(",");
    return { params, ret: m[2] };
  }
  numInfoType(t) {
    switch (t) {
      case "char":
        return { bits: 8, signed: true, isFloat: false };
      case "uint8":
        return { bits: 8, signed: false, isFloat: false };
      case "uint16":
        return { bits: 16, signed: false, isFloat: false };
      case "int":
        return { bits: 32, signed: true, isFloat: false };
      case "uint32":
        return { bits: 32, signed: false, isFloat: false };
      case "int64":
        return { bits: 64, signed: true, isFloat: false };
      case "uint64":
        return { bits: 64, signed: false, isFloat: false };
      case "float":
        return { bits: 32, signed: true, isFloat: true };
      case "double":
        return { bits: 64, signed: true, isFloat: true };
      default:
        return null;
    }
  }
  promoteNumericType(a, b) {
    if (a === "double" || b === "double")
      return "double";
    if (a === "float" || b === "float")
      return "float";
    const ia = this.numInfoType(a), ib = this.numInfoType(b);
    if (!ia || !ib)
      return null;
    const bits = Math.max(ia.bits, ib.bits);
    const signed = ia.signed && ib.signed;
    if (bits === 8)
      return signed ? "char" : "uint8";
    if (bits === 16)
      return signed ? "int" : "uint16";
    if (bits === 32)
      return signed ? "int" : "uint32";
    return signed ? "int64" : "uint64";
  }
  coerce(b, fromType, toType) {
    if (!fromType)
      return;
    const from = this.resolveTypeName(fromType);
    const to = this.resolveTypeName(toType);
    if (from === to)
      return;
    if (this.isEnumType(from) || this.isEnumType(to))
      return;
    if (this.isFnPtrType(from) || this.isFnPtrType(to))
      return;
    if (!this.numInfoType(from) || !this.numInfoType(to))
      return;
    const isF32 = (x) => x === "float";
    const isF64 = (x) => x === "double";
    const isI64 = (x) => x === "int64" || x === "uint64";
    if (isF32(to)) {
      if (isF32(from))
        return;
      if (isF64(from)) {
        b.f32DemoteF64();
        return;
      }
      if (isI64(from)) {
        if (this.isUnsignedType(from))
          b.f32ConvertI64U();
        else
          b.f32ConvertI64S();
        return;
      }
      if (this.isUnsignedType(from))
        b.f32ConvertI32U();
      else
        b.f32ConvertI32S();
      return;
    }
    if (isF64(to)) {
      if (isF64(from))
        return;
      if (isF32(from)) {
        b.f64PromoteF32();
        return;
      }
      if (isI64(from)) {
        if (this.isUnsignedType(from))
          b.f64ConvertI64U();
        else
          b.f64ConvertI64S();
        return;
      }
      if (this.isUnsignedType(from))
        b.f64ConvertI32U();
      else
        b.f64ConvertI32S();
      return;
    }
    if (isI64(to)) {
      if (isI64(from))
        return;
      if (isF32(from)) {
        if (this.isUnsignedType(to))
          b.i64TruncF32U();
        else
          b.i64TruncF32S();
        return;
      }
      if (isF64(from)) {
        if (this.isUnsignedType(to))
          b.i64TruncF64U();
        else
          b.i64TruncF64S();
        return;
      }
      if (this.isUnsignedType(from))
        b.i64ExtendI32U();
      else
        b.i64ExtendI32S();
      return;
    }
    if (isF32(from)) {
      if (this.isUnsignedType(to))
        b.i32TruncF32U();
      else
        b.i32TruncF32S();
      return;
    }
    if (isF64(from)) {
      if (this.isUnsignedType(to))
        b.i32TruncF64U();
      else
        b.i32TruncF64S();
      return;
    }
    if (isI64(from)) {
      b.i32WrapI64();
      return;
    }
  }
  emitExprCoerced(b, node, targetType) {
    const fromType = this.getExprType(node);
    this.emitExpr(b, node);
    if (targetType)
      this.coerce(b, fromType, targetType);
  }
  emitCast(b, fromType, toType) {
    if (!fromType)
      return;
    const f = this.resolveTypeName(fromType);
    const t = this.resolveTypeName(toType);
    if (f === t)
      return;
    const reinterp = (x) => x === "ptr" || x === "string" || x === "int";
    if (reinterp(f) && reinterp(t))
      return;
    const isF32 = (x) => x === "float";
    const isF64 = (x) => x === "double";
    const isI64 = (x) => x === "int64" || x === "uint64";
    if (isF32(t)) {
      if (isF32(f))
        return;
      if (isF64(f)) {
        b.f32DemoteF64();
        return;
      }
      if (isI64(f)) {
        if (this.isUnsignedType(f))
          b.f32ConvertI64U();
        else
          b.f32ConvertI64S();
        return;
      }
      if (this.isUnsignedType(f))
        b.f32ConvertI32U();
      else
        b.f32ConvertI32S();
      return;
    }
    if (isF64(t)) {
      if (isF64(f))
        return;
      if (isF32(f)) {
        b.f64PromoteF32();
        return;
      }
      if (isI64(f)) {
        if (this.isUnsignedType(f))
          b.f64ConvertI64U();
        else
          b.f64ConvertI64S();
        return;
      }
      if (this.isUnsignedType(f))
        b.f64ConvertI32U();
      else
        b.f64ConvertI32S();
      return;
    }
    if (isI64(t)) {
      if (isI64(f))
        return;
      if (isF32(f)) {
        if (this.isUnsignedType(t))
          b.i64TruncF32U();
        else
          b.i64TruncF32S();
        return;
      }
      if (isF64(f)) {
        if (this.isUnsignedType(t))
          b.i64TruncF64U();
        else
          b.i64TruncF64S();
        return;
      }
      if (this.isUnsignedType(f))
        b.i64ExtendI32U();
      else
        b.i64ExtendI32S();
      return;
    }
    if (isF32(f)) {
      if (this.isUnsignedType(t))
        b.i32TruncF32U();
      else
        b.i32TruncF32S();
      return;
    }
    if (isF64(f)) {
      if (this.isUnsignedType(t))
        b.i32TruncF64U();
      else
        b.i32TruncF64S();
      return;
    }
    if (isI64(f)) {
      b.i32WrapI64();
      return;
    }
  }
  toWasmType(t) {
    const r = this.resolveTypeName(t);
    if (r === "float")
      return "f32";
    if (r === "double")
      return "f64";
    if (r === "int64" || r === "uint64")
      return "i64";
    return "i32";
  }
  registerImport(modArg, nameArg, alias, params, returns) {
    if (this.importedFunctions.has(alias))
      return;
    const wasmParams = params.map((p) => this.toWasmType(p));
    const wasmRet = returns.length > 0 ? this.toWasmType(returns[0]) : null;
    this.mod.addFunctionImportAlias(modArg, nameArg, alias, wasmParams, wasmRet);
    this.importedFunctions.set(alias, {
      wasmModule: modArg,
      wasmName: nameArg,
      alias,
      paramTypes: params,
      returnType: returns[0] || "void"
    });
  }
  preScanImports(nodes) {
    for (const node of nodes) {
      if (node.kind === "NamespaceDecl") {
        this.preScanImports(node.body);
      } else if (node.kind === "ClassDecl") {
        for (const m of node.members) {
          if ((m.kind === "MethodDecl" || m.kind === "ConstructorDecl" || m.kind === "DestructorDecl") && m.body) {
            this.preScanStmtImports(m.body);
          }
        }
      }
    }
  }
  preScanStmtImports(node) {
    if (!node)
      return;
    if (node.kind === "BeginEnd") {
      for (const s of node.statements)
        this.preScanStmtImports(s);
    } else if (node.kind === "ExprStatement") {
      if (node.expr && node.expr.kind === "Call") {
        const path = this.pathOf(node.expr.callee);
        if (path === "System.wasi.Import")
          this.tryRegisterImport(node.expr.args);
      }
    } else if (node.kind === "If") {
      for (const b of node.branches)
        this.preScanStmtImports(b.thenStmt);
      this.preScanStmtImports(node.elseStmt);
    } else if (node.kind === "While")
      this.preScanStmtImports(node.body);
    else if (node.kind === "For")
      this.preScanStmtImports(node.body);
    else if (node.kind === "Switch") {
      for (const c of node.cases)
        for (const s of c.statements)
          this.preScanStmtImports(s);
    }
  }
  tryRegisterImport(args) {
    if (args.length !== 5)
      return false;
    const [modArg, nameArg, aliasArg, paramsArg, returnsArg] = args;
    if (modArg.kind !== "StringLiteral" || nameArg.kind !== "StringLiteral" || aliasArg.kind !== "StringLiteral")
      return false;
    if (paramsArg.kind !== "ArrayLiteral" || returnsArg.kind !== "ArrayLiteral")
      return false;
    const extract = (arr) => arr.elements.filter((e) => e.kind === "StringLiteral" || e.kind === "Identifier").map((e) => e.kind === "StringLiteral" ? e.value : e.name);
    this.registerImport(modArg.value, nameArg.value, aliasArg.value, extract(paramsArg), extract(returnsArg));
    return true;
  }
  captureSizeAndAlign(t) {
    const wasm = this.wasmType(t);
    if (wasm === "i64" || wasm === "f64")
      return { size: 8, align: 8 };
    return { size: 4, align: 4 };
  }
  getStaticClosureAddr(name, fnIdx) {
    if (this.staticClosureAddr.has(name))
      return this.staticClosureAddr.get(name);
    const addr = WasmCodeGen.STATIC_CLOSURE_BASE + this.nextStaticClosureAddr * 4;
    if (addr >= WasmCodeGen.STATIC_CLOSURE_LIMIT)
      throw new Error("WASM: demasiados closures estáticos");
    this.nextStaticClosureAddr++;
    this.staticClosureAddr.set(name, addr);
    this.mod.addData32(addr, fnIdx);
    return addr;
  }
  ensureStringConcatHelper() {
    const helperName = "__builtin_string_concat";
    if (this.emittedHelpers.has(helperName))
      return helperName;
    this.emittedHelpers.add(helperName);
    this.mod.addFunction(helperName, ["i32", "i32"], "i32", (builder) => {
      const s1 = 0, s2 = 1;
      const len1 = builder.addLocal("__sc_len1", "i32");
      const len2 = builder.addLocal("__sc_len2", "i32");
      const newLen = builder.addLocal("__sc_newlen", "i32");
      const blockPtr = builder.addLocal("__sc_block", "i32");
      const dest = builder.addLocal("__sc_dest", "i32");
      const i = builder.addLocal("__sc_i", "i32");
      const topL1 = `sc_top1_${this.tmpCounter}`;
      const endL1 = `sc_end1_${this.tmpCounter}`;
      const topL2 = `sc_top2_${this.tmpCounter}`;
      const endL2 = `sc_end2_${this.tmpCounter++}`;
      builder.getLocal(s1);
      builder.i32Const(4);
      builder.i32Sub();
      builder.i32Load(0, 2);
      builder.setLocal(len1);
      builder.getLocal(s2);
      builder.i32Const(4);
      builder.i32Sub();
      builder.i32Load(0, 2);
      builder.setLocal(len2);
      builder.getLocal(len1);
      builder.getLocal(len2);
      builder.i32Add();
      builder.setLocal(newLen);
      builder.getLocal(newLen);
      builder.i32Const(4);
      builder.i32Add();
      builder.callByName(this.allocator.malloc);
      builder.setLocal(blockPtr);
      builder.getLocal(blockPtr);
      builder.getLocal(newLen);
      builder.i32Store(0, 2);
      builder.getLocal(blockPtr);
      builder.i32Const(4);
      builder.i32Add();
      builder.setLocal(dest);
      builder.i32Const(0);
      builder.setLocal(i);
      builder.block("void", endL1);
      builder.loop("void", topL1);
      builder.getLocal(i);
      builder.getLocal(len1);
      builder.i32GeU();
      builder.brIfTo(endL1);
      builder.getLocal(dest);
      builder.getLocal(i);
      builder.i32Add();
      builder.getLocal(s1);
      builder.getLocal(i);
      builder.i32Add();
      builder.i32Load8U(0, 0);
      builder.i32Store8(0, 0);
      builder.getLocal(i);
      builder.i32Const(1);
      builder.i32Add();
      builder.setLocal(i);
      builder.brTo(topL1);
      builder.end();
      builder.end();
      builder.i32Const(0);
      builder.setLocal(i);
      builder.block("void", endL2);
      builder.loop("void", topL2);
      builder.getLocal(i);
      builder.getLocal(len2);
      builder.i32GeU();
      builder.brIfTo(endL2);
      builder.getLocal(dest);
      builder.getLocal(len1);
      builder.i32Add();
      builder.getLocal(i);
      builder.i32Add();
      builder.getLocal(s2);
      builder.getLocal(i);
      builder.i32Add();
      builder.i32Load8U(0, 0);
      builder.i32Store8(0, 0);
      builder.getLocal(i);
      builder.i32Const(1);
      builder.i32Add();
      builder.setLocal(i);
      builder.brTo(topL2);
      builder.end();
      builder.end();
      builder.getLocal(dest);
      builder.return_();
    });
    return helperName;
  }
  compile(ast, specializations = []) {
    const allBodies = [...ast.body, ...specializations];
    const collectTop = (nodes, currentNs = "") => {
      for (const node of nodes) {
        if (node.kind === "NamespaceDecl") {
          const nsName = currentNs ? `${currentNs}::${node.name}` : node.name;
          collectTop(node.body, nsName);
        } else if (node.kind === "ClassDecl") {
          this.registerClassShell(node, currentNs ? `${currentNs}::${node.name}` : node.name);
        } else if (node.kind === "EnumDecl") {
          this.registerEnum(node, currentNs ? `${currentNs}::${node.name}` : node.name);
        } else if (node.kind === "UsingDecl") {
          if (node.isWildcard)
            this.usingWildcards.push(node.name);
          else
            this.usingAliases.set(node.parts[node.parts.length - 1], node.parts.join("::"));
        }
      }
    };
    const compileTop = (nodes, currentNs = "") => {
      for (const node of nodes) {
        if (node.kind === "NamespaceDecl") {
          compileTop(node.body, currentNs ? `${currentNs}::${node.name}` : node.name);
        } else if (node.kind === "ClassDecl") {
          this.compileClass(node, currentNs ? `${currentNs}::${node.name}` : node.name);
        }
      }
    };
    this.preScanImports(allBodies);
    collectTop(allBodies);
    for (const name of [...this.classInfo.keys()]) {
      this.computeClassLayout(name);
    }
    this.preScanForTable(allBodies);
    this.createTable();
    compileTop(allBodies);
    this.finalizeVtables();
    this.exportPublicStatics(allBodies);
    this.generateStart();
    this.mod.ensureStringData();
    return this.mod.build();
  }
  preScanForTable(nodes, currentNs = "") {
    for (const node of nodes) {
      if (node.kind === "NamespaceDecl") {
        this.preScanForTable(node.body, currentNs ? `${currentNs}::${node.name}` : node.name);
      } else if (node.kind === "ClassDecl") {
        const fullName = currentNs ? `${currentNs}::${node.name}` : node.name;
        const ci = this.classInfo.get(fullName);
        if (!ci)
          continue;
        for (const [, m] of ci.methods)
          if (m.hasBody)
            this.tableFuncNames.add(m.wasmName);
        for (const [, ctor] of ci.ctors)
          this.tableFuncNames.add(ctor.wasmName);
        if (ci.dtor)
          this.tableFuncNames.add(ci.dtor);
        for (const m of node.members) {
          if ((m.kind === "MethodDecl" || m.kind === "ConstructorDecl" || m.kind === "DestructorDecl") && m.body) {
            this.collectLambdas(m.body);
          }
          if (m.kind === "FieldDecl" && m.isStatic && m.value) {
            this.collectLambdas(m.value);
          }
        }
      }
    }
  }
  collectLambdas(node) {
    if (!node || typeof node !== "object")
      return;
    if (Array.isArray(node)) {
      for (const child of node)
        this.collectLambdas(child);
      return;
    }
    if (node.kind === "LambdaExpr") {
      if (!node._lambdaName) {
        node._lambdaName = `__lambda_${this.lambdaCounter++}`;
      }
      this.tableFuncNames.add(node._lambdaName);
    }
    for (const key of Object.keys(node)) {
      if (key === "line" || key === "column" || key === "kind" || key.startsWith("_"))
        continue;
      const child = node[key];
      if (child && typeof child === "object")
        this.collectLambdas(child);
    }
  }
  createTable() {
    const nameArr = [];
    for (const n of this.tableFuncNames) {
      if (this.funcTableIndex.has(n))
        continue;
      nameArr.push(n);
    }
    if (nameArr.length === 0) {
      this.mod.addTable(0);
      return;
    }
    this.mod.addTable(nameArr.length);
    for (let i = 0;i < nameArr.length; i++) {
      this.mod.addFunctionToTable(nameArr[i], i);
      this.funcTableIndex.set(nameArr[i], i);
    }
  }
  finalizeVtables() {
    for (const [, ci] of this.classInfo) {
      if (!ci.isPolymorphic)
        continue;
      const vtableAddr = WasmCodeGen.VTABLE_BASE + ci.typeTag * WasmCodeGen.VTABLE_STRIDE;
      const bytes = [];
      for (let s = 0;s < this.totalVirtualSlots; s++) {
        let tableIdx = 0;
        for (const [, minfo] of ci.methods) {
          if (minfo.virtualSlot === s && minfo.hasBody) {
            const ti = this.funcTableIndex.get(minfo.wasmName);
            if (ti !== undefined)
              tableIdx = ti;
            break;
          }
        }
        bytes.push(tableIdx & 255, tableIdx >>> 8 & 255, tableIdx >>> 16 & 255, tableIdx >>> 24 & 255);
      }
      this.mod.addDataSegment(vtableAddr, bytes);
    }
  }
  registerClassShell(node, name) {
    this.classInfo.set(name, {
      name,
      isStruct: !!node.isStruct,
      isInterface: !!node.isInterface,
      baseName: node.base?.name || null,
      sizeof: 0,
      isPolymorphic: false,
      typeTag: -1,
      tagOffset: -1,
      fields: new Map,
      statics: new Map,
      methods: new Map,
      ctors: new Map,
      virtualSlots: new Map,
      node
    });
  }
  computeClassLayout(name, computing = new Set) {
    const ci = this.classInfo.get(name);
    if (!ci)
      return;
    if (this.computedLayouts.has(name))
      return;
    if (computing.has(name))
      throw new Error(`WASM: herencia circular detectada en '${name}'`);
    computing.add(name);
    const mangled = this.sanitizeIdent(name);
    let baseCi = null;
    let baseOffset = 0;
    if (ci.baseName) {
      const baseName = this.resolveTypeName(ci.baseName);
      if (baseName !== name) {
        this.computeClassLayout(baseName, computing);
        baseCi = this.classInfo.get(baseName) || null;
        if (!baseCi)
          throw new Error(`WASM: clase base '${ci.baseName}' usada por '${name}' no está registrada`);
        if (!baseCi.isInterface) {
          baseOffset = baseCi.sizeof;
          for (const [n, f] of baseCi.fields)
            if (!ci.fields.has(n))
              ci.fields.set(n, f);
          for (const [n, s] of baseCi.statics)
            if (!ci.statics.has(n))
              ci.statics.set(n, s);
          for (const [sig, m] of baseCi.methods)
            if (!ci.methods.has(sig))
              ci.methods.set(sig, m);
          for (const [sig, c] of baseCi.ctors)
            if (!ci.ctors.has(sig))
              ci.ctors.set(sig, c);
          if (baseCi.dtor && !ci.dtor)
            ci.dtor = baseCi.dtor;
        }
      }
    }
    let ownVirtual = false;
    for (const m of ci.node.members) {
      if (m.kind !== "MethodDecl")
        continue;
      if (m.isStatic)
        continue;
      if (m.isVirtual || m.isOverride || !m.body) {
        ownVirtual = true;
        break;
      }
    }
    const baseIsPoly = baseCi ? baseCi.isPolymorphic : false;
    ci.isPolymorphic = ownVirtual || baseIsPoly;
    let tagOffset = -1;
    let fieldStartOffset = baseOffset;
    if (ci.isPolymorphic) {
      if (baseIsPoly) {
        tagOffset = baseCi.tagOffset;
        fieldStartOffset = baseOffset;
      } else {
        tagOffset = baseOffset + 3 & ~3;
        fieldStartOffset = tagOffset + 4;
        if (ci.typeTag === -1) {
          ci.typeTag = this.nextTypeTag++;
          if (this.nextTypeTag > WasmCodeGen.VTABLE_MAX_CLASSES) {
            throw new Error(`WASM: demasiadas clases polimórficas (máx ${WasmCodeGen.VTABLE_MAX_CLASSES})`);
          }
        }
      }
    }
    ci.tagOffset = tagOffset;
    let offset = fieldStartOffset;
    for (const m of ci.node.members) {
      if (m.kind !== "FieldDecl")
        continue;
      const resolvedType = this.resolveTypeName(m.type);
      if (m.isStatic) {
        const gname = `${mangled}$${m.name}`;
        const wt = this.wasmType(resolvedType);
        this.mod.addGlobal(gname, wt, true, wt === "f64" ? 0 : wt === "f32" ? 0 : wt === "i64" ? 0n : 0);
        ci.statics.set(m.name, { globalName: gname, type: resolvedType });
      } else {
        const fieldCi = this.classInfo.get(resolvedType);
        if (fieldCi && fieldCi.isStruct)
          this.computeClassLayout(resolvedType, computing);
        const sz = this.sizeofField(resolvedType);
        offset = offset + sz - 1 & ~(sz - 1);
        ci.fields.set(m.name, { offset, type: resolvedType, isConst: !!m.isConst });
        offset += sz;
      }
    }
    ci.sizeof = offset + 7 & ~7;
    for (const m of ci.node.members) {
      if (m.kind === "ConstructorDecl") {
        const pts = m.params.map((p) => this.resolveTypeName(p.type));
        const csig = this.ctorSig(pts);
        const cname = `${mangled}$ctor$${this.sigToWasmSuffix(pts)}`;
        ci.ctors.set(csig, { wasmName: cname, paramTypes: pts });
      } else if (m.kind === "MethodDecl") {
        const isStatic = !!m.isStatic;
        const retTypeStr = this.resolveTypeName(m.returnType || "void");
        const pts = m.params.map((p) => this.resolveTypeName(p.type));
        const hasBody = !!m.body;
        const sig = this.methodSig(m.name, pts);
        const fname = `${mangled}$${m.name}$${this.sigToWasmSuffix(pts)}${isStatic ? "$static" : ""}`;
        const baseM = ci.methods.get(sig);
        const inheritedVirtual = baseM ? baseM.isVirtual : false;
        const isVirtual = !isStatic && (m.isVirtual || m.isOverride || !hasBody || inheritedVirtual);
        const minfo = {
          wasmName: fname,
          isStatic,
          isVirtual,
          hasBody,
          paramCount: pts.length,
          retType: this.wasmType(retTypeStr),
          retTypeName: retTypeStr,
          paramTypes: pts
        };
        ci.methods.set(sig, minfo);
        if (isVirtual) {
          const vsig = `${m.name}:${pts.length}:${pts.join(",")}`;
          let slot = this.virtualSlotsBySig.get(vsig);
          if (slot === undefined) {
            slot = this.totalVirtualSlots++;
            if (this.totalVirtualSlots > 64) {
              throw new Error(`WASM: máximo 64 slots virtuales globales, excedido`);
            }
            this.virtualSlotsBySig.set(vsig, slot);
          }
          minfo.virtualSlot = slot;
        }
      }
    }
    for (const [sig, minfo] of ci.methods) {
      if (minfo.isVirtual && minfo.virtualSlot !== undefined) {
        ci.virtualSlots.set(sig, minfo.virtualSlot);
      }
    }
    computing.delete(name);
    this.computedLayouts.add(name);
  }
  exportPublicStatics(nodes, currentNs = "") {
    for (const node of nodes) {
      if (node.kind === "NamespaceDecl") {
        this.exportPublicStatics(node.body, currentNs ? `${currentNs}::${node.name}` : node.name);
      } else if (node.kind === "ClassDecl") {
        const fullName = currentNs ? `${currentNs}::${node.name}` : node.name;
        const ci = this.classInfo.get(fullName);
        if (!ci)
          continue;
        const safeName = this.sanitizeIdent(fullName.replace(/::/g, "_"));
        for (const m of node.members) {
          if (m.kind === "FieldDecl" && m.isStatic && m.visibility === "public") {
            const sInfo = ci.statics.get(m.name);
            if (sInfo)
              this.mod.addExport(`${safeName}_${m.name}`, "global", sInfo.globalName);
          }
          if (m.kind === "MethodDecl" && m.isStatic && m.visibility === "public") {
            const mInfo = this.findStaticMethod(ci, m.name);
            if (mInfo)
              this.mod.addExport(`${safeName}_${m.name}`, "function", mInfo.wasmName);
          }
        }
      }
    }
  }
  resolveTypeName(name) {
    if (this.isFnPtrType(name))
      return name;
    const BUILTIN_TYPES = [
      "void",
      "int",
      "int64",
      "string",
      "char",
      "float",
      "double",
      "bool",
      "auto",
      "ptr",
      "uint8",
      "uint16",
      "uint32",
      "uint64"
    ];
    if (this.classInfo.has(name) || this.enumInfo.has(name) || BUILTIN_TYPES.includes(name))
      return name;
    if (this.usingAliases.has(name))
      return this.usingAliases.get(name);
    for (const ns of this.usingWildcards) {
      const c = `${ns}::${name}`;
      if (this.classInfo.has(c) || this.enumInfo.has(c))
        return c;
    }
    return name;
  }
  registerEnum(node, explicitName) {
    const enumName = explicitName || node.name;
    const base = this.enumNextAddress;
    const members = new Map;
    let lastOrdinal = -1;
    for (const m of node.members) {
      let ordinal;
      if (m.valueExpr && m.valueExpr.kind === "NumberLiteral" && typeof m.valueExpr.value === "number") {
        ordinal = m.valueExpr.value | 0;
      } else if (m.valueExpr && m.valueExpr.kind === "NumberLiteral" && typeof m.valueExpr.value === "bigint") {
        ordinal = Number(m.valueExpr.value) | 0;
      } else
        ordinal = lastOrdinal + 1;
      const address = this.enumNextAddress;
      this.enumNextAddress += 4;
      if (this.enumNextAddress > WasmCodeGen.ENUM_LIMIT)
        throw new Error("WASM: tabla de enums excedió el límite");
      members.set(m.name, { address, ordinal });
      lastOrdinal = ordinal;
    }
    this.enumInfo.set(enumName, { name: enumName, members, base, totalSize: this.enumNextAddress - base });
    for (const [, info] of members)
      this.mod.addData32(info.address, info.ordinal);
  }
  guaranteesReturn(node) {
    if (!node)
      return false;
    switch (node.kind) {
      case "Return":
        return true;
      case "BeginEnd":
        for (const s of node.statements || [])
          if (this.guaranteesReturn(s))
            return true;
        return false;
      case "If":
        if (!node.elseStmt)
          return false;
        return this.guaranteesReturn(node.branches?.[0]?.thenStmt) && this.guaranteesReturn(node.elseStmt);
      default:
        return false;
    }
  }
  compileClass(node, explicitName) {
    const className = explicitName || node.name;
    const info = this.classInfo.get(className);
    const mangled = this.sanitizeIdent(className);
    const staticsWithInit = node.members.filter((m) => m.kind === "FieldDecl" && m.isStatic && m.value);
    if (staticsWithInit.length) {
      const clinitName = `${mangled}$clinit`;
      info.clinit = clinitName;
      this.mod.addFunction(clinitName, [], null, (b) => {
        this.setupFn(b, className, "void", "void");
        for (const m of staticsWithInit) {
          this.emitExprCoerced(b, m.value, info.statics.get(m.name).type);
          b.globalSet(info.statics.get(m.name).globalName);
        }
        b.return_();
      });
    }
    for (const m of node.members) {
      if (m.kind !== "ConstructorDecl")
        continue;
      const resolvedParams = m.params.map((p) => ({ ...p, type: this.resolveTypeName(p.type) }));
      const csig = this.ctorSig(resolvedParams.map((p) => p.type));
      const ctorInfo = info.ctors.get(csig);
      if (!ctorInfo)
        throw new Error(`WASM: constructor not found for sig ${csig}`);
      const cname = ctorInfo.wasmName;
      const paramTypes = ["i32", ...resolvedParams.map((p) => this.wasmType(p.type))];
      const paramNames = ["this", ...resolvedParams.map((p) => p.name)];
      this.mod.addFunction(cname, paramTypes, null, (b) => {
        this.setupFn(b, className, "void", "void");
        let slot = 0;
        this.locals.set("this", { index: slot++, type: className });
        const structParams = [];
        for (const p of resolvedParams) {
          const pCi = this.classInfo.get(p.type);
          if (pCi && pCi.isStruct) {
            structParams.push({ name: p.name, type: p.type, wasmParamIdx: slot });
            const copyIdx = b.addLocal(`__scopy_${p.name}`, "i32");
            this.locals.set(p.name, { index: copyIdx, type: p.type });
            slot++;
          } else {
            this.locals.set(p.name, { index: slot++, type: p.type });
          }
        }
        if (structParams.length > 0 && this.larenaSavedIndex === null) {
          this.larenaSavedIndex = b.addLocal("__larena_saved", "i32");
        }
        this.collectLocals(m.body, b);
        if (this.larenaSavedIndex !== null) {
          b.globalGet(this.localArenaTop);
          b.setLocal(this.larenaSavedIndex);
        }
        for (const sp of structParams) {
          const spCi = this.classInfo.get(sp.type);
          const dstIdx = this.locals.get(sp.name).index;
          b.globalGet(this.localArenaTop);
          b.setLocal(dstIdx);
          b.getLocal(dstIdx);
          b.i32Const(spCi.sizeof);
          b.i32Add();
          b.globalSet(this.localArenaTop);
          b.getLocal(dstIdx);
          b.getLocal(sp.wasmParamIdx);
          b.i32Const(spCi.sizeof);
          b.memoryCopy();
        }
        this.compileStmt(m.body);
        this.emitStackCleanup(b);
        b.return_();
      }, paramNames);
    }
    const dtorNode = node.members.find((m) => m.kind === "DestructorDecl" && m.body);
    if (dtorNode) {
      const dname = `${mangled}$dtor`;
      info.dtor = dname;
      this.mod.addFunction(dname, ["i32"], null, (b) => {
        this.setupFn(b, className, "void", "void");
        this.locals.set("this", { index: 0, type: className });
        this.collectLocals(dtorNode.body, b);
        if (this.larenaSavedIndex !== null) {
          b.globalGet(this.localArenaTop);
          b.setLocal(this.larenaSavedIndex);
        }
        this.compileStmt(dtorNode.body);
        if (info.baseName) {
          const baseName = this.resolveTypeName(info.baseName);
          const baseCi = this.classInfo.get(baseName);
          if (baseCi && baseCi.dtor) {
            b.getLocal(0);
            b.callByName(baseCi.dtor);
          }
        }
        this.emitStackCleanup(b);
        b.return_();
      }, ["this"]);
    }
    for (const m of node.members) {
      if (m.kind !== "MethodDecl" || !m.body)
        continue;
      const resolvedParams = m.params.map((p) => ({ ...p, type: this.resolveTypeName(p.type) }));
      const sig = this.methodSig(m.name, resolvedParams.map((p) => p.type));
      const minfo = info.methods.get(sig);
      if (!minfo)
        throw new Error(`WASM: method not found for sig ${sig}`);
      const retTypeStr = this.resolveTypeName(m.returnType || "void");
      const isStatic = !!m.isStatic;
      const fname = minfo.wasmName;
      const retT = minfo.retType;
      if (retTypeStr !== "void" && !this.guaranteesReturn(m.body)) {
        throw new Error(`Error Semántico: '${m.name}' en '${className}' declara '${retTypeStr}' pero no retorna en todas las rutas.`);
      }
      const paramTypes = isStatic ? ["i32", ...resolvedParams.map((p) => this.wasmType(p.type))] : ["i32", ...resolvedParams.map((p) => this.wasmType(p.type))];
      const paramNames = isStatic ? ["__env", ...resolvedParams.map((p) => p.name)] : ["this", ...resolvedParams.map((p) => p.name)];
      this.mod.addFunction(fname, paramTypes, retT === "void" ? null : retT, (b) => {
        this.setupFn(b, className, retT, retTypeStr);
        let slot = 0;
        if (!isStatic)
          this.locals.set("this", { index: slot++, type: className });
        else
          this.locals.set("__env", { index: slot++, type: "int" });
        const structParams = [];
        for (const p of resolvedParams) {
          const pCi = this.classInfo.get(p.type);
          if (pCi && pCi.isStruct) {
            structParams.push({ name: p.name, type: p.type, wasmParamIdx: slot });
            const copyIdx = b.addLocal(`__scopy_${p.name}`, "i32");
            this.locals.set(p.name, { index: copyIdx, type: p.type });
            slot++;
          } else {
            this.locals.set(p.name, { index: slot++, type: p.type });
          }
        }
        if (structParams.length > 0 && this.larenaSavedIndex === null) {
          this.larenaSavedIndex = b.addLocal("__larena_saved", "i32");
        }
        this.collectLocals(m.body, b);
        if (this.larenaSavedIndex !== null) {
          b.globalGet(this.localArenaTop);
          b.setLocal(this.larenaSavedIndex);
        }
        for (const sp of structParams) {
          const spCi = this.classInfo.get(sp.type);
          const dstIdx = this.locals.get(sp.name).index;
          b.globalGet(this.localArenaTop);
          b.setLocal(dstIdx);
          b.getLocal(dstIdx);
          b.i32Const(spCi.sizeof);
          b.i32Add();
          b.globalSet(this.localArenaTop);
          b.getLocal(dstIdx);
          b.getLocal(sp.wasmParamIdx);
          b.i32Const(spCi.sizeof);
          b.memoryCopy();
        }
        this.compileStmt(m.body);
        this.emitStackCleanup(b);
        b.return_();
      }, paramNames);
    }
  }
  generateStart() {
    const mainRef = this.findMain();
    const clinits = [];
    for (const [, ci] of this.classInfo)
      if (ci.clinit)
        clinits.push(ci.clinit);
    let mainParamCount = 0, mainRetType = "i32";
    for (const [, ci] of this.classInfo) {
      const m = this.findStaticMethod(ci, "main");
      if (m) {
        mainParamCount = m.paramCount;
        mainRetType = m.retType;
        break;
      }
    }
    const argvOffset = mainParamCount > 0 ? this.stringPool.add("").offset : 0;
    this.mod.addFunction("_start", [], null, (b) => {
      for (const c of clinits)
        b.callByName(c);
      b.i32Const(0);
      for (let i = 0;i < mainParamCount; i++)
        b.i32Const(argvOffset);
      b.callByName(mainRef);
      if (mainRetType !== "void")
        b.drop();
      b.i32Const(0);
      b.callByName("proc_exit");
    });
    this.mod.addExport("_start", "function", "_start");
    this.mod.addExport("main", "function", mainRef);
  }
  findMain() {
    for (const [, ci] of this.classInfo) {
      const m = this.findStaticMethod(ci, "main");
      if (m)
        return m.wasmName;
    }
    throw new Error("WASM: no se encontró main");
  }
  setupFn(b, className, ret, retTypeName) {
    this.curFn = b;
    this.curClass = className;
    this.curRetType = ret;
    this.curRetTypeName = retTypeName;
    this.locals = new Map;
    this.tmpCounter = 0;
    this.breakStack = [];
    this.continueStack = [];
    this.larenaSavedIndex = null;
    this.stackAllocs = [];
    this.captures = new Map;
    this.envLocalIdx = -1;
  }
  emitStackCleanup(b) {
    for (let i = this.stackAllocs.length - 1;i >= 0; i--) {
      const sa = this.stackAllocs[i];
      const ci = this.classInfo.get(sa.type);
      if (ci && ci.dtor) {
        b.getLocal(sa.localIndex);
        b.i32Const(0);
        b.i32Ne();
        b.if_("void");
        b.getLocal(sa.localIndex);
        b.callByName(ci.dtor);
        b.end();
      }
    }
    if (this.larenaSavedIndex !== null) {
      b.getLocal(this.larenaSavedIndex);
      b.globalSet(this.localArenaTop);
    }
  }
  wasmType(t) {
    if (this.isFnPtrType(t))
      return "i32";
    const resolved = this.resolveTypeName(t);
    if (resolved === "void")
      return "void";
    if (resolved === "float")
      return "f32";
    if (resolved === "double")
      return "f64";
    if (resolved === "int64" || resolved === "uint64")
      return "i64";
    return "i32";
  }
  sizeofField(t) {
    if (this.isFnPtrType(t))
      return 4;
    const resolved = this.resolveTypeName(t);
    if (resolved === "float")
      return 4;
    if (resolved === "double")
      return 8;
    if (resolved === "int64" || resolved === "uint64")
      return 8;
    if (this.enumInfo.has(resolved))
      return 4;
    const ci = this.classInfo.get(resolved);
    if (ci && ci.isStruct)
      return ci.sizeof;
    return 4;
  }
  sizeofClass(name) {
    const resolved = this.resolveTypeName(name);
    const ci = this.classInfo.get(resolved);
    if (!ci)
      throw new Error(`WASM: clase '${name}' no declarada`);
    return ci.sizeof;
  }
  isUnsignedType(t) {
    return t === "uint8" || t === "uint16" || t === "uint32" || t === "uint64";
  }
  getExprType(node) {
    if (!node)
      return null;
    switch (node.kind) {
      case "ThisExpr":
        return this.curClass;
      case "Identifier": {
        if (this.captures.has(node.name))
          return this.captures.get(node.name).type;
        if (this.locals.has(node.name))
          return this.locals.get(node.name).type;
        if (this.curClass) {
          const ci = this.classInfo.get(this.curClass);
          if (ci) {
            if (ci.fields.has(node.name))
              return ci.fields.get(node.name).type;
            if (ci.statics.has(node.name))
              return ci.statics.get(node.name).type;
            const m = this.findStaticMethod(ci, node.name);
            if (m && m.hasBody) {
              return `fn(${m.paramTypes.join(",")})->${m.retTypeName}`;
            }
          }
        }
        for (const [, ci] of this.classInfo) {
          const m = this.findStaticMethod(ci, node.name);
          if (m && m.hasBody) {
            return `fn(${m.paramTypes.join(",")})->${m.retTypeName}`;
          }
        }
        return null;
      }
      case "MemberAccess": {
        const em = this.resolveEnumMember(node);
        if (em)
          return em.enumName;
        if (node.object.kind === "Identifier" && !this.locals.has(node.object.name)) {
          const candidate = `${node.object.name}::${node.property}`;
          if (this.classInfo.has(candidate))
            return candidate;
          if (this.enumInfo.has(candidate))
            return candidate;
        }
        const sm = this.resolveStaticMember(node);
        if (sm) {
          if (sm.kind === "field")
            return sm.fieldInfo.type;
          return sm.methodInfo.retTypeName === "void" ? null : sm.methodInfo.retTypeName;
        }
        const objT = this.getExprType(node.object);
        if (!objT)
          return null;
        if (node.property === "length" && (objT === "string" || objT.endsWith("[]")))
          return "int";
        const ci = this.classInfo.get(objT);
        if (!ci)
          return null;
        if (ci.fields.has(node.property))
          return ci.fields.get(node.property).type;
        if (ci.statics.has(node.property))
          return ci.statics.get(node.property).type;
        return null;
      }
      case "IndexExpr": {
        const arrT = this.getExprType(node.array);
        if (!arrT)
          return null;
        if (arrT.endsWith("[]"))
          return arrT.slice(0, -2);
        return null;
      }
      case "NewExpr": {
        if (node._resolvedClassName)
          return node._resolvedClassName;
        const rawName = typeof node.className === "string" ? node.className : node.className.kind === "QualifiedName" ? node.className.parts.join("::") : String(node.className);
        return this.resolveTypeName(rawName);
      }
      case "NewArrayExpr": {
        const dims = (node.sizes || []).length;
        if (node._resolvedElementType)
          return node._resolvedElementType + "[]".repeat(dims);
        const rawElem = typeof node.elementType === "string" ? node.elementType : String(node.elementType);
        return this.resolveTypeName(rawElem) + "[]".repeat(dims);
      }
      case "NumberLiteral":
        if (typeof node.value === "bigint") {
          if (node.isUnsigned)
            return "uint64";
          if (node.value >= 0n && node.value <= 9223372036854775807n)
            return "int64";
          if (node.value >= 0n && node.value <= 18446744073709551615n)
            return "uint64";
          return "int64";
        }
        if (Number.isInteger(node.value)) {
          if (node.isUnsigned) {
            if (node.value >= 0 && node.value <= 4294967295)
              return "uint32";
            return "uint64";
          }
          if (node.value >= -2147483648 && node.value <= 2147483647)
            return "int";
          if (node.value >= 0 && node.value <= 4294967295)
            return "uint32";
          return "int64";
        }
        return node.isFloat32 ? "float" : "double";
      case "StringLiteral":
        return "string";
      case "BooleanLiteral":
        return "bool";
      case "NullLiteral":
        return "null";
      case "BinaryOp": {
        const lt = this.getExprType(node.left);
        const rt = this.getExprType(node.right);
        if (!lt || !rt)
          return null;
        const op = node.op;
        if (["<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(op))
          return "bool";
        if (op === "-" && lt === "ptr" && rt === "ptr")
          return "int";
        if (lt === "string" || rt === "string")
          return "string";
        const promoted = this.promoteNumericType(lt, rt);
        return promoted || "int";
      }
      case "UnaryOp":
        if (node.op === "!")
          return "bool";
        if (node.op === "-") {
          const ot = this.getExprType(node.operand);
          if (ot === "uint64")
            return "int64";
          return ot;
        }
        return this.getExprType(node.operand);
      case "Ternary": {
        const tt = this.getExprType(node.thenExpr);
        const et = this.getExprType(node.elseExpr);
        if (!tt || !et)
          return null;
        if (tt === et)
          return tt;
        if (tt === "null")
          return et;
        if (et === "null")
          return tt;
        const promoted = this.promoteNumericType(tt, et);
        if (promoted)
          return promoted;
        return tt;
      }
      case "CastExpr":
        return this.resolveTypeName(node.targetType);
      case "LambdaExpr": {
        if (node._resolvedFnPtrType)
          return node._resolvedFnPtrType;
        const pts = node.params.map((p) => this.resolveTypeName(p.type));
        const rt = this.inferLambdaReturn(node.body) || "void";
        return `fn(${pts.join(",")})->${rt}`;
      }
      case "AddressOfExpr":
        return "ptr";
      case "Assignment":
      case "CompoundAssignment":
      case "IncrementExpr":
        return this.getExprType(node.target);
      case "SuperCall":
        return null;
      case "Call": {
        const p = this.pathOf(node.callee);
        if (p === "System.wasi.Import")
          return "void";
        if (node.callee.kind === "Identifier" && this.importedFunctions.has(node.callee.name)) {
          const imp = this.importedFunctions.get(node.callee.name);
          return imp.returnType === "void" ? null : imp.returnType;
        }
        if (p && this.builtinReturnTypes[p]) {
          const t = this.builtinReturnTypes[p];
          return t === "void" ? null : t;
        }
        if (node.callee.kind === "Identifier" && this.locals.has(node.callee.name)) {
          const ltype = this.locals.get(node.callee.name).type;
          if (this.isFnPtrType(ltype)) {
            const fp = this.parseFnPtrType(ltype);
            return fp.ret === "void" ? null : fp.ret;
          }
        }
        const m = this.resolveCallInfo(node);
        if (!m)
          return null;
        return m.retTypeName === "void" ? null : m.retTypeName;
      }
      default:
        return null;
    }
  }
  resolveCallInfo(node) {
    if (node._resolvedMethodSig && node._resolvedMethodClass) {
      const ci = this.classInfo.get(node._resolvedMethodClass);
      if (ci) {
        const m = ci.methods.get(node._resolvedMethodSig);
        if (m)
          return m;
      }
    }
    const callee = node.callee;
    if (callee.kind === "Identifier") {
      const name = callee.name;
      if (this.importedFunctions.has(name))
        return null;
      const l = this.locals.get(name);
      if (l && this.isFnPtrType(l.type))
        return null;
      if (this.curClass) {
        const ci = this.classInfo.get(this.curClass);
        const m = this.findStaticMethod(ci, name);
        if (m)
          return m;
      }
      for (const [, ci] of this.classInfo) {
        const m = this.findStaticMethod(ci, name);
        if (m)
          return m;
      }
      return null;
    }
    if (callee.kind === "MemberAccess") {
      if (callee.object.kind === "Identifier" && !this.locals.has(callee.object.name)) {
        const clsName = this.resolveClassNameForStatic(callee.object.name);
        if (clsName) {
          const ci = this.classInfo.get(clsName);
          const m = this.findStaticMethod(ci, callee.property);
          if (m)
            return m;
        }
      }
      const objT = this.getExprType(callee.object);
      if (objT && this.classInfo.has(objT)) {
        const ci = this.classInfo.get(objT);
        const m = this.findMethodByName(ci, callee.property);
        if (m)
          return m;
      }
      return null;
    }
    return null;
  }
  exprProducesValue(node) {
    if (!node)
      return false;
    switch (node.kind) {
      case "Assignment":
      case "CompoundAssignment":
      case "IncrementExpr":
      case "VarDecl":
      case "If":
      case "While":
      case "For":
      case "Switch":
      case "BeginEnd":
      case "Return":
      case "Break":
      case "Continue":
      case "Delete":
      case "SuperCall":
        return false;
      case "Call": {
        const p = this.pathOf(node.callee);
        if (p === "System.wasi.Import")
          return false;
        if (p && (p.startsWith("System.") || p.startsWith("Unsafe.")))
          return true;
        const m = this.resolveCallInfo(node);
        if (m)
          return m.retType !== "void";
        if (node.callee.kind === "Identifier" && this.locals.has(node.callee.name)) {
          const ltype = this.locals.get(node.callee.name).type;
          if (this.isFnPtrType(ltype)) {
            const fp = this.parseFnPtrType(ltype);
            return fp.ret !== "void";
          }
        }
        return false;
      }
      default:
        return true;
    }
  }
  emitZero(b, type) {
    if (this.isFnPtrType(type)) {
      b.i32Const(0);
      return;
    }
    const resolved = this.resolveTypeName(type);
    if (resolved === "float")
      b.f32Const(0);
    else if (resolved === "double")
      b.f64Const(0);
    else if (resolved === "int64" || resolved === "uint64")
      b.i64Const(0);
    else
      b.i32Const(0);
  }
  collectLocals(node, b) {
    if (!node)
      return;
    switch (node.kind) {
      case "BeginEnd":
        for (const s of node.statements)
          this.collectLocals(s, b);
        return;
      case "If":
        for (const br of node.branches)
          this.collectLocals(br.thenStmt, b);
        this.collectLocals(node.elseStmt, b);
        return;
      case "While":
        this.collectLocals(node.body, b);
        return;
      case "For":
        if (node.init?.kind === "VarDecl" && !this.locals.has(node.init.name)) {
          const resolvedT = this.resolveTypeName(node.init.type);
          const idx = b.addLocal(node.init.name, this.wasmType(resolvedT));
          this.locals.set(node.init.name, { index: idx, type: resolvedT });
        }
        this.collectLocals(node.body, b);
        return;
      case "Switch":
        for (const c of node.cases)
          for (const s of c.statements)
            this.collectLocals(s, b);
        return;
      case "VarDecl": {
        if (!this.locals.has(node.name)) {
          const resolvedT = this.resolveTypeName(node.type);
          const idx = b.addLocal(node.name, this.wasmType(resolvedT));
          this.locals.set(node.name, { index: idx, type: resolvedT });
        }
        if (!node.value && this.classInfo.has(this.resolveTypeName(node.type))) {
          if (this.larenaSavedIndex === null) {
            this.larenaSavedIndex = b.addLocal("__larena_saved", "i32");
          }
          this.stackAllocs.push({
            localIndex: this.locals.get(node.name).index,
            type: this.resolveTypeName(node.type)
          });
        }
        return;
      }
    }
  }
  pathOf(node) {
    if (!node)
      return null;
    if (node.kind === "Identifier")
      return node.name;
    if (node.kind === "MemberAccess") {
      const p = this.pathOf(node.object);
      return p ? `${p}.${node.property}` : null;
    }
    if (node.kind === "QualifiedName")
      return node.parts.join("::");
    return null;
  }
  inferLambdaReturn(node) {
    if (!node)
      return null;
    if (node.kind === "Return" && node.expr)
      return this.getExprType(node.expr);
    if (node.kind === "BeginEnd") {
      for (const s of node.statements) {
        const r = this.inferLambdaReturn(s);
        if (r)
          return r;
      }
    }
    if (node.kind === "If") {
      if (!node.elseStmt)
        return null;
      const t = this.inferLambdaReturn(node.branches[0].thenStmt);
      if (t)
        return t;
      return this.inferLambdaReturn(node.elseStmt);
    }
    return null;
  }
  emitLambdaFunction(node, paramTypes, retType, wasmName) {
    const captures = node._captures || [];
    const captureLayout = [];
    let offset = 8;
    for (const c of captures) {
      const { size, align } = this.captureSizeAndAlign(c.type);
      offset = offset + align - 1 & ~(align - 1);
      captureLayout.push({ name: c.name, type: c.type, offset, size, align });
      offset += size;
    }
    const wasmParams = ["i32", ...paramTypes.map((t) => this.toWasmType(t))];
    const wasmRet = this.wasmType(retType);
    const savedFn = this.curFn;
    const savedClass = this.curClass;
    const savedRet = this.curRetType;
    const savedRetName = this.curRetTypeName;
    const savedLocals = this.locals;
    const savedTmp = this.tmpCounter;
    const savedBreak = this.breakStack;
    const savedContinue = this.continueStack;
    const savedLarena = this.larenaSavedIndex;
    const savedStack = this.stackAllocs;
    const savedCaptures = this.captures;
    const savedEnvLocalIdx = this.envLocalIdx;
    this.mod.addFunction(wasmName, wasmParams, wasmRet === "void" ? null : wasmRet, (b) => {
      this.setupFn(b, savedClass, wasmRet, retType);
      this.envLocalIdx = 0;
      this.captures = new Map;
      for (const cl of captureLayout) {
        this.captures.set(cl.name, { type: cl.type, offset: cl.offset, size: cl.size, align: cl.align });
      }
      this.locals.set("__env", { index: 0, type: "int" });
      for (let i = 0;i < paramTypes.length; i++) {
        this.locals.set(node.params[i].name, { index: i + 1, type: paramTypes[i] });
      }
      this.collectLocals(node.body, b);
      this.compileStmt(node.body);
      b.return_();
    }, ["__env", ...node.params.map((p) => p.name)]);
    this.curFn = savedFn;
    this.curClass = savedClass;
    this.curRetType = savedRet;
    this.curRetTypeName = savedRetName;
    this.locals = savedLocals;
    this.tmpCounter = savedTmp;
    this.breakStack = savedBreak;
    this.continueStack = savedContinue;
    this.larenaSavedIndex = savedLarena;
    this.stackAllocs = savedStack;
    this.captures = savedCaptures;
    this.envLocalIdx = savedEnvLocalIdx;
  }
  emitBuiltinCall(path, b, args) {
    const isPrintArg = (t) => t === "string" || t === "int" || t === "char" || t === "uint8" || t === "uint16" || t === "uint32" || t === "int64" || t === "uint64" || t === "bool" || t === "ptr" || t === "float" || t === "double" || this.isEnumType(t);
    const emitPrintArg = (arg) => {
      const t = this.getExprType(arg);
      if (this.isEnumType(t)) {
        this.emitExpr(b, arg);
        b.i32Load(0, 2);
        b.callByName(this.i32ToStr);
        const tmpLen = b.addLocal(`__pe_${this.tmpCounter++}`, "i32");
        b.setLocal(tmpLen);
        b.i32Const(WasmCodeGen.INT_BUF_OFFSET);
        b.getLocal(tmpLen);
        b.callByName(this.wasiWriteBuf);
        return;
      }
      if (t === "string") {
        const tmp = b.addLocal(`__ps_${this.tmpCounter++}`, "i32");
        this.emitExpr(b, arg);
        b.setLocal(tmp);
        b.getLocal(tmp);
        b.getLocal(tmp);
        b.i32Const(4);
        b.i32Sub();
        b.i32Load(0, 2);
        b.callByName(this.wasiWriteBuf);
        return;
      }
      if (t === "bool") {
        const tOff = this.stringPool.add("true").offset;
        const fOff = this.stringPool.add("false").offset;
        const tmp = b.addLocal(`__pb_${this.tmpCounter++}`, "i32");
        this.emitExpr(b, arg);
        b.setLocal(tmp);
        b.getLocal(tmp);
        b.getLocal(tmp);
        b.if_("void");
        b.i32Const(tOff);
        b.i32Const(4);
        b.callByName(this.wasiWriteBuf);
        b.else_();
        b.i32Const(fOff);
        b.i32Const(5);
        b.callByName(this.wasiWriteBuf);
        b.end();
        return;
      }
      if (t === "int64" || t === "uint64") {
        this.emitExpr(b, arg);
        b.callByName(t === "uint64" ? this.u64ToStr : this.i64ToStr);
        const tmpLen = b.addLocal(`__p64_${this.tmpCounter++}`, "i32");
        b.setLocal(tmpLen);
        b.i32Const(WasmCodeGen.INT_BUF_OFFSET);
        b.getLocal(tmpLen);
        b.callByName(this.wasiWriteBuf);
        return;
      }
      if (t === "int" || t === "char" || t === "uint8" || t === "uint16" || t === "uint32" || t === "ptr") {
        this.emitExpr(b, arg);
        b.callByName(this.i32ToStr);
        const tmpLen = b.addLocal(`__pl_${this.tmpCounter++}`, "i32");
        b.setLocal(tmpLen);
        b.i32Const(WasmCodeGen.INT_BUF_OFFSET);
        b.getLocal(tmpLen);
        b.callByName(this.wasiWriteBuf);
        return;
      }
      if (t === "float") {
        this.emitExpr(b, arg);
        b.f64PromoteF32();
        b.callByName(this.f64ToStr);
        const tmpLen = b.addLocal(`__pfl_${this.tmpCounter++}`, "i32");
        b.setLocal(tmpLen);
        b.i32Const(WasmCodeGen.INT_BUF_OFFSET);
        b.getLocal(tmpLen);
        b.callByName(this.wasiWriteBuf);
        return;
      }
      if (t === "double") {
        this.emitExpr(b, arg);
        b.callByName(this.f64ToStr);
        const tmpLen = b.addLocal(`__pfl_${this.tmpCounter++}`, "i32");
        b.setLocal(tmpLen);
        b.i32Const(WasmCodeGen.INT_BUF_OFFSET);
        b.getLocal(tmpLen);
        b.callByName(this.wasiWriteBuf);
        return;
      }
      throw new Error(`println: tipo '${t}' no soportado`);
    };
    switch (path) {
      case "System.wasi.Import":
        return this.tryRegisterImport(args);
      case "Unsafe.pointer.read8":
        this.emitExpr(b, args[0]);
        b.i32Load8U(0, 0);
        return true;
      case "Unsafe.pointer.read16":
        this.emitExpr(b, args[0]);
        b.i32Load16U(0, 1);
        return true;
      case "Unsafe.pointer.read32":
        this.emitExpr(b, args[0]);
        b.i32Load(0, 2);
        return true;
      case "Unsafe.pointer.read64":
        this.emitExpr(b, args[0]);
        b.i64Load(0, 3);
        return true;
      case "Unsafe.pointer.write8":
        this.emitExpr(b, args[0]);
        this.emitExprCoerced(b, args[1], "int");
        b.i32Store8(0, 0);
        b.i32Const(0);
        return true;
      case "Unsafe.pointer.write16":
        this.emitExpr(b, args[0]);
        this.emitExprCoerced(b, args[1], "int");
        b.i32Store16(0, 1);
        b.i32Const(0);
        return true;
      case "Unsafe.pointer.write32":
        this.emitExpr(b, args[0]);
        this.emitExprCoerced(b, args[1], "int");
        b.i32Store(0, 2);
        b.i32Const(0);
        return true;
      case "Unsafe.pointer.write64":
        this.emitExpr(b, args[0]);
        this.emitExprCoerced(b, args[1], "int64");
        b.i64Store(0, 3);
        b.i32Const(0);
        return true;
      case "Unsafe.pointer.offset":
        this.emitExpr(b, args[0]);
        this.emitExpr(b, args[1]);
        b.i32Add();
        return true;
      case "Unsafe.pointer.isNull":
        this.emitExpr(b, args[0]);
        b.i32Const(-1);
        b.i32Eq();
        return true;
      case "Unsafe.memory.alloc":
        this.emitExpr(b, args[0]);
        b.callByName(this.allocator.malloc);
        return true;
      case "Unsafe.memory.free":
        this.emitExpr(b, args[0]);
        b.callByName(this.allocator.free);
        b.i32Const(0);
        return true;
      case "Unsafe.memory.realloc":
        this.emitExpr(b, args[0]);
        this.emitExpr(b, args[1]);
        b.drop();
        return true;
      case "Unsafe.memory.set": {
        const pLoc = b.addLocal(`__mset_p_${this.tmpCounter++}`, "i32");
        const vLoc = b.addLocal(`__mset_v_${this.tmpCounter++}`, "i32");
        const nLoc = b.addLocal(`__mset_n_${this.tmpCounter++}`, "i32");
        const iLoc = b.addLocal(`__mset_i_${this.tmpCounter++}`, "i32");
        const topL = `mset_top_${this.tmpCounter++}`, endL = `mset_end_${this.tmpCounter++}`;
        this.emitExpr(b, args[0]);
        b.setLocal(pLoc);
        this.emitExpr(b, args[1]);
        b.setLocal(vLoc);
        this.emitExpr(b, args[2]);
        b.setLocal(nLoc);
        b.i32Const(0);
        b.setLocal(iLoc);
        b.block("void", endL);
        b.loop("void", topL);
        b.getLocal(iLoc);
        b.getLocal(nLoc);
        b.i32GeU();
        b.brIfTo(endL);
        b.getLocal(pLoc);
        b.getLocal(iLoc);
        b.i32Add();
        b.getLocal(vLoc);
        b.i32Store8(0, 0);
        b.getLocal(iLoc);
        b.i32Const(1);
        b.i32Add();
        b.setLocal(iLoc);
        b.brTo(topL);
        b.end();
        b.end();
        b.i32Const(0);
        return true;
      }
      case "Unsafe.memory.copy": {
        const dLoc = b.addLocal(`__mcp_d_${this.tmpCounter++}`, "i32");
        const sLoc = b.addLocal(`__mcp_s_${this.tmpCounter++}`, "i32");
        const nLoc = b.addLocal(`__mcp_n_${this.tmpCounter++}`, "i32");
        const iLoc = b.addLocal(`__mcp_i_${this.tmpCounter++}`, "i32");
        const topL = `mcp_top_${this.tmpCounter++}`, endL = `mcp_end_${this.tmpCounter++}`;
        this.emitExpr(b, args[0]);
        b.setLocal(dLoc);
        this.emitExpr(b, args[1]);
        b.setLocal(sLoc);
        this.emitExpr(b, args[2]);
        b.setLocal(nLoc);
        b.i32Const(0);
        b.setLocal(iLoc);
        b.block("void", endL);
        b.loop("void", topL);
        b.getLocal(iLoc);
        b.getLocal(nLoc);
        b.i32GeU();
        b.brIfTo(endL);
        b.getLocal(dLoc);
        b.getLocal(iLoc);
        b.i32Add();
        b.getLocal(sLoc);
        b.getLocal(iLoc);
        b.i32Add();
        b.i32Load8U(0, 0);
        b.i32Store8(0, 0);
        b.getLocal(iLoc);
        b.i32Const(1);
        b.i32Add();
        b.setLocal(iLoc);
        b.brTo(topL);
        b.end();
        b.end();
        b.i32Const(0);
        return true;
      }
      case "Unsafe.memory.compare": {
        const aLoc = b.addLocal(`__mcmp_a_${this.tmpCounter++}`, "i32");
        const bLoc = b.addLocal(`__mcmp_b_${this.tmpCounter++}`, "i32");
        const nLoc = b.addLocal(`__mcmp_n_${this.tmpCounter++}`, "i32");
        const iLoc = b.addLocal(`__mcmp_i_${this.tmpCounter++}`, "i32");
        const daLoc = b.addLocal(`__mcmp_da_${this.tmpCounter++}`, "i32");
        const dbLoc = b.addLocal(`__mcmp_db_${this.tmpCounter++}`, "i32");
        const resLoc = b.addLocal(`__mcmp_r_${this.tmpCounter++}`, "i32");
        const topL = `mcmp_top_${this.tmpCounter++}`, endL = `mcmp_end_${this.tmpCounter++}`;
        this.emitExpr(b, args[0]);
        b.setLocal(aLoc);
        this.emitExpr(b, args[1]);
        b.setLocal(bLoc);
        this.emitExpr(b, args[2]);
        b.setLocal(nLoc);
        b.i32Const(0);
        b.setLocal(iLoc);
        b.i32Const(0);
        b.setLocal(resLoc);
        b.block("void", endL);
        b.loop("void", topL);
        b.getLocal(iLoc);
        b.getLocal(nLoc);
        b.i32GeU();
        b.brIfTo(endL);
        b.getLocal(aLoc);
        b.getLocal(iLoc);
        b.i32Add();
        b.i32Load8U(0, 0);
        b.setLocal(daLoc);
        b.getLocal(bLoc);
        b.getLocal(iLoc);
        b.i32Add();
        b.i32Load8U(0, 0);
        b.setLocal(dbLoc);
        b.getLocal(daLoc);
        b.getLocal(dbLoc);
        b.i32Ne();
        b.if_("void");
        b.getLocal(daLoc);
        b.getLocal(dbLoc);
        b.i32LtU();
        b.if_("void");
        b.i32Const(-1);
        b.setLocal(resLoc);
        b.else_();
        b.i32Const(1);
        b.setLocal(resLoc);
        b.end();
        b.brTo(endL);
        b.end();
        b.getLocal(iLoc);
        b.i32Const(1);
        b.i32Add();
        b.setLocal(iLoc);
        b.brTo(topL);
        b.end();
        b.end();
        b.getLocal(resLoc);
        return true;
      }
      case "System.wasi.write":
      case "System.write": {
        if (args.length !== 1)
          throw new Error(`${path} espera 1 argumento`);
        emitPrintArg(args[0]);
        b.i32Const(0);
        return true;
      }
      case "System.wasi.writeLine":
      case "System.writeLine": {
        if (args.length !== 1)
          throw new Error(`${path} espera 1 argumento`);
        emitPrintArg(args[0]);
        b.i32Const(WasmCodeGen.NL_OFFSET);
        b.i32Const(1);
        b.callByName(this.wasiWriteBuf);
        b.i32Const(0);
        return true;
      }
      case "System.wasi.println":
      case "System.println": {
        for (let i = 0;i < args.length; i++) {
          if (i > 0) {
            b.i32Const(WasmCodeGen.SPACE_OFFSET);
            b.i32Const(1);
            b.callByName(this.wasiWriteBuf);
          }
          const t = this.getExprType(args[i]);
          if (!isPrintArg(t))
            throw new Error(`println: tipo '${t}' no soportado`);
          emitPrintArg(args[i]);
        }
        b.i32Const(WasmCodeGen.NL_OFFSET);
        b.i32Const(1);
        b.callByName(this.wasiWriteBuf);
        b.i32Const(0);
        return true;
      }
      case "System.wasi.exit":
      case "System.exit":
        this.emitExpr(b, args[0]);
        b.callByName("proc_exit");
        b.unreachable();
        return true;
      case "System.wasi.flush":
      case "System.flush":
        b.i32Const(0);
        return true;
      case "System.wasi.readLine":
      case "System.readLine":
        b.callByName(this.readLineFn);
        return true;
      case "System.wasi.readInt":
      case "System.readInt":
        b.callByName(this.readLineFn);
        b.callByName(this.parseIntFn);
        return true;
      case "Math.abs":
        this.emitExprCoerced(b, args[0], "double");
        b.f64Abs();
        return true;
      case "Math.sqrt":
        this.emitExprCoerced(b, args[0], "double");
        b.f64Sqrt();
        return true;
      case "Math.floor":
        this.emitExprCoerced(b, args[0], "double");
        b.f64Floor();
        return true;
      case "Math.ceil":
        this.emitExprCoerced(b, args[0], "double");
        b.f64Ceil();
        return true;
      case "Math.round":
        this.emitExprCoerced(b, args[0], "double");
        b.f64Nearest();
        return true;
      case "Math.trunc":
        this.emitExprCoerced(b, args[0], "double");
        b.f64Trunc();
        return true;
      case "Math.min":
        this.emitExprCoerced(b, args[0], "double");
        this.emitExprCoerced(b, args[1], "double");
        b.f64Min();
        return true;
      case "Math.max":
        this.emitExprCoerced(b, args[0], "double");
        this.emitExprCoerced(b, args[1], "double");
        b.f64Max();
        return true;
      case "Math.copysign":
        this.emitExprCoerced(b, args[0], "double");
        this.emitExprCoerced(b, args[1], "double");
        b.f64Copysign();
        return true;
      case "File.readAll": {
        if (args.length !== 1)
          throw new Error("File.readAll espera 1 argumento");
        const fdLoc = b.addLocal(`__fr_fd_${this.tmpCounter++}`, "i32");
        const resLoc = b.addLocal(`__fr_res_${this.tmpCounter++}`, "i32");
        this.emitExpr(b, args[0]);
        b.callByName(this.fileIO.fsOpenRead);
        b.setLocal(fdLoc);
        b.getLocal(fdLoc);
        b.i32Const(0);
        b.i32LtS();
        b.if_("void");
        b.i32Const(this.stringPool.add("").offset);
        b.setLocal(resLoc);
        b.else_();
        b.getLocal(fdLoc);
        b.callByName(this.fileIO.fsReadAll);
        b.setLocal(resLoc);
        b.getLocal(fdLoc);
        b.callByName("wasi_fd_close");
        b.drop();
        b.end();
        b.getLocal(resLoc);
        return true;
      }
      case "File.writeAll": {
        if (args.length !== 2)
          throw new Error("File.writeAll espera 2 argumentos");
        const fdLoc = b.addLocal(`__fw_fd_${this.tmpCounter++}`, "i32");
        const wrLoc = b.addLocal(`__fw_wr_${this.tmpCounter++}`, "i32");
        const resLoc = b.addLocal(`__fw_res_${this.tmpCounter++}`, "i32");
        this.emitExpr(b, args[0]);
        b.i32Const(0);
        b.callByName(this.fileIO.fsOpenWrite);
        b.setLocal(fdLoc);
        b.getLocal(fdLoc);
        b.i32Const(0);
        b.i32LtS();
        b.if_("void");
        b.i32Const(0);
        b.setLocal(resLoc);
        b.else_();
        b.getLocal(fdLoc);
        this.emitExpr(b, args[1]);
        b.callByName(this.fileIO.fsWriteStr);
        b.setLocal(wrLoc);
        b.getLocal(fdLoc);
        b.callByName("wasi_fd_close");
        b.drop();
        b.getLocal(wrLoc);
        b.i32Const(0);
        b.i32GeS();
        b.setLocal(resLoc);
        b.end();
        b.getLocal(resLoc);
        return true;
      }
      case "File.append": {
        if (args.length !== 2)
          throw new Error("File.append espera 2 argumentos");
        const fdLoc = b.addLocal(`__fa_fd_${this.tmpCounter++}`, "i32");
        const wrLoc = b.addLocal(`__fa_wr_${this.tmpCounter++}`, "i32");
        const resLoc = b.addLocal(`__fa_res_${this.tmpCounter++}`, "i32");
        this.emitExpr(b, args[0]);
        b.i32Const(1);
        b.callByName(this.fileIO.fsOpenWrite);
        b.setLocal(fdLoc);
        b.getLocal(fdLoc);
        b.i32Const(0);
        b.i32LtS();
        b.if_("void");
        b.i32Const(0);
        b.setLocal(resLoc);
        b.else_();
        b.getLocal(fdLoc);
        this.emitExpr(b, args[1]);
        b.callByName(this.fileIO.fsWriteStr);
        b.setLocal(wrLoc);
        b.getLocal(fdLoc);
        b.callByName("wasi_fd_close");
        b.drop();
        b.getLocal(wrLoc);
        b.i32Const(0);
        b.i32GeS();
        b.setLocal(resLoc);
        b.end();
        b.getLocal(resLoc);
        return true;
      }
      case "File.exists": {
        if (args.length !== 1)
          throw new Error("File.exists espera 1 argumento");
        this.emitExpr(b, args[0]);
        b.callByName(this.fileIO.fsExists);
        return true;
      }
      default:
        return false;
    }
  }
  emitIndexAddr(b, arrayExpr, indexExpr, elemSize) {
    const tmpArr = b.addLocal(`__ia_${this.tmpCounter++}`, "i32");
    const tmpIdx = b.addLocal(`__ii_${this.tmpCounter++}`, "i32");
    this.emitExpr(b, arrayExpr);
    b.setLocal(tmpArr);
    this.emitExpr(b, indexExpr);
    b.setLocal(tmpIdx);
    b.getLocal(tmpIdx);
    b.getLocal(tmpArr);
    b.i32Const(4);
    b.i32Sub();
    b.i32Load(0, 2);
    b.i32GeU();
    b.if_("void");
    b.unreachable();
    b.end();
    b.getLocal(tmpArr);
    b.getLocal(tmpIdx);
    b.i32Const(elemSize);
    b.i32Mul();
    b.i32Add();
  }
  elemSizeOf(t) {
    if (this.isFnPtrType(t))
      return 4;
    const r = this.resolveTypeName(t);
    if (r === "float")
      return 4;
    if (r === "double")
      return 8;
    if (r === "int64" || r === "uint64")
      return 8;
    if (this.enumInfo.has(r))
      return 4;
    const ci = this.classInfo.get(r);
    if (ci)
      return ci.sizeof;
    return 4;
  }
  isF32Elem(t) {
    if (!t)
      return false;
    return this.resolveTypeName(t) === "float";
  }
  isF64Elem(t) {
    if (!t)
      return false;
    return this.resolveTypeName(t) === "double";
  }
  isI64Elem(t) {
    if (!t)
      return false;
    const r = this.resolveTypeName(t);
    return r === "int64" || r === "uint64";
  }
  arrayElemType(node) {
    const arrT = this.getExprType(node);
    if (!arrT || !arrT.endsWith("[]"))
      return null;
    return arrT.slice(0, -2);
  }
  compileStmt(node) {
    if (!node)
      return;
    const b = this.curFn;
    switch (node.kind) {
      case "BeginEnd":
        for (const s of node.statements)
          this.compileStmt(s);
        return;
      case "VarDecl": {
        const resolvedT = this.resolveTypeName(node.type);
        const ci = this.classInfo.get(resolvedT);
        const local = this.locals.get(node.name);
        if (!node.value && ci) {
          const tmp = b.addLocal(`__sa_${this.tmpCounter++}`, "i32");
          b.globalGet(this.localArenaTop);
          b.setLocal(tmp);
          b.getLocal(tmp);
          b.i32Const(ci.sizeof);
          b.i32Add();
          b.globalSet(this.localArenaTop);
          b.getLocal(tmp);
          b.i32Const(0);
          b.i32Const(ci.sizeof);
          b.memoryFill();
          if (ci.isPolymorphic) {
            b.getLocal(tmp);
            b.i32Const(ci.typeTag);
            b.i32Store(ci.tagOffset, 2);
          }
          const ctor0 = this.findCtorForArgCount(ci, 0);
          if (ctor0) {
            b.getLocal(tmp);
            b.callByName(ctor0.wasmName);
          }
          b.getLocal(tmp);
          b.setLocal(local.index);
          return;
        }
        if (ci && ci.isStruct && node.value) {
          const tmp = b.addLocal(`__sinit_${this.tmpCounter++}`, "i32");
          b.globalGet(this.localArenaTop);
          b.setLocal(tmp);
          b.getLocal(tmp);
          b.i32Const(ci.sizeof);
          b.i32Add();
          b.globalSet(this.localArenaTop);
          b.getLocal(tmp);
          this.emitExpr(b, node.value);
          b.i32Const(ci.sizeof);
          b.memoryCopy();
          b.getLocal(tmp);
          b.setLocal(local.index);
          return;
        }
        if (node.value) {
          this.emitExprCoerced(b, node.value, resolvedT);
        } else {
          this.emitZero(b, node.type);
        }
        b.setLocal(local.index);
        return;
      }
      case "ExprStatement": {
        this.emitExpr(b, node.expr);
        if (this.exprProducesValue(node.expr))
          b.drop();
        return;
      }
      case "If": {
        const endLabel = `if_end_${this.tmpCounter++}`;
        b.block("void", endLabel);
        for (const br of node.branches) {
          const nextLabel = `if_next_${this.tmpCounter++}`;
          b.block("void", nextLabel);
          this.emitExpr(b, br.condition);
          b.i32Eqz();
          b.brIfTo(nextLabel);
          this.compileStmt(br.thenStmt);
          b.brTo(endLabel);
          b.end();
        }
        if (node.elseStmt)
          this.compileStmt(node.elseStmt);
        b.end();
        return;
      }
      case "While": {
        const topLabel = `while_top_${this.tmpCounter++}`;
        const endLabel = `while_end_${this.tmpCounter++}`;
        b.block("void", endLabel);
        b.loop("void", topLabel);
        this.emitExpr(b, node.condition);
        b.i32Eqz();
        b.brIfTo(endLabel);
        this.breakStack.push([endLabel]);
        this.continueStack.push([topLabel]);
        this.compileStmt(node.body);
        this.breakStack.pop();
        this.continueStack.pop();
        b.brTo(topLabel);
        b.end();
        b.end();
        return;
      }
      case "For": {
        if (node.init)
          this.compileStmt(node.init);
        const topLabel = `for_top_${this.tmpCounter++}`;
        const endLabel = `for_end_${this.tmpCounter++}`;
        b.block("void", endLabel);
        b.loop("void", topLabel);
        if (node.condition) {
          this.emitExpr(b, node.condition);
          b.i32Eqz();
          b.brIfTo(endLabel);
        }
        this.breakStack.push([endLabel]);
        this.continueStack.push([topLabel]);
        this.compileStmt(node.body);
        if (node.update) {
          this.emitExpr(b, node.update);
          if (this.exprProducesValue(node.update))
            b.drop();
        }
        this.breakStack.pop();
        this.continueStack.pop();
        b.brTo(topLabel);
        b.end();
        b.end();
        return;
      }
      case "Switch": {
        const swType = this.getExprType(node.expr);
        const isStr = swType === "string";
        const isI64Sw = swType === "int64" || swType === "uint64";
        const slotType = isI64Sw ? "i64" : "i32";
        const tmpSlot = b.addLocal(`__sw_${this.tmpCounter++}`, slotType);
        const endLabel = `sw_end_${this.tmpCounter++}`;
        b.block("void", endLabel);
        this.emitExpr(b, node.expr);
        b.setLocal(tmpSlot);
        for (const c of node.cases) {
          if (c.values === null) {
            this.breakStack.push([endLabel]);
            for (const s of c.statements)
              this.compileStmt(s);
            this.breakStack.pop();
            b.brTo(endLabel);
            continue;
          }
          const nextLabel = `sw_next_${this.tmpCounter++}`;
          const bodyLabel = `sw_body_${this.tmpCounter++}`;
          b.block("void", nextLabel);
          b.block("void", bodyLabel);
          for (const v of c.values) {
            b.getLocal(tmpSlot);
            this.emitExprCoerced(b, v, swType);
            if (isStr)
              b.callByName(this.strEq);
            else if (isI64Sw)
              b.i64Eq();
            else
              b.i32Eq();
            b.brIfTo(bodyLabel);
          }
          b.brTo(nextLabel);
          b.end();
          this.breakStack.push([endLabel]);
          for (const s of c.statements)
            this.compileStmt(s);
          this.breakStack.pop();
          b.brTo(endLabel);
          b.end();
        }
        b.end();
        return;
      }
      case "Break": {
        const st = this.breakStack[this.breakStack.length - 1];
        if (st && st.length)
          b.brTo(st[0]);
        return;
      }
      case "Continue": {
        const st = this.continueStack[this.continueStack.length - 1];
        if (st && st.length)
          b.brTo(st[0]);
        return;
      }
      case "Return": {
        if (node.expr)
          this.emitExprCoerced(b, node.expr, this.curRetTypeName);
        this.emitStackCleanup(b);
        b.return_();
        return;
      }
      case "Delete": {
        const t = this.getExprType(node.target);
        if (t && t.endsWith("[]")) {
          const elemT = t.slice(0, -2);
          const ci = this.classInfo.get(elemT);
          if (ci && ci.dtor) {
            const tmpArr = b.addLocal(`__darr_${this.tmpCounter++}`, "i32");
            const iLoc = b.addLocal(`__di_${this.tmpCounter++}`, "i32");
            const nLoc = b.addLocal(`__dn_${this.tmpCounter++}`, "i32");
            const elemLoc = b.addLocal(`__de_${this.tmpCounter++}`, "i32");
            const topL = `darr_top_${this.tmpCounter++}`, endL = `darr_end_${this.tmpCounter++}`;
            this.emitExpr(b, node.target);
            b.setLocal(tmpArr);
            b.getLocal(tmpArr);
            b.i32Const(4);
            b.i32Sub();
            b.i32Load(0, 2);
            b.setLocal(nLoc);
            b.i32Const(0);
            b.setLocal(iLoc);
            b.block("void", endL);
            b.loop("void", topL);
            b.getLocal(iLoc);
            b.getLocal(nLoc);
            b.i32GeU();
            b.brIfTo(endL);
            b.getLocal(tmpArr);
            b.getLocal(iLoc);
            b.i32Const(4);
            b.i32Mul();
            b.i32Add();
            b.i32Load(0, 2);
            b.setLocal(elemLoc);
            b.getLocal(elemLoc);
            b.i32Const(0);
            b.i32GtS();
            b.if_("void");
            b.getLocal(elemLoc);
            b.callByName(ci.dtor);
            b.end();
            b.getLocal(iLoc);
            b.i32Const(1);
            b.i32Add();
            b.setLocal(iLoc);
            b.brTo(topL);
            b.end();
            b.end();
            b.getLocal(tmpArr);
            b.i32Const(4);
            b.i32Sub();
            b.callByName(this.allocator.free);
            return;
          }
        }
        if (t && this.classInfo.has(t)) {
          const ci = this.classInfo.get(t);
          const tmp = b.addLocal(`__dobj_${this.tmpCounter++}`, "i32");
          this.emitExpr(b, node.target);
          b.setLocal(tmp);
          if (ci.dtor) {
            b.getLocal(tmp);
            b.callByName(ci.dtor);
          }
          b.getLocal(tmp);
          b.callByName(this.allocator.free);
          return;
        }
        this.emitExpr(b, node.target);
        b.callByName(this.allocator.free);
        return;
      }
    }
  }
  emitExpr(b, node) {
    if (!node)
      return;
    switch (node.kind) {
      case "NumberLiteral":
        if (typeof node.value === "bigint") {
          b.i64Const(node.value);
        } else if (Number.isInteger(node.value)) {
          if (node.value >= -2147483648 && node.value <= 4294967295) {
            b.i32Const(node.value | 0);
          } else {
            b.i64Const(BigInt(node.value));
          }
        } else {
          if (node.isFloat32)
            b.f32Const(node.value);
          else
            b.f64Const(node.value);
        }
        return;
      case "BooleanLiteral":
        b.i32Const(node.value ? 1 : 0);
        return;
      case "NullLiteral":
        b.i32Const(-1);
        return;
      case "StringLiteral": {
        const ref = this.stringPool.add(node.value);
        b.i32Const(ref.offset);
        return;
      }
      case "ThisExpr":
        if (this.captures.has("this")) {
          const cl = this.captures.get("this");
          const envIdx = this.locals.get("__env").index;
          b.getLocal(envIdx);
          b.i32Load(cl.offset, 2);
          return;
        }
        b.getLocal(this.locals.get("this").index);
        return;
      case "Identifier": {
        if (this.captures.has(node.name)) {
          const cl = this.captures.get(node.name);
          const envIdx = this.locals.get("__env").index;
          b.getLocal(envIdx);
          if (cl.type === "int64" || cl.type === "uint64")
            b.i64Load(cl.offset, 3);
          else if (cl.type === "float")
            b.f32Load(cl.offset, 2);
          else if (cl.type === "double")
            b.f64Load(cl.offset, 3);
          else
            b.i32Load(cl.offset, 2);
          return;
        }
        const l = this.locals.get(node.name);
        if (l) {
          b.getLocal(l.index);
          return;
        }
        if (this.curClass) {
          const ci = this.classInfo.get(this.curClass);
          if (ci.fields.has(node.name)) {
            const f = ci.fields.get(node.name);
            b.getLocal(this.locals.get("this").index);
            if (f.type === "float")
              b.f32Load(f.offset, 2);
            else if (f.type === "double")
              b.f64Load(f.offset, 3);
            else if (f.type === "int64" || f.type === "uint64")
              b.i64Load(f.offset, 3);
            else
              b.i32Load(f.offset, 2);
            return;
          }
          if (ci.statics.has(node.name)) {
            b.globalGet(ci.statics.get(node.name).globalName);
            return;
          }
          const m = this.findStaticMethod(ci, node.name);
          if (m && m.hasBody) {
            const idx = this.funcTableIndex.get(m.wasmName);
            if (idx !== undefined) {
              b.i32Const(this.getStaticClosureAddr(m.wasmName, idx));
              return;
            }
          }
        }
        for (const [, ci] of this.classInfo) {
          const m = this.findStaticMethod(ci, node.name);
          if (m && m.hasBody) {
            const idx = this.funcTableIndex.get(m.wasmName);
            if (idx !== undefined) {
              b.i32Const(this.getStaticClosureAddr(m.wasmName, idx));
              return;
            }
          }
        }
        throw new Error(`WASM: identificador desconocido '${node.name}'`);
      }
      case "LambdaExpr": {
        const paramTypes = node.params.map((p) => this.resolveTypeName(p.type));
        let retType = "void";
        if (node._resolvedFnPtrType) {
          const parsed = this.parseFnPtrType(node._resolvedFnPtrType);
          if (parsed)
            retType = parsed.ret;
        } else {
          retType = this.inferLambdaReturn(node.body) || "void";
        }
        const name = node._lambdaName || `__lambda_${this.lambdaCounter++}`;
        node._lambdaName = name;
        if (!this.lambdaEmitted.has(name)) {
          this.lambdaEmitted.add(name);
          this.emitLambdaFunction(node, paramTypes, retType, name);
        }
        const fnIdx = this.funcTableIndex.get(name);
        if (fnIdx === undefined)
          throw new Error(`WASM: lambda '${name}' no registrada en tabla`);
        const captures = node._captures || [];
        if (captures.length === 0) {
          b.i32Const(this.getStaticClosureAddr(name, fnIdx));
          return;
        }
        const layout = [];
        let offset = 8;
        for (const c of captures) {
          const { size, align } = this.captureSizeAndAlign(c.type);
          offset = offset + align - 1 & ~(align - 1);
          layout.push({ name: c.name, type: c.type, offset });
          offset += size;
        }
        const closureSize = offset;
        const tmp = b.addLocal(`__clo_${this.tmpCounter++}`, "i32");
        b.i32Const(closureSize);
        b.callByName(this.allocator.malloc);
        b.setLocal(tmp);
        b.getLocal(tmp);
        b.i32Const(fnIdx);
        b.i32Store(0, 2);
        for (const cl of layout) {
          b.getLocal(tmp);
          if (cl.name === "this") {
            if (this.captures.has("this")) {
              const outerCl = this.captures.get("this");
              const outerEnvIdx = this.locals.get("__env").index;
              b.getLocal(outerEnvIdx);
              b.i32Load(outerCl.offset, 2);
            } else {
              b.getLocal(this.locals.get("this").index);
            }
          } else {
            this.emitExpr(b, { kind: "Identifier", name: cl.name });
          }
          if (cl.type === "int64" || cl.type === "uint64")
            b.i64Store(cl.offset, 3);
          else if (cl.type === "float")
            b.f32Store(cl.offset, 2);
          else if (cl.type === "double")
            b.f64Store(cl.offset, 3);
          else
            b.i32Store(cl.offset, 2);
        }
        b.getLocal(tmp);
        return;
      }
      case "Ternary": {
        const thenType = this.getExprType(node.thenExpr);
        const elseType = this.getExprType(node.elseExpr);
        const resultType = thenType && elseType && (thenType === elseType || thenType === "null" || elseType === "null") ? thenType === "null" ? elseType : elseType === "null" ? thenType : thenType : this.promoteNumericType(thenType || "", elseType || "") || thenType || elseType || "int";
        const wasmResult = this.wasmType(resultType);
        this.emitExpr(b, node.condition);
        b.if_(wasmResult);
        this.emitExprCoerced(b, node.thenExpr, resultType);
        b.else_();
        this.emitExprCoerced(b, node.elseExpr, resultType);
        b.end();
        return;
      }
      case "CastExpr": {
        const from = this.getExprType(node.expr);
        this.emitExpr(b, node.expr);
        this.emitCast(b, from, node.targetType);
        return;
      }
      case "BinaryOp": {
        const op = node.op;
        const lt = this.getExprType(node.left);
        const rt = this.getExprType(node.right);
        if (op === "+") {
          const ls = lt === "string", rs = rt === "string";
          if (ls || rs) {
            this.emitExpr(b, node.left);
            if (!ls) {
              if (this.isEnumType(lt))
                b.i32Load(0, 2);
              if (lt === "uint64")
                b.callByName(this.u64ToHeapStr);
              else if (lt === "int64")
                b.callByName(this.i64ToHeapStr);
              else if (lt === "float") {
                b.f64PromoteF32();
                b.callByName(this.f64ToHeapStr);
              } else if (lt === "double")
                b.callByName(this.f64ToHeapStr);
              else
                b.callByName(this.i32ToHeapStr);
            }
            this.emitExpr(b, node.right);
            if (!rs) {
              if (this.isEnumType(rt))
                b.i32Load(0, 2);
              if (rt === "uint64")
                b.callByName(this.u64ToHeapStr);
              else if (rt === "int64")
                b.callByName(this.i64ToHeapStr);
              else if (rt === "float") {
                b.f64PromoteF32();
                b.callByName(this.f64ToHeapStr);
              } else if (rt === "double")
                b.callByName(this.f64ToHeapStr);
              else
                b.callByName(this.i32ToHeapStr);
            }
            b.callByName(this.ensureStringConcatHelper());
            return;
          }
        }
        if ((op === "==" || op === "!=") && lt === "string" && rt === "string") {
          this.emitExpr(b, node.left);
          this.emitExpr(b, node.right);
          b.callByName(this.strEq);
          if (op === "!=")
            b.i32Eqz();
          return;
        }
        let domain = "i32";
        if (lt === "double" || rt === "double")
          domain = "f64";
        else if (lt === "float" || rt === "float")
          domain = "f32";
        else if (lt === "int64" || rt === "int64" || lt === "uint64" || rt === "uint64")
          domain = "i64";
        if (domain === "f32" || domain === "f64") {
          const targetSrc = domain === "f32" ? "float" : "double";
          this.emitExprCoerced(b, node.left, targetSrc);
          this.emitExprCoerced(b, node.right, targetSrc);
          if (domain === "f32") {
            switch (op) {
              case "+":
                b.f32Add();
                break;
              case "-":
                b.f32Sub();
                break;
              case "*":
                b.f32Mul();
                break;
              case "/":
                b.f32Div();
                break;
              case "==":
                b.f32Eq();
                break;
              case "!=":
                b.f32Ne();
                break;
              case "<":
                b.f32Lt();
                break;
              case "<=":
                b.f32Le();
                break;
              case ">":
                b.f32Gt();
                break;
              case ">=":
                b.f32Ge();
                break;
              default:
                throw new Error(`WASM: op f32 no soportado '${op}'`);
            }
          } else {
            switch (op) {
              case "+":
                b.f64Add();
                break;
              case "-":
                b.f64Sub();
                break;
              case "*":
                b.f64Mul();
                break;
              case "/":
                b.f64Div();
                break;
              case "==":
                b.f64Eq();
                break;
              case "!=":
                b.f64Ne();
                break;
              case "<":
                b.f64Lt();
                break;
              case "<=":
                b.f64Le();
                break;
              case ">":
                b.f64Gt();
                break;
              case ">=":
                b.f64Ge();
                break;
              default:
                throw new Error(`WASM: op f64 no soportado '${op}'`);
            }
          }
          return;
        }
        if (domain === "i64") {
          this.emitExpr(b, node.left);
          if (!(lt === "int64" || lt === "uint64")) {
            if (this.isUnsignedType(lt))
              b.i64ExtendI32U();
            else
              b.i64ExtendI32S();
          }
          this.emitExpr(b, node.right);
          if (!(rt === "int64" || rt === "uint64")) {
            if (this.isUnsignedType(rt))
              b.i64ExtendI32U();
            else
              b.i64ExtendI32S();
          }
          const bothU = this.isUnsignedType(lt) && this.isUnsignedType(rt);
          switch (op) {
            case "+":
              b.i64Add();
              break;
            case "-":
              b.i64Sub();
              break;
            case "*":
              b.i64Mul();
              break;
            case "/":
              bothU ? b.i64DivU() : b.i64DivS();
              break;
            case "%":
              bothU ? b.i64RemU() : b.i64RemS();
              break;
            case "==":
              b.i64Eq();
              break;
            case "!=":
              b.i64Ne();
              break;
            case "<":
              bothU ? b.i64LtU() : b.i64LtS();
              break;
            case "<=":
              bothU ? b.i64LeU() : b.i64LeS();
              break;
            case ">":
              bothU ? b.i64GtU() : b.i64GtS();
              break;
            case ">=":
              bothU ? b.i64GeU() : b.i64GeS();
              break;
            case "&":
              b.i64And();
              break;
            case "|":
              b.i64Or();
              break;
            case "^":
              b.i64Xor();
              break;
            case "<<":
              b.i64Shl();
              break;
            case ">>":
              bothU ? b.i64ShrU() : b.i64ShrS();
              break;
            default:
              throw new Error(`WASM: op i64 no soportado '${op}'`);
          }
          return;
        }
        this.emitExpr(b, node.left);
        this.emitExpr(b, node.right);
        const bothU = this.isUnsignedType(lt) && this.isUnsignedType(rt);
        switch (op) {
          case "+":
            b.i32Add();
            break;
          case "-":
            b.i32Sub();
            break;
          case "*":
            b.i32Mul();
            break;
          case "/":
            bothU ? b.i32DivU() : b.i32DivS();
            break;
          case "%":
            bothU ? b.i32RemU() : b.i32RemS();
            break;
          case "==":
            b.i32Eq();
            break;
          case "!=":
            b.i32Ne();
            break;
          case "<":
            bothU ? b.i32LtU() : b.i32LtS();
            break;
          case "<=":
            bothU ? b.i32LeU() : b.i32LeS();
            break;
          case ">":
            bothU ? b.i32GtU() : b.i32GtS();
            break;
          case ">=":
            bothU ? b.i32GeU() : b.i32GeS();
            break;
          case "&&":
            b.i32And();
            break;
          case "||":
            b.i32Or();
            break;
          case "&":
            b.i32And();
            break;
          case "|":
            b.i32Or();
            break;
          case "^":
            b.i32Xor();
            break;
          case "<<":
            b.i32Shl();
            break;
          case ">>":
            bothU ? b.i32ShrU() : b.i32ShrS();
            break;
          default:
            throw new Error(`WASM: op no soportado '${op}'`);
        }
        return;
      }
      case "UnaryOp": {
        const t = this.getExprType(node.operand);
        const isF32 = t === "float";
        const isF64 = t === "double";
        const isI64 = t === "int64" || t === "uint64";
        if (node.op === "-") {
          if (isF32) {
            this.emitExpr(b, node.operand);
            b.f32Neg();
          } else if (isF64) {
            this.emitExpr(b, node.operand);
            b.f64Neg();
          } else if (isI64) {
            b.i64Const(0);
            this.emitExpr(b, node.operand);
            b.i64Sub();
          } else {
            b.i32Const(0);
            this.emitExpr(b, node.operand);
            b.i32Sub();
          }
          return;
        }
        this.emitExpr(b, node.operand);
        if (node.op === "!")
          b.i32Eqz();
        else if (node.op === "~") {
          if (isI64) {
            b.i64Const(-1n);
            b.i64Xor();
          } else {
            b.i32Const(-1);
            b.i32Xor();
          }
        }
        return;
      }
      case "Assignment": {
        const t = node.target;
        if (t.kind === "Identifier" && this.captures.has(t.name)) {
          throw new Error(`WASM: no se puede asignar a '${t.name}': capturado por valor en lambda`);
        }
        if (t.kind === "MemberAccess") {
          const sm = this.resolveStaticMember(t);
          if (sm && sm.kind === "field") {
            this.emitExprCoerced(b, node.expr, sm.fieldInfo.type);
            b.globalSet(sm.fieldInfo.globalName);
            return;
          }
        }
        const targetType = this.getExprType(t);
        const targetCi = targetType ? this.classInfo.get(targetType) : null;
        if (targetCi && targetCi.isStruct && t.kind === "Identifier" && this.locals.has(t.name)) {
          const l = this.locals.get(t.name);
          b.getLocal(l.index);
          this.emitExpr(b, node.expr);
          b.i32Const(targetCi.sizeof);
          b.memoryCopy();
          return;
        }
        if (t.kind === "Identifier") {
          if (this.locals.has(t.name)) {
            const l = this.locals.get(t.name);
            this.emitExprCoerced(b, node.expr, l.type);
            b.setLocal(l.index);
            return;
          }
          if (this.curClass) {
            const ci = this.classInfo.get(this.curClass);
            if (ci.fields.has(t.name)) {
              const f = ci.fields.get(t.name);
              b.getLocal(this.locals.get("this").index);
              this.emitExprCoerced(b, node.expr, f.type);
              if (f.type === "float")
                b.f32Store(f.offset, 2);
              else if (f.type === "double")
                b.f64Store(f.offset, 3);
              else if (f.type === "int64" || f.type === "uint64")
                b.i64Store(f.offset, 3);
              else
                b.i32Store(f.offset, 2);
              return;
            }
            if (ci.statics.has(t.name)) {
              this.emitExprCoerced(b, node.expr, ci.statics.get(t.name).type);
              b.globalSet(ci.statics.get(t.name).globalName);
              return;
            }
          }
          throw new Error(`WASM: assignment a '${t.name}' no soportado`);
        }
        if (t.kind === "MemberAccess") {
          const objT = this.getExprType(t.object);
          if (!objT)
            throw new Error(`WASM: no sé el tipo de ${t.property}`);
          const ci = this.classInfo.get(objT);
          if (!ci)
            throw new Error(`WASM: clase '${objT}' no declarada`);
          const f = ci.fields.get(t.property);
          if (!f)
            throw new Error(`WASM: campo '${t.property}' no existe en '${objT}'`);
          this.emitExpr(b, t.object);
          this.emitExprCoerced(b, node.expr, f.type);
          if (f.type === "float")
            b.f32Store(f.offset, 2);
          else if (f.type === "double")
            b.f64Store(f.offset, 3);
          else if (f.type === "int64" || f.type === "uint64")
            b.i64Store(f.offset, 3);
          else
            b.i32Store(f.offset, 2);
          return;
        }
        if (t.kind === "IndexExpr") {
          const elemT = this.arrayElemType(t.array);
          const es = elemT ? this.elemSizeOf(elemT) : 4;
          this.emitIndexAddr(b, t.array, t.index, es);
          this.emitExprCoerced(b, node.expr, elemT);
          if (this.isF32Elem(elemT))
            b.f32Store(0, 2);
          else if (this.isF64Elem(elemT))
            b.f64Store(0, 3);
          else if (this.isI64Elem(elemT))
            b.i64Store(0, 3);
          else
            b.i32Store(0, 2);
          return;
        }
        throw new Error(`WASM: assignment target no soportado (${t.kind})`);
      }
      case "CompoundAssignment": {
        const t = node.target;
        if (t.kind === "Identifier" && this.captures.has(t.name)) {
          throw new Error(`WASM: no se puede modificar '${t.name}': capturado por valor en lambda`);
        }
        if (t.kind === "MemberAccess") {
          const sm = this.resolveStaticMember(t);
          if (sm && sm.kind === "field") {
            const fInfo = sm.fieldInfo;
            const t32 = fInfo.type === "float";
            const t64 = fInfo.type === "double";
            const ti64 = fInfo.type === "int64" || fInfo.type === "uint64";
            b.globalGet(fInfo.globalName);
            this.emitExprCoerced(b, node.expr, fInfo.type);
            if (t32) {
              const fm = { "+": "f32Add", "-": "f32Sub", "*": "f32Mul", "/": "f32Div" };
              b[fm[node.binOp]]();
            } else if (t64) {
              const fm = { "+": "f64Add", "-": "f64Sub", "*": "f64Mul", "/": "f64Div" };
              b[fm[node.binOp]]();
            } else if (ti64) {
              const im = { "+": "i64Add", "-": "i64Sub", "*": "i64Mul", "/": "i64DivS", "%": "i64RemS" };
              b[im[node.binOp]]();
            } else {
              const im = { "+": "i32Add", "-": "i32Sub", "*": "i32Mul", "/": "i32DivS", "%": "i32RemS" };
              b[im[node.binOp]]();
            }
            b.globalSet(fInfo.globalName);
            return;
          }
        }
        if (t.kind === "Identifier") {
          const l = this.locals.get(t.name);
          if (!l)
            throw new Error(`WASM: compound a no-local`);
          const isI64 = l.type === "int64" || l.type === "uint64";
          const isF32 = l.type === "float";
          const isF64 = l.type === "double";
          b.getLocal(l.index);
          this.emitExprCoerced(b, node.expr, l.type);
          if (isI64) {
            const im = { "+": "i64Add", "-": "i64Sub", "*": "i64Mul", "/": "i64DivS", "%": "i64RemS" };
            b[im[node.binOp]]();
          } else if (isF32) {
            const fm = { "+": "f32Add", "-": "f32Sub", "*": "f32Mul", "/": "f32Div" };
            b[fm[node.binOp]]();
          } else if (isF64) {
            const fm = { "+": "f64Add", "-": "f64Sub", "*": "f64Mul", "/": "f64Div" };
            b[fm[node.binOp]]();
          } else {
            const im = { "+": "i32Add", "-": "i32Sub", "*": "i32Mul", "/": "i32DivS", "%": "i32RemS" };
            b[im[node.binOp]]();
          }
          b.setLocal(l.index);
          return;
        }
        if (t.kind === "IndexExpr") {
          const elemT = this.arrayElemType(t.array);
          const es = elemT ? this.elemSizeOf(elemT) : 4;
          const isF32 = this.isF32Elem(elemT);
          const isF64 = this.isF64Elem(elemT);
          const isI64 = this.isI64Elem(elemT);
          const addrTmp = b.addLocal(`__ca_${this.tmpCounter++}`, "i32");
          const valTmp = b.addLocal(`__cv_${this.tmpCounter++}`, isF32 ? "f32" : isF64 ? "f64" : isI64 ? "i64" : "i32");
          this.emitIndexAddr(b, t.array, t.index, es);
          b.setLocal(addrTmp);
          b.getLocal(addrTmp);
          if (isF32)
            b.f32Load(0, 2);
          else if (isF64)
            b.f64Load(0, 3);
          else if (isI64)
            b.i64Load(0, 3);
          else
            b.i32Load(0, 2);
          this.emitExprCoerced(b, node.expr, elemT);
          if (isF32) {
            const fm = { "+": "f32Add", "-": "f32Sub", "*": "f32Mul", "/": "f32Div" };
            b[fm[node.binOp]]();
          } else if (isF64) {
            const fm = { "+": "f64Add", "-": "f64Sub", "*": "f64Mul", "/": "f64Div" };
            b[fm[node.binOp]]();
          } else if (isI64) {
            const im = { "+": "i64Add", "-": "i64Sub", "*": "i64Mul", "/": "i64DivS", "%": "i64RemS" };
            b[im[node.binOp]]();
          } else {
            const im = { "+": "i32Add", "-": "i32Sub", "*": "i32Mul", "/": "i32DivS", "%": "i32RemS" };
            b[im[node.binOp]]();
          }
          b.setLocal(valTmp);
          b.getLocal(addrTmp);
          b.getLocal(valTmp);
          if (isF32)
            b.f32Store(0, 2);
          else if (isF64)
            b.f64Store(0, 3);
          else if (isI64)
            b.i64Store(0, 3);
          else
            b.i32Store(0, 2);
          return;
        }
        throw new Error(`WASM: compound target no soportado (${t.kind})`);
      }
      case "IncrementExpr": {
        const t = node.target;
        if (t.kind === "Identifier" && this.captures.has(t.name)) {
          throw new Error(`WASM: no se puede modificar '${t.name}': capturado por valor en lambda`);
        }
        if (t.kind === "MemberAccess") {
          const sm = this.resolveStaticMember(t);
          if (sm && sm.kind === "field") {
            const fInfo = sm.fieldInfo;
            const isI64 = fInfo.type === "int64" || fInfo.type === "uint64";
            b.globalGet(fInfo.globalName);
            if (isI64) {
              b.i64Const(1);
              if (node.op === "++")
                b.i64Add();
              else
                b.i64Sub();
            } else {
              b.i32Const(1);
              if (node.op === "++")
                b.i32Add();
              else
                b.i32Sub();
            }
            b.globalSet(fInfo.globalName);
            return;
          }
        }
        if (t.kind === "Identifier") {
          const l = this.locals.get(t.name);
          if (!l)
            throw new Error(`WASM: incremento a no-local`);
          const isI64 = l.type === "int64" || l.type === "uint64";
          b.getLocal(l.index);
          if (isI64) {
            b.i64Const(1);
            if (node.op === "++")
              b.i64Add();
            else
              b.i64Sub();
          } else {
            b.i32Const(1);
            if (node.op === "++")
              b.i32Add();
            else
              b.i32Sub();
          }
          b.setLocal(l.index);
          return;
        }
        throw new Error(`WASM: incremento no soportado en ${t.kind}`);
      }
      case "SuperCall": {
        if (!this.curClass)
          throw new Error("WASM: super() fuera de una clase");
        const thisL = this.locals.get("this");
        if (!thisL)
          throw new Error("WASM: super() fuera de un método de instancia");
        const ci = this.classInfo.get(this.curClass);
        if (!ci || !ci.baseName)
          throw new Error(`WASM: '${this.curClass}' no tiene clase base`);
        const baseName = this.resolveTypeName(ci.baseName);
        const baseCi = this.classInfo.get(baseName);
        if (!baseCi)
          throw new Error(`WASM: clase base '${ci.baseName}' no registrada`);
        const ctor = this.findCtorForArgCount(baseCi, node.args.length);
        if (!ctor)
          throw new Error(`WASM: clase base '${ci.baseName}' no tiene ctor con ${node.args.length} args`);
        b.getLocal(thisL.index);
        for (let i = 0;i < node.args.length; i++) {
          this.emitExprCoerced(b, node.args[i], ctor.paramTypes[i] || null);
        }
        b.callByName(ctor.wasmName);
        return;
      }
      case "Call": {
        const bpath = this.pathOf(node.callee);
        if (bpath && this.emitBuiltinCall(bpath, b, node.args))
          return;
        if (node.callee.kind === "Identifier" && this.importedFunctions.has(node.callee.name)) {
          const imp = this.importedFunctions.get(node.callee.name);
          for (let i = 0;i < node.args.length; i++) {
            this.emitExprCoerced(b, node.args[i], imp.paramTypes[i] || null);
          }
          b.callByName(node.callee.name);
          return;
        }
        const callee = node.callee;
        if (callee.kind === "Identifier") {
          const l = this.locals.get(callee.name);
          if (l && this.isFnPtrType(l.type)) {
            const fp = this.parseFnPtrType(l.type);
            const wasmParams = ["i32", ...fp.params.map((t) => this.toWasmType(t))];
            const wasmRet = fp.ret === "void" ? [] : [this.toWasmType(fp.ret)];
            const typeIdx = this.mod.getTypeIndex(wasmParams, wasmRet);
            const tmp = b.addLocal(`__cl_${this.tmpCounter++}`, "i32");
            b.getLocal(l.index);
            b.setLocal(tmp);
            b.getLocal(tmp);
            for (let i = 0;i < node.args.length; i++) {
              this.emitExprCoerced(b, node.args[i], fp.params[i] || null);
            }
            b.getLocal(tmp);
            b.i32Load(0, 2);
            b.callIndirect(typeIdx);
            return;
          }
        }
        if (callee.kind === "MemberAccess") {
          const sm = this.resolveStaticMember(callee, node._resolvedMethodSig);
          if (sm && sm.kind === "method") {
            const m = sm.methodInfo;
            b.i32Const(0);
            for (let i = 0;i < node.args.length; i++) {
              this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
            }
            b.callByName(m.wasmName);
            return;
          }
        }
        if (callee.kind === "MemberAccess") {
          const objT = this.getExprType(callee.object);
          if (!objT)
            throw new Error(`WASM: no sé el tipo del receptor de '${callee.property}'`);
          const ci = this.classInfo.get(objT);
          if (!ci)
            throw new Error(`WASM: clase '${objT}' no declarada`);
          let m = null;
          if (node._resolvedMethodSig)
            m = ci.methods.get(node._resolvedMethodSig) || null;
          if (!m)
            m = this.findMethodByName(ci, callee.property);
          if (!m)
            throw new Error(`WASM: método '${callee.property}' no existe en '${objT}'`);
          if (m.isVirtual && !m.isStatic) {
            if (!ci.isPolymorphic) {
              throw new Error(`WASM: '${callee.property}' es virtual pero '${objT}' no es polimórfica (bug interno)`);
            }
            const sigKey = node._resolvedMethodSig || this.methodSig(callee.property, m.paramTypes);
            const slot = ci.virtualSlots.get(sigKey);
            if (slot === undefined) {
              throw new Error(`WASM: slot virtual no asignado para '${objT}.${sigKey}'`);
            }
            const wasmParamTypes = ["i32", ...m.paramTypes.map((t) => this.toWasmType(t))];
            const wasmRetTypes = m.retType === "void" ? [] : [m.retType];
            const typeIdx = this.mod.getTypeIndex(wasmParamTypes, wasmRetTypes);
            const objTmp = b.addLocal(`__vt_${this.tmpCounter++}`, "i32");
            this.emitExpr(b, callee.object);
            b.setLocal(objTmp);
            b.getLocal(objTmp);
            for (let i = 0;i < node.args.length; i++) {
              this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
            }
            b.getLocal(objTmp);
            b.i32Load(ci.tagOffset, 2);
            b.i32Const(WasmCodeGen.VTABLE_STRIDE);
            b.i32Mul();
            b.i32Const(WasmCodeGen.VTABLE_BASE + slot * 4);
            b.i32Add();
            b.i32Load(0, 2);
            b.callIndirect(typeIdx);
            return;
          }
          if (m.isStatic) {
            b.i32Const(0);
            for (let i = 0;i < node.args.length; i++) {
              this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
            }
          } else {
            this.emitExpr(b, callee.object);
            for (let i = 0;i < node.args.length; i++) {
              this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
            }
          }
          b.callByName(m.wasmName);
          return;
        }
        if (callee.kind === "Identifier") {
          const name = callee.name;
          if (node._resolvedMethodSig && node._resolvedMethodClass) {
            const ci = this.classInfo.get(node._resolvedMethodClass);
            if (ci) {
              const m = ci.methods.get(node._resolvedMethodSig);
              if (m) {
                b.i32Const(0);
                for (let i = 0;i < node.args.length; i++) {
                  this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
                }
                b.callByName(m.wasmName);
                return;
              }
            }
          }
          if (this.curClass) {
            const ci = this.classInfo.get(this.curClass);
            const m = this.findStaticMethod(ci, name);
            if (m) {
              b.i32Const(0);
              for (let i = 0;i < node.args.length; i++) {
                this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
              }
              b.callByName(m.wasmName);
              return;
            }
          }
          for (const [, ci] of this.classInfo) {
            const m = this.findStaticMethod(ci, name);
            if (m) {
              b.i32Const(0);
              for (let i = 0;i < node.args.length; i++) {
                this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
              }
              b.callByName(m.wasmName);
              return;
            }
          }
          throw new Error(`WASM: función '${name}' no encontrada`);
        }
        throw new Error(`WASM: call no soportado (${callee.kind})`);
      }
      case "NewExpr": {
        const rawName = typeof node.className === "string" ? node.className : node.className.kind === "QualifiedName" ? node.className.parts.join("::") : String(node.className);
        const resolved = node._resolvedClassName || this.resolveClassNameForStatic(rawName) || this.resolveTypeName(rawName);
        const ci = this.classInfo.get(resolved);
        if (!ci)
          throw new Error(`WASM: clase '${rawName}' no declarada`);
        const tmp = b.addLocal(`__new_${this.tmpCounter++}`, "i32");
        b.i32Const(ci.sizeof);
        b.callByName(this.allocator.malloc);
        b.setLocal(tmp);
        b.getLocal(tmp);
        b.i32Const(0);
        b.i32Const(ci.sizeof);
        b.memoryFill();
        if (ci.isPolymorphic) {
          b.getLocal(tmp);
          b.i32Const(ci.typeTag);
          b.i32Store(ci.tagOffset, 2);
        }
        let ctor = null;
        if (node._resolvedCtorSig)
          ctor = ci.ctors.get(node._resolvedCtorSig) || null;
        if (!ctor)
          ctor = this.findCtorForArgCount(ci, node.args.length);
        if (ctor) {
          b.getLocal(tmp);
          for (let i = 0;i < node.args.length; i++) {
            this.emitExprCoerced(b, node.args[i], ctor.paramTypes[i] || null);
          }
          b.callByName(ctor.wasmName);
        }
        b.getLocal(tmp);
        return;
      }
      case "NewArrayExpr": {
        const sizes = node.sizes || [];
        if (sizes.length === 0)
          throw new Error("WASM: new[] sin dimensiones");
        const elemT = node._resolvedElementType || this.resolveClassNameForStatic(String(node.elementType)) || this.resolveTypeName(String(node.elementType));
        const buildNested = (dimIdx, resultLocal) => {
          if (dimIdx === sizes.length - 1) {
            const elemSize = this.elemSizeOf(elemT);
            const nLoc = b.addLocal(`__na_${this.tmpCounter++}`, "i32");
            const blkLoc = b.addLocal(`__nab_${this.tmpCounter++}`, "i32");
            this.emitExpr(b, sizes[dimIdx]);
            b.setLocal(nLoc);
            b.i32Const(4);
            b.getLocal(nLoc);
            b.i32Const(elemSize);
            b.i32Mul();
            b.i32Add();
            b.callByName(this.allocator.malloc);
            b.setLocal(blkLoc);
            b.getLocal(blkLoc);
            b.getLocal(nLoc);
            b.i32Store(0, 2);
            b.getLocal(blkLoc);
            b.i32Const(4);
            b.i32Add();
            b.setLocal(resultLocal);
            return;
          }
          const nLoc = b.addLocal(`__na_${this.tmpCounter++}`, "i32");
          const iLoc = b.addLocal(`__nai_${this.tmpCounter++}`, "i32");
          const outerLoc = b.addLocal(`__nao_${this.tmpCounter++}`, "i32");
          const subLoc = b.addLocal(`__nas_${this.tmpCounter++}`, "i32");
          const topL = `na_top_${this.tmpCounter++}`;
          const endL = `na_end_${this.tmpCounter++}`;
          this.emitExpr(b, sizes[dimIdx]);
          b.setLocal(nLoc);
          b.i32Const(4);
          b.getLocal(nLoc);
          b.i32Const(4);
          b.i32Mul();
          b.i32Add();
          b.callByName(this.allocator.malloc);
          b.setLocal(outerLoc);
          b.getLocal(outerLoc);
          b.getLocal(nLoc);
          b.i32Store(0, 2);
          b.i32Const(0);
          b.setLocal(iLoc);
          b.block("void", endL);
          b.loop("void", topL);
          b.getLocal(iLoc);
          b.getLocal(nLoc);
          b.i32GeU();
          b.brIfTo(endL);
          buildNested(dimIdx + 1, subLoc);
          b.getLocal(outerLoc);
          b.i32Const(4);
          b.i32Add();
          b.getLocal(iLoc);
          b.i32Const(4);
          b.i32Mul();
          b.i32Add();
          b.getLocal(subLoc);
          b.i32Store(0, 2);
          b.getLocal(iLoc);
          b.i32Const(1);
          b.i32Add();
          b.setLocal(iLoc);
          b.brTo(topL);
          b.end();
          b.end();
          b.getLocal(outerLoc);
          b.i32Const(4);
          b.i32Add();
          b.setLocal(resultLocal);
        };
        const resultLoc = b.addLocal(`__nar_${this.tmpCounter++}`, "i32");
        buildNested(0, resultLoc);
        b.getLocal(resultLoc);
        return;
      }
      case "IndexExpr": {
        const elemT = this.arrayElemType(node.array);
        const es = elemT ? this.elemSizeOf(elemT) : 4;
        this.emitIndexAddr(b, node.array, node.index, es);
        if (this.isF32Elem(elemT))
          b.f32Load(0, 2);
        else if (this.isF64Elem(elemT))
          b.f64Load(0, 3);
        else if (this.isI64Elem(elemT))
          b.i64Load(0, 3);
        else
          b.i32Load(0, 2);
        return;
      }
      case "MemberAccess": {
        const em = this.resolveEnumMember(node);
        if (em) {
          b.i32Const(em.member.address | 0);
          return;
        }
        const sm = this.resolveStaticMember(node);
        if (sm && sm.kind === "field") {
          b.globalGet(sm.fieldInfo.globalName);
          return;
        }
        const objT = this.getExprType(node.object);
        if (!objT)
          throw new Error(`WASM: no sé el tipo de ${node.property}`);
        if (node.property === "length" && (objT === "string" || objT.endsWith("[]"))) {
          this.emitExpr(b, node.object);
          b.i32Const(4);
          b.i32Sub();
          b.i32Load(0, 2);
          return;
        }
        const ci = this.classInfo.get(objT);
        if (!ci)
          throw new Error(`WASM: clase '${objT}' no declarada`);
        const f = ci.fields.get(node.property);
        if (!f)
          throw new Error(`WASM: campo '${node.property}' no existe en '${objT}'`);
        this.emitExpr(b, node.object);
        if (f.type === "float")
          b.f32Load(f.offset, 2);
        else if (f.type === "double")
          b.f64Load(f.offset, 3);
        else if (f.type === "int64" || f.type === "uint64")
          b.i64Load(f.offset, 3);
        else
          b.i32Load(f.offset, 2);
        return;
      }
      case "AddressOfExpr": {
        const t = node.target;
        if (t.kind === "Identifier") {
          const l = this.locals.get(t.name);
          if (!l)
            throw new Error(`WASM: &${t.name} - variable desconocida`);
          const ci = this.classInfo.get(l.type);
          if (ci) {
            b.getLocal(l.index);
            return;
          }
          throw new Error(`WASM: &${t.name} - no se puede tomar la dirección de una variable local primitiva '${l.type}'. Usa un objeto stack (struct/class).`);
        }
        if (t.kind === "MemberAccess") {
          const objT = this.getExprType(t.object);
          if (!objT)
            throw new Error(`WASM: &obj.field - objeto desconocido`);
          const ci = this.classInfo.get(objT);
          if (!ci)
            throw new Error(`WASM: &obj.field - '${objT}' no es clase/struct`);
          const f = ci.fields.get(t.property);
          if (!f)
            throw new Error(`WASM: &obj.field - '${t.property}' no existe en '${objT}'`);
          this.emitExpr(b, t.object);
          b.i32Const(f.offset);
          b.i32Add();
          return;
        }
        if (t.kind === "IndexExpr") {
          const elemT = this.arrayElemType(t.array);
          const es = elemT ? this.elemSizeOf(elemT) : 4;
          this.emitIndexAddr(b, t.array, t.index, es);
          return;
        }
        throw new Error(`WASM: & sobre expresión no soportada (${t.kind})`);
      }
      case "ArrayLiteral":
        throw new Error(`WASM: array literals solo válidos dentro de System.wasi.Import`);
      default:
        throw new Error(`WASM: expresión no soportada '${node.kind}'`);
    }
  }
}

// main.ts
var isDeno = typeof globalThis.Deno !== "undefined";
var rawArgs = isDeno ? globalThis.Deno.args : process.argv.slice(2);
var mode = rawArgs.includes("--ast") ? "ast" : "wasm";
var outputFile = "out.wasm";
var oIndex = rawArgs.indexOf("-o") !== -1 ? rawArgs.indexOf("-o") : rawArgs.indexOf("--output");
if (oIndex !== -1 && oIndex + 1 < rawArgs.length) {
  outputFile = rawArgs[oIndex + 1];
}
var positionalArgs = [];
for (let i = 0;i < rawArgs.length; i++) {
  if (rawArgs[i] === "-o" || rawArgs[i] === "--output") {
    i++;
    continue;
  }
  if (rawArgs[i].startsWith("-")) {
    continue;
  }
  positionalArgs.push(rawArgs[i]);
}
if (positionalArgs.length < 1) {
  console.error("Uso: [bun|node|deno] main.ts <archivo> [-o | --output <salida>] [--ast]");
  process.exit(1);
}
var filePath = positionalArgs[0];
async function fileExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
try {
  const seen = new Set;
  async function parseWithIncludes(absPath) {
    const abs = resolve(absPath);
    if (seen.has(abs))
      return [];
    seen.add(abs);
    const src = await readFile(abs, "utf-8");
    const tokens = Lexer(src);
    const parser = new Parser(tokens, abs);
    const ast = parser.parseProgram();
    if (parser.errors.length > 0) {
      console.error(`--- Errores de Sintaxis en ${absPath} ---`);
      for (const e of parser.errors)
        console.error(e.message);
      process.exit(1);
    }
    const result = [];
    for (const node of ast.body) {
      if (node.kind === "IncludeDecl" || node.kind === "ImportDecl") {
        let inc = node.path;
        if (!inc.endsWith(".cyn"))
          inc += ".cyn";
        const incAbs = resolve(dirname(abs), inc);
        if (!await fileExists(incAbs)) {
          console.error(`Error: '${node.path}' desde ${absPath} no existe (buscado en ${incAbs})`);
          process.exit(1);
        }
        const includedBody = await parseWithIncludes(incAbs);
        result.push(...includedBody);
        if (node.kind === "ImportDecl") {
          for (const imp of node.imports) {
            result.push({
              kind: "UsingDecl",
              name: imp.parts.join("::"),
              parts: imp.parts,
              isWildcard: imp.parts.length === 1
            });
          }
        }
      } else {
        result.push(node);
      }
    }
    return result;
  }
  let preludeBody = [];
  if (await fileExists("stdlib.cyn")) {
    preludeBody = await parseWithIncludes(resolve("stdlib.cyn"));
  }
  const mainBody = await parseWithIncludes(filePath);
  const ast = { kind: "Program", body: [...preludeBody, ...mainBody] };
  const semantic = new SemanticAnalyzer(ast);
  semantic.analyze();
  if (mode === "ast") {
    console.log(JSON.stringify(ast, null, 2));
    process.exit(0);
  }
  const cg = new WasmCodeGen;
  const specializations = semantic.getSpecializedNodes();
  const wasmBytes = cg.compile(ast, specializations);
  await writeFile(outputFile, wasmBytes);
  console.log(`¡Compilación exitosa! Archivo generado: ${outputFile} (${wasmBytes.length} bytes)`);
  const wasi = new WASI({
    version: "preview1",
    args: [filePath],
    env: {},
    preopens: { ".": "." }
  });
  const wasmModule = await WebAssembly.compile(wasmBytes);
  const importObject = wasi.getImportObject ? wasi.getImportObject() : { wasi_snapshot_preview1: wasi.wasiImport };
  const instance = await WebAssembly.instantiate(wasmModule, importObject);
  try {
    wasi.start(instance);
  } catch (e) {
    if (typeof e?.code === "number") {} else if (e?.message && /exit/i.test(e.message)) {} else {
      throw e;
    }
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
