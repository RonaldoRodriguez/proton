// semantic.ts
import { SemanticError } from './error';

const NUMERIC_TYPES = new Set(['int', 'int64', 'float', 'double', 'char', 'uint8', 'uint16', 'uint32', 'uint64']);
const INTEGER_TYPES = new Set(['int', 'int64', 'char', 'uint8', 'uint16', 'uint32', 'uint64']);
const BUILTIN_TYPES_NO_VOID = new Set(['int', 'int64', 'string', 'char', 'float', 'double', 'bool', 'uint8', 'uint16', 'uint32', 'uint64']);
const SWITCHABLE_TYPES = new Set(['int', 'int64', 'char', 'bool', 'string', 'uint8', 'uint16', 'uint32', 'uint64']);

const UNSIGNED_TYPES = new Set(['uint8', 'uint16', 'uint32', 'uint64']);
function isUnsigned(t) { return UNSIGNED_TYPES.has(t); }
function isNumeric(t) { return NUMERIC_TYPES.has(t); }
function isIntegerType(t) { return INTEGER_TYPES.has(t); }
function isArrayType(t) { return typeof t === 'string' && t.endsWith('[]'); }
function elementType(t) { return t.slice(0, -2); }
function isFnPtrType(t) { return typeof t === 'string' && t.startsWith('fn(') && t.includes(')->'); }
function parseFnPtrType(t) {
    const m = /^fn\(([^)]*)\)->(.+)$/.exec(t);
    if (!m) return null;
    const params = m[1] === '' ? [] : m[1].split(',');
    return { params, ret: m[2] };
}

function numInfo(t) {
    switch (t) {
        case 'char':   return { bits: 8,  signed: true,  isFloat: false };
        case 'uint8':  return { bits: 8,  signed: false, isFloat: false };
        case 'uint16': return { bits: 16, signed: false, isFloat: false };
        case 'int':    return { bits: 32, signed: true,  isFloat: false };
        case 'uint32': return { bits: 32, signed: false, isFloat: false };
        case 'int64':  return { bits: 64, signed: true,  isFloat: false };
        case 'uint64': return { bits: 64, signed: false, isFloat: false };
        case 'float':  return { bits: 32, signed: true,  isFloat: true };
        case 'double': return { bits: 64, signed: true,  isFloat: true };
        default:       return null;
    }
}

function promoteNumeric(a, b) {
    if (a === 'double' || b === 'double') return 'double';
    if (a === 'float'  || b === 'float')  return 'float';
    const ia = numInfo(a);
    const ib = numInfo(b);
    if (!ia || !ib) return null;
    const bits = Math.max(ia.bits, ib.bits);
    const signed = ia.signed && ib.signed;
    if (bits === 8)  return signed ? 'char' : 'uint8';
    if (bits === 16) return signed ? 'int'  : 'uint16';
    if (bits === 32) return signed ? 'int'  : 'uint32';
    return signed ? 'int64' : 'uint64';
}

class Scope {
    constructor(parent = null, kind = 'block') {
        this.symbols = new Map();
        this.parent = parent;
        this.kind = kind;
        this.fullName = null;
    }
    define(name, data) { this.symbols.set(name, data); }
    lookup(name) {
        if (this.symbols.has(name)) return this.symbols.get(name);
        if (this.parent) return this.parent.lookup(name);
        return null;
    }
    lookupCurrent(name) { return this.symbols.has(name) ? this.symbols.get(name) : null; }
    hasAnyCtor() {
        for (const key of this.symbols.keys()) {
            if (typeof key === 'string' && key.startsWith('__ctor_')) return true;
        }
        return false;
    }
}

export class SemanticAnalyzer {
    constructor(ast) {
        this.ast = ast;
        this.globalScope = new Scope(null, 'global');
        this.currentScope = this.globalScope;
        this.currentMethod = null;
        this.currentClass = null;
        this.errors = [];
        this.loopDepth = 0;
        this.switchDepth = 0;
        this.usingAliases = new Map();
        this.usingWildcards = [];

        // ── NUEVO: estado de genéricos ────────────────────────
        /** "Box<int>" -> ClassSymbol especializado. */
        this.specializedClasses = new Map();
        /** Cola FIFO de ClassSymbols pendientes de análisis. */
        this.pendingSpecializations = [];
        /** AST nodes sintéticos (ya con tipos sustituidos) para el codegen. */
        this.specializedAstNodes = [];
        /** Map<T, type> mientras analizamos el cuerpo de una plantilla. */
        this.currentTypeParams = null;
        // ─────────────────────────────────────────────────────
    }

    pushError(msg, node) {
        if (node && typeof node.line === 'number' && typeof node.column === 'number') {
            this.errors.push(new SemanticError(msg, node.line, node.column, node._sourceFile));
        } else {
            this.errors.push(new SemanticError(msg));
        }
    }

    // ═════════════════════════════════════════════════════════════
    // ═══ NUEVO ═══: Helpers de genéricos
    // ═════════════════════════════════════════════════════════════

    /** Divide "A, B<C,D>" en ["A", "B<C,D>"]. */
    splitTypeArgs(s) {
        const parts = [];
        let depth = 0, cur = '';
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (c === '<') depth++;
            else if (c === '>') {
                if (i > 0 && s[i - 1] === '-') { cur += c; continue; }
                depth--;
            }
            if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
            cur += c;
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
    }

    /** Devuelve {base,args} si `typeStr` es `Foo<A,B>`, o null. */
    parseGenericType(typeStr) {
        if (typeof typeStr !== 'string') return null;
        typeStr = typeStr.trim();
        if (isFnPtrType(typeStr)) return null;
        const lt = typeStr.indexOf('<');
        if (lt === -1) return null;
        let depth = 0, end = -1;
        for (let i = lt; i < typeStr.length; i++) {
            const c = typeStr[i];
            if (c === '<') depth++;
            else if (c === '>') {
                if (i > 0 && typeStr[i - 1] === '-') continue;
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        if (end !== typeStr.length - 1) return null;
        return {
            base: typeStr.slice(0, lt).trim(),
            args: this.splitTypeArgs(typeStr.slice(lt + 1, end)),
        };
    }

    /** Sustituye nombres por sus bindings (T→int, T[]→int[], Box<T>→Box<int>...). */
    substituteType(typeStr, bindings) {
        if (!typeStr) return typeStr;
        typeStr = typeStr.trim();
        if (bindings.has(typeStr)) return bindings.get(typeStr);
        if (typeStr.endsWith('[]')) return this.substituteType(typeStr.slice(0, -2), bindings) + '[]';
        if (typeStr.startsWith('fn(') && typeStr.includes(')->')) {
            const m = /^fn\(([^)]*)\)->(.+)$/.exec(typeStr);
            if (m) {
                const ps = m[1] === '' ? [] : m[1].split(',').map(p => p.trim());
                return `fn(${ps.map(p => this.substituteType(p, bindings)).join(',')})->${this.substituteType(m[2].trim(), bindings)}`;
            }
        }
        const g = this.parseGenericType(typeStr);
        if (g) {
            const newArgs = g.args.map(a => this.substituteType(a, bindings));
            return `${g.base}<${newArgs.join(',')}>`;
        }
        return typeStr;
    }

    /** Deep-clone del AST sustituyendo strings de tipo por bindings. */
    substituteAstNode(node, bindings) {
        if (node === null || node === undefined) return node;
        if (typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(n => this.substituteAstNode(n, bindings));

        const out = {};
        for (const key of Object.keys(node)) {
            if (key === '_sourceFile') { out[key] = node[key]; continue; }
            const val = node[key];

            if (typeof val === 'string' && (
                key === 'type' ||
                key === 'returnType' ||
                key === 'targetType' ||
                key === 'elementType' ||
                key === 'className'
            )) {
                out[key] = this.substituteType(val, bindings);
                continue;
            }

            if (key === 'line' || key === 'column' || key === 'kind') {
                out[key] = val;
                continue;
            }

            if (val && typeof val === 'object') {
                out[key] = this.substituteAstNode(val, bindings);
            } else {
                out[key] = val;
            }
        }

        // extends Base<T>
        if (out.base && typeof out.base === 'object' && typeof out.base.name === 'string') {
            out.base = { ...out.base, name: this.substituteType(out.base.name, bindings) };
        }

        if (out.kind === 'ClassDecl') {
            out.typeParams = [];
            out.isSpecialized = true;
        }
        return out;
    }

    // ═════════════════════════════════════════════════════════════
    //  Overload helpers (idénticos al original)
    // ═════════════════════════════════════════════════════════════
    methodSig(name, paramCount, paramTypes) {
        return `${name}#${paramCount}#${paramTypes.join(',')}`;
    }

    lookupMethods(classSym, name) {
        const results = [];
        const seen = new Set();
        let cur = classSym;
        while (cur) {
            for (const [key, member] of cur.scope.symbols) {
                if (member.kind !== 'MethodDecl') continue;
                if (typeof key === 'string' && key.startsWith(name + '#')) {
                    if (seen.has(key)) continue;
                    seen.add(key);
                    results.push({ member, owner: cur });
                } else if (key === name) {
                    if (seen.has('plain:' + name)) continue;
                    seen.add('plain:' + name);
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
            if (m && (m.kind === 'FieldDecl' || m.kind === 'ConstructorDecl' || m.kind === 'DestructorDecl')) {
                return { member: m, owner: cur };
            }
            cur = cur.baseRef;
        }
        return null;
    }

    resolveOverload(candidates, argTypes) {
        const matching = candidates.filter(c => {
            if (c.member.isVariadic) return true;
            if (c.member.paramCount !== argTypes.length) return false;
            for (let i = 0; i < argTypes.length; i++) {
                const at = argTypes[i];
                if (at === 'error' || at === 'any') continue;
                const pt = c.member.paramTypes[i] || 'any';
                if (pt === 'any') continue;
                if (!this.canAssignType(pt, at)) return false;
            }
            return true;
        });
        if (matching.length === 0) return { status: 'not-found' };
        if (matching.length === 1) return { status: 'ok', candidate: matching[0] };
        const exact = matching.filter(c => {
            if (c.member.isVariadic) return false;
            for (let i = 0; i < argTypes.length; i++) {
                const at = argTypes[i];
                const pt = c.member.paramTypes[i] || 'any';
                if (at !== 'any' && pt !== 'any' && at !== pt) return false;
            }
            return true;
        });
        if (exact.length === 1) return { status: 'ok', candidate: exact[0] };
        return { status: 'ambiguous', candidates: exact.length ? exact : matching };
    }

    collectUsings(nodes) {
        for (const node of nodes) {
            if (node.kind === 'UsingDecl') {
                if (node.isWildcard) this.usingWildcards.push(node.name);
                else {
                    const shortName = node.parts[node.parts.length - 1];
                    this.usingAliases.set(shortName, node.parts.join('::'));
                }
            } else if (node.kind === 'NamespaceDecl') {
                this.collectUsings(node.body);
            }
        }
    }

    canAssignType(targetType, sourceType) {
        if (targetType === 'any' || sourceType === 'any') return true;
        if (targetType === 'error' || sourceType === 'error') return true;
        if (sourceType === 'null') return true;
        if (targetType === sourceType) return true;

        // NUEVO: si ambos son genéricos, comparar estructura
        if (this.parseGenericType(targetType) || this.parseGenericType(sourceType)) {
            const tg = this.parseGenericType(targetType);
            const sg = this.parseGenericType(sourceType);
            if (!tg || !sg) return false;
            if (tg.base !== sg.base) return false;
            if (tg.args.length !== sg.args.length) return false;
            for (let i = 0; i < tg.args.length; i++) {
                if (!this.canAssignType(tg.args[i], sg.args[i]) &&
                    !this.canAssignType(sg.args[i], tg.args[i])) return false;
            }
            return true;
        }

        const i32ish = (t) => t === 'ptr' || t === 'string' || t === 'int';
        if (i32ish(targetType) && i32ish(sourceType)) return true;

        if (isFnPtrType(targetType) && isFnPtrType(sourceType)) {
            const t = parseFnPtrType(targetType);
            const s = parseFnPtrType(sourceType);
            if (!t || !s) return false;
            if (t.ret !== s.ret) return false;
            if (t.params.length !== s.params.length) return false;
            for (let i = 0; i < t.params.length; i++) {
                if (t.params[i] !== s.params[i]) return false;
            }
            return true;
        }
        if (isFnPtrType(targetType) || isFnPtrType(sourceType)) return false;

        const tEnum = this.lookupEnumCanonical(targetType);
        const sEnum = this.lookupEnumCanonical(sourceType);
        if (tEnum !== null || sEnum !== null) {
            return tEnum !== null && sEnum !== null && tEnum === sEnum;
        }

        if (isArrayType(targetType) || isArrayType(sourceType)) return false;
        if (targetType === 'ptr' || sourceType === 'ptr') return false;

        const ti = numInfo(targetType);
        const si = numInfo(sourceType);
        if (ti && si) {
            if (ti.isFloat) return true;
            if (si.isFloat) return false;
            if (ti.bits < si.bits) return false;
            if (si.signed && !ti.signed) return false;
            return true;
        }

        const tSym = this.lookupClassByFullName(this.resolveTypeName(targetType));
        const sSym = this.lookupClassByFullName(this.resolveTypeName(sourceType));
        if (tSym && tSym.kind === 'ClassDecl' && sSym && sSym.kind === 'ClassDecl') {
            return this.isSubclassOf(sSym, tSym);
        }
        return false;
    }

    lookupEnumCanonical(typeName) {
        if (typeof typeName !== 'string') return null;
        if (isFnPtrType(typeName)) return null;
        const resolved = this.resolveTypeName(typeName);
        const sym = this.lookupClassByFullName(resolved);
        if (sym && sym.kind === 'EnumDecl') return sym.name;
        return null;
    }

    // ═══ REEMPLAZADO ═══ lookupClassByFullName
    lookupClassByFullName(fullName) {
        if (typeof fullName !== 'string') return null;
        if (isFnPtrType(fullName)) return null;

        // Cache de especializaciones
        if (this.specializedClasses.has(fullName)) return this.specializedClasses.get(fullName);

        // Intento de instanciación
        const g = this.parseGenericType(fullName);
        if (g) {
            const base = this.resolveTypeName(g.base);
            const template = this.globalScope.lookup(base);
            if (template && template.kind === 'ClassDecl' && template.isGeneric) {
                return this.ensureSpecializedClass(base, g.args);
            }
            return null;
        }

        if (this.usingAliases.has(fullName)) fullName = this.usingAliases.get(fullName);
        if (!fullName.includes('::')) return this.globalScope.lookup(fullName);
        const parts = fullName.split('::');
        return this.resolveQualifiedFrom(this.globalScope, parts);
    }

    resolveQualifiedFrom(startScope, parts) {
        let sym = startScope.lookupCurrent(parts[0]);
        if (!sym) return null;
        for (let i = 1; i < parts.length; i++) {
            if (!sym.scope) return null;
            sym = sym.scope.lookupCurrent(parts[i]);
            if (!sym) return null;
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
        if (!sym) return null;
        for (let i = 1; i < parts.length; i++) {
            if (!sym.scope) return null;
            sym = sym.scope.lookupCurrent(parts[i]);
            if (!sym) return null;
        }
        return sym;
    }

    // ═══ REEMPLAZADO ═══ resolveTypeName
    resolveTypeName(name) {
        // Sustitución de T mientras analizamos un template
        if (this.currentTypeParams && this.currentTypeParams.size > 0 && typeof name === 'string') {
            let needsSub = false;
            for (const tp of this.currentTypeParams.keys()) {
                if (name.includes(tp)) { needsSub = true; break; }
            }
            if (needsSub) name = this.substituteType(name, this.currentTypeParams);
        }

        if (isFnPtrType(name)) return name;
        if (BUILTIN_TYPES_NO_VOID.has(name) || name === 'void' || name === 'ptr' ||
            name === 'any' || name === 'auto') return name;

        // Normalizar tipo genérico
        const g = this.parseGenericType(name);
        if (g) {
            const resolvedBase = this.usingAliases.get(g.base) ?? g.base;
            const resolvedArgs = g.args.map(a => this.resolveTypeName(a));
            return `${resolvedBase}<${resolvedArgs.join(',')}>`;
        }

        if (this.usingAliases.has(name)) return this.usingAliases.get(name);
        if (this.globalScope.lookup(name)) return name;
        for (const ns of this.usingWildcards) {
            const candidate = `${ns}::${name}`;
            if (this.lookupClassByFullName(candidate)) return candidate;
        }
        return name;
    }

    // ═════════════════════════════════════════════════════════════
    // ═══ NUEVO ═══: Monomorfización
    // ═════════════════════════════════════════════════════════════
    /**
 * Resuelve la base y registra las firmas de la especialización de forma
 * SÍNCRONA (no en la cola). Necesario para que analyzeNewExpr/analyzeCall/
 * analyzeMemberAccess encuentren constructores, métodos y campos en cuanto
 * el tipo se instancia, sin esperar a que la cola drene.
 *
 * Se cachea el sym en specializedClasses ANTES de llamar aquí, así que
 * la recursión (Box<int> → base genérica → ...) está protegida.
 */
finalizeSpecializedSignatures(sym) {
    if (!sym || sym._signaturesDone) return;
    sym._signaturesDone = true;

    // 1. Resolver baseRef
    if (sym.baseName) {
        const parts = sym.baseName.split('::');
        let baseSym = parts.length === 1
            ? this.resolveQualified(parts)
            : this.resolveQualifiedFrom(this.globalScope, parts);
        if (!baseSym) baseSym = this.lookupClassByFullName(sym.baseName);

        if (baseSym && baseSym.kind === 'ClassDecl') {
            if (baseSym.isFinal) {
                this.pushError(
                    `La clase '${sym.name}' no puede heredar de '${baseSym.name}' porque es 'final'.`,
                    sym.node,
                );
            } else {
                sym.baseRef = baseSym;
            }
        } else if (!baseSym) {
            this.pushError(
                `La clase base '${sym.baseName}' usada por '${sym.name}' no está declarada.`,
                sym.node,
            );
        }
    }

    // 2. Registrar firmas de miembros en el scope
    this.registerClassSignatures(sym.node, sym);

    // 3. Calcular abstractness (ahora sí puede inspeccionar baseRef)
    sym.isEffectivelyAbstract = this.computeAbstractness(sym);
}

// completeSpecializationAnalysis(sym) {

    ensureSpecializedClass(baseName, args) {
    const key = `${baseName}<${args.join(',')}>`;
    if (this.specializedClasses.has(key)) return this.specializedClasses.get(key);

    const template = this.globalScope.lookup(baseName);
    if (!template || template.kind !== 'ClassDecl' || !template.isGeneric) {
        this.pushError(`'${baseName}' no es un tipo genérico.`, null);
        return null;
    }
    if ((template.typeParams || []).length !== args.length) {
        this.pushError(
            `'${baseName}' espera ${template.typeParams.length} argumento(s) de tipo, se pasaron ${args.length}.`,
            null,
        );
        return null;
    }

    const resolvedArgs = args.map(a => this.resolveTypeName(a));

    const bindings = new Map();
    for (let i = 0; i < template.typeParams.length; i++) {
        bindings.set(template.typeParams[i].name, resolvedArgs[i]);
    }

    // Validar bounds
    for (let i = 0; i < template.typeParams.length; i++) {
        const tp = template.typeParams[i];
        if (tp.bound) {
            const boundType = this.substituteType(tp.bound, bindings);
            const argType = resolvedArgs[i];
            if (argType !== 'any' && boundType !== 'any' && !this.canAssignType(boundType, argType)) {
                this.pushError(
                    `'${argType}' no satisface el bound '${tp.bound}' del parámetro '${tp.name}' en '${baseName}'.`,
                    null,
                );
            }
        }
    }

    const parentScope = (template.scope && template.scope.parent) || this.globalScope;
    const scope = new Scope(parentScope, 'class');
    scope.fullName = key;

    const sym = {
        kind: 'ClassDecl',
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
        baseVisibility: template.baseVisibility || null,
    };

    // Generar AST sintético con tipos sustituidos
    const syntheticNode = this.substituteAstNode(template.node, bindings);
    syntheticNode.name = key;
    sym.node = syntheticNode;
    this.specializedAstNodes.push(syntheticNode);

    // ═══ FIX: cachear ANTES de cualquier recursión (base puede ser genérica) ═══
    this.specializedClasses.set(key, sym);

    // ═══ FIX: resolver base + registrar firmas INMEDIATAMENTE ═══
    // Así, cuando analyzeNewExpr busque constructores en scope.symbols, ya estarán.
    this.finalizeSpecializedSignatures(sym);

    // Solo el análisis de CUERPOS queda en la cola (puede enriquecer sin bloquear)
    this.pendingSpecializations.push(sym);

    return sym;
}

    completeSpecializationAnalysis(sym) {
    if (!sym || sym._analyzed) return;
    sym._analyzed = true;

    // Las firmas ya fueron registradas en finalizeSpecializedSignatures.
    // Solo falta analizar los cuerpos (puede enriquecer y encolar más
    // especializaciones si los métodos construyen otros genéricos).
    if (sym.node) {
        this.analyzeClassBodies(sym.node, sym);
    }
}

    getSpecializedNodes() {
        return this.specializedAstNodes;
    }

    // ═════════════════════════════════════════════════════════════
    //  seedBuiltins (idéntico al original)
    // ═════════════════════════════════════════════════════════════
    seedBuiltins() {
        const method = (returnType, paramTypes) => ({
            kind: 'MethodDecl', visibility: 'public', isStatic: true, isVirtual: false,
            hasBody: true, returnType, paramCount: paramTypes.length, paramTypes,
        });
        const variadic = (returnType) => ({
            kind: 'MethodDecl', visibility: 'public', isStatic: true, isVirtual: false,
            hasBody: true, returnType, paramCount: 0, paramTypes: [], isVariadic: true,
        });
        const field = (type) => ({
            kind: 'FieldDecl', visibility: 'public', isStatic: true, type,
        });
        const cls = (name, scope) => ({
            kind: 'ClassDecl', name, shortName: name, isBuiltin: true,
            isInterface: false, isAbstract: false, isEffectivelyAbstract: false,
            isStruct: false, isFinal: false, scope, baseRef: null, node: null,
        });

        const pointerScope = new Scope(this.globalScope, 'class');
        pointerScope.define('read8',   method('int',   ['ptr']));
        pointerScope.define('read16',  method('int',   ['ptr']));
        pointerScope.define('read32',  method('int',   ['ptr']));
        pointerScope.define('read64',  method('int64', ['ptr']));
        pointerScope.define('write8',  method('void',  ['ptr', 'int']));
        pointerScope.define('write16', method('void',  ['ptr', 'int']));
        pointerScope.define('write32', method('void',  ['ptr', 'int']));
        pointerScope.define('write64', method('void',  ['ptr', 'int64']));
        pointerScope.define('offset',  method('ptr',   ['ptr', 'int']));
        pointerScope.define('isNull',  method('bool',  ['ptr']));
        this.globalScope.define('pointer', cls('pointer', pointerScope));

        const memoryScope = new Scope(this.globalScope, 'class');
        memoryScope.define('alloc',    method('ptr',  ['int']));
        memoryScope.define('realloc', method('ptr',  ['ptr', 'int']));
        memoryScope.define('free',     method('void', ['ptr']));
        memoryScope.define('copy',     method('void', ['ptr', 'ptr', 'int']));
        memoryScope.define('set',      method('void', ['ptr', 'int', 'int']));
        memoryScope.define('compare', method('int',  ['ptr', 'ptr', 'int']));
        this.globalScope.define('memory', cls('memory', memoryScope));

        const unsafeScope = new Scope(this.globalScope, 'class');
        unsafeScope.define('pointer', field('pointer'));
        unsafeScope.define('memory',  field('memory'));
        this.globalScope.define('Unsafe', cls('Unsafe', unsafeScope));

        const wasiScope = new Scope(this.globalScope, 'class');
        wasiScope.define('write',      method('void', ['string']));
        wasiScope.define('writeLine', method('void', ['string']));
        wasiScope.define('println',    variadic('void'));
        wasiScope.define('flush',      method('void', []));
        wasiScope.define('exit',       method('void', ['int']));
        wasiScope.define('readLine',   method('string', []));
        wasiScope.define('readInt',    method('int', []));
        wasiScope.define('Import', {
            kind: 'MethodDecl', visibility: 'public', isStatic: true, isVirtual: false,
            hasBody: true, returnType: 'void', paramCount: 5,
            paramTypes: ['string', 'string', 'string', 'any', 'any'],
            isVariadic: true, isImportDirective: true,
        });
        this.globalScope.define('__wasi_io', cls('__wasi_io', wasiScope));

        const systemScope = new Scope(this.globalScope, 'class');
        systemScope.define('wasi',     field('__wasi_io'));
        systemScope.define('write',    method('void', ['string']));
        systemScope.define('writeLine', method('void', ['string']));
        systemScope.define('println',   variadic('void'));
        systemScope.define('flush',    method('void', []));
        systemScope.define('exit',     method('void', ['int']));
        systemScope.define('readLine', method('string', []));
        systemScope.define('readInt',  method('int', []));
        this.globalScope.define('System', cls('System', systemScope));

        const mathScope = new Scope(this.globalScope, 'class');
        mathScope.define('abs',       method('double', ['double']));
        mathScope.define('sqrt',      method('double', ['double']));
        mathScope.define('floor',     method('double', ['double']));
        mathScope.define('ceil',      method('double', ['double']));
        mathScope.define('round',     method('double', ['double']));
        mathScope.define('trunc',     method('double', ['double']));
        mathScope.define('min',       method('double', ['double', 'double']));
        mathScope.define('max',       method('double', ['double', 'double']));
        mathScope.define('copysign',  method('double', ['double', 'double']));
        this.globalScope.define('Math', cls('Math', mathScope));

        const fileScope = new Scope(this.globalScope, 'class');
        fileScope.define('readAll',  method('string', ['string']));
        fileScope.define('writeAll', method('bool',   ['string', 'string']));
        fileScope.define('append',   method('bool',   ['string', 'string']));
        fileScope.define('exists',   method('bool',   ['string']));
        this.globalScope.define('File', cls('File', fileScope));
    }

    // ═══ REEMPLAZADO ═══ analyze
    analyze() {
        this.seedBuiltins();
        this.collectUsings(this.ast.body);
        this.registerScopes(this.ast.body, this.globalScope);

        const allClasses = [];
        this.collectClassSymbols(this.globalScope, allClasses);

        // Resolución de herencia SOLO para no-genéricos
        for (const sym of allClasses) {
            if (sym.isGeneric) continue;
            if (!sym.baseName) continue;
            const parts = sym.baseName.split('::');
            const baseSym = parts.length === 1
                ? this.resolveQualified(parts)
                : this.resolveQualifiedFrom(this.globalScope, parts);
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

        // Detección de ciclos (solo no-genéricos)
        for (const sym of allClasses) {
            if (sym.isGeneric) continue;
            const visited = new Set();
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

        // Firmas + abstractness SOLO para no-genéricos
        for (const sym of allClasses) {
            if (sym.isGeneric) continue;
            this.registerClassSignatures(sym.node, sym);
        }
        for (const sym of allClasses) {
            if (sym.isGeneric) continue;
            sym.isEffectivelyAbstract = this.computeAbstractness(sym);
        }
        for (const sym of allClasses) {
            if (sym.isGeneric) continue;
            this.analyzeClassBodies(sym.node, sym);
        }

        // Drenar especializaciones (puede añadir más durante el análisis)
        while (this.pendingSpecializations.length > 0) {
            const sym = this.pendingSpecializations.shift();
            this.completeSpecializationAnalysis(sym);
        }

        this.verifyEntryPoint();

        if (this.errors.length > 0) {
            const report = this.errors.map(err => err.message).join('\n');
            throw new Error(`\n--- Errores Semánticos Encontrados (${this.errors.length}) ---\n` + report);
        }
        return true;
    }

    // ═══ REEMPLAZADO ═══ registerScopes
    registerScopes(nodes, scope) {
        for (const node of nodes) {
            if (node.kind === 'NamespaceDecl') {
                const existing = scope.lookupCurrent(node.name);
                if (existing) {
                    if (existing.kind === 'NamespaceDecl' && existing.scope) {
                        this.registerScopes(node.body, existing.scope);
                        continue;
                    }
                    this.pushError(`'${node.name}' ya está declarado en este ámbito.`, node);
                    continue;
                }
                const fullName = scope.kind === 'global'
                    ? node.name
                    : `${scope.fullName}::${node.name}`;
                const nsScope = new Scope(scope, 'namespace');
                nsScope.fullName = fullName;
                scope.define(node.name, {
                    kind: 'NamespaceDecl', name: fullName, shortName: node.name, scope: nsScope, node,
                });
                this.registerScopes(node.body, nsScope);
            } else if (node.kind === 'ClassDecl') {
                if (scope.lookupCurrent(node.name)) {
                    this.pushError(`'${node.name}' ya está declarado en este ámbito.`, node);
                    continue;
                }
                const fullName = scope.kind === 'global'
                    ? node.name
                    : `${scope.fullName}::${node.name}`;
                const classScope = new Scope(scope, 'class');
                classScope.fullName = fullName;
                const typeParams = node.typeParams || [];
                scope.define(node.name, {
                    kind: 'ClassDecl',
                    name: fullName,
                    shortName: node.name,
                    isInterface: !!node.isInterface,
                    isAbstract: !!node.isAbstract,
                    isStruct: !!node.isStruct,
                    isFinal: !!node.isFinal,
                    isEffectivelyAbstract: !!node.isAbstract,
                    isGeneric: typeParams.length > 0,       // NUEVO
                    typeParams,                              // NUEVO
                    baseName: node.base?.name || null,
                    baseVisibility: node.base?.visibility || null,
                    scope: classScope, baseRef: null, node,
                });
            } else if (node.kind === 'EnumDecl') {
                if (scope.lookupCurrent(node.name)) {
                    this.pushError(`'${node.name}' ya está declarado en este ámbito.`, node);
                    continue;
                }
                const fullName = scope.kind === 'global'
                    ? node.name
                    : `${scope.fullName}::${node.name}`;
                const members = new Map();
                let lastValue = 0;
                for (const m of node.members) {
                    let v;
                    if (m.valueExpr) {
                        if (m.valueExpr.kind !== 'NumberLiteral') {
                            this.pushError(`El valor del miembro '${m.name}' del enum debe ser un literal numérico.`, m);
                            v = 0;
                        } else {
                            v = (typeof m.valueExpr.value === 'bigint' ? Number(m.valueExpr.value) : m.valueExpr.value) | 0;
                        }
                    } else {
                        v = lastValue;
                    }
                    members.set(m.name, v);
                    lastValue = v + 1;
                }
                scope.define(node.name, {
                    kind: 'EnumDecl',
                    name: fullName, shortName: node.name,
                    members, node,
                });
            }
        }
    }

    collectClassSymbols(scope, out) {
        for (const [, sym] of scope.symbols) {
            if (sym.kind === 'ClassDecl' && !sym.isBuiltin) out.push(sym);
            else if (sym.kind === 'NamespaceDecl' && sym.scope) this.collectClassSymbols(sym.scope, out);
        }
    }

    // ═══ REEMPLAZADO ═══ verifyEntryPoint
    verifyEntryPoint() {
        for (const [, sym] of this.globalScope.symbols) {
            if (sym.kind === 'ClassDecl' && sym.scope && !sym.isBuiltin && !sym.isGeneric) {
                const hasMain = this.lookupMethods(sym, 'main').some(c => c.member.isStatic);
                if (hasMain) return;
            }
            if (sym.kind === 'NamespaceDecl' && sym.scope) {
                if (this.findMainIn(sym.scope)) return;
            }
        }
        // Buscar en especializaciones ya instanciadas
        for (const [, sym] of this.specializedClasses) {
            if (sym.scope) {
                const hasMain = this.lookupMethods(sym, 'main').some(c => c.member.isStatic);
                if (hasMain) return;
            }
        }
        this.pushError("No se encontró un punto de entrada 'static main(...)' en ninguna clase.");
    }

    // ═══ REEMPLAZADO ═══ findMainIn
    findMainIn(scope) {
        for (const [, sym] of scope.symbols) {
            if (sym.kind === 'ClassDecl' && sym.scope && !sym.isGeneric) {
                const hasMain = this.lookupMethods(sym, 'main').some(c => c.member.isStatic);
                if (hasMain) return true;
            }
            if (sym.kind === 'NamespaceDecl' && sym.scope) {
                if (this.findMainIn(sym.scope)) return true;
            }
        }
        return false;
    }

    computeAbstractness(classSym) {
        if (classSym.isInterface) return true;
        if (classSym.isAbstract) return true;
        let cur = classSym;
        const seen = new Set();
        while (cur) {
            if (seen.has(cur.name)) break;
            seen.add(cur.name);
            for (const [key, member] of cur.scope.symbols) {
                if (member.kind !== 'MethodDecl') continue;
                if (typeof key !== 'string' || !key.includes('#')) continue;
                if (member.hasBody) continue;
                const impl = this.lookupMember(classSym, key);
                if (!impl || !impl.member.hasBody) return true;
            }
            cur = cur.baseRef;
        }
        return false;
    }

    registerClassSignatures(node, classSym) {
        for (const member of node.members) {
            if (member.kind === 'MethodDecl') {
                const resolvedParamTypes = member.params.map(p => this.resolveTypeName(p.type || 'any'));
                const sig = this.methodSig(member.name, member.params.length, resolvedParamTypes);

                if (classSym.scope.lookupCurrent(sig)) {
                    this.pushError(`El método '${member.name}' con esta firma ya está declarado en '${classSym.name}'.`, member);
                    continue;
                }

                const baseCandidates = classSym.baseRef
                    ? this.lookupMethods(classSym.baseRef, member.name)
                        .filter(c => c.member.paramCount === member.params.length)
                    : [];
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

                if (baseIsMethod && baseFound.member.returnType !== (member.returnType || 'void')) {
                    this.pushError(`El método '${member.name}' en '${classSym.name}' sobrescribe uno de '${baseFound.owner.name}' pero cambia el tipo de retorno.`, member);
                }

                classSym.scope.define(sig, {
                    kind: 'MethodDecl',
                    visibility: member.visibility || 'private',
                    returnType: member.returnType || 'void',
                    isStatic: member.isStatic || false,
                    isVirtual, hasBody,
                    paramCount: member.params.length,
                    paramTypes: resolvedParamTypes,
                });
            } else if (member.kind === 'FieldDecl') {
                if (classSym.scope.lookupCurrent(member.name)) {
                    this.pushError(`El campo '${member.name}' ya está declarado en '${classSym.name}'.`, member);
                } else {
                    classSym.scope.define(member.name, {
                        kind: 'FieldDecl',
                        visibility: member.visibility || 'private',
                        isStatic: member.isStatic || false,
                        isConst: member.isConst || false,
                        type: member.type || 'any'
                    });
                }
            } else if (member.kind === 'ConstructorDecl') {
                const types = member.params.map(p => this.resolveTypeName(p.type || 'any'));
                const key = `__ctor_${member.params.length}_${types.join(',')}`;
                if (classSym.scope.lookupCurrent(key)) {
                    this.pushError(`'${classSym.name}' ya tiene un constructor con ${member.params.length} parámetro(s) de tipos (${types.join(', ')}).`, member);
                } else {
                    classSym.scope.define(key, {
                        kind: 'ConstructorDecl',
                        visibility: member.visibility || 'private',
                        paramCount: member.params.length,
                        paramTypes: types,
                    });
                }
            } else if (member.kind === 'DestructorDecl') {
                if (classSym.scope.lookupCurrent('__dtor')) {
                    this.pushError(`'${classSym.name}' ya tiene un destructor.`, member);
                } else {
                    classSym.scope.define('__dtor', {
                        kind: 'DestructorDecl',
                        visibility: member.visibility || 'private'
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

        // Para especializaciones, typeParams ya está vacío (tipos sustituidos)
        this.currentTypeParams = null;

        for (const member of node.members) {
            if (member.kind === 'MethodDecl') {
                if (member.body) this.analyzeMethodBody(member);
            }
            else if (member.kind === 'FieldDecl') this.analyzeFieldInit(member);
            else if (member.kind === 'ConstructorDecl') this.analyzeConstructorBody(node.name, member);
            else if (member.kind === 'DestructorDecl') this.analyzeDestructorBody(node.name, member);
        }

        this.currentScope = previousScope;
        this.currentClass = previousClass;
        this.currentTypeParams = previousTypeParams;
    }

    lookupLocalOnly(name) {
        let scope = this.currentScope;
        while (scope && scope.kind !== 'class' && scope.kind !== 'global' && scope.kind !== 'namespace') {
            if (scope.symbols.has(name)) return scope.symbols.get(name);
            scope = scope.parent;
        }
        return null;
    }

    lookupMember(classSym, name) {
        let cur = classSym;
        while (cur) {
            const m = cur.scope.lookupCurrent(name);
            if (m) return { member: m, owner: cur };
            cur = cur.baseRef;
        }
        const methods = this.lookupMethods(classSym, name);
        if (methods.length > 0) return methods[0];
        return null;
    }

    isSubclassOf(sub, sup) {
        let cur = sub;
        while (cur) {
            if (cur === sup) return true;
            cur = cur.baseRef;
        }
        return false;
    }

    isAccessible(member, ownerSym) {
        const vis = member.visibility || 'private';
        if (vis === 'public') return true;
        if (!this.currentClass) return false;
        const fromSym = this.currentClass.sym;
        if (fromSym === ownerSym) return true;
        if (vis === 'protected' && this.isSubclassOf(fromSym, ownerSym)) return true;
        return false;
    }

    checkStaticAccess(member, memberName, node) {
        if (!this.currentMethod || !this.currentMethod.isStatic) return true;
        if (member.isStatic) return true;
        if (member.kind === 'ConstructorDecl' || member.kind === 'ClassDecl') return true;
        this.pushError(`No se puede acceder a '${memberName}' (no estático) desde el contexto estático ${this.describeContext()}.`, node);
        return false;
    }

    checkConstWrite(target, node) {
        if (!target) return true;
        const inCtor = this.currentMethod && this.currentMethod.isCtor;

        if (target.kind === 'Identifier') {
            const local = this.lookupLocalOnly(target.name);
            if (local) {
                if (local.kind === 'Capture') {
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

        if (target.kind === 'MemberAccess') {
            const objClass = this.resolveObjectClass(target.object);
            if (objClass) {
                const found = this.lookupField(objClass.sym, target.property);
                if (found && found.member.isConst) {
                    const isThis = target.object.kind === 'ThisExpr';
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
                if (member.kind !== 'ConstructorDecl') continue;
                hasAnyCtorHere = true;
                if (member.paramCount === 0) { ctor0 = member; break; }
            }
            if (hasAnyCtorHere) {
                if (!ctor0) return 'missing';
                if (!this.isAccessible(ctor0, cur)) return 'inaccessible';
                return 'ok';
            }
            cur = cur.baseRef;
        }
        return 'ok';
    }

    describeContext() {
        if (this.currentClass && this.currentMethod) {
            return `'${this.currentClass.name}.${this.currentMethod.name}'`;
        }
        if (this.currentClass) return `'${this.currentClass.name}'`;
        return `el ámbito global`;
    }

    visitNode(node) {
        if (!node) return null;
        switch (node.kind) {
            case 'Program':
                for (const c of node.body) {
                    try {
                        if (c.kind === 'UsingDecl') {
                            if (c.isWildcard) this.usingWildcards.push(c.name);
                            else this.usingAliases.set(c.parts[c.parts.length - 1], c.parts.join('::'));
                        } else {
                            this.visitNode(c);
                        }
                    } catch (e) { this.errors.push(e); }
                }
                return null;
            case 'NamespaceDecl':
                for (const c of node.body) {
                    if (c.kind === 'UsingDecl') {
                        if (c.isWildcard) this.usingWildcards.push(c.name);
                        else this.usingAliases.set(c.parts[c.parts.length - 1], c.parts.join('::'));
                    } else this.visitNode(c);
                }
                return null;
            case 'ClassDecl': case 'EnumDecl': return null;
            case 'MethodDecl':   if (node.body) this.analyzeMethodBody(node); return null;
            case 'ConstructorDecl': case 'DestructorDecl': return null;
            case 'FieldDecl':    return this.analyzeFieldDecl(node);
            case 'VarDecl':      return this.analyzeVarDecl(node);
            case 'ExprStatement': this.visitNode(node.expr); return null;
            case 'If':           return this.analyzeIf(node);
            case 'While':        return this.analyzeWhile(node);
            case 'For':          return this.analyzeFor(node);
            case 'Switch':       return this.analyzeSwitch(node);
            case 'BeginEnd':     return this.analyzeBeginEnd(node);
            case 'Return':       return this.analyzeReturn(node);
            case 'Delete':       return this.analyzeDelete(node);
            case 'Break':        return this.analyzeBreak(node);
            case 'Continue':     return this.analyzeContinue(node);
            case 'BinaryOp':     return this.analyzeBinaryOp(node);
            case 'UnaryOp':      return this.analyzeUnaryOp(node);
            case 'Ternary':      return this.analyzeTernary(node);
            case 'CastExpr':     return this.analyzeCastExpr(node);
            case 'IncrementExpr':return this.analyzeIncrementExpr(node);
            case 'AddressOfExpr':return this.analyzeAddressOfExpr(node);
            case 'Assignment':   return this.analyzeAssignment(node);
            case 'CompoundAssignment': return this.analyzeCompoundAssignment(node);
            case 'Call':         return this.analyzeCall(node);
            case 'MemberAccess': return this.analyzeMemberAccess(node);
            case 'IndexExpr':    return this.analyzeIndexExpr(node);
            case 'ThisExpr':     return this.analyzeThisExpr(node);
            case 'SuperCall':    return this.analyzeSuperCall(node);
            case 'NewExpr':      return this.analyzeNewExpr(node);
            case 'NewArrayExpr': return this.analyzeNewArrayExpr(node);
            case 'Identifier':   return this.analyzeIdentifierUse(node);
            case 'QualifiedName':return this.analyzeQualifiedName(node);
            case 'LambdaExpr':   return this.analyzeLambdaExpr(node);
            case 'ArrayLiteral': return 'any';
            case 'NullLiteral':  return 'null';
            case 'StringLiteral':return 'string';
            case 'BooleanLiteral': return 'bool';
            case 'NumberLiteral':
                if (typeof node.value === 'bigint') {
                    if (node.isUnsigned) return 'uint64';
                    if (node.value >= 0n && node.value <= 9223372036854775807n) return 'int64';
                    if (node.value >= 0n && node.value <= 18446744073709551615n) return 'uint64';
                    return 'int64';
                }
                if (Number.isInteger(node.value)) {
                    if (node.isUnsigned) {
                        if (node.value >= 0 && node.value <= 4294967295) return 'uint32';
                        return 'uint64';
                    }
                    if (node.value >= -2147483648 && node.value <= 2147483647) return 'int';
                    if (node.value >= 0 && node.value <= 4294967295) return 'uint32';
                    return 'int64';
                }
                return node.isFloat32 ? 'float' : 'double';
            default: return null;
        }
    }

    analyzeFieldDecl(node) { return node.type || 'any'; }

    analyzeFieldInit(node) {
        if (!node.value) return;
        const sym = this.currentScope.lookupCurrent(node.name);
        let declaredType = sym ? sym.type : (node.type || 'any');
        const valueType = this.visitNode(node.value);

        if (declaredType === 'auto') {
            declaredType = (valueType === 'error') ? 'any' : valueType;
            if (sym) sym.type = declaredType;
            return;
        }
        if (valueType && valueType !== 'error' && !this.canAssignType(declaredType, valueType)) {
            this.pushError(`No se puede inicializar el campo '${node.name}' de tipo '${declaredType}' con un valor de tipo '${valueType}'.`, node);
        }
    }

    analyzeMethodBody(node) {
        const methodScope = new Scope(this.currentScope, 'method');
        const previousScope = this.currentScope;
        const previousMethod = this.currentMethod;
        const prevLoop = this.loopDepth;
        const prevSwitch = this.switchDepth;

        this.currentScope = methodScope;
        this.currentMethod = { name: node.name, returnType: node.returnType || 'void', isStatic: node.isStatic || false };
        this.loopDepth = 0;
        this.switchDepth = 0;

        try {
            for (const param of node.params) {
                if (methodScope.lookupCurrent(param.name)) {
                    this.pushError(`El parámetro '${param.name}' ya está definido en el método '${node.name}'.`, node);
                } else {
                    methodScope.define(param.name, {
                        kind: 'Parameter',
                        type: param.type || 'any',
                        isConst: param.isConst || false,
                    });
                }
            }
            if (node.body) this.visitNode(node.body);
        } finally {
            this.currentScope = previousScope;
            this.currentMethod = previousMethod;
            this.loopDepth = prevLoop;
            this.switchDepth = prevSwitch;
        }
    }

    analyzeConstructorBody(className, node) {
        const methodScope = new Scope(this.currentScope, 'method');
        const previousScope = this.currentScope;
        const previousMethod = this.currentMethod;
        const prevLoop = this.loopDepth;
        const prevSwitch = this.switchDepth;

        const ctorMethod = { name: className, returnType: 'void', isStatic: false, isCtor: true, superCallSeen: false };
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
                        kind: 'Parameter',
                        type: param.type || 'any',
                        isConst: param.isConst || false,
                    });
                }
            }
            if (node.body) this.visitNode(node.body);

            const baseSym = this.currentClass?.sym.baseRef;
            if (baseSym && !baseSym.isInterface && !ctorMethod.superCallSeen) {
                const status = this.defaultCtorStatus(baseSym);
                if (status === 'missing') {
                    this.pushError(`El constructor de '${className}' debe llamar explícitamente a 'super(...)' porque '${baseSym.name}' no tiene un constructor por defecto.`, node);
                } else if (status === 'inaccessible') {
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
        const methodScope = new Scope(this.currentScope, 'method');
        const previousScope = this.currentScope;
        const previousMethod = this.currentMethod;
        const prevLoop = this.loopDepth;
        const prevSwitch = this.switchDepth;

        this.currentScope = methodScope;
        this.currentMethod = { name: `~${className}`, returnType: 'void', isStatic: false, isDtor: true };
        this.loopDepth = 0;
        this.switchDepth = 0;

        try {
            if (node.body) this.visitNode(node.body);
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
            return node.type || 'any';
        }
        let declaredType = node.type || 'any';

        if (declaredType === 'auto') {
            if (!node.value) {
                this.pushError(`La variable '${name}' declarada con 'auto' requiere un inicializador.`, node);
                this.currentScope.define(name, { kind: 'VarDecl', type: 'any', isConst: node.isConst || false });
                return 'any';
            }
            const valueType = this.visitNode(node.value);
            declaredType = (valueType === 'error') ? 'any' : valueType;
            this.currentScope.define(name, { kind: 'VarDecl', type: declaredType, isConst: node.isConst || false });
            return declaredType;
        }

        // NUEVO: si el tipo es genérico, forzar la instanciación
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
        } else if (!BUILTIN_TYPES_NO_VOID.has(declaredType) && declaredType !== 'ptr' && !declaredType.startsWith('void')
                   && !this.parseGenericType(declaredType)) {
            const stripped = declaredType.split('[')[0];
            const resolvedName = this.resolveTypeName(stripped);
            const resolved = this.lookupClassByFullName(resolvedName);
            if (!resolved && !BUILTIN_TYPES_NO_VOID.has(stripped) && stripped !== 'ptr') {
                this.pushError(`El tipo '${stripped}' no está declarado.`, node);
            }
        }

        this.currentScope.define(name, { kind: 'VarDecl', type: declaredType, isConst: node.isConst || false });

        if (!node.value && !declaredType.endsWith('[]') && !isFnPtrType(declaredType)) {
            const sym = this.lookupClassByFullName(this.resolveTypeName(declaredType));
            if (sym && sym.kind === 'ClassDecl' && !sym.isStruct) {
                const status = this.defaultCtorStatus(sym);
                if (status === 'missing') {
                    this.pushError(`No se puede declarar '${name}' de tipo '${declaredType}' sin inicializar: la clase no tiene constructor sin argumentos.`, node);
                } else if (status === 'inaccessible') {
                    this.pushError(`El constructor por defecto de '${declaredType}' no es accesible desde ${this.describeContext()}.`, node);
                }
            }
        }

        if (node.value) {
            const valueType = this.visitNode(node.value);
            if (valueType && valueType !== 'error' && !this.canAssignType(declaredType, valueType)) {
                this.pushError(`No se puede inicializar '${name}' de tipo '${declaredType}' con un valor de tipo '${valueType}'.`, node);
            }
        }
        return declaredType;
    }

    analyzeIf(node) {
        for (const branch of node.branches) {
            const condType = this.visitNode(branch.condition);
            if (condType && condType !== 'error' && condType !== 'bool' && condType !== 'any') {
                this.pushError(`La condición del 'if' debe ser de tipo 'bool', se obtuvo '${condType}'.`, branch.condition);
            }
            this.currentScope = new Scope(this.currentScope, 'block');
            this.visitNode(branch.thenStmt);
            this.currentScope = this.currentScope.parent;
        }
        if (node.elseStmt) {
            this.currentScope = new Scope(this.currentScope, 'block');
            this.visitNode(node.elseStmt);
            this.currentScope = this.currentScope.parent;
        }
        return null;
    }

    analyzeWhile(node) {
        const condType = this.visitNode(node.condition);
        if (condType && condType !== 'error' && condType !== 'bool' && condType !== 'any') {
            this.pushError(`La condición del 'while' debe ser de tipo 'bool', se obtuvo '${condType}'.`, node.condition);
        }
        this.currentScope = new Scope(this.currentScope, 'block');
        this.loopDepth++;
        try { this.visitNode(node.body); }
        finally { this.loopDepth--; this.currentScope = this.currentScope.parent; }
        return null;
    }

    analyzeFor(node) {
        this.currentScope = new Scope(this.currentScope, 'block');
        this.loopDepth++;
        try {
            if (node.init) this.visitNode(node.init);
            if (node.condition) {
                const condType = this.visitNode(node.condition);
                if (condType && condType !== 'error' && condType !== 'bool' && condType !== 'any') {
                    this.pushError(`La condición del 'for' debe ser de tipo 'bool', se obtuvo '${condType}'.`, node.condition);
                }
            }
            if (node.update) this.visitNode(node.update);
            this.visitNode(node.body);
        } finally { this.loopDepth--; this.currentScope = this.currentScope.parent; }
        return null;
    }

    analyzeSwitch(node) {
        const exprType = this.visitNode(node.expr);
        const exprSym = exprType ? this.lookupClassByFullName(this.resolveTypeName(exprType)) : null;
        const exprIsEnum = exprSym && exprSym.kind === 'EnumDecl';

        if (exprType && exprType !== 'error' && exprType !== 'any'
            && !SWITCHABLE_TYPES.has(exprType) && !exprIsEnum) {
            this.pushError(
                `La expresión de 'switch' debe ser de tipo integral, 'bool', 'string' o enum, se obtuvo '${exprType}'.`,
                node.expr
            );
        }

        const seenLiterals = new Set();
        let defaultSeen = false;

        this.switchDepth++;
        try {
            for (const c of node.cases) {
                if (c.values === null) {
                    if (defaultSeen) this.pushError(`Múltiples 'default' en el mismo 'switch'.`, c);
                    defaultSeen = true;
                } else {
                    for (const v of c.values) {
                        const vType = this.visitNode(v);
                        if (exprType !== 'any' && vType !== 'error' && vType !== 'any') {
                            if (!this.canAssignType(exprType, vType) && !this.canAssignType(vType, exprType)) {
                                this.pushError(`El 'case' de tipo '${vType}' no es compatible con el 'switch' de tipo '${exprType}'.`, v);
                            }
                        }
                        const k = v.kind;
                        if (k === 'NumberLiteral' || k === 'StringLiteral' || k === 'BooleanLiteral') {
                            const key = `${k}:${JSON.stringify(typeof v.value === 'bigint' ? v.value.toString() : v.value)}`;
                            if (seenLiterals.has(key)) this.pushError(`Valor de 'case' duplicado: ${JSON.stringify(v.value)}.`, v);
                            seenLiterals.add(key);
                        }
                    }
                }
                this.currentScope = new Scope(this.currentScope, 'block');
                try {
                    for (const stmt of c.statements) this.visitNode(stmt);
                } finally { this.currentScope = this.currentScope.parent; }
            }
        } finally { this.switchDepth--; }
        return null;
    }

    analyzeBeginEnd(node) {
        this.currentScope = new Scope(this.currentScope, 'block');
        for (const stmt of node.statements) this.visitNode(stmt);
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
        if (this.loopDepth === 0) this.pushError(`'continue' solo puede usarse dentro de un bucle.`, node);
        return null;
    }

    analyzeReturn(node) {
        const exprType = node.expr ? this.visitNode(node.expr) : null;
        const method = this.currentMethod;
        if (!method) return null;

        if (method.isCtor || method.isDtor) {
            if (node.expr && exprType !== 'error') {
                const kind = method.isCtor ? 'constructor' : 'destructor';
                this.pushError(`El ${kind} '${method.name}' no puede retornar un valor.`, node);
            }
            return null;
        }
        if (method.returnType === 'void') {
            if (node.expr && exprType !== 'error') {
                this.pushError(`El método '${method.name}' es de tipo 'void' pero retorna un valor de tipo '${exprType}'.`, node);
            }
        } else if (method.returnType === 'any') {
            if (node.expr && exprType && exprType !== 'error' && exprType !== 'any') {
                if (!method._inferredReturn) method._inferredReturn = exprType;
            }
        } else {
            if (!node.expr) {
                this.pushError(`El método '${method.name}' debe retornar un valor de tipo '${method.returnType}'.`, node);
            } else if (exprType !== 'error' && !this.canAssignType(method.returnType, exprType)) {
                this.pushError(`El método '${method.name}' debe retornar '${method.returnType}', pero se retornó '${exprType}'.`, node);
            }
        }
        return null;
    }

    analyzeDelete(node) { this.resolveLValueType(node.target); return null; }

    resolveLValueType(target) {
        if (target.kind === 'Identifier') {
            const local = this.lookupLocalOnly(target.name);
            if (local) {
                if (local.kind === 'ClassDecl') return local.name;
                return local.type || 'any';
            }
            if (this.currentClass) {
                const found = this.lookupField(this.currentClass.sym, target.name);
                if (found) {
                    if (!this.isAccessible(found.member, found.owner)) {
                        this.pushError(`El miembro '${target.name}' de la clase '${found.owner.name}' es '${found.member.visibility || 'private'}' y no es accesible desde ${this.describeContext()}.`, target);
                        return 'error';
                    }
                    if (!this.checkStaticAccess(found.member, target.name, target)) return 'error';
                    return found.member.type || 'any';
                }
            }
            this.pushError(`'${target.name}' no ha sido declarado.`, target);
            return 'error';
        }
        if (target.kind === 'MemberAccess') {
            if (target.object.kind === 'Identifier') {
                let nm = target.object.name;
                if (this.usingAliases.has(nm)) nm = this.usingAliases.get(nm);
                const es = this.resolveQualified([nm]) || this.resolveQualifiedFrom(this.globalScope, [nm]);
                if (es && es.kind === 'EnumDecl') {
                    this.pushError(`No se puede asignar a '${target.object.name}.${target.property}': es un miembro de enum (constante).`, target);
                    return 'error';
                }
            }
            return this.analyzeMemberAccess(target);
        }
        if (target.kind === 'IndexExpr') return this.analyzeIndexExpr(target);
        if (target.kind === 'QualifiedName') return this.analyzeQualifiedName(target);
        this.pushError(`Expresión no asignable.`, target);
        return 'error';
    }

    analyzeAssignment(node) {
        if (!this.checkConstWrite(node.target, node.target)) return 'error';
        const targetType = this.resolveLValueType(node.target);
        if (targetType === 'error') { this.visitNode(node.expr); return 'error'; }
        const valueType = this.visitNode(node.expr);
        if (valueType && valueType !== 'error' && !this.canAssignType(targetType, valueType)) {
            this.pushError(`No se puede asignar '${valueType}' a un lvalue de tipo '${targetType}'.`, node.target);
            return 'error';
        }
        return targetType;
    }

    analyzeCompoundAssignment(node) {
        if (!this.checkConstWrite(node.target, node.target)) return 'error';
        const targetType = this.resolveLValueType(node.target);
        if (targetType === 'error') { this.visitNode(node.expr); return 'error'; }
        const valueType = this.visitNode(node.expr);
        if (valueType === 'error') return 'error';
        const resultType = this.applyBinaryOp(node.binOp, targetType, valueType, node);
        if (resultType === 'error') return 'error';
        if (resultType !== 'any' && !this.canAssignType(targetType, resultType)) {
            this.pushError(`El resultado de '${node.op}' es de tipo '${resultType}', que no es asignable al lvalue de tipo '${targetType}'.`, node.target);
            return 'error';
        }
        return targetType;
    }

    analyzeAddressOfExpr(node) { this.resolveLValueType(node.target); return 'ptr'; }

    analyzeIndexExpr(node) {
        const arrType = this.visitNode(node.array);
        const idxType = this.visitNode(node.index);
        if (arrType === 'error' || idxType === 'error') return 'error';
        if (arrType === 'any') return 'any';
        if (!isArrayType(arrType)) {
            this.pushError(`No se puede indexar un valor de tipo '${arrType}'; se esperaba un array.`, node);
            return 'error';
        }
        if (!INTEGER_TYPES.has(idxType) && idxType !== 'any') {
            this.pushError(`El índice de un array debe ser entero, se obtuvo '${idxType}'.`, node.index);
        }
        return elementType(arrType);
    }

    analyzeThisExpr(node) {
        if (!this.currentClass) {
            this.pushError(`'this' solo puede usarse dentro de un método de una clase.`, node);
            return 'error';
        }
        if (this.currentMethod && (this.currentMethod.isStatic || this.currentMethod.name === '<lambda>')) {
            this.pushError(`'this' no puede usarse dentro de un método 'static' o lambda (${this.describeContext()}).`, node);
            return 'error';
        }
        return this.currentClass.name;
    }

    analyzeSuperCall(node) {
        for (const a of node.args) this.visitNode(a);
        if (!this.currentMethod || !this.currentMethod.isCtor) {
            this.pushError(`'super(...)' solo puede usarse dentro de un constructor.`, node);
            return 'void';
        }
        if (!this.currentClass || !this.currentClass.sym.baseRef) {
            this.pushError(`La clase '${this.currentClass?.name ?? '?'}' no tiene clase base, no se puede llamar a 'super(...)'.`, node);
            return 'void';
        }
        const baseSym = this.currentClass.sym.baseRef;
        if (baseSym.isInterface) {
            this.pushError(`'${baseSym.name}' es una interface y no tiene constructores.`, node);
            return 'void';
        }
        if (this.currentMethod.superCallSeen) {
            this.pushError(`Ya se ha llamado a 'super(...)' previamente en este constructor.`, node);
            return 'void';
        }
        this.currentMethod.superCallSeen = true;

        const argTypes = node.args.map(a => this.visitNode(a));
        if (argTypes.some(t => t === 'error')) return 'void';

        const candidates = [];
        for (const [key, member] of baseSym.scope.symbols) {
            if (member.kind === 'ConstructorDecl' && member.paramCount === node.args.length) {
                candidates.push({ member, owner: baseSym });
            }
        }
        const resolved = this.resolveOverload(candidates, argTypes);
        if (resolved.status !== 'ok') {
            this.pushError(`La clase base '${baseSym.name}' no tiene un constructor compatible con (${argTypes.join(', ')})${resolved.status === 'ambiguous' ? ' — llamada ambigua' : ''}.`, node);
            return 'void';
        }
        if (!this.isAccessible(resolved.candidate.member, baseSym)) {
            this.pushError(`El constructor de '${baseSym.name}' es '${resolved.candidate.member.visibility}' y no es accesible desde ${this.describeContext()}.`, node);
            return 'void';
        }
        return 'void';
    }

    resolveObjectClass(objectExpr) {
        if (objectExpr.kind === 'ThisExpr') {
            if (!this.currentClass) return null;
            if (this.currentMethod && this.currentMethod.isStatic) {
                this.pushError(`'this' no puede usarse dentro de un método 'static' (${this.describeContext()}).`, objectExpr);
                return null;
            }
            return { className: this.currentClass.name, sym: this.currentClass.sym };
        }

        if (objectExpr.kind === 'Identifier') {
            const local = this.lookupLocalOnly(objectExpr.name);
            if (local) {
                const typeName = local.kind === 'ClassDecl' ? local.name : (local.type || 'any');
                if (typeName && typeName !== 'any' && typeName !== 'error') {
                    const classSym = this.lookupClassByFullName(this.resolveTypeName(typeName));
                    if (classSym && classSym.kind === 'ClassDecl') {
                        return { className: classSym.name, sym: classSym };
                    }
                }
                return null;
            }
            if (this.currentClass) {
                const found = this.lookupField(this.currentClass.sym, objectExpr.name);
                if (found) {
                    const typeName = found.member.type || 'any';
                    if (typeName && typeName !== 'any' && typeName !== 'error') {
                        const classSym = this.lookupClassByFullName(this.resolveTypeName(typeName));
                        if (classSym && classSym.kind === 'ClassDecl') {
                            return { className: classSym.name, sym: classSym };
                        }
                    }
                    return null;
                }
            }
        }

        let objType = null;
        if (objectExpr.kind === 'Identifier') {
            let name = objectExpr.name;
            if (this.usingAliases.has(name)) name = this.usingAliases.get(name);
            else if (!name.includes('::')) {
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

        if (objType === 'error') return null;
        const classSym = this.lookupClassByFullName(objType);
        if (!classSym || classSym.kind !== 'ClassDecl') return null;
        return { className: objType, sym: classSym };
    }

    analyzeMemberAccess(node) {
        if (node.property === 'length') {
            const objType = this.visitNode(node.object);
            if (objType === 'string' || isArrayType(objType)) return 'int';
            if (objType === 'error') return 'error';
        }

        if (node.object.kind === 'Identifier' && !this.lookupLocalOnly(node.object.name)) {
            let nsName = node.object.name;
            if (this.usingAliases.has(nsName)) nsName = this.usingAliases.get(nsName);
            const nsSym = this.currentScope.lookup(nsName) || this.globalScope.lookup(nsName);
            if (nsSym && nsSym.kind === 'NamespaceDecl' && nsSym.scope) {
                const inner = nsSym.scope.lookupCurrent(node.property);
                if (!inner) {
                    this.pushError(`El namespace '${node.object.name}' no tiene el miembro '${node.property}'.`, node);
                    return 'error';
                }
                if (inner.kind === 'ClassDecl' || inner.kind === 'EnumDecl' || inner.kind === 'NamespaceDecl') {
                    return inner.name;
                }
                if (inner.kind === 'MethodDecl') return inner.returnType || 'any';
                if (inner.kind === 'FieldDecl') return inner.type || 'any';
            }
        }

        if (node.object.kind === 'Identifier') {
            let name = node.object.name;
            if (this.usingAliases.has(name)) name = this.usingAliases.get(name);
            const enumSym = this.resolveQualified([name]) || this.resolveQualifiedFrom(this.globalScope, [name]);
            if (enumSym && enumSym.kind === 'EnumDecl') {
                if (!enumSym.members.has(node.property)) {
                    this.pushError(`El enum '${enumSym.name}' no tiene el miembro '${node.property}'.`, node);
                    return 'error';
                }
                return enumSym.name;
            }
        }

        const objClass = this.resolveObjectClass(node.object);
        if (!objClass) {
            if (node.object.kind === 'ThisExpr') return 'error';
            const objType = this.visitNode(node.object);
            if (objType !== 'error') {
                this.pushError(`El tipo '${objType}' no es una clase, no se puede acceder al miembro '${node.property}'.`, node);
            }
            return 'error';
        }
        const found = this.lookupField(objClass.sym, node.property);
        if (!found) {
            this.pushError(`La clase '${objClass.className}' no tiene un miembro llamado '${node.property}'.`, node);
            return 'error';
        }
        if (!this.isAccessible(found.member, found.owner)) {
            this.pushError(`El miembro '${node.property}' de la clase '${found.owner.name}' es '${found.member.visibility || 'private'}' y no es accesible desde ${this.describeContext()}.`, node);
            return 'error';
        }
        return found.member.type || 'any';
    }

    analyzeCall(node) {
        const callee = node.callee;
        const args = node.args || [];

        if (callee.kind === 'MemberAccess' && callee.property === 'Import'
            && callee.object.kind === 'MemberAccess' && callee.object.property === 'wasi'
            && callee.object.object.kind === 'Identifier' && callee.object.object.name === 'System') {
            return this.analyzeImportDirective(args, node);
        }

        const argTypes = args.map(a => this.visitNode(a));
        if (argTypes.some(t => t === 'error')) return 'error';

        if (callee.kind === 'QualifiedName') {
            const sym = this.resolveQualified(callee.parts) ||
                        this.resolveQualifiedFrom(this.globalScope, callee.parts);
            if (!sym) {
                this.pushError(`Llamada a '${callee.parts.join('::')}()' no declarada.`, callee);
                return 'error';
            }
            if (sym.kind !== 'MethodDecl') {
                this.pushError(`'${callee.parts.join('::')}' no es un método o función.`, callee);
                return 'error';
            }
            if (!sym.isVariadic && sym.paramCount !== undefined && sym.paramCount !== args.length) {
                this.pushError(`'${callee.parts.join('::')}' espera ${sym.paramCount} argumento(s), se pasaron ${args.length}.`, node);
            }
            return sym.returnType || 'any';
        }

        if (callee.kind === 'Identifier') {
            const local = this.lookupLocalOnly(callee.name);
            if (local && isFnPtrType(local.type)) {
                const fp = parseFnPtrType(local.type);
                if (!fp) {
                    this.pushError(`Tipo '${local.type}' inválido.`, callee);
                    return 'error';
                }
                if (fp.params.length !== args.length) {
                    this.pushError(`'${callee.name}' espera ${fp.params.length} argumento(s), se pasaron ${args.length}.`, node);
                    return 'error';
                }
                for (let i = 0; i < args.length; i++) {
                    if (argTypes[i] !== 'error' && !this.canAssignType(fp.params[i], argTypes[i])) {
                        this.pushError(`Argumento ${i + 1} de '${callee.name}': esperaba '${fp.params[i]}', se pasó '${argTypes[i]}'.`, args[i]);
                    }
                }
                return fp.ret;
            }
            if (local) {
                this.pushError(`'${callee.name}' no es un método o función.`, callee);
                return 'error';
            }

            const candidates = [];
            if (this.currentClass) {
                candidates.push(...this.lookupMethods(this.currentClass.sym, callee.name));
            }
            const globalFn = this.globalScope.lookupCurrent(callee.name);
            if (globalFn && globalFn.kind === 'MethodDecl') {
                candidates.push({ member: globalFn, owner: null });
            }

            if (candidates.length === 0) {
                this.pushError(`Llamada a '${callee.name}()' no declarada.`, callee);
                return 'error';
            }

            const resolved = this.resolveOverload(candidates, argTypes);
            if (resolved.status === 'not-found') {
                this.pushError(`No hay sobrecarga de '${callee.name}' compatible con (${argTypes.join(', ')}).`, node);
                return 'error';
            }
            if (resolved.status === 'ambiguous') {
                this.pushError(`Llamada a '${callee.name}' ambigua: múltiples sobrecargas compatibles.`, node);
                return 'error';
            }
            const m = resolved.candidate.member;
            if (resolved.candidate.owner) {
                if (!this.isAccessible(m, resolved.candidate.owner)) {
                    this.pushError(`El método '${callee.name}' de '${resolved.candidate.owner.name}' es '${m.visibility || 'private'}' y no es accesible desde ${this.describeContext()}.`, callee);
                    return 'error';
                }
                if (!this.checkStaticAccess(m, callee.name, callee)) return 'error';
                node._resolvedMethodSig = this.methodSig(callee.name, m.paramCount, m.paramTypes);
                node._resolvedMethodClass = resolved.candidate.owner.name;
            } else {
                node._resolvedMethodSig = null;
                node._resolvedMethodClass = null;
            }
            return m.returnType || 'any';
        }

        if (callee.kind === 'MemberAccess') {
            const objClass = this.resolveObjectClass(callee.object);
            if (!objClass) {
                if (callee.object.kind === 'ThisExpr') return 'error';
                const objType = this.visitNode(callee.object);
                if (objType !== 'error') {
                    this.pushError(`El tipo '${objType}' no es una clase, no se puede llamar '${callee.property}()'.`, callee);
                }
                return 'error';
            }
            const candidates = this.lookupMethods(objClass.sym, callee.property);
            if (candidates.length === 0) {
                this.pushError(`La clase '${objClass.className}' no tiene un método '${callee.property}()'.`, callee);
                return 'error';
            }
            const resolved = this.resolveOverload(candidates, argTypes);
            if (resolved.status === 'not-found') {
                this.pushError(`No hay sobrecarga de '${callee.property}' compatible con (${argTypes.join(', ')}).`, node);
                return 'error';
            }
            if (resolved.status === 'ambiguous') {
                this.pushError(`Llamada a '${callee.property}' ambigua: múltiples sobrecargas compatibles.`, node);
                return 'error';
            }
            const m = resolved.candidate.member;
            if (!this.isAccessible(m, resolved.candidate.owner)) {
                this.pushError(`El método '${callee.property}' de '${resolved.candidate.owner.name}' es '${m.visibility || 'private'}' y no es accesible desde ${this.describeContext()}.`, callee);
                return 'error';
            }
            node._resolvedMethodSig = this.methodSig(callee.property, m.paramCount, m.paramTypes);
            node._resolvedMethodClass = resolved.candidate.owner.name;
            return m.returnType || 'any';
        }

        this.pushError(`Expresión no llamable.`, node);
        return 'error';
    }

    analyzeImportDirective(args, node) {
        if (args.length !== 5) {
            this.pushError(`System.wasi.Import espera 5 argumentos: (module, name, alias, paramTypes[], returnTypes[])`, node);
            return 'void';
        }
        const [modArg, nameArg, aliasArg, paramsArg, returnsArg] = args;
        const isStr = (a) => a.kind === 'StringLiteral';
        const isArr = (a) => a.kind === 'ArrayLiteral';

        if (!isStr(modArg) || !isStr(nameArg) || !isStr(aliasArg)) {
            this.pushError(`System.wasi.Import: los 3 primeros args deben ser strings literales.`, node);
            return 'void';
        }
        if (!isArr(paramsArg) || !isArr(returnsArg)) {
            this.pushError(`System.wasi.Import: los 2 últimos args deben ser array literals.`, node);
            return 'void';
        }
        const alias = aliasArg.value;

        const extract = (arr) => arr.elements
            .filter((e) => e.kind === 'StringLiteral' || e.kind === 'Identifier')
            .map((e) => e.kind === 'StringLiteral' ? e.value : e.name);
        const params = extract(paramsArg);
        const returns = extract(returnsArg);

        if (this.globalScope.lookupCurrent(alias)) {
            this.pushError(`System.wasi.Import: el alias '${alias}' ya está declarado.`, node);
            return 'void';
        }
        this.globalScope.define(alias, {
            kind: 'MethodDecl',
            visibility: 'public',
            returnType: returns[0] || 'void',
            isStatic: true,
            isVirtual: false,
            hasBody: false,
            isVariadic: false,
            paramCount: params.length,
            paramTypes: params,
            isImport: true,
        });
        return 'void';
    }

    analyzeNewExpr(node) {
        for (const a of node.args || []) this.visitNode(a);

        const rawName = typeof node.className === 'string'
            ? node.className
            : (node.className.kind === 'QualifiedName' ? node.className.parts.join('::') : String(node.className));

        // NUEVO: forzar instanciación de genéricos
        const resolvedName = this.resolveTypeName(rawName);
        const genericParsed = this.parseGenericType(resolvedName);
        if (genericParsed) {
            this.lookupClassByFullName(resolvedName);
        }

        const parts = resolvedName.split('::');
        let classSym = this.resolveQualified(parts) || this.resolveQualifiedFrom(this.globalScope, parts);
        if (!classSym || classSym.kind !== 'ClassDecl') {
            classSym = this.lookupClassByFullName(resolvedName);
        }

        if (!classSym || classSym.kind !== 'ClassDecl') {
            this.pushError(`'${rawName}' no es una clase declarada.`, node);
            return 'error';
        }
        if (classSym.isBuiltin) {
            this.pushError(`'${rawName}' es un tipo interno del compilador y no puede instanciarse con 'new'.`, node);
            return 'error';
        }
        if (classSym.isInterface) {
            this.pushError(`No se puede instanciar la interface '${rawName}' con 'new'.`, node);
            return 'error';
        }
        if (classSym.isEffectivelyAbstract) {
            this.pushError(`No se puede instanciar '${rawName}': la clase es abstracta.`, node);
            return 'error';
        }

        node._resolvedClassName = classSym.name;

        const argTypes = (node.args || []).map(a => this.visitNode(a));
        if (argTypes.some(t => t === 'error')) return 'error';

        if (argTypes.length === 0) {
            const status = this.defaultCtorStatus(classSym);
            if (status === 'missing') {
                this.pushError(`La clase '${rawName}' no tiene un constructor sin argumentos.`, node);
                return 'error';
            }
            if (status === 'inaccessible') {
                this.pushError(`El constructor por defecto de '${rawName}' no es accesible desde ${this.describeContext()}.`, node);
                return 'error';
            }
            node._resolvedCtorSig = null;
            return classSym.name;
        }

        const candidates = [];
        for (const [, member] of classSym.scope.symbols) {
            if (member.kind === 'ConstructorDecl' && member.paramCount === argTypes.length) {
                candidates.push({ member, owner: classSym });
            }
        }
        const resolved = this.resolveOverload(candidates, argTypes);
        if (resolved.status !== 'ok') {
            this.pushError(`La clase '${rawName}' no tiene un constructor compatible con (${argTypes.join(', ')})${resolved.status === 'ambiguous' ? ' — llamada ambigua' : ''}.`, node);
            return 'error';
        }
        if (!this.isAccessible(resolved.candidate.member, classSym)) {
            this.pushError(`El constructor de '${rawName}' es '${resolved.candidate.member.visibility}' y no es accesible desde ${this.describeContext()}.`, node);
            return 'error';
        }
        node._resolvedCtorSig = `__ctor_${argTypes.length}_${resolved.candidate.member.paramTypes.join(',')}`;
        return classSym.name;
    }

    analyzeNewArrayExpr(node) {
        const sizes = node.sizes || [];
        for (const sz of sizes) {
            const szType = this.visitNode(sz);
            if (!INTEGER_TYPES.has(szType) && szType !== 'any') {
                this.pushError(`El tamaño de 'new[]' debe ser entero, se obtuvo '${szType}'.`, sz);
            }
        }

        const rawElem = typeof node.elementType === 'string'
            ? node.elementType
            : String(node.elementType);

        if (BUILTIN_TYPES_NO_VOID.has(rawElem) || rawElem === 'ptr' || isFnPtrType(rawElem)) {
            node._resolvedElementType = this.resolveTypeName(rawElem);
            return rawElem + '[]'.repeat(sizes.length);
        }

        // NUEVO: elemento genérico → instanciación
        const resolvedElem = this.resolveTypeName(rawElem);
        if (this.parseGenericType(resolvedElem)) {
            this.lookupClassByFullName(resolvedElem);
        }

        const parts = resolvedElem.split('::');
        let classSym = this.resolveQualified(parts) || this.resolveQualifiedFrom(this.globalScope, parts);
        if (!classSym || classSym.kind !== 'ClassDecl') {
            classSym = this.lookupClassByFullName(resolvedElem);
        }
        if (!classSym || classSym.kind !== 'ClassDecl') {
            this.pushError(`'${rawElem}' no es un tipo válido para 'new[]'.`, node);
            return 'error';
        }

        node._resolvedElementType = classSym.name;
        return classSym.name + '[]'.repeat(sizes.length);
    }

    analyzeIncrementExpr(node) {
        if (!this.checkConstWrite(node.target, node.target)) return 'error';
        const targetType = this.resolveLValueType(node.target);
        if (targetType === 'error') return 'error';
        if (!isNumeric(targetType) && targetType !== 'any') {
            this.pushError(`Operador '${node.op}' requiere un lvalue numérico, se obtuvo '${targetType}'.`, node);
            return 'error';
        }
        return targetType;
    }

    analyzeQualifiedName(node) {
        const sym = this.resolveQualified(node.parts) ||
                    this.resolveQualifiedFrom(this.globalScope, node.parts);
        if (!sym) {
            this.pushError(`Nombre calificado no encontrado: '${node.parts.join('::')}'.`, node);
            return 'error';
        }
        if (sym.kind === 'NamespaceDecl') {
            this.pushError(`'${node.parts.join('::')}' es un namespace, no un valor.`, node);
            return 'error';
        }
        if (sym.kind === 'EnumDecl') {
            this.pushError(`'${node.parts.join('::')}' es un enum, no un valor (usa Color.RED).`, node);
            return 'error';
        }
        if (sym.kind === 'ClassDecl') return sym.name;
        return sym.type || 'any';
    }

    applyBinaryOp(op, leftType, rightType, node) {
        if (leftType === 'error' || rightType === 'error') return 'error';
        if (leftType === 'any' || rightType === 'any') return 'any';
        if (isFnPtrType(leftType) || isFnPtrType(rightType)) {
            if (op === '==' || op === '!=') return 'bool';
            this.pushError(`Operador '${op}' no aplicable a tipos fn pointer.`, node);
            return 'error';
        }

        if (['<', '>', '<=', '>='].includes(op)) {
            if (!isNumeric(leftType))  this.pushError(`Operador '${op}' requiere operandos numéricos, se obtuvo '${leftType}'.`, node);
            if (!isNumeric(rightType)) this.pushError(`Operador '${op}' requiere operandos numéricos, se obtuvo '${rightType}'.`, node);
            return 'bool';
        }
        if (op === '==' || op === '!=') {
            if (!this.canAssignType(leftType, rightType) && !this.canAssignType(rightType, leftType)) {
                this.pushError(`No se pueden comparar '${leftType}' y '${rightType}' con '${op}'.`, node);
            }
            return 'bool';
        }
        if (op === '&&' || op === '||') {
            if (leftType !== 'bool')  this.pushError(`Operador '${op}' requiere operandos booleanos, se obtuvo '${leftType}'.`, node);
            if (rightType !== 'bool') this.pushError(`Operador '${op}' requiere operandos booleanos, se obtuvo '${rightType}'.`, node);
            return 'bool';
        }
        if (op === '+') {
            if (leftType === 'string' || rightType === 'string') return 'string';
            const r = promoteNumeric(leftType, rightType);
            if (!r) { this.pushError(`Operador '+' no aplicable a '${leftType}' y '${rightType}'.`, node); return 'error'; }
            return r;
        }
        if (['-', '*', '/', '%'].includes(op)) {
            if (op === '-' && leftType === 'ptr' && rightType === 'ptr') return 'int';
            if (op === '%') {
                if (!isIntegerType(leftType))  { this.pushError(`Operador '%' requiere operandos enteros, se obtuvo '${leftType}'.`, node); return 'error'; }
                if (!isIntegerType(rightType)) { this.pushError(`Operador '%' requiere operandos enteros, se obtuvo '${rightType}'.`, node); return 'error'; }
            }
            const r = promoteNumeric(leftType, rightType);
            if (!r) { this.pushError(`Operador '${op}' requiere operandos numéricos, se obtuvo '${leftType}' y '${rightType}'.`, node); return 'error'; }
            return r;
        }
        if (['&', '|', '^', '<<', '>>'].includes(op)) {
            if (!isIntegerType(leftType))  { this.pushError(`Operador '${op}' requiere operandos enteros, se obtuvo '${leftType}'.`, node); return 'error'; }
            if (!isIntegerType(rightType)) { this.pushError(`Operador '${op}' requiere operandos enteros, se obtuvo '${rightType}'.`, node); return 'error'; }
            return promoteNumeric(leftType, rightType);
        }
        return 'any';
    }

    analyzeBinaryOp(node) {
        const leftType = this.visitNode(node.left);
        const rightType = this.visitNode(node.right);
        return this.applyBinaryOp(node.op, leftType, rightType, node);
    }

    analyzeUnaryOp(node) {
        const operandType = this.visitNode(node.operand);
        if (!node.op) return operandType;
        if (node.op === '!') {
            if (operandType !== 'bool' && operandType !== 'any' && operandType !== 'error') {
                this.pushError(`Operador '!' requiere un operando booleano, se obtuvo '${operandType}'.`, node);
                return 'error';
            }
            return 'bool';
        }
        if (node.op === '~') {
            if (!isIntegerType(operandType) && operandType !== 'any' && operandType !== 'error') {
                this.pushError(`Operador '~' requiere un operando entero, se obtuvo '${operandType}'.`, node);
                return 'error';
            }
            return operandType;
        }
        if (node.op === '-' || node.op === '+') {
            if (!isNumeric(operandType) && operandType !== 'any' && operandType !== 'error') {
                this.pushError(`Operador '${node.op}' requiere un operando numérico, se obtuvo '${operandType}'.`, node);
                return 'error';
            }
            if (node.op === '-' && operandType === 'uint64') return 'int64';
            return operandType;
        }
        return operandType;
    }

    analyzeTernary(node) {
        const condType = this.visitNode(node.condition);
        if (condType && condType !== 'error' && condType !== 'bool' && condType !== 'any') {
            this.pushError(`La condición del operador '?:' debe ser de tipo 'bool', se obtuvo '${condType}'.`, node.condition);
        }
        const thenType = this.visitNode(node.thenExpr);
        const elseType = this.visitNode(node.elseExpr);
        if (thenType === 'error' || elseType === 'error') return 'error';
        if (thenType === 'any' || elseType === 'any') return 'any';
        if (thenType === elseType) return thenType;
        if (thenType === 'null') return elseType;
        if (elseType === 'null') return thenType;

        const promoted = promoteNumeric(thenType, elseType);
        if (promoted) return promoted;

        if (this.canAssignType(thenType, elseType)) return thenType;
        if (this.canAssignType(elseType, thenType)) return elseType;

        this.pushError(`Las ramas del operador '?:' tienen tipos incompatibles: '${thenType}' y '${elseType}'.`, node);
        return 'error';
    }

    analyzeCastExpr(node) {
        const fromType = this.visitNode(node.expr);
        const toType = node.targetType;
        if (fromType === 'error') return 'error';
        if (isNumeric(fromType) && isNumeric(toType)) return toType;
        const reinterp = (t) => t === 'ptr' || t === 'string' || t === 'int';
        if (reinterp(fromType) && reinterp(toType)) return toType;
        this.pushError(`Cast '${fromType} as ${toType}' inválido.`, node);
        return 'error';
    }

    containsThis(node) {
        if (!node || typeof node !== 'object') return false;
        if (Array.isArray(node)) return node.some(c => this.containsThis(c));
        if (node.kind === 'ThisExpr') return true;
        if (node.kind === 'LambdaExpr') return false;
        for (const key of Object.keys(node)) {
            if (key === 'line' || key === 'column' || key === 'kind' || key.startsWith('_')) continue;
            const child = node[key];
            if (child && typeof child === 'object' && this.containsThis(child)) return true;
        }
        return false;
    }

    collectLambdaIdents(node, used, declared) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const child of node) this.collectLambdaIdents(child, used, declared);
            return;
        }
        if (node.kind === 'VarDecl') {
            declared.add(node.name);
            if (node.value) this.collectLambdaIdents(node.value, used, declared);
            return;
        }
        if (node.kind === 'Identifier') {
            used.add(node.name);
            return;
        }
        if (node.kind === 'LambdaExpr') return;
        for (const key of Object.keys(node)) {
            if (key === 'line' || key === 'column' || key === 'kind' || key.startsWith('_')) continue;
            const child = node[key];
            if (child && typeof child === 'object') this.collectLambdaIdents(child, used, declared);
        }
    }

    isCapturableType(t) {
        if (!t) return false;
        if (t === 'int' || t === 'int64' || t === 'float' || t === 'double' ||
            t === 'bool' || t === 'char' || t === 'uint8' || t === 'uint16' ||
            t === 'uint32' || t === 'uint64' || t === 'ptr' || t === 'string') return true;
        if (isFnPtrType(t)) return true;
        const sym = this.lookupClassByFullName(this.resolveTypeName(t));
        if (sym && sym.kind === 'EnumDecl') return true;
        if (sym && sym.kind === 'ClassDecl' && !sym.isStruct) return true;
        return false;
    }

    analyzeLambdaExpr(node) {
        const paramTypes = node.params.map(p => p.type || 'any');
        const paramNames = new Set(node.params.map(p => p.name));

        const savedMethod = this.currentMethod;
        const savedScope  = this.currentScope;
        const savedLoop   = this.loopDepth;
        const savedSwitch = this.switchDepth;

        const used = new Set();
        const declared = new Set();
        this.collectLambdaIdents(node.body, used, declared);

        const usesThis = this.containsThis(node.body);
        const captures = [];
        let validThis = false;

        if (usesThis) {
            const thisInScope = this.lookupLocalOnly('this');
            if (thisInScope) {
                captures.push({ name: 'this', type: this.currentClass.name });
                validThis = true;
            } else if (!this.currentClass) {
                this.pushError(`'this' usado en lambda fuera de una clase.`, node);
            } else if (savedMethod && savedMethod.isStatic) {
                this.pushError(`'this' no puede usarse dentro de un método 'static'.`, node);
            } else {
                captures.push({ name: 'this', type: this.currentClass.name });
                validThis = true;
            }
        }

        for (const name of used) {
            if (paramNames.has(name)) continue;
            if (declared.has(name)) continue;

            const local = this.lookupLocalOnly(name);
            if (local) {
                const t = local.type || 'any';
                if (!this.isCapturableType(t)) {
                    this.pushError(`No se puede capturar '${name}' de tipo '${t}' en lambda (usa primitivos, string, ptr, enum, class o fn).`, node);
                    continue;
                }
                captures.push({ name, type: t });
                continue;
            }

            if (this.currentClass) {
                const found = this.lookupField(this.currentClass.sym, name);
                if (found && !found.member.isStatic && found.member.kind === 'FieldDecl') {
                    const t = found.member.type || 'any';
                    if (!this.isCapturableType(t)) {
                        this.pushError(`No se puede capturar '${name}' de tipo '${t}' en lambda (usa primitivos, string, ptr, enum, class o fn).`, node);
                        continue;
                    }
                    captures.push({ name, type: t });
                    continue;
                }
                if (found) continue;
            }

            const globalSym = this.resolveQualified([name]) || this.resolveQualifiedFrom(this.globalScope, [name]);
            if (globalSym) continue;

            let foundAsFn = false;
            for (const [, clsSym] of this.globalScope.symbols) {
                if (clsSym.kind === 'ClassDecl' && clsSym.scope && !clsSym.isBuiltin) {
                    if (this.lookupMethods(clsSym, name).some(c => c.member.isStatic && c.member.hasBody)) {
                        foundAsFn = true;
                        break;
                    }
                }
            }
            if (foundAsFn) continue;

            this.pushError(`Identificador '${name}' usado en lambda no está declarado.`, node);
        }
        node._captures = captures;

        const lambdaScope = new Scope(this.currentScope, 'method');
        this.currentScope = lambdaScope;
        const tempMethod = {
            name: '<lambda>',
            returnType: 'any',
            isStatic: !validThis,
            _inferredReturn: null,
            _isLambda: true,
        };
        this.currentMethod = tempMethod;
        this.loopDepth = 0;
        this.switchDepth = 0;

        try {
            for (const p of node.params) {
                if (lambdaScope.lookupCurrent(p.name)) {
                    this.pushError(`Parámetro duplicado '${p.name}' en lambda.`, p);
                } else {
                    lambdaScope.define(p.name, { kind: 'Parameter', type: p.type || 'any', isConst: p.isConst || false });
                }
            }
            for (const c of captures) {
                lambdaScope.define(c.name, { kind: 'Capture', type: c.type });
            }
            if (node.body) this.visitNode(node.body);

            const retType = tempMethod._inferredReturn || 'void';
            const fnPtrType = `fn(${paramTypes.join(',')})->${retType}`;
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
            if (local.kind === 'ClassDecl') return local.name;
            return local.type || 'any';
        }
        if (this.currentClass) {
            const found = this.lookupMember(this.currentClass.sym, name);
            if (found) {
                if (!this.isAccessible(found.member, found.owner)) {
                    this.pushError(`El miembro '${name}' de la clase '${found.owner.name}' es '${found.member.visibility || 'private'}' y no es accesible desde ${this.describeContext()}.`, node);
                    return 'error';
                }
                if (!this.checkStaticAccess(found.member, name, node)) return 'error';
                if (found.member.kind === 'MethodDecl' && found.member.isStatic && found.member.hasBody) {
                    return `fn(${found.member.paramTypes.join(',')})->${found.member.returnType}`;
                }
                return found.member.type || 'any';
            }
        }

        let resolvedParts = [name];
        if (!name.includes('::')) {
            for (const ns of this.usingWildcards) {
                const candidateParts = [ns, name];
                const symCandidate = this.resolveQualified(candidateParts) || this.resolveQualifiedFrom(this.globalScope, candidateParts);
                if (symCandidate) {
                    resolvedParts = candidateParts;
                    break;
                }
            }
        } else {
            resolvedParts = name.split('::');
        }

        const sym = this.resolveQualified(resolvedParts) || this.resolveQualifiedFrom(this.globalScope, resolvedParts);
        if (sym) {
            if (sym.kind === 'ClassDecl' || sym.kind === 'EnumDecl') return sym.name;
            if (sym.kind === 'NamespaceDecl') {
                this.pushError(`'${name}' es un namespace, no un valor.`, node);
                return 'error';
            }
            if (sym.kind === 'MethodDecl' && sym.isStatic && sym.hasBody) {
                return `fn(${sym.paramTypes.join(',')})->${sym.returnType}`;
            }
            return sym.type || 'any';
        }

        for (const [, clsSym] of this.globalScope.symbols) {
            if (clsSym.kind === 'ClassDecl' && clsSym.scope && !clsSym.isBuiltin) {
                const methods = this.lookupMethods(clsSym, name);
                const m = methods.find(c => c.member.isStatic && c.member.hasBody);
                if (m) return `fn(${m.member.paramTypes.join(',')})->${m.member.returnType}`;
            }
        }

        this.pushError(`Uso de variable o identificador no declarado '${node.name}'.`, node);
        return 'error';
    }
}// ensureSpecializedClass(baseName, args) {