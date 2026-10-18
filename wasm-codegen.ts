// wasm-codegen.ts
import { ModuleBuilder, FunctionIRBuilder, StringPool } from './compiler';
import {
    injectAllocator, injectStringRuntime, injectWasiRuntime,
    injectIntToString, injectFloatToString, injectI64ToString,
    injectU64ToString,
    injectHeapStringConv, injectLocalArena,
    injectReadLine, injectParseInt,
    injectFileIO,
    type AllocatorRefs,
} from './wasm-runtime';

type RetWasm = 'i32' | 'i64' | 'f32' | 'f64' | 'void';
type WasmPrim = 'i32' | 'i64' | 'f32' | 'f64';

interface MethodInfo {
    wasmName: string;
    isStatic: boolean;
    isVirtual: boolean;
    hasBody: boolean;
    paramCount: number;
    retType: RetWasm;
    retTypeName: string;
    paramTypes: string[];
    virtualSlot?: number;
}

interface CtorInfo {
    wasmName: string;
    paramTypes: string[];
}

interface ClassInfo {
    name: string;
    isStruct: boolean;
    isInterface: boolean;
    baseName: string | null;
    sizeof: number;
    isPolymorphic: boolean;
    typeTag: number;
    tagOffset: number;
    fields: Map<string, { offset: number; type: string; isConst: boolean }>;
    statics: Map<string, { globalName: string; type: string }>;
    methods: Map<string, MethodInfo>;   // key = sig (name#paramCount#types)
    ctors: Map<string, CtorInfo>;       // key = __ctor_N_types
    dtor?: string;
    clinit?: string;
    virtualSlots: Map<string, number>;
    node: any;
}

interface EnumMember { address: number; ordinal: number; }
interface EnumInfo { name: string; members: Map<string, EnumMember>; base: number; totalSize: number; }
interface ImportedFunc { wasmModule: string; wasmName: string; alias: string; paramTypes: string[]; returnType: string; }
interface StackAlloc { localIndex: number; type: string; }
interface CaptureInfo { type: string; offset: number; size: number; align: number; }

export class WasmCodeGen {
    mod = new ModuleBuilder();
    classInfo = new Map<string, ClassInfo>();
    enumInfo = new Map<string, EnumInfo>();
    importedFunctions = new Map<string, ImportedFunc>();

    usingAliases = new Map<string, string>();
    usingWildcards: string[] = [];

    allocator: AllocatorRefs;
    strEq!: string;
    wasiWriteBuf!: string;
    i32ToStr!: string;
    i64ToStr!: string;
    u64ToStr!: string;
    stringPool: StringPool;
    emittedHelpers = new Set<string>();
    f64ToStr!: string;
    i32ToHeapStr!: string;
    f64ToHeapStr!: string;
    i64ToHeapStr!: string;
    u64ToHeapStr!: string;
    localArenaTop!: string;
    readLineFn!: string;
    parseIntFn!: string;
    fileIO!: {
        fsOpenRead: string;
        fsOpenWrite: string;
        fsReadAll: string;
        fsWriteStr: string;
        fsExists: string;
    };

    curFn: FunctionIRBuilder | null = null;
    curClass: string | null = null;
    curRetType: RetWasm = 'void';
    curRetTypeName: string = 'void';
    locals = new Map<string, { index: number; type: string }>();
    tmpCounter = 0;
    breakStack: string[][] = [];
    continueStack: string[][] = [];

    larenaSavedIndex: number | null = null;
    stackAllocs: StackAlloc[] = [];

    captures = new Map<string, CaptureInfo>();
    envLocalIdx = -1;

    private enumNextAddress = 0;
    private computedLayouts = new Set<string>();

    private nextTypeTag = 0;
    private totalVirtualSlots = 0;
    private virtualSlotsBySig = new Map<string, number>();

    private funcTableIndex = new Map<string, number>();
    private lambdaCounter = 0;
    private lambdaEmitted = new Set<string>();
    private tableFuncNames = new Set<string>();

    private staticClosureAddr = new Map<string, number>();
    private nextStaticClosureAddr = 0;

    static readonly MEM_PAGES = 20;
    static readonly LOCAL_ARENA_START = 0x10000;
    static readonly ENUM_BASE = 0x20000;
    static readonly ENUM_LIMIT = 0x28000;
    static readonly VTABLE_BASE = 0x28000;
    static readonly VTABLE_STRIDE = 256;
    static readonly VTABLE_MAX_CLASSES = 128;
    static readonly VTABLE_LIMIT = WasmCodeGen.VTABLE_BASE + WasmCodeGen.VTABLE_STRIDE * WasmCodeGen.VTABLE_MAX_CLASSES;
    static readonly HEAP_START = 0x30000;
    static readonly HEAP_LIMIT = 0x120000;
    static readonly STATIC_CLOSURE_BASE = 0x120000;
    static readonly STATIC_CLOSURE_LIMIT = 0x140000;

    static readonly IOV_SCRATCH      = 512;
    static readonly NWRITTEN_SCRATCH = 520;
    static readonly NL_OFFSET        = 524;
    static readonly SPACE_OFFSET     = 525;
    static readonly INT_BUF_OFFSET   = 528;
    static readonly I64_REV_OFFSET   = 592;

    builtinReturnTypes: Record<string, string> = {
        'Unsafe.pointer.read8':   'int',  'Unsafe.pointer.read16':  'int',
        'Unsafe.pointer.read32':  'int',  'Unsafe.pointer.read64':  'int64',
        'Unsafe.pointer.write8':  'void', 'Unsafe.pointer.write16': 'void',
        'Unsafe.pointer.write32': 'void', 'Unsafe.pointer.write64': 'void',
        'Unsafe.pointer.offset':  'ptr',  'Unsafe.pointer.isNull':  'bool',
        'Unsafe.memory.alloc':    'ptr',  'Unsafe.memory.realloc': 'ptr',
        'Unsafe.memory.free':    'void',  'Unsafe.memory.set':     'void',
        'Unsafe.memory.copy':    'void',  'Unsafe.memory.compare': 'int',
        'System.readLine': 'string', 'System.wasi.readLine': 'string',
        'System.readInt':  'int',    'System.wasi.readInt':  'int',
        'Math.abs': 'double', 'Math.sqrt': 'double',
        'Math.floor': 'double', 'Math.ceil': 'double',
        'Math.round': 'double', 'Math.trunc': 'double',
        'Math.min': 'double', 'Math.max': 'double', 'Math.copysign': 'double',
        'File.readAll': 'string',
        'File.writeAll': 'bool',
        'File.append': 'bool',
        'File.exists': 'bool',
    };

    constructor() {
        this.mod.addMemory(WasmCodeGen.MEM_PAGES, 256);
        this.mod.addExport('memory', 'memory', 0);
        this.mod.addFunctionImportAlias('wasi_snapshot_preview1', 'proc_exit', 'proc_exit', ['i32'], null);
        this.mod.addFunctionImportAlias('wasi_snapshot_preview1', 'fd_write', 'wasi_fd_write', ['i32', 'i32', 'i32', 'i32'], 'i32');
        this.mod.addFunctionImportAlias('wasi_snapshot_preview1', 'fd_read', 'wasi_fd_read', ['i32', 'i32', 'i32', 'i32'], 'i32');
        this.mod.addFunctionImportAlias('wasi_snapshot_preview1', 'path_open', 'wasi_path_open',
            ['i32', 'i32', 'i32', 'i32', 'i32', 'i64', 'i64', 'i32', 'i32'], 'i32');
        this.mod.addFunctionImportAlias('wasi_snapshot_preview1', 'fd_close', 'wasi_fd_close', ['i32'], 'i32');
        this.mod.addFunctionImportAlias('wasi_snapshot_preview1', 'fd_seek', 'wasi_fd_seek',
            ['i32', 'i64', 'i32', 'i32'], 'i32');

        this.mod.addDataSegment(WasmCodeGen.IOV_SCRATCH, new Array(13).fill(0));
        this.mod.addDataSegment(WasmCodeGen.NL_OFFSET, [0x0A]);
        this.mod.addDataSegment(WasmCodeGen.SPACE_OFFSET, [0x20]);
        this.mod.addDataSegment(WasmCodeGen.INT_BUF_OFFSET, new Array(96).fill(0));

        this.stringPool = this.mod.getStringPool(1024);
        this.allocator = injectAllocator(this.mod, WasmCodeGen.HEAP_START, WasmCodeGen.HEAP_LIMIT);
        this.strEq = injectStringRuntime(this.mod).strEq;
        this.wasiWriteBuf = injectWasiRuntime(this.mod, WasmCodeGen.IOV_SCRATCH, WasmCodeGen.NWRITTEN_SCRATCH, 'wasi_fd_write').writeBuf;
        this.i32ToStr = injectIntToString(this.mod, WasmCodeGen.INT_BUF_OFFSET).i32ToStr;
        this.f64ToStr = injectFloatToString(this.mod, WasmCodeGen.INT_BUF_OFFSET).f64ToStr;
        this.i64ToStr = injectI64ToString(this.mod, WasmCodeGen.INT_BUF_OFFSET, WasmCodeGen.I64_REV_OFFSET).i64ToStr;
        this.u64ToStr = injectU64ToString(this.mod, WasmCodeGen.INT_BUF_OFFSET, WasmCodeGen.I64_REV_OFFSET).u64ToStr;
        const heapRt = injectHeapStringConv(
            this.mod, WasmCodeGen.INT_BUF_OFFSET,
            this.i32ToStr, this.f64ToStr, this.i64ToStr, this.u64ToStr,
            this.allocator.malloc,
        );
        this.i32ToHeapStr = heapRt.i32ToHeap;
        this.f64ToHeapStr = heapRt.f64ToHeap;
        this.i64ToHeapStr = heapRt.i64ToHeap;
        this.u64ToHeapStr = heapRt.u64ToHeap;
        this.localArenaTop = injectLocalArena(this.mod, WasmCodeGen.LOCAL_ARENA_START).arenaTop;

        const rlRt = injectReadLine(this.mod, this.allocator.malloc, this.allocator.free, 'wasi_fd_read');
        this.readLineFn = rlRt.readLine;
        this.parseIntFn = injectParseInt(this.mod).parseInt;

        this.fileIO = injectFileIO(
            this.mod,
            this.allocator.malloc,
            this.allocator.free,
            'wasi_fd_read',
            'wasi_fd_write',
            'wasi_path_open',
            'wasi_fd_close',
            'wasi_fd_seek',
        );

        this.enumNextAddress = WasmCodeGen.ENUM_BASE;
    }

    // ─── Sig helpers ───────────────────────────────────────────────
    private methodSig(name: string, paramTypes: string[]): string {
        return `${name}#${paramTypes.length}#${paramTypes.join(',')}`;
    }

    private ctorSig(paramTypes: string[]): string {
        return `__ctor_${paramTypes.length}_${paramTypes.join(',')}`;
    }

    private sigToWasmSuffix(types: string[]): string {
        if (types.length === 0) return `0`;
        return `${types.length}$${types.map(t => t.replace(/[^a-zA-Z0-9_]/g, '_')).join('$')}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ NUEVO ═══: sanitiza identificadores para nombres wasm.
    // Convierte "Box<int>" → "Box_lt_int_gt". Necesario porque los
    // nombres de función/global wasm no pueden contener '<', '>', ','
    // ni espacios, y las herramientas estándar lo rechazan.
    // ═══════════════════════════════════════════════════════════════
    private sanitizeIdent(name: string): string {
        return name.replace(/[<>,\s]/g, (c) => ({
            '<': '_lt_', '>': '_gt_', ',': '_', ' ': '_',
        })[c] ?? '_');
    }

    private findMethodByName(ci: ClassInfo, name: string): MethodInfo | null {
        for (const [sig, m] of ci.methods) {
            if (typeof sig === 'string' && sig.startsWith(name + '#')) return m;
        }
        return null;
    }

    private findStaticMethod(ci: ClassInfo, name: string): MethodInfo | null {
        for (const [sig, m] of ci.methods) {
            if (typeof sig === 'string' && sig.startsWith(name + '#') && m.isStatic) return m;
        }
        return null;
    }

    private findCtorForArgCount(ci: ClassInfo, argCount: number): CtorInfo | null {
        const prefix = `__ctor_${argCount}_`;
        for (const [sig, c] of ci.ctors) {
            if (typeof sig === 'string' && sig.startsWith(prefix)) return c;
        }
        return null;
    }

    // ─── Resolución de nombres ─────────────────────────────────────
    private resolveClassNameForStatic(name: string): string | null {
        if (this.classInfo.has(name)) return name;
        if (this.usingAliases.has(name)) {
            const a = this.usingAliases.get(name)!;
            if (this.classInfo.has(a)) return a;
        }
        for (const ns of this.usingWildcards) {
            const c = `${ns}::${name}`;
            if (this.classInfo.has(c)) return c;
        }
        return null;
    }

    private resolveEnumName(name: string): string | null {
        if (this.enumInfo.has(name)) return name;
        if (this.usingAliases.has(name)) {
            const a = this.usingAliases.get(name)!;
            if (this.enumInfo.has(a)) return a;
        }
        for (const ns of this.usingWildcards) {
            const c = `${ns}::${name}`;
            if (this.enumInfo.has(c)) return c;
        }
        return null;
    }

    private resolveEnumMember(node: any): { enumName: string; member: EnumMember } | null {
        if (!node || node.kind !== 'MemberAccess') return null;
        if (node.object.kind !== 'Identifier') return null;
        if (this.locals.has(node.object.name)) return null;
        const enumName = this.resolveEnumName(node.object.name);
        if (!enumName) return null;
        const ei = this.enumInfo.get(enumName)!;
        const member = ei.members.get(node.property);
        if (!member) return null;
        return { enumName, member };
    }

    private resolveStaticMember(node: any, resolvedSig?: string | null): { ci: ClassInfo; kind: 'field' | 'method'; fieldInfo?: { globalName: string; type: string }; methodInfo?: MethodInfo } | null {
        if (!node || node.kind !== 'MemberAccess') return null;

        // 1) Clase por nombre: `Clase.miembro`
        if (node.object.kind === 'Identifier' && !this.locals.has(node.object.name)) {
            const clsName = this.resolveClassNameForStatic(node.object.name);
            if (clsName) {
                const ci = this.classInfo.get(clsName)!;
                if (ci.statics.has(node.property)) {
                    return { ci, kind: 'field', fieldInfo: ci.statics.get(node.property) };
                }
                let m: MethodInfo | null = null;
                if (resolvedSig) {
                    const candidate = ci.methods.get(resolvedSig) || null;
                    // FIX: solo aceptar el candidato si es estático
                    if (candidate && candidate.isStatic) m = candidate;
                }
                if (!m) m = this.findStaticMethod(ci, node.property);
                if (m) return { ci, kind: 'method', methodInfo: m };
            }
        }

        // 2) this: `this.miembro` (solo estáticos resuelven como "estático")
        if (node.object.kind === 'ThisExpr' && this.curClass) {
            const ci = this.classInfo.get(this.curClass);
            if (ci) {
                if (ci.statics.has(node.property)) return { ci, kind: 'field', fieldInfo: ci.statics.get(node.property) };
                let m: MethodInfo | null = null;
                if (resolvedSig) {
                    const candidate = ci.methods.get(resolvedSig) || null;
                    // FIX
                    if (candidate && candidate.isStatic) m = candidate;
                }
                if (!m) m = this.findStaticMethod(ci, node.property);
                if (m) return { ci, kind: 'method', methodInfo: m };
            }
        }

        // 3) Objeto tipado: `obj.miembro` — solo resolver aquí si el miembro
        //    resuelto es realmente estático. En otro caso dejar que la rama
        //    de instancia (más abajo en emitExpr) haga la llamada correcta.
        const objT = this.getExprType(node.object);
        if (objT && this.classInfo.has(objT)) {
            const ci = this.classInfo.get(objT)!;
            if (ci.statics.has(node.property)) return { ci, kind: 'field', fieldInfo: ci.statics.get(node.property) };
            let m: MethodInfo | null = null;
            if (resolvedSig) {
                const candidate = ci.methods.get(resolvedSig) || null;
                // FIX CRÍTICO: si el método es de instancia NO devolverlo aquí
                if (candidate && candidate.isStatic) m = candidate;
            }
            if (!m) m = this.findStaticMethod(ci, node.property);
            if (m) return { ci, kind: 'method', methodInfo: m };
        }
        return null;
    }

    private isEnumType(t: string | null): boolean {
        if (!t) return false;
        return this.enumInfo.has(this.resolveTypeName(t));
    }

    private isFnPtrType(t: string | null): boolean {
        return !!t && t.startsWith('fn(') && t.includes(')->');
    }
    private parseFnPtrType(t: string): { params: string[]; ret: string } | null {
        const m = /^fn\(([^)]*)\)->(.+)$/.exec(t);
        if (!m) return null;
        const params = m[1] === '' ? [] : m[1].split(',');
        return { params, ret: m[2] };
    }

    private numInfoType(t: string): { bits: number; signed: boolean; isFloat: boolean } | null {
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

    private promoteNumericType(a: string, b: string): string | null {
        if (a === 'double' || b === 'double') return 'double';
        if (a === 'float'  || b === 'float')  return 'float';
        const ia = this.numInfoType(a), ib = this.numInfoType(b);
        if (!ia || !ib) return null;
        const bits = Math.max(ia.bits, ib.bits);
        const signed = ia.signed && ib.signed;
        if (bits === 8)  return signed ? 'char' : 'uint8';
        if (bits === 16) return signed ? 'int'  : 'uint16';
        if (bits === 32) return signed ? 'int'  : 'uint32';
        return signed ? 'int64' : 'uint64';
    }

    private coerce(b: FunctionIRBuilder, fromType: string | null, toType: string) {
        if (!fromType) return;
        const from = this.resolveTypeName(fromType);
        const to = this.resolveTypeName(toType);
        if (from === to) return;
        if (this.isEnumType(from) || this.isEnumType(to)) return;
        if (this.isFnPtrType(from) || this.isFnPtrType(to)) return;
        if (!this.numInfoType(from) || !this.numInfoType(to)) return;

        const isF32 = (x: string) => x === 'float';
        const isF64 = (x: string) => x === 'double';
        const isI64 = (x: string) => x === 'int64' || x === 'uint64';

        if (isF32(to)) {
            if (isF32(from)) return;
            if (isF64(from)) { b.f32DemoteF64(); return; }
            if (isI64(from)) {
                if (this.isUnsignedType(from)) b.f32ConvertI64U(); else b.f32ConvertI64S();
                return;
            }
            if (this.isUnsignedType(from)) b.f32ConvertI32U(); else b.f32ConvertI32S();
            return;
        }
        if (isF64(to)) {
            if (isF64(from)) return;
            if (isF32(from)) { b.f64PromoteF32(); return; }
            if (isI64(from)) {
                if (this.isUnsignedType(from)) b.f64ConvertI64U(); else b.f64ConvertI64S();
                return;
            }
            if (this.isUnsignedType(from)) b.f64ConvertI32U(); else b.f64ConvertI32S();
            return;
        }
        if (isI64(to)) {
            if (isI64(from)) return;
            if (isF32(from)) {
                if (this.isUnsignedType(to)) b.i64TruncF32U(); else b.i64TruncF32S();
                return;
            }
            if (isF64(from)) {
                if (this.isUnsignedType(to)) b.i64TruncF64U(); else b.i64TruncF64S();
                return;
            }
            if (this.isUnsignedType(from)) b.i64ExtendI32U(); else b.i64ExtendI32S();
            return;
        }
        if (isF32(from)) {
            if (this.isUnsignedType(to)) b.i32TruncF32U(); else b.i32TruncF32S();
            return;
        }
        if (isF64(from)) {
            if (this.isUnsignedType(to)) b.i32TruncF64U(); else b.i32TruncF64S();
            return;
        }
        if (isI64(from)) {
            b.i32WrapI64();
            return;
        }
    }

    private emitExprCoerced(b: FunctionIRBuilder, node: any, targetType: string | null) {
        const fromType = this.getExprType(node);
        this.emitExpr(b, node);
        if (targetType) this.coerce(b, fromType, targetType);
    }

    private emitCast(b: FunctionIRBuilder, fromType: string | null, toType: string) {
        if (!fromType) return;
        const f = this.resolveTypeName(fromType);
        const t = this.resolveTypeName(toType);
        if (f === t) return;

        const reinterp = (x: string) => x === 'ptr' || x === 'string' || x === 'int';
        if (reinterp(f) && reinterp(t)) return;

        const isF32 = (x: string) => x === 'float';
        const isF64 = (x: string) => x === 'double';
        const isI64 = (x: string) => x === 'int64' || x === 'uint64';

        if (isF32(t)) {
            if (isF32(f)) return;
            if (isF64(f)) { b.f32DemoteF64(); return; }
            if (isI64(f)) { if (this.isUnsignedType(f)) b.f32ConvertI64U(); else b.f32ConvertI64S(); return; }
            if (this.isUnsignedType(f)) b.f32ConvertI32U(); else b.f32ConvertI32S();
            return;
        }
        if (isF64(t)) {
            if (isF64(f)) return;
            if (isF32(f)) { b.f64PromoteF32(); return; }
            if (isI64(f)) { if (this.isUnsignedType(f)) b.f64ConvertI64U(); else b.f64ConvertI64S(); return; }
            if (this.isUnsignedType(f)) b.f64ConvertI32U(); else b.f64ConvertI32S();
            return;
        }
        if (isI64(t)) {
            if (isI64(f)) return;
            if (isF32(f)) { if (this.isUnsignedType(t)) b.i64TruncF32U(); else b.i64TruncF32S(); return; }
            if (isF64(f)) { if (this.isUnsignedType(t)) b.i64TruncF64U(); else b.i64TruncF64S(); return; }
            if (this.isUnsignedType(f)) b.i64ExtendI32U(); else b.i64ExtendI32S();
            return;
        }
        if (isF32(f)) { if (this.isUnsignedType(t)) b.i32TruncF32U(); else b.i32TruncF32S(); return; }
        if (isF64(f)) { if (this.isUnsignedType(t)) b.i32TruncF64U(); else b.i32TruncF64S(); return; }
        if (isI64(f)) { b.i32WrapI64(); return; }
    }

    private toWasmType(t: string): WasmPrim {
        const r = this.resolveTypeName(t);
        if (r === 'float') return 'f32';
        if (r === 'double') return 'f64';
        if (r === 'int64' || r === 'uint64') return 'i64';
        return 'i32';
    }

    private registerImport(modArg: string, nameArg: string, alias: string, params: string[], returns: string[]): void {
        if (this.importedFunctions.has(alias)) return;
        const wasmParams = params.map(p => this.toWasmType(p));
        const wasmRet = returns.length > 0 ? this.toWasmType(returns[0]) : null;
        this.mod.addFunctionImportAlias(modArg, nameArg, alias, wasmParams as any, wasmRet);
        this.importedFunctions.set(alias, {
            wasmModule: modArg, wasmName: nameArg, alias,
            paramTypes: params, returnType: returns[0] || 'void',
        });
    }

    private preScanImports(nodes: any[]): void {
        for (const node of nodes) {
            if (node.kind === 'NamespaceDecl') {
                this.preScanImports(node.body);
            } else if (node.kind === 'ClassDecl') {
                for (const m of node.members) {
                    if ((m.kind === 'MethodDecl' || m.kind === 'ConstructorDecl' || m.kind === 'DestructorDecl') && m.body) {
                        this.preScanStmtImports(m.body);
                    }
                }
            }
        }
    }

    private preScanStmtImports(node: any): void {
        if (!node) return;
        if (node.kind === 'BeginEnd') {
            for (const s of node.statements) this.preScanStmtImports(s);
        } else if (node.kind === 'ExprStatement') {
            if (node.expr && node.expr.kind === 'Call') {
                const path = this.pathOf(node.expr.callee);
                if (path === 'System.wasi.Import') this.tryRegisterImport(node.expr.args);
            }
        } else if (node.kind === 'If') {
            for (const b of node.branches) this.preScanStmtImports(b.thenStmt);
            this.preScanStmtImports(node.elseStmt);
        } else if (node.kind === 'While') this.preScanStmtImports(node.body);
        else if (node.kind === 'For') this.preScanStmtImports(node.body);
        else if (node.kind === 'Switch') {
            for (const c of node.cases) for (const s of c.statements) this.preScanStmtImports(s);
        }
    }

    private tryRegisterImport(args: any[]): boolean {
        if (args.length !== 5) return false;
        const [modArg, nameArg, aliasArg, paramsArg, returnsArg] = args;
        if (modArg.kind !== 'StringLiteral' || nameArg.kind !== 'StringLiteral' || aliasArg.kind !== 'StringLiteral') return false;
        if (paramsArg.kind !== 'ArrayLiteral' || returnsArg.kind !== 'ArrayLiteral') return false;
        const extract = (arr: any) => arr.elements
            .filter((e: any) => e.kind === 'StringLiteral' || e.kind === 'Identifier')
            .map((e: any) => e.kind === 'StringLiteral' ? e.value : e.name);
        this.registerImport(modArg.value, nameArg.value, aliasArg.value, extract(paramsArg), extract(returnsArg));
        return true;
    }

    private captureSizeAndAlign(t: string): { size: number; align: number } {
        const wasm = this.wasmType(t);
        if (wasm === 'i64' || wasm === 'f64') return { size: 8, align: 8 };
        return { size: 4, align: 4 };
    }

    private getStaticClosureAddr(name: string, fnIdx: number): number {
        if (this.staticClosureAddr.has(name)) return this.staticClosureAddr.get(name)!;
        const addr = WasmCodeGen.STATIC_CLOSURE_BASE + this.nextStaticClosureAddr * 4;
        if (addr >= WasmCodeGen.STATIC_CLOSURE_LIMIT) throw new Error('WASM: demasiados closures estáticos');
        this.nextStaticClosureAddr++;
        this.staticClosureAddr.set(name, addr);
        this.mod.addData32(addr, fnIdx);
        return addr;
    }

    private ensureStringConcatHelper(): string {
        const helperName = '__builtin_string_concat';
        if (this.emittedHelpers.has(helperName)) return helperName;
        this.emittedHelpers.add(helperName);
        this.mod.addFunction(helperName, ['i32', 'i32'], 'i32', (builder) => {
            const s1 = 0, s2 = 1;
            const len1 = builder.addLocal('__sc_len1', 'i32');
            const len2 = builder.addLocal('__sc_len2', 'i32');
            const newLen = builder.addLocal('__sc_newlen', 'i32');
            const blockPtr = builder.addLocal('__sc_block', 'i32');
            const dest = builder.addLocal('__sc_dest', 'i32');
            const i = builder.addLocal('__sc_i', 'i32');
            const topL1 = `sc_top1_${this.tmpCounter}`;
            const endL1 = `sc_end1_${this.tmpCounter}`;
            const topL2 = `sc_top2_${this.tmpCounter}`;
            const endL2 = `sc_end2_${this.tmpCounter++}`;
            builder.getLocal(s1); builder.i32Const(4); builder.i32Sub();
            builder.i32Load(0, 2); builder.setLocal(len1);
            builder.getLocal(s2); builder.i32Const(4); builder.i32Sub();
            builder.i32Load(0, 2); builder.setLocal(len2);
            builder.getLocal(len1); builder.getLocal(len2); builder.i32Add();
            builder.setLocal(newLen);
            builder.getLocal(newLen); builder.i32Const(4); builder.i32Add();
            builder.callByName(this.allocator.malloc); builder.setLocal(blockPtr);
            builder.getLocal(blockPtr); builder.getLocal(newLen); builder.i32Store(0, 2);
            builder.getLocal(blockPtr); builder.i32Const(4); builder.i32Add();
            builder.setLocal(dest);
            builder.i32Const(0); builder.setLocal(i);
            builder.block('void', endL1);
            builder.loop('void', topL1);
                builder.getLocal(i); builder.getLocal(len1); builder.i32GeU(); builder.brIfTo(endL1);
                builder.getLocal(dest); builder.getLocal(i); builder.i32Add();
                builder.getLocal(s1); builder.getLocal(i); builder.i32Add();
                builder.i32Load8U(0, 0); builder.i32Store8(0, 0);
                builder.getLocal(i); builder.i32Const(1); builder.i32Add(); builder.setLocal(i);
                builder.brTo(topL1);
            builder.end(); builder.end();
            builder.i32Const(0); builder.setLocal(i);
            builder.block('void', endL2);
            builder.loop('void', topL2);
                builder.getLocal(i); builder.getLocal(len2); builder.i32GeU(); builder.brIfTo(endL2);
                builder.getLocal(dest); builder.getLocal(len1); builder.i32Add(); builder.getLocal(i); builder.i32Add();
                builder.getLocal(s2); builder.getLocal(i); builder.i32Add();
                builder.i32Load8U(0, 0); builder.i32Store8(0, 0);
                builder.getLocal(i); builder.i32Const(1); builder.i32Add(); builder.setLocal(i);
                builder.brTo(topL2);
            builder.end(); builder.end();
            builder.getLocal(dest); builder.return_();
        });
        return helperName;
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ CAMBIO ═══ compile: acepta `specializations` (AST nodes ya
    // sustituidos por monomorfización) y los procesa en todas las fases.
    // ═══════════════════════════════════════════════════════════════
    compile(ast: any, specializations: any[] = []): Uint8Array {
        // NUEVO: combinar cuerpo normal + especializaciones en una sola lista.
        const allBodies = [...ast.body, ...specializations];

        const collectTop = (nodes: any[], currentNs: string = '') => {
            for (const node of nodes) {
                if (node.kind === 'NamespaceDecl') {
                    const nsName = currentNs ? `${currentNs}::${node.name}` : node.name;
                    collectTop(node.body, nsName);
                } else if (node.kind === 'ClassDecl') {
                    this.registerClassShell(node, currentNs ? `${currentNs}::${node.name}` : node.name);
                } else if (node.kind === 'EnumDecl') {
                    this.registerEnum(node, currentNs ? `${currentNs}::${node.name}` : node.name);
                } else if (node.kind === 'UsingDecl') {
                    if (node.isWildcard) this.usingWildcards.push(node.name);
                    else this.usingAliases.set(node.parts[node.parts.length - 1], node.parts.join('::'));
                }
            }
        };
        const compileTop = (nodes: any[], currentNs: string = '') => {
            for (const node of nodes) {
                if (node.kind === 'NamespaceDecl') {
                    compileTop(node.body, currentNs ? `${currentNs}::${node.name}` : node.name);
                } else if (node.kind === 'ClassDecl') {
                    this.compileClass(node, currentNs ? `${currentNs}::${node.name}` : node.name);
                }
            }
        };

        // CAMBIO: todas las fases usan allBodies (incluye especializaciones).
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

    private preScanForTable(nodes: any[], currentNs: string = '') {
        for (const node of nodes) {
            if (node.kind === 'NamespaceDecl') {
                this.preScanForTable(node.body, currentNs ? `${currentNs}::${node.name}` : node.name);
            } else if (node.kind === 'ClassDecl') {
                const fullName = currentNs ? `${currentNs}::${node.name}` : node.name;
                const ci = this.classInfo.get(fullName);
                if (!ci) continue;
                for (const [, m] of ci.methods) if (m.hasBody) this.tableFuncNames.add(m.wasmName);
                for (const [, ctor] of ci.ctors) this.tableFuncNames.add(ctor.wasmName);
                if (ci.dtor) this.tableFuncNames.add(ci.dtor);

                for (const m of node.members) {
                    if ((m.kind === 'MethodDecl' || m.kind === 'ConstructorDecl' || m.kind === 'DestructorDecl') && m.body) {
                        this.collectLambdas(m.body);
                    }
                    if (m.kind === 'FieldDecl' && m.isStatic && m.value) {
                        this.collectLambdas(m.value);
                    }
                }
            }
        }
    }

    private collectLambdas(node: any) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            for (const child of node) this.collectLambdas(child);
            return;
        }
        if (node.kind === 'LambdaExpr') {
            if (!node._lambdaName) {
                node._lambdaName = `__lambda_${this.lambdaCounter++}`;
            }
            this.tableFuncNames.add(node._lambdaName);
        }
        for (const key of Object.keys(node)) {
            if (key === 'line' || key === 'column' || key === 'kind' || key.startsWith('_')) continue;
            const child = node[key];
            if (child && typeof child === 'object') this.collectLambdas(child);
        }
    }

    private createTable() {
        const nameArr: string[] = [];
        for (const n of this.tableFuncNames) {
            if (this.funcTableIndex.has(n)) continue;
            nameArr.push(n);
        }
        if (nameArr.length === 0) {
            this.mod.addTable(0);
            return;
        }
        this.mod.addTable(nameArr.length);
        for (let i = 0; i < nameArr.length; i++) {
            this.mod.addFunctionToTable(nameArr[i], i);
            this.funcTableIndex.set(nameArr[i], i);
        }
    }

    private finalizeVtables() {
        for (const [, ci] of this.classInfo) {
            if (!ci.isPolymorphic) continue;
            const vtableAddr = WasmCodeGen.VTABLE_BASE + ci.typeTag * WasmCodeGen.VTABLE_STRIDE;
            const bytes: number[] = [];
            for (let s = 0; s < this.totalVirtualSlots; s++) {
                let tableIdx = 0;
                for (const [, minfo] of ci.methods) {
                    if (minfo.virtualSlot === s && minfo.hasBody) {
                        const ti = this.funcTableIndex.get(minfo.wasmName);
                        if (ti !== undefined) tableIdx = ti;
                        break;
                    }
                }
                bytes.push(
                    tableIdx & 0xFF,
                    (tableIdx >>> 8) & 0xFF,
                    (tableIdx >>> 16) & 0xFF,
                    (tableIdx >>> 24) & 0xFF,
                );
            }
            this.mod.addDataSegment(vtableAddr, bytes);
        }
    }

    private registerClassShell(node: any, name: string) {
        this.classInfo.set(name, {
            name,
            isStruct: !!node.isStruct,
            isInterface: !!node.isInterface,
            baseName: node.base?.name || null,
            sizeof: 0,
            isPolymorphic: false,
            typeTag: -1,
            tagOffset: -1,
            fields: new Map(), statics: new Map(),
            methods: new Map(), ctors: new Map(),
            virtualSlots: new Map(),
            node,
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // ═══ CAMBIO ═══ computeClassLayout: sanitiza `name` para los wasm
    // names (campos estáticos, ctors, métodos). Los nombres originales
    // ("Box<int>") siguen usándose como key en classInfo.
    // ═══════════════════════════════════════════════════════════════
    private computeClassLayout(name: string, computing: Set<string> = new Set()): void {
        const ci = this.classInfo.get(name);
        if (!ci) return;
        if (this.computedLayouts.has(name)) return;
        if (computing.has(name)) throw new Error(`WASM: herencia circular detectada en '${name}'`);
        computing.add(name);

        // NUEVO: nombre saneado para wasm (Box<int> → Box_lt_int_gt)
        const mangled = this.sanitizeIdent(name);

        let baseCi: ClassInfo | null = null;
        let baseOffset = 0;
        if (ci.baseName) {
            const baseName = this.resolveTypeName(ci.baseName);
            if (baseName !== name) {
                this.computeClassLayout(baseName, computing);
                baseCi = this.classInfo.get(baseName) || null;
                if (!baseCi) throw new Error(`WASM: clase base '${ci.baseName}' usada por '${name}' no está registrada`);
                if (!baseCi.isInterface) {
                    baseOffset = baseCi.sizeof;
                    for (const [n, f] of baseCi.fields)   if (!ci.fields.has(n))  ci.fields.set(n, f);
                    for (const [n, s] of baseCi.statics) if (!ci.statics.has(n)) ci.statics.set(n, s);
                    for (const [sig, m] of baseCi.methods) if (!ci.methods.has(sig)) ci.methods.set(sig, m);
                    for (const [sig, c] of baseCi.ctors) if (!ci.ctors.has(sig)) ci.ctors.set(sig, c);
                    if (baseCi.dtor && !ci.dtor) ci.dtor = baseCi.dtor;
                }
            }
        }

        let ownVirtual = false;
        for (const m of ci.node.members) {
            if (m.kind !== 'MethodDecl') continue;
            if (m.isStatic) continue;
            if (m.isVirtual || m.isOverride || !m.body) { ownVirtual = true; break; }
        }
        const baseIsPoly = baseCi ? baseCi.isPolymorphic : false;
        ci.isPolymorphic = ownVirtual || baseIsPoly;

        let tagOffset = -1;
        let fieldStartOffset = baseOffset;
        if (ci.isPolymorphic) {
            if (baseIsPoly) {
                tagOffset = baseCi!.tagOffset;
                fieldStartOffset = baseOffset;
            } else {
                tagOffset = (baseOffset + 3) & ~3;
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
            if (m.kind !== 'FieldDecl') continue;
            const resolvedType = this.resolveTypeName(m.type);
            if (m.isStatic) {
                // CAMBIO: `name` → `mangled`
                const gname = `${mangled}$${m.name}`;
                const wt = this.wasmType(resolvedType);
                this.mod.addGlobal(gname, wt, true, wt === 'f64' ? 0.0 : wt === 'f32' ? 0.0 : wt === 'i64' ? 0n : 0);
                ci.statics.set(m.name, { globalName: gname, type: resolvedType });
            } else {
                const fieldCi = this.classInfo.get(resolvedType);
                if (fieldCi && fieldCi.isStruct) this.computeClassLayout(resolvedType, computing);
                const sz = this.sizeofField(resolvedType);
                offset = (offset + sz - 1) & ~(sz - 1);
                ci.fields.set(m.name, { offset, type: resolvedType, isConst: !!m.isConst });
                offset += sz;
            }
        }
        ci.sizeof = (offset + 7) & ~7;

        for (const m of ci.node.members) {
            if (m.kind === 'ConstructorDecl') {
                const pts = m.params.map((p: any) => this.resolveTypeName(p.type));
                const csig = this.ctorSig(pts);
                // CAMBIO: `name` → `mangled`
                const cname = `${mangled}$ctor$${this.sigToWasmSuffix(pts)}`;
                ci.ctors.set(csig, { wasmName: cname, paramTypes: pts });
            } else if (m.kind === 'MethodDecl') {
                const isStatic = !!m.isStatic;
                const retTypeStr = this.resolveTypeName(m.returnType || 'void');
                const pts = m.params.map((p: any) => this.resolveTypeName(p.type));
                const hasBody = !!m.body;
                const sig = this.methodSig(m.name, pts);
                // CAMBIO: `name` → `mangled`
                const fname = `${mangled}$${m.name}$${this.sigToWasmSuffix(pts)}${isStatic ? '$static' : ''}`;

                const baseM = ci.methods.get(sig);
                const inheritedVirtual = baseM ? baseM.isVirtual : false;
                const isVirtual = !isStatic && (m.isVirtual || m.isOverride || !hasBody || inheritedVirtual);

                const minfo: MethodInfo = {
                    wasmName: fname, isStatic,
                    isVirtual, hasBody,
                    paramCount: pts.length,
                    retType: this.wasmType(retTypeStr),
                    retTypeName: retTypeStr,
                    paramTypes: pts,
                };
                ci.methods.set(sig, minfo);

                if (isVirtual) {
                    const vsig = `${m.name}:${pts.length}:${pts.join(',')}`;
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

    // ═══ CAMBIO ═══ exportPublicStatics: sanitiza nombre para exports
    private exportPublicStatics(nodes: any[], currentNs: string = '') {
        for (const node of nodes) {
            if (node.kind === 'NamespaceDecl') {
                this.exportPublicStatics(node.body, currentNs ? `${currentNs}::${node.name}` : node.name);
            } else if (node.kind === 'ClassDecl') {
                const fullName = currentNs ? `${currentNs}::${node.name}` : node.name;
                const ci = this.classInfo.get(fullName);
                if (!ci) continue;
                // CAMBIO: sanitizar el nombre exportado (Box<int> → Box_lt_int_gt)
                const safeName = this.sanitizeIdent(fullName.replace(/::/g, '_'));
                for (const m of node.members) {
                    if (m.kind === 'FieldDecl' && m.isStatic && m.visibility === 'public') {
                        const sInfo = ci.statics.get(m.name);
                        if (sInfo) this.mod.addExport(`${safeName}_${m.name}`, 'global', sInfo.globalName);
                    }
                    if (m.kind === 'MethodDecl' && m.isStatic && m.visibility === 'public') {
                        const mInfo = this.findStaticMethod(ci, m.name);
                        if (mInfo) this.mod.addExport(`${safeName}_${m.name}`, 'function', mInfo.wasmName);
                    }
                }
            }
        }
    }

    resolveTypeName(name: string): string {
        if (this.isFnPtrType(name)) return name;
        const BUILTIN_TYPES = [
            'void', 'int', 'int64', 'string', 'char', 'float', 'double', 'bool', 'auto', 'ptr',
            'uint8', 'uint16', 'uint32', 'uint64',
        ];
        if (this.classInfo.has(name) || this.enumInfo.has(name) || BUILTIN_TYPES.includes(name)) return name;
        if (this.usingAliases.has(name)) return this.usingAliases.get(name)!;
        for (const ns of this.usingWildcards) {
            const c = `${ns}::${name}`;
            if (this.classInfo.has(c) || this.enumInfo.has(c)) return c;
        }
        return name;
    }

    registerEnum(node: any, explicitName?: string) {
        const enumName = explicitName || node.name;
        const base = this.enumNextAddress;
        const members = new Map<string, EnumMember>();
        let lastOrdinal = -1;
        for (const m of node.members) {
            let ordinal: number;
            if (m.valueExpr && m.valueExpr.kind === 'NumberLiteral' && typeof m.valueExpr.value === 'number') {
                ordinal = m.valueExpr.value | 0;
            } else if (m.valueExpr && m.valueExpr.kind === 'NumberLiteral' && typeof m.valueExpr.value === 'bigint') {
                ordinal = Number(m.valueExpr.value) | 0;
            } else ordinal = lastOrdinal + 1;
            const address = this.enumNextAddress;
            this.enumNextAddress += 4;
            if (this.enumNextAddress > WasmCodeGen.ENUM_LIMIT) throw new Error('WASM: tabla de enums excedió el límite');
            members.set(m.name, { address, ordinal });
            lastOrdinal = ordinal;
        }
        this.enumInfo.set(enumName, { name: enumName, members, base, totalSize: this.enumNextAddress - base });
        for (const [, info] of members) this.mod.addData32(info.address, info.ordinal);
    }

    private guaranteesReturn(node: any): boolean {
        if (!node) return false;
        switch (node.kind) {
            case 'Return': return true;
            case 'BeginEnd':
                for (const s of (node.statements || [])) if (this.guaranteesReturn(s)) return true;
                return false;
            case 'If':
                if (!node.elseStmt) return false;
                return this.guaranteesReturn(node.branches?.[0]?.thenStmt)
                    && this.guaranteesReturn(node.elseStmt);
            default: return false;
        }
    }

    // ═══ CAMBIO ═══ compileClass: sanitiza className para clinit/dtor
    compileClass(node: any, explicitName?: string) {
        const className = explicitName || node.name;
        const info = this.classInfo.get(className)!;

        // NUEVO: nombre saneado para los wasm names de clinit/dtor.
        const mangled = this.sanitizeIdent(className);

        const staticsWithInit = node.members.filter((m: any) =>
            m.kind === 'FieldDecl' && m.isStatic && m.value);
        if (staticsWithInit.length) {
            // CAMBIO: `${className}$clinit` → `${mangled}$clinit`
            const clinitName = `${mangled}$clinit`;
            info.clinit = clinitName;
            this.mod.addFunction(clinitName, [], null, (b) => {
                this.setupFn(b, className, 'void', 'void');
                for (const m of staticsWithInit) {
                    this.emitExprCoerced(b, m.value, info.statics.get(m.name)!.type);
                    b.globalSet(info.statics.get(m.name)!.globalName);
                }
                b.return_();
            });
        }

        for (const m of node.members) {
            if (m.kind !== 'ConstructorDecl') continue;
            const resolvedParams = m.params.map((p: any) => ({ ...p, type: this.resolveTypeName(p.type) }));
            const csig = this.ctorSig(resolvedParams.map((p: any) => p.type));
            const ctorInfo = info.ctors.get(csig);
            if (!ctorInfo) throw new Error(`WASM: constructor not found for sig ${csig}`);
            const cname = ctorInfo.wasmName;

            const paramTypes: any[] = ['i32', ...resolvedParams.map((p: any) => this.wasmType(p.type))];
            const paramNames = ['this', ...resolvedParams.map((p: any) => p.name)];
            this.mod.addFunction(cname, paramTypes, null, (b) => {
                this.setupFn(b, className, 'void', 'void');
                let slot = 0;
                this.locals.set('this', { index: slot++, type: className });
                const structParams: { name: string; type: string; wasmParamIdx: number }[] = [];
                for (const p of resolvedParams) {
                    const pCi = this.classInfo.get(p.type);
                    if (pCi && pCi.isStruct) {
                        structParams.push({ name: p.name, type: p.type, wasmParamIdx: slot });
                        const copyIdx = b.addLocal(`__scopy_${p.name}`, 'i32');
                        this.locals.set(p.name, { index: copyIdx, type: p.type });
                        slot++;
                    } else {
                        this.locals.set(p.name, { index: slot++, type: p.type });
                    }
                }
                if (structParams.length > 0 && this.larenaSavedIndex === null) {
                    this.larenaSavedIndex = b.addLocal('__larena_saved', 'i32');
                }
                this.collectLocals(m.body, b);
                if (this.larenaSavedIndex !== null) {
                    b.globalGet(this.localArenaTop); b.setLocal(this.larenaSavedIndex);
                }
                for (const sp of structParams) {
                    const spCi = this.classInfo.get(sp.type)!;
                    const dstIdx = this.locals.get(sp.name)!.index;
                    b.globalGet(this.localArenaTop); b.setLocal(dstIdx);
                    b.getLocal(dstIdx); b.i32Const(spCi.sizeof); b.i32Add();
                    b.globalSet(this.localArenaTop);
                    b.getLocal(dstIdx); b.getLocal(sp.wasmParamIdx); b.i32Const(spCi.sizeof);
                    b.memoryCopy();
                }
                this.compileStmt(m.body);
                this.emitStackCleanup(b);
                b.return_();
            }, paramNames);
        }

        const dtorNode = node.members.find((m: any) => m.kind === 'DestructorDecl' && m.body);
        if (dtorNode) {
            // CAMBIO: `${className}$dtor` → `${mangled}$dtor`
            const dname = `${mangled}$dtor`;
            info.dtor = dname;
            this.mod.addFunction(dname, ['i32'], null, (b) => {
                this.setupFn(b, className, 'void', 'void');
                this.locals.set('this', { index: 0, type: className });
                this.collectLocals(dtorNode.body, b);
                if (this.larenaSavedIndex !== null) {
                    b.globalGet(this.localArenaTop); b.setLocal(this.larenaSavedIndex);
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
            }, ['this']);
        }

        for (const m of node.members) {
            if (m.kind !== 'MethodDecl' || !m.body) continue;
            const resolvedParams = m.params.map((p: any) => ({ ...p, type: this.resolveTypeName(p.type) }));
            const sig = this.methodSig(m.name, resolvedParams.map((p: any) => p.type));
            const minfo = info.methods.get(sig);
            if (!minfo) throw new Error(`WASM: method not found for sig ${sig}`);
            const retTypeStr = this.resolveTypeName(m.returnType || 'void');
            const isStatic = !!m.isStatic;
            const fname = minfo.wasmName;
            const retT = minfo.retType;

            if (retTypeStr !== 'void' && !this.guaranteesReturn(m.body)) {
                throw new Error(`Error Semántico: '${m.name}' en '${className}' declara '${retTypeStr}' pero no retorna en todas las rutas.`);
            }

            const paramTypes: any[] = isStatic
                ? ['i32', ...resolvedParams.map((p: any) => this.wasmType(p.type))]
                : ['i32', ...resolvedParams.map((p: any) => this.wasmType(p.type))];
            const paramNames = isStatic
                ? ['__env', ...resolvedParams.map((p: any) => p.name)]
                : ['this', ...resolvedParams.map((p: any) => p.name)];

            this.mod.addFunction(fname, paramTypes, retT === 'void' ? null : retT, (b) => {
                this.setupFn(b, className, retT, retTypeStr);
                let slot = 0;
                if (!isStatic) this.locals.set('this', { index: slot++, type: className });
                else           this.locals.set('__env', { index: slot++, type: 'int' });
                const structParams: { name: string; type: string; wasmParamIdx: number }[] = [];
                for (const p of resolvedParams) {
                    const pCi = this.classInfo.get(p.type);
                    if (pCi && pCi.isStruct) {
                        structParams.push({ name: p.name, type: p.type, wasmParamIdx: slot });
                        const copyIdx = b.addLocal(`__scopy_${p.name}`, 'i32');
                        this.locals.set(p.name, { index: copyIdx, type: p.type });
                        slot++;
                    } else {
                        this.locals.set(p.name, { index: slot++, type: p.type });
                    }
                }
                if (structParams.length > 0 && this.larenaSavedIndex === null) {
                    this.larenaSavedIndex = b.addLocal('__larena_saved', 'i32');
                }
                this.collectLocals(m.body, b);
                if (this.larenaSavedIndex !== null) {
                    b.globalGet(this.localArenaTop); b.setLocal(this.larenaSavedIndex);
                }
                for (const sp of structParams) {
                    const spCi = this.classInfo.get(sp.type)!;
                    const dstIdx = this.locals.get(sp.name)!.index;
                    b.globalGet(this.localArenaTop); b.setLocal(dstIdx);
                    b.getLocal(dstIdx); b.i32Const(spCi.sizeof); b.i32Add();
                    b.globalSet(this.localArenaTop);
                    b.getLocal(dstIdx); b.getLocal(sp.wasmParamIdx); b.i32Const(spCi.sizeof);
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
        const clinits: string[] = [];
        for (const [, ci] of this.classInfo) if (ci.clinit) clinits.push(ci.clinit);
        let mainParamCount = 0, mainRetType: RetWasm = 'i32';
        for (const [, ci] of this.classInfo) {
            const m = this.findStaticMethod(ci, 'main');
            if (m) { mainParamCount = m.paramCount; mainRetType = m.retType; break; }
        }
        const argvOffset = mainParamCount > 0 ? this.stringPool.add('').offset : 0;
        this.mod.addFunction('_start', [], null, (b) => {
            for (const c of clinits) b.callByName(c);
            b.i32Const(0);
            for (let i = 0; i < mainParamCount; i++) b.i32Const(argvOffset);
            b.callByName(mainRef);
            if (mainRetType !== 'void') b.drop();
            b.i32Const(0);
            b.callByName('proc_exit');
        });
        this.mod.addExport('_start', 'function', '_start');
        this.mod.addExport('main', 'function', mainRef);
    }

    findMain(): string {
        for (const [, ci] of this.classInfo) {
            const m = this.findStaticMethod(ci, 'main');
            if (m) return m.wasmName;
        }
        throw new Error('WASM: no se encontró main');
    }

    setupFn(b: FunctionIRBuilder, className: string | null, ret: RetWasm, retTypeName: string) {
        this.curFn = b; this.curClass = className; this.curRetType = ret;
        this.curRetTypeName = retTypeName;
        this.locals = new Map(); this.tmpCounter = 0;
        this.breakStack = []; this.continueStack = [];
        this.larenaSavedIndex = null; this.stackAllocs = [];
        this.captures = new Map();
        this.envLocalIdx = -1;
    }

    emitStackCleanup(b: FunctionIRBuilder) {
        for (let i = this.stackAllocs.length - 1; i >= 0; i--) {
            const sa = this.stackAllocs[i];
            const ci = this.classInfo.get(sa.type);
            if (ci && ci.dtor) {
                b.getLocal(sa.localIndex); b.i32Const(0); b.i32Ne();
                b.if_('void');
                    b.getLocal(sa.localIndex); b.callByName(ci.dtor);
                b.end();
            }
        }
        if (this.larenaSavedIndex !== null) {
            b.getLocal(this.larenaSavedIndex); b.globalSet(this.localArenaTop);
        }
    }

    wasmType(t: string): RetWasm {
        if (this.isFnPtrType(t)) return 'i32';
        const resolved = this.resolveTypeName(t);
        if (resolved === 'void') return 'void';
        if (resolved === 'float') return 'f32';
        if (resolved === 'double') return 'f64';
        if (resolved === 'int64' || resolved === 'uint64') return 'i64';
        return 'i32';
    }

    sizeofField(t: string): number {
        if (this.isFnPtrType(t)) return 4;
        const resolved = this.resolveTypeName(t);
        if (resolved === 'float') return 4;
        if (resolved === 'double') return 8;
        if (resolved === 'int64' || resolved === 'uint64') return 8;
        if (this.enumInfo.has(resolved)) return 4;
        const ci = this.classInfo.get(resolved);
        if (ci && ci.isStruct) return ci.sizeof;
        return 4;
    }

    sizeofClass(name: string): number {
        const resolved = this.resolveTypeName(name);
        const ci = this.classInfo.get(resolved);
        if (!ci) throw new Error(`WASM: clase '${name}' no declarada`);
        return ci.sizeof;
    }

    isUnsignedType(t: string): boolean {
        return t === 'uint8' || t === 'uint16' || t === 'uint32' || t === 'uint64';
    }

    getExprType(node: any): string | null {
        if (!node) return null;
        switch (node.kind) {
            case 'ThisExpr': return this.curClass;

            case 'Identifier': {
                if (this.captures.has(node.name)) return this.captures.get(node.name)!.type;
                if (this.locals.has(node.name)) return this.locals.get(node.name)!.type;
                if (this.curClass) {
                    const ci = this.classInfo.get(this.curClass);
                    if (ci) {
                        if (ci.fields.has(node.name))  return ci.fields.get(node.name)!.type;
                        if (ci.statics.has(node.name)) return ci.statics.get(node.name)!.type;
                        const m = this.findStaticMethod(ci, node.name);
                        if (m && m.hasBody) {
                            return `fn(${m.paramTypes.join(',')})->${m.retTypeName}`;
                        }
                    }
                }
                for (const [, ci] of this.classInfo) {
                    const m = this.findStaticMethod(ci, node.name);
                    if (m && m.hasBody) {
                        return `fn(${m.paramTypes.join(',')})->${m.retTypeName}`;
                    }
                }
                return null;
            }

            case 'MemberAccess': {
                const em = this.resolveEnumMember(node);
                if (em) return em.enumName;

                if (node.object.kind === 'Identifier' && !this.locals.has(node.object.name)) {
                    const candidate = `${node.object.name}::${node.property}`;
                    if (this.classInfo.has(candidate)) return candidate;
                    if (this.enumInfo.has(candidate)) return candidate;
                }

                const sm = this.resolveStaticMember(node);
                if (sm) {
                    if (sm.kind === 'field') return sm.fieldInfo!.type;
                    return sm.methodInfo!.retTypeName === 'void' ? null : sm.methodInfo!.retTypeName;
                }
                const objT = this.getExprType(node.object);
                if (!objT) return null;
                if (node.property === 'length' && (objT === 'string' || objT.endsWith('[]'))) return 'int';
                const ci = this.classInfo.get(objT);
                if (!ci) return null;
                if (ci.fields.has(node.property)) return ci.fields.get(node.property)!.type;
                if (ci.statics.has(node.property)) return ci.statics.get(node.property)!.type;
                return null;
            }

            case 'IndexExpr': {
                const arrT = this.getExprType(node.array);
                if (!arrT) return null;
                if (arrT.endsWith('[]')) return arrT.slice(0, -2);
                return null;
            }

            case 'NewExpr': {
                if (node._resolvedClassName) return node._resolvedClassName;
                const rawName = typeof node.className === 'string'
                    ? node.className
                    : (node.className.kind === 'QualifiedName' ? node.className.parts.join('::') : String(node.className));
                return this.resolveTypeName(rawName);
            }

            case 'NewArrayExpr': {
                const dims = (node.sizes || []).length;
                if (node._resolvedElementType) return node._resolvedElementType + '[]'.repeat(dims);
                const rawElem = typeof node.elementType === 'string' ? node.elementType : String(node.elementType);
                return this.resolveTypeName(rawElem) + '[]'.repeat(dims);
            }

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

            case 'StringLiteral': return 'string';
            case 'BooleanLiteral': return 'bool';
            case 'NullLiteral': return 'null';

            case 'BinaryOp': {
                const lt = this.getExprType(node.left);
                const rt = this.getExprType(node.right);
                if (!lt || !rt) return null;
                const op = node.op;
                if (['<', '>', '<=', '>=', '==', '!=', '&&', '||'].includes(op)) return 'bool';
                if (op === '-' && lt === 'ptr' && rt === 'ptr') return 'int';
                if (lt === 'string' || rt === 'string') return 'string';
                const promoted = this.promoteNumericType(lt, rt);
                return promoted || 'int';
            }

            case 'UnaryOp':
                if (node.op === '!') return 'bool';
                if (node.op === '-') {
                    const ot = this.getExprType(node.operand);
                    if (ot === 'uint64') return 'int64';
                    return ot;
                }
                return this.getExprType(node.operand);

            case 'Ternary': {
                const tt = this.getExprType(node.thenExpr);
                const et = this.getExprType(node.elseExpr);
                if (!tt || !et) return null;
                if (tt === et) return tt;
                if (tt === 'null') return et;
                if (et === 'null') return tt;
                const promoted = this.promoteNumericType(tt, et);
                if (promoted) return promoted;
                return tt;
            }

            case 'CastExpr': return this.resolveTypeName(node.targetType);

            case 'LambdaExpr': {
                if (node._resolvedFnPtrType) return node._resolvedFnPtrType;
                const pts = node.params.map((p: any) => this.resolveTypeName(p.type));
                const rt = this.inferLambdaReturn(node.body) || 'void';
                return `fn(${pts.join(',')})->${rt}`;
            }

            case 'AddressOfExpr': return 'ptr';
            case 'Assignment': case 'CompoundAssignment': case 'IncrementExpr':
                return this.getExprType(node.target);
            case 'SuperCall': return null;

            case 'Call': {
                const p = this.pathOf(node.callee);
                if (p === 'System.wasi.Import') return 'void';
                if (node.callee.kind === 'Identifier' && this.importedFunctions.has(node.callee.name)) {
                    const imp = this.importedFunctions.get(node.callee.name)!;
                    return imp.returnType === 'void' ? null : imp.returnType;
                }
                if (p && this.builtinReturnTypes[p]) {
                    const t = this.builtinReturnTypes[p];
                    return t === 'void' ? null : t;
                }
                if (node.callee.kind === 'Identifier' && this.locals.has(node.callee.name)) {
                    const ltype = this.locals.get(node.callee.name)!.type;
                    if (this.isFnPtrType(ltype)) {
                        const fp = this.parseFnPtrType(ltype)!;
                        return fp.ret === 'void' ? null : fp.ret;
                    }
                }
                const m = this.resolveCallInfo(node);
                if (!m) return null;
                return m.retTypeName === 'void' ? null : m.retTypeName;
            }

            default: return null;
        }
    }

    resolveCallInfo(node: any): MethodInfo | null {
        // Prefer semantic-resolved
        if (node._resolvedMethodSig && node._resolvedMethodClass) {
            const ci = this.classInfo.get(node._resolvedMethodClass);
            if (ci) {
                const m = ci.methods.get(node._resolvedMethodSig);
                if (m) return m;
            }
        }
        const callee = node.callee;
        if (callee.kind === 'Identifier') {
            const name = callee.name;
            if (this.importedFunctions.has(name)) return null;
            const l = this.locals.get(name);
            if (l && this.isFnPtrType(l.type)) return null;
            if (this.curClass) {
                const ci = this.classInfo.get(this.curClass)!;
                const m = this.findStaticMethod(ci, name);
                if (m) return m;
            }
            for (const [, ci] of this.classInfo) {
                const m = this.findStaticMethod(ci, name);
                if (m) return m;
            }
            return null;
        }
        if (callee.kind === 'MemberAccess') {
            if (callee.object.kind === 'Identifier' && !this.locals.has(callee.object.name)) {
                const clsName = this.resolveClassNameForStatic(callee.object.name);
                if (clsName) {
                    const ci = this.classInfo.get(clsName)!;
                    const m = this.findStaticMethod(ci, callee.property);
                    if (m) return m;
                }
            }
            const objT = this.getExprType(callee.object);
            if (objT && this.classInfo.has(objT)) {
                const ci = this.classInfo.get(objT)!;
                const m = this.findMethodByName(ci, callee.property);
                if (m) return m;
            }
            return null;
        }
        return null;
    }

    exprProducesValue(node: any): boolean {
        if (!node) return false;
        switch (node.kind) {
            case 'Assignment': case 'CompoundAssignment': case 'IncrementExpr':
            case 'VarDecl': case 'If': case 'While': case 'For': case 'Switch':
            case 'BeginEnd': case 'Return': case 'Break': case 'Continue': case 'Delete':
            case 'SuperCall':
                return false;
            case 'Call': {
                const p = this.pathOf(node.callee);
                if (p === 'System.wasi.Import') return false;
                if (p && (p.startsWith('System.') || p.startsWith('Unsafe.'))) return true;
                const m = this.resolveCallInfo(node);
                if (m) return m.retType !== 'void';
                if (node.callee.kind === 'Identifier' && this.locals.has(node.callee.name)) {
                    const ltype = this.locals.get(node.callee.name)!.type;
                    if (this.isFnPtrType(ltype)) {
                        const fp = this.parseFnPtrType(ltype)!;
                        return fp.ret !== 'void';
                    }
                }
                return false;
            }
            default: return true;
        }
    }

    emitZero(b: FunctionIRBuilder, type: string) {
        if (this.isFnPtrType(type)) { b.i32Const(0); return; }
        const resolved = this.resolveTypeName(type);
        if (resolved === 'float') b.f32Const(0);
        else if (resolved === 'double') b.f64Const(0);
        else if (resolved === 'int64' || resolved === 'uint64') b.i64Const(0);
        else b.i32Const(0);
    }

    collectLocals(node: any, b: FunctionIRBuilder) {
        if (!node) return;
        switch (node.kind) {
            case 'BeginEnd': for (const s of node.statements) this.collectLocals(s, b); return;
            case 'If':
                for (const br of node.branches) this.collectLocals(br.thenStmt, b);
                this.collectLocals(node.elseStmt, b); return;
            case 'While': this.collectLocals(node.body, b); return;
            case 'For':
                if (node.init?.kind === 'VarDecl' && !this.locals.has(node.init.name)) {
                    const resolvedT = this.resolveTypeName(node.init.type);
                    const idx = b.addLocal(node.init.name, this.wasmType(resolvedT));
                    this.locals.set(node.init.name, { index: idx, type: resolvedT });
                }
                this.collectLocals(node.body, b); return;
            case 'Switch':
                for (const c of node.cases) for (const s of c.statements) this.collectLocals(s, b);
                return;
            case 'VarDecl': {
                if (!this.locals.has(node.name)) {
                    const resolvedT = this.resolveTypeName(node.type);
                    const idx = b.addLocal(node.name, this.wasmType(resolvedT));
                    this.locals.set(node.name, { index: idx, type: resolvedT });
                }
                if (!node.value && this.classInfo.has(this.resolveTypeName(node.type))) {
                    if (this.larenaSavedIndex === null) {
                        this.larenaSavedIndex = b.addLocal('__larena_saved', 'i32');
                    }
                    this.stackAllocs.push({
                        localIndex: this.locals.get(node.name)!.index,
                        type: this.resolveTypeName(node.type),
                    });
                }
                return;
            }
        }
    }

    pathOf(node: any): string | null {
        if (!node) return null;
        if (node.kind === 'Identifier') return node.name;
        if (node.kind === 'MemberAccess') {
            const p = this.pathOf(node.object);
            return p ? `${p}.${node.property}` : null;
        }
        if (node.kind === 'QualifiedName') return node.parts.join('::');
        return null;
    }

    private inferLambdaReturn(node: any): string | null {
        if (!node) return null;
        if (node.kind === 'Return' && node.expr) return this.getExprType(node.expr);
        if (node.kind === 'BeginEnd') {
            for (const s of node.statements) {
                const r = this.inferLambdaReturn(s);
                if (r) return r;
            }
        }
        if (node.kind === 'If') {
            if (!node.elseStmt) return null;
            const t = this.inferLambdaReturn(node.branches[0].thenStmt);
            if (t) return t;
            return this.inferLambdaReturn(node.elseStmt);
        }
        return null;
    }

    private emitLambdaFunction(node: any, paramTypes: string[], retType: string, wasmName: string) {
        const captures = node._captures || [];
        const captureLayout: { name: string; type: string; offset: number; size: number; align: number }[] = [];
        let offset = 8;
        for (const c of captures) {
            const { size, align } = this.captureSizeAndAlign(c.type);
            offset = (offset + align - 1) & ~(align - 1);
            captureLayout.push({ name: c.name, type: c.type, offset, size, align });
            offset += size;
        }

        const wasmParams: WasmPrim[] = ['i32', ...paramTypes.map(t => this.toWasmType(t))];
        const wasmRet: RetWasm = this.wasmType(retType);

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

        this.mod.addFunction(wasmName, wasmParams as any, wasmRet === 'void' ? null : wasmRet, (b) => {
            this.setupFn(b, savedClass, wasmRet, retType);
            this.envLocalIdx = 0;
            this.captures = new Map();
            for (const cl of captureLayout) {
                this.captures.set(cl.name, { type: cl.type, offset: cl.offset, size: cl.size, align: cl.align });
            }
            this.locals.set('__env', { index: 0, type: 'int' });
            for (let i = 0; i < paramTypes.length; i++) {
                this.locals.set(node.params[i].name, { index: i + 1, type: paramTypes[i] });
            }
            this.collectLocals(node.body, b);
            this.compileStmt(node.body);
            b.return_();
        }, ['__env', ...node.params.map((p: any) => p.name)]);

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

    emitBuiltinCall(path: string, b: FunctionIRBuilder, args: any[]): boolean {
        const isPrintArg = (t: string | null) =>
            t === 'string' || t === 'int' || t === 'char'
            || t === 'uint8' || t === 'uint16' || t === 'uint32'
            || t === 'int64' || t === 'uint64'
            || t === 'bool' || t === 'ptr'
            || t === 'float' || t === 'double'
            || this.isEnumType(t);

        const emitPrintArg = (arg: any) => {
            const t = this.getExprType(arg);

            if (this.isEnumType(t)) {
                this.emitExpr(b, arg);
                b.i32Load(0, 2);
                b.callByName(this.i32ToStr);
                const tmpLen = b.addLocal(`__pe_${this.tmpCounter++}`, 'i32');
                b.setLocal(tmpLen);
                b.i32Const(WasmCodeGen.INT_BUF_OFFSET); b.getLocal(tmpLen);
                b.callByName(this.wasiWriteBuf);
                return;
            }
            if (t === 'string') {
                const tmp = b.addLocal(`__ps_${this.tmpCounter++}`, 'i32');
                this.emitExpr(b, arg); b.setLocal(tmp);
                b.getLocal(tmp); b.getLocal(tmp);
                b.i32Const(4); b.i32Sub(); b.i32Load(0, 2);
                b.callByName(this.wasiWriteBuf); return;
            }
            if (t === 'bool') {
                const tOff = this.stringPool.add('true').offset;
                const fOff = this.stringPool.add('false').offset;
                const tmp = b.addLocal(`__pb_${this.tmpCounter++}`, 'i32');
                this.emitExpr(b, arg); b.setLocal(tmp);
                b.getLocal(tmp); b.getLocal(tmp);
                b.if_('void');
                    b.i32Const(tOff); b.i32Const(4); b.callByName(this.wasiWriteBuf);
                b.else_();
                    b.i32Const(fOff); b.i32Const(5); b.callByName(this.wasiWriteBuf);
                b.end(); return;
            }
            if (t === 'int64' || t === 'uint64') {
                this.emitExpr(b, arg);
                b.callByName(t === 'uint64' ? this.u64ToStr : this.i64ToStr);
                const tmpLen = b.addLocal(`__p64_${this.tmpCounter++}`, 'i32');
                b.setLocal(tmpLen);
                b.i32Const(WasmCodeGen.INT_BUF_OFFSET); b.getLocal(tmpLen);
                b.callByName(this.wasiWriteBuf); return;
            }
            if (t === 'int' || t === 'char' || t === 'uint8' || t === 'uint16' || t === 'uint32' || t === 'ptr') {
                this.emitExpr(b, arg); b.callByName(this.i32ToStr);
                const tmpLen = b.addLocal(`__pl_${this.tmpCounter++}`, 'i32');
                b.setLocal(tmpLen);
                b.i32Const(WasmCodeGen.INT_BUF_OFFSET); b.getLocal(tmpLen);
                b.callByName(this.wasiWriteBuf); return;
            }
            if (t === 'float') {
                this.emitExpr(b, arg);
                b.f64PromoteF32();
                b.callByName(this.f64ToStr);
                const tmpLen = b.addLocal(`__pfl_${this.tmpCounter++}`, 'i32');
                b.setLocal(tmpLen);
                b.i32Const(WasmCodeGen.INT_BUF_OFFSET); b.getLocal(tmpLen);
                b.callByName(this.wasiWriteBuf);
                return;
            }
            if (t === 'double') {
                this.emitExpr(b, arg);
                b.callByName(this.f64ToStr);
                const tmpLen = b.addLocal(`__pfl_${this.tmpCounter++}`, 'i32');
                b.setLocal(tmpLen);
                b.i32Const(WasmCodeGen.INT_BUF_OFFSET); b.getLocal(tmpLen);
                b.callByName(this.wasiWriteBuf);
                return;
            }
            throw new Error(`println: tipo '${t}' no soportado`);
        };

        switch (path) {
            case 'System.wasi.Import': return this.tryRegisterImport(args);

            case 'Unsafe.pointer.read8':
                this.emitExpr(b, args[0]); b.i32Load8U(0, 0); return true;
            case 'Unsafe.pointer.read16':
                this.emitExpr(b, args[0]); b.i32Load16U(0, 1); return true;
            case 'Unsafe.pointer.read32':
                this.emitExpr(b, args[0]); b.i32Load(0, 2); return true;
            case 'Unsafe.pointer.read64':
                this.emitExpr(b, args[0]); b.i64Load(0, 3); return true;
            case 'Unsafe.pointer.write8':
                this.emitExpr(b, args[0]); this.emitExprCoerced(b, args[1], 'int');
                b.i32Store8(0, 0); b.i32Const(0); return true;
            case 'Unsafe.pointer.write16':
                this.emitExpr(b, args[0]); this.emitExprCoerced(b, args[1], 'int');
                b.i32Store16(0, 1); b.i32Const(0); return true;
            case 'Unsafe.pointer.write32':
                this.emitExpr(b, args[0]); this.emitExprCoerced(b, args[1], 'int');
                b.i32Store(0, 2); b.i32Const(0); return true;
            case 'Unsafe.pointer.write64':
                this.emitExpr(b, args[0]); this.emitExprCoerced(b, args[1], 'int64');
                b.i64Store(0, 3); b.i32Const(0); return true;
            case 'Unsafe.pointer.offset':
                this.emitExpr(b, args[0]); this.emitExpr(b, args[1]); b.i32Add(); return true;
            case 'Unsafe.pointer.isNull':
                this.emitExpr(b, args[0]); b.i32Const(-1); b.i32Eq(); return true;
            case 'Unsafe.memory.alloc':
                this.emitExpr(b, args[0]); b.callByName(this.allocator.malloc); return true;
            case 'Unsafe.memory.free':
                this.emitExpr(b, args[0]); b.callByName(this.allocator.free); b.i32Const(0); return true;
            case 'Unsafe.memory.realloc':
                this.emitExpr(b, args[0]); this.emitExpr(b, args[1]); b.drop(); return true;
            case 'Unsafe.memory.set': {
                const pLoc = b.addLocal(`__mset_p_${this.tmpCounter++}`, 'i32');
                const vLoc = b.addLocal(`__mset_v_${this.tmpCounter++}`, 'i32');
                const nLoc = b.addLocal(`__mset_n_${this.tmpCounter++}`, 'i32');
                const iLoc = b.addLocal(`__mset_i_${this.tmpCounter++}`, 'i32');
                const topL = `mset_top_${this.tmpCounter++}`, endL = `mset_end_${this.tmpCounter++}`;
                this.emitExpr(b, args[0]); b.setLocal(pLoc);
                this.emitExpr(b, args[1]); b.setLocal(vLoc);
                this.emitExpr(b, args[2]); b.setLocal(nLoc);
                b.i32Const(0); b.setLocal(iLoc);
                b.block('void', endL);
                b.loop('void', topL);
                    b.getLocal(iLoc); b.getLocal(nLoc); b.i32GeU(); b.brIfTo(endL);
                    b.getLocal(pLoc); b.getLocal(iLoc); b.i32Add();
                    b.getLocal(vLoc); b.i32Store8(0, 0);
                    b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
                    b.brTo(topL);
                b.end(); b.end(); b.i32Const(0); return true;
            }
            case 'Unsafe.memory.copy': {
                const dLoc = b.addLocal(`__mcp_d_${this.tmpCounter++}`, 'i32');
                const sLoc = b.addLocal(`__mcp_s_${this.tmpCounter++}`, 'i32');
                const nLoc = b.addLocal(`__mcp_n_${this.tmpCounter++}`, 'i32');
                const iLoc = b.addLocal(`__mcp_i_${this.tmpCounter++}`, 'i32');
                const topL = `mcp_top_${this.tmpCounter++}`, endL = `mcp_end_${this.tmpCounter++}`;
                this.emitExpr(b, args[0]); b.setLocal(dLoc);
                this.emitExpr(b, args[1]); b.setLocal(sLoc);
                this.emitExpr(b, args[2]); b.setLocal(nLoc);
                b.i32Const(0); b.setLocal(iLoc);
                b.block('void', endL);
                b.loop('void', topL);
                    b.getLocal(iLoc); b.getLocal(nLoc); b.i32GeU(); b.brIfTo(endL);
                    b.getLocal(dLoc); b.getLocal(iLoc); b.i32Add();
                    b.getLocal(sLoc); b.getLocal(iLoc); b.i32Add();
                    b.i32Load8U(0, 0); b.i32Store8(0, 0);
                    b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
                    b.brTo(topL);
                b.end(); b.end(); b.i32Const(0); return true;
            }
            case 'Unsafe.memory.compare': {
                const aLoc  = b.addLocal(`__mcmp_a_${this.tmpCounter++}`, 'i32');
                const bLoc  = b.addLocal(`__mcmp_b_${this.tmpCounter++}`, 'i32');
                const nLoc  = b.addLocal(`__mcmp_n_${this.tmpCounter++}`, 'i32');
                const iLoc  = b.addLocal(`__mcmp_i_${this.tmpCounter++}`, 'i32');
                const daLoc = b.addLocal(`__mcmp_da_${this.tmpCounter++}`, 'i32');
                const dbLoc = b.addLocal(`__mcmp_db_${this.tmpCounter++}`, 'i32');
                const resLoc = b.addLocal(`__mcmp_r_${this.tmpCounter++}`, 'i32');
                const topL = `mcmp_top_${this.tmpCounter++}`, endL = `mcmp_end_${this.tmpCounter++}`;
                this.emitExpr(b, args[0]); b.setLocal(aLoc);
                this.emitExpr(b, args[1]); b.setLocal(bLoc);
                this.emitExpr(b, args[2]); b.setLocal(nLoc);
                b.i32Const(0); b.setLocal(iLoc); b.i32Const(0); b.setLocal(resLoc);
                b.block('void', endL);
                b.loop('void', topL);
                    b.getLocal(iLoc); b.getLocal(nLoc); b.i32GeU(); b.brIfTo(endL);
                    b.getLocal(aLoc); b.getLocal(iLoc); b.i32Add(); b.i32Load8U(0, 0); b.setLocal(daLoc);
                    b.getLocal(bLoc); b.getLocal(iLoc); b.i32Add(); b.i32Load8U(0, 0); b.setLocal(dbLoc);
                    b.getLocal(daLoc); b.getLocal(dbLoc); b.i32Ne();
                    b.if_('void');
                        b.getLocal(daLoc); b.getLocal(dbLoc); b.i32LtU();
                        b.if_('void'); b.i32Const(-1); b.setLocal(resLoc);
                        b.else_();     b.i32Const(1);  b.setLocal(resLoc); b.end();
                        b.brTo(endL);
                    b.end();
                    b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
                    b.brTo(topL);
                b.end(); b.end(); b.getLocal(resLoc); return true;
            }
            case 'System.wasi.write': case 'System.write': {
                if (args.length !== 1) throw new Error(`${path} espera 1 argumento`);
                emitPrintArg(args[0]);
                b.i32Const(0); return true;
            }
            case 'System.wasi.writeLine': case 'System.writeLine': {
                if (args.length !== 1) throw new Error(`${path} espera 1 argumento`);
                emitPrintArg(args[0]);
                b.i32Const(WasmCodeGen.NL_OFFSET); b.i32Const(1); b.callByName(this.wasiWriteBuf);
                b.i32Const(0); return true;
            }
            case 'System.wasi.println': case 'System.println': {
                for (let i = 0; i < args.length; i++) {
                    if (i > 0) { b.i32Const(WasmCodeGen.SPACE_OFFSET); b.i32Const(1); b.callByName(this.wasiWriteBuf); }
                    const t = this.getExprType(args[i]);
                    if (!isPrintArg(t)) throw new Error(`println: tipo '${t}' no soportado`);
                    emitPrintArg(args[i]);
                }
                b.i32Const(WasmCodeGen.NL_OFFSET); b.i32Const(1); b.callByName(this.wasiWriteBuf);
                b.i32Const(0); return true;
            }
            case 'System.wasi.exit': case 'System.exit':
                this.emitExpr(b, args[0]); b.callByName('proc_exit'); b.unreachable(); return true;
            case 'System.wasi.flush': case 'System.flush':
                b.i32Const(0); return true;
            case 'System.wasi.readLine': case 'System.readLine':
                b.callByName(this.readLineFn); return true;
            case 'System.wasi.readInt': case 'System.readInt':
                b.callByName(this.readLineFn);
                b.callByName(this.parseIntFn);
                return true;

            case 'Math.abs':      this.emitExprCoerced(b, args[0], 'double'); b.f64Abs(); return true;
            case 'Math.sqrt':     this.emitExprCoerced(b, args[0], 'double'); b.f64Sqrt(); return true;
            case 'Math.floor':    this.emitExprCoerced(b, args[0], 'double'); b.f64Floor(); return true;
            case 'Math.ceil':     this.emitExprCoerced(b, args[0], 'double'); b.f64Ceil(); return true;
            case 'Math.round':    this.emitExprCoerced(b, args[0], 'double'); b.f64Nearest(); return true;
            case 'Math.trunc':    this.emitExprCoerced(b, args[0], 'double'); b.f64Trunc(); return true;
            case 'Math.min':
                this.emitExprCoerced(b, args[0], 'double');
                this.emitExprCoerced(b, args[1], 'double');
                b.f64Min(); return true;
            case 'Math.max':
                this.emitExprCoerced(b, args[0], 'double');
                this.emitExprCoerced(b, args[1], 'double');
                b.f64Max(); return true;
            case 'Math.copysign':
                this.emitExprCoerced(b, args[0], 'double');
                this.emitExprCoerced(b, args[1], 'double');
                b.f64Copysign(); return true;

            case 'File.readAll': {
                if (args.length !== 1) throw new Error('File.readAll espera 1 argumento');
                const fdLoc = b.addLocal(`__fr_fd_${this.tmpCounter++}`, 'i32');
                const resLoc = b.addLocal(`__fr_res_${this.tmpCounter++}`, 'i32');
                this.emitExpr(b, args[0]);
                b.callByName(this.fileIO.fsOpenRead);
                b.setLocal(fdLoc);
                b.getLocal(fdLoc); b.i32Const(0); b.i32LtS();
                b.if_('void');
                    b.i32Const(this.stringPool.add('').offset);
                    b.setLocal(resLoc);
                b.else_();
                    b.getLocal(fdLoc);
                    b.callByName(this.fileIO.fsReadAll);
                    b.setLocal(resLoc);
                    b.getLocal(fdLoc);
                    b.callByName('wasi_fd_close');
                    b.drop();
                b.end();
                b.getLocal(resLoc);
                return true;
            }
            case 'File.writeAll': {
                if (args.length !== 2) throw new Error('File.writeAll espera 2 argumentos');
                const fdLoc = b.addLocal(`__fw_fd_${this.tmpCounter++}`, 'i32');
                const wrLoc = b.addLocal(`__fw_wr_${this.tmpCounter++}`, 'i32');
                const resLoc = b.addLocal(`__fw_res_${this.tmpCounter++}`, 'i32');
                this.emitExpr(b, args[0]);
                b.i32Const(0);
                b.callByName(this.fileIO.fsOpenWrite);
                b.setLocal(fdLoc);
                b.getLocal(fdLoc); b.i32Const(0); b.i32LtS();
                b.if_('void');
                    b.i32Const(0); b.setLocal(resLoc);
                b.else_();
                    b.getLocal(fdLoc);
                    this.emitExpr(b, args[1]);
                    b.callByName(this.fileIO.fsWriteStr);
                    b.setLocal(wrLoc);
                    b.getLocal(fdLoc); b.callByName('wasi_fd_close'); b.drop();
                    b.getLocal(wrLoc); b.i32Const(0); b.i32GeS();
                    b.setLocal(resLoc);
                b.end();
                b.getLocal(resLoc);
                return true;
            }
            case 'File.append': {
                if (args.length !== 2) throw new Error('File.append espera 2 argumentos');
                const fdLoc = b.addLocal(`__fa_fd_${this.tmpCounter++}`, 'i32');
                const wrLoc = b.addLocal(`__fa_wr_${this.tmpCounter++}`, 'i32');
                const resLoc = b.addLocal(`__fa_res_${this.tmpCounter++}`, 'i32');
                this.emitExpr(b, args[0]);
                b.i32Const(1);
                b.callByName(this.fileIO.fsOpenWrite);
                b.setLocal(fdLoc);
                b.getLocal(fdLoc); b.i32Const(0); b.i32LtS();
                b.if_('void');
                    b.i32Const(0); b.setLocal(resLoc);
                b.else_();
                    b.getLocal(fdLoc);
                    this.emitExpr(b, args[1]);
                    b.callByName(this.fileIO.fsWriteStr);
                    b.setLocal(wrLoc);
                    b.getLocal(fdLoc); b.callByName('wasi_fd_close'); b.drop();
                    b.getLocal(wrLoc); b.i32Const(0); b.i32GeS();
                    b.setLocal(resLoc);
                b.end();
                b.getLocal(resLoc);
                return true;
            }
            case 'File.exists': {
                if (args.length !== 1) throw new Error('File.exists espera 1 argumento');
                this.emitExpr(b, args[0]);
                b.callByName(this.fileIO.fsExists);
                return true;
            }

            default: return false;
        }
    }

    emitIndexAddr(b: FunctionIRBuilder, arrayExpr: any, indexExpr: any, elemSize: number) {
        const tmpArr = b.addLocal(`__ia_${this.tmpCounter++}`, 'i32');
        const tmpIdx = b.addLocal(`__ii_${this.tmpCounter++}`, 'i32');
        this.emitExpr(b, arrayExpr); b.setLocal(tmpArr);
        this.emitExpr(b, indexExpr); b.setLocal(tmpIdx);
        b.getLocal(tmpIdx);
        b.getLocal(tmpArr); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2); b.i32GeU();
        b.if_('void'); b.unreachable(); b.end();
        b.getLocal(tmpArr); b.getLocal(tmpIdx); b.i32Const(elemSize); b.i32Mul(); b.i32Add();
    }

    private elemSizeOf(t: string): number {
        if (this.isFnPtrType(t)) return 4;
        const r = this.resolveTypeName(t);
        if (r === 'float') return 4;
        if (r === 'double') return 8;
        if (r === 'int64' || r === 'uint64') return 8;
        if (this.enumInfo.has(r)) return 4;
        const ci = this.classInfo.get(r);
        if (ci) return ci.sizeof;
        return 4;
    }

    private isF32Elem(t: string | null): boolean {
        if (!t) return false;
        return this.resolveTypeName(t) === 'float';
    }
    private isF64Elem(t: string | null): boolean {
        if (!t) return false;
        return this.resolveTypeName(t) === 'double';
    }
    private isI64Elem(t: string | null): boolean {
        if (!t) return false;
        const r = this.resolveTypeName(t);
        return r === 'int64' || r === 'uint64';
    }

    private arrayElemType(node: any): string | null {
        const arrT = this.getExprType(node);
        if (!arrT || !arrT.endsWith('[]')) return null;
        return arrT.slice(0, -2);
    }

    compileStmt(node: any) {
        if (!node) return;
        const b = this.curFn!;
        switch (node.kind) {
            case 'BeginEnd':
                for (const s of node.statements) this.compileStmt(s);
                return;

            case 'VarDecl': {
                const resolvedT = this.resolveTypeName(node.type);
                const ci = this.classInfo.get(resolvedT);
                const local = this.locals.get(node.name)!;

                if (!node.value && ci) {
                    const tmp = b.addLocal(`__sa_${this.tmpCounter++}`, 'i32');
                    b.globalGet(this.localArenaTop); b.setLocal(tmp);
                    b.getLocal(tmp); b.i32Const(ci.sizeof); b.i32Add(); b.globalSet(this.localArenaTop);
                    b.getLocal(tmp); b.i32Const(0); b.i32Const(ci.sizeof); b.memoryFill();
                    if (ci.isPolymorphic) {
                        b.getLocal(tmp);
                        b.i32Const(ci.typeTag);
                        b.i32Store(ci.tagOffset, 2);
                    }
                    const ctor0 = this.findCtorForArgCount(ci, 0);
                    if (ctor0) { b.getLocal(tmp); b.callByName(ctor0.wasmName); }
                    b.getLocal(tmp); b.setLocal(local.index);
                    return;
                }
                if (ci && ci.isStruct && node.value) {
                    const tmp = b.addLocal(`__sinit_${this.tmpCounter++}`, 'i32');
                    b.globalGet(this.localArenaTop); b.setLocal(tmp);
                    b.getLocal(tmp); b.i32Const(ci.sizeof); b.i32Add(); b.globalSet(this.localArenaTop);
                    b.getLocal(tmp); this.emitExpr(b, node.value); b.i32Const(ci.sizeof); b.memoryCopy();
                    b.getLocal(tmp); b.setLocal(local.index);
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

            case 'ExprStatement': {
                this.emitExpr(b, node.expr);
                if (this.exprProducesValue(node.expr)) b.drop();
                return;
            }

            case 'If': {
                const endLabel = `if_end_${this.tmpCounter++}`;
                b.block('void', endLabel);
                for (const br of node.branches) {
                    const nextLabel = `if_next_${this.tmpCounter++}`;
                    b.block('void', nextLabel);
                    this.emitExpr(b, br.condition); b.i32Eqz(); b.brIfTo(nextLabel);
                    this.compileStmt(br.thenStmt); b.brTo(endLabel); b.end();
                }
                if (node.elseStmt) this.compileStmt(node.elseStmt);
                b.end(); return;
            }

            case 'While': {
                const topLabel = `while_top_${this.tmpCounter++}`;
                const endLabel = `while_end_${this.tmpCounter++}`;
                b.block('void', endLabel);
                b.loop('void', topLabel);
                this.emitExpr(b, node.condition); b.i32Eqz(); b.brIfTo(endLabel);
                this.breakStack.push([endLabel]);
                this.continueStack.push([topLabel]);
                this.compileStmt(node.body);
                this.breakStack.pop(); this.continueStack.pop();
                b.brTo(topLabel); b.end(); b.end(); return;
            }

            case 'For': {
                if (node.init) this.compileStmt(node.init);
                const topLabel = `for_top_${this.tmpCounter++}`;
                const endLabel = `for_end_${this.tmpCounter++}`;
                b.block('void', endLabel);
                b.loop('void', topLabel);
                if (node.condition) {
                    this.emitExpr(b, node.condition); b.i32Eqz(); b.brIfTo(endLabel);
                }
                this.breakStack.push([endLabel]);
                this.continueStack.push([topLabel]);
                this.compileStmt(node.body);
                if (node.update) {
                    this.emitExpr(b, node.update);
                    if (this.exprProducesValue(node.update)) b.drop();
                }
                this.breakStack.pop(); this.continueStack.pop();
                b.brTo(topLabel); b.end(); b.end(); return;
            }

            case 'Switch': {
                const swType = this.getExprType(node.expr);
                const isStr = swType === 'string';
                const isI64Sw = swType === 'int64' || swType === 'uint64';
                const slotType: 'i32' | 'i64' = isI64Sw ? 'i64' : 'i32';
                const tmpSlot = b.addLocal(`__sw_${this.tmpCounter++}`, slotType);
                const endLabel = `sw_end_${this.tmpCounter++}`;
                b.block('void', endLabel);
                this.emitExpr(b, node.expr);
                b.setLocal(tmpSlot);
                for (const c of node.cases) {
                    if (c.values === null) {
                        this.breakStack.push([endLabel]);
                        for (const s of c.statements) this.compileStmt(s);
                        this.breakStack.pop(); b.brTo(endLabel); continue;
                    }
                    const nextLabel = `sw_next_${this.tmpCounter++}`;
                    const bodyLabel = `sw_body_${this.tmpCounter++}`;
                    b.block('void', nextLabel);
                    b.block('void', bodyLabel);
                    for (const v of c.values) {
                        b.getLocal(tmpSlot);
                        this.emitExprCoerced(b, v, swType);
                        if (isStr) b.callByName(this.strEq);
                        else if (isI64Sw) b.i64Eq();
                        else b.i32Eq();
                        b.brIfTo(bodyLabel);
                    }
                    b.brTo(nextLabel); b.end();
                    this.breakStack.push([endLabel]);
                    for (const s of c.statements) this.compileStmt(s);
                    this.breakStack.pop(); b.brTo(endLabel); b.end();
                }
                b.end(); return;
            }

            case 'Break': {
                const st = this.breakStack[this.breakStack.length - 1];
                if (st && st.length) b.brTo(st[0]); return;
            }
            case 'Continue': {
                const st = this.continueStack[this.continueStack.length - 1];
                if (st && st.length) b.brTo(st[0]); return;
            }

            case 'Return': {
                if (node.expr) this.emitExprCoerced(b, node.expr, this.curRetTypeName);
                this.emitStackCleanup(b); b.return_(); return;
            }

            case 'Delete': {
                const t = this.getExprType(node.target);
                if (t && t.endsWith('[]')) {
                    const elemT = t.slice(0, -2);
                    const ci = this.classInfo.get(elemT);
                    if (ci && ci.dtor) {
                        const tmpArr  = b.addLocal(`__darr_${this.tmpCounter++}`, 'i32');
                        const iLoc    = b.addLocal(`__di_${this.tmpCounter++}`, 'i32');
                        const nLoc    = b.addLocal(`__dn_${this.tmpCounter++}`, 'i32');
                        const elemLoc = b.addLocal(`__de_${this.tmpCounter++}`, 'i32');
                        const topL    = `darr_top_${this.tmpCounter++}`, endL = `darr_end_${this.tmpCounter++}`;
                        this.emitExpr(b, node.target); b.setLocal(tmpArr);
                        b.getLocal(tmpArr); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2); b.setLocal(nLoc);
                        b.i32Const(0); b.setLocal(iLoc);
                        b.block('void', endL);
                        b.loop('void', topL);
                            b.getLocal(iLoc); b.getLocal(nLoc); b.i32GeU(); b.brIfTo(endL);
                            b.getLocal(tmpArr); b.getLocal(iLoc); b.i32Const(4); b.i32Mul(); b.i32Add();
                            b.i32Load(0, 2); b.setLocal(elemLoc);
                            b.getLocal(elemLoc); b.i32Const(0); b.i32GtS();
                            b.if_('void'); b.getLocal(elemLoc); b.callByName(ci.dtor); b.end();
                            b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
                            b.brTo(topL);
                        b.end(); b.end();
                        b.getLocal(tmpArr); b.i32Const(4); b.i32Sub(); b.callByName(this.allocator.free);
                        return;
                    }
                }
                if (t && this.classInfo.has(t)) {
                    const ci = this.classInfo.get(t)!;
                    const tmp = b.addLocal(`__dobj_${this.tmpCounter++}`, 'i32');
                    this.emitExpr(b, node.target); b.setLocal(tmp);
                    if (ci.dtor) { b.getLocal(tmp); b.callByName(ci.dtor); }
                    b.getLocal(tmp); b.callByName(this.allocator.free);
                    return;
                }
                this.emitExpr(b, node.target); b.callByName(this.allocator.free);
                return;
            }
        }
    }

    emitExpr(b: FunctionIRBuilder, node: any) {
        if (!node) return;
        switch (node.kind) {
            case 'NumberLiteral':
                if (typeof node.value === 'bigint') {
                    b.i64Const(node.value);
                } else if (Number.isInteger(node.value)) {
                    if (node.value >= -2147483648 && node.value <= 4294967295) {
                        b.i32Const(node.value | 0);
                    } else {
                        b.i64Const(BigInt(node.value));
                    }
                } else {
                    if (node.isFloat32) b.f32Const(node.value);
                    else b.f64Const(node.value);
                }
                return;
            case 'BooleanLiteral': b.i32Const(node.value ? 1 : 0); return;
            case 'NullLiteral':    b.i32Const(-1); return;
            case 'StringLiteral': {
                const ref = this.stringPool.add(node.value);
                b.i32Const(ref.offset); return;
            }

            case 'ThisExpr':
                if (this.captures.has('this')) {
                    const cl = this.captures.get('this')!;
                    const envIdx = this.locals.get('__env')!.index;
                    b.getLocal(envIdx);
                    b.i32Load(cl.offset, 2);
                    return;
                }
                b.getLocal(this.locals.get('this')!.index);
                return;

            case 'Identifier': {
                if (this.captures.has(node.name)) {
                    const cl = this.captures.get(node.name)!;
                    const envIdx = this.locals.get('__env')!.index;
                    b.getLocal(envIdx);
                    if (cl.type === 'int64' || cl.type === 'uint64') b.i64Load(cl.offset, 3);
                    else if (cl.type === 'float') b.f32Load(cl.offset, 2);
                    else if (cl.type === 'double') b.f64Load(cl.offset, 3);
                    else b.i32Load(cl.offset, 2);
                    return;
                }
                const l = this.locals.get(node.name);
                if (l) { b.getLocal(l.index); return; }
                if (this.curClass) {
                    const ci = this.classInfo.get(this.curClass)!;
                    if (ci.fields.has(node.name)) {
                        const f = ci.fields.get(node.name)!;
                        b.getLocal(this.locals.get('this')!.index);
                        if (f.type === 'float') b.f32Load(f.offset, 2);
                        else if (f.type === 'double') b.f64Load(f.offset, 3);
                        else if (f.type === 'int64' || f.type === 'uint64') b.i64Load(f.offset, 3);
                        else b.i32Load(f.offset, 2);
                        return;
                    }
                    if (ci.statics.has(node.name)) {
                        b.globalGet(ci.statics.get(node.name)!.globalName); return;
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

            case 'LambdaExpr': {
                const paramTypes = node.params.map((p: any) => this.resolveTypeName(p.type));
                let retType = 'void';
                if (node._resolvedFnPtrType) {
                    const parsed = this.parseFnPtrType(node._resolvedFnPtrType);
                    if (parsed) retType = parsed.ret;
                } else {
                    retType = this.inferLambdaReturn(node.body) || 'void';
                }
                const name = node._lambdaName || `__lambda_${this.lambdaCounter++}`;
                node._lambdaName = name;
                if (!this.lambdaEmitted.has(name)) {
                    this.lambdaEmitted.add(name);
                    this.emitLambdaFunction(node, paramTypes, retType, name);
                }
                const fnIdx = this.funcTableIndex.get(name);
                if (fnIdx === undefined) throw new Error(`WASM: lambda '${name}' no registrada en tabla`);

                const captures = node._captures || [];
                if (captures.length === 0) {
                    b.i32Const(this.getStaticClosureAddr(name, fnIdx));
                    return;
                }

                const layout: { name: string; type: string; offset: number }[] = [];
                let offset = 8;
                for (const c of captures) {
                    const { size, align } = this.captureSizeAndAlign(c.type);
                    offset = (offset + align - 1) & ~(align - 1);
                    layout.push({ name: c.name, type: c.type, offset });
                    offset += size;
                }
                const closureSize = offset;

                const tmp = b.addLocal(`__clo_${this.tmpCounter++}`, 'i32');
                b.i32Const(closureSize);
                b.callByName(this.allocator.malloc);
                b.setLocal(tmp);
                b.getLocal(tmp); b.i32Const(fnIdx); b.i32Store(0, 2);
                for (const cl of layout) {
                    b.getLocal(tmp);
                    if (cl.name === 'this') {
                        if (this.captures.has('this')) {
                            const outerCl = this.captures.get('this')!;
                            const outerEnvIdx = this.locals.get('__env')!.index;
                            b.getLocal(outerEnvIdx);
                            b.i32Load(outerCl.offset, 2);
                        } else {
                            b.getLocal(this.locals.get('this')!.index);
                        }
                    } else {
                        this.emitExpr(b, { kind: 'Identifier', name: cl.name });
                    }
                    if (cl.type === 'int64' || cl.type === 'uint64') b.i64Store(cl.offset, 3);
                    else if (cl.type === 'float') b.f32Store(cl.offset, 2);
                    else if (cl.type === 'double') b.f64Store(cl.offset, 3);
                    else b.i32Store(cl.offset, 2);
                }
                b.getLocal(tmp);
                return;
            }

            case 'Ternary': {
                const thenType = this.getExprType(node.thenExpr);
                const elseType = this.getExprType(node.elseExpr);
                const resultType =
                    (thenType && elseType && (thenType === elseType || thenType === 'null' || elseType === 'null'))
                        ? (thenType === 'null' ? elseType! : elseType === 'null' ? thenType! : thenType)
                        : (this.promoteNumericType(thenType || '', elseType || '') || thenType || elseType || 'int');

                const wasmResult = this.wasmType(resultType);
                this.emitExpr(b, node.condition);
                b.if_(wasmResult as any);
                    this.emitExprCoerced(b, node.thenExpr, resultType);
                b.else_();
                    this.emitExprCoerced(b, node.elseExpr, resultType);
                b.end();
                return;
            }

            case 'CastExpr': {
                const from = this.getExprType(node.expr);
                this.emitExpr(b, node.expr);
                this.emitCast(b, from, node.targetType);
                return;
            }

            case 'BinaryOp': {
                const op = node.op;
                const lt = this.getExprType(node.left);
                const rt = this.getExprType(node.right);

                if (op === '+') {
                    const ls = lt === 'string', rs = rt === 'string';
                    if (ls || rs) {
                        this.emitExpr(b, node.left);
                        if (!ls) {
                            if (this.isEnumType(lt)) b.i32Load(0, 2);
                            if (lt === 'uint64') b.callByName(this.u64ToHeapStr);
                            else if (lt === 'int64') b.callByName(this.i64ToHeapStr);
                            else if (lt === 'float') { b.f64PromoteF32(); b.callByName(this.f64ToHeapStr); }
                            else if (lt === 'double') b.callByName(this.f64ToHeapStr);
                            else b.callByName(this.i32ToHeapStr);
                        }
                        this.emitExpr(b, node.right);
                        if (!rs) {
                            if (this.isEnumType(rt)) b.i32Load(0, 2);
                            if (rt === 'uint64') b.callByName(this.u64ToHeapStr);
                            else if (rt === 'int64') b.callByName(this.i64ToHeapStr);
                            else if (rt === 'float') { b.f64PromoteF32(); b.callByName(this.f64ToHeapStr); }
                            else if (rt === 'double') b.callByName(this.f64ToHeapStr);
                            else b.callByName(this.i32ToHeapStr);
                        }
                        b.callByName(this.ensureStringConcatHelper()); return;
                    }
                }

                if ((op === '==' || op === '!=') && lt === 'string' && rt === 'string') {
                    this.emitExpr(b, node.left); this.emitExpr(b, node.right);
                    b.callByName(this.strEq);
                    if (op === '!=') b.i32Eqz();
                    return;
                }

                let domain: 'f32' | 'f64' | 'i64' | 'i32' = 'i32';
                if (lt === 'double' || rt === 'double') domain = 'f64';
                else if (lt === 'float' || rt === 'float') domain = 'f32';
                else if (lt === 'int64' || rt === 'int64' || lt === 'uint64' || rt === 'uint64') domain = 'i64';

                if (domain === 'f32' || domain === 'f64') {
                    const targetSrc = domain === 'f32' ? 'float' : 'double';
                    this.emitExprCoerced(b, node.left, targetSrc);
                    this.emitExprCoerced(b, node.right, targetSrc);
                    if (domain === 'f32') {
                        switch (op) {
                            case '+':  b.f32Add(); break;
                            case '-':  b.f32Sub(); break;
                            case '*':  b.f32Mul(); break;
                            case '/':  b.f32Div(); break;
                            case '==': b.f32Eq();  break;
                            case '!=': b.f32Ne();  break;
                            case '<':  b.f32Lt();  break;
                            case '<=': b.f32Le();  break;
                            case '>':  b.f32Gt();  break;
                            case '>=': b.f32Ge();  break;
                            default: throw new Error(`WASM: op f32 no soportado '${op}'`);
                        }
                    } else {
                        switch (op) {
                            case '+':  b.f64Add(); break;
                            case '-':  b.f64Sub(); break;
                            case '*':  b.f64Mul(); break;
                            case '/':  b.f64Div(); break;
                            case '==': b.f64Eq();  break;
                            case '!=': b.f64Ne();  break;
                            case '<':  b.f64Lt();  break;
                            case '<=': b.f64Le();  break;
                            case '>':  b.f64Gt();  break;
                            case '>=': b.f64Ge();  break;
                            default: throw new Error(`WASM: op f64 no soportado '${op}'`);
                        }
                    }
                    return;
                }

                if (domain === 'i64') {
                    this.emitExpr(b, node.left);
                    if (!(lt === 'int64' || lt === 'uint64')) {
                        if (this.isUnsignedType(lt!)) b.i64ExtendI32U(); else b.i64ExtendI32S();
                    }
                    this.emitExpr(b, node.right);
                    if (!(rt === 'int64' || rt === 'uint64')) {
                        if (this.isUnsignedType(rt!)) b.i64ExtendI32U(); else b.i64ExtendI32S();
                    }
                    const bothU = this.isUnsignedType(lt!) && this.isUnsignedType(rt!);
                    switch (op) {
                        case '+':  b.i64Add(); break;
                        case '-':  b.i64Sub(); break;
                        case '*':  b.i64Mul(); break;
                        case '/':  bothU ? b.i64DivU() : b.i64DivS(); break;
                        case '%':  bothU ? b.i64RemU() : b.i64RemS(); break;
                        case '==': b.i64Eq();  break;
                        case '!=': b.i64Ne();  break;
                        case '<':  bothU ? b.i64LtU() : b.i64LtS(); break;
                        case '<=': bothU ? b.i64LeU() : b.i64LeS(); break;
                        case '>':  bothU ? b.i64GtU() : b.i64GtS(); break;
                        case '>=': bothU ? b.i64GeU() : b.i64GeS(); break;
                        case '&':  b.i64And(); break;
                        case '|':  b.i64Or();  break;
                        case '^':  b.i64Xor(); break;
                        case '<<': b.i64Shl(); break;
                        case '>>': bothU ? b.i64ShrU() : b.i64ShrS(); break;
                        default: throw new Error(`WASM: op i64 no soportado '${op}'`);
                    }
                    return;
                }

                this.emitExpr(b, node.left);
                this.emitExpr(b, node.right);
                const bothU = this.isUnsignedType(lt!) && this.isUnsignedType(rt!);
                switch (op) {
                    case '+':  b.i32Add(); break;
                    case '-':  b.i32Sub(); break;
                    case '*':  b.i32Mul(); break;
                    case '/':  bothU ? b.i32DivU() : b.i32DivS(); break;
                    case '%':  bothU ? b.i32RemU() : b.i32RemS(); break;
                    case '==': b.i32Eq();  break;
                    case '!=': b.i32Ne();  break;
                    case '<':  bothU ? b.i32LtU() : b.i32LtS(); break;
                    case '<=': bothU ? b.i32LeU() : b.i32LeS(); break;
                    case '>':  bothU ? b.i32GtU() : b.i32GtS(); break;
                    case '>=': bothU ? b.i32GeU() : b.i32GeS(); break;
                    case '&&': b.i32And(); break;
                    case '||': b.i32Or();  break;
                    case '&':  b.i32And(); break;
                    case '|':  b.i32Or();  break;
                    case '^':  b.i32Xor(); break;
                    case '<<': b.i32Shl(); break;
                    case '>>': bothU ? b.i32ShrU() : b.i32ShrS(); break;
                    default: throw new Error(`WASM: op no soportado '${op}'`);
                }
                return;
            }

            case 'UnaryOp': {
                const t = this.getExprType(node.operand);
                const isF32 = t === 'float';
                const isF64 = t === 'double';
                const isI64 = t === 'int64' || t === 'uint64';

                if (node.op === '-') {
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
                if (node.op === '!') b.i32Eqz();
                else if (node.op === '~') {
                    if (isI64) { b.i64Const(-1n); b.i64Xor(); }
                    else       { b.i32Const(-1);  b.i32Xor(); }
                }
                return;
            }

            case 'Assignment': {
                const t = node.target;

                if (t.kind === 'Identifier' && this.captures.has(t.name)) {
                    throw new Error(`WASM: no se puede asignar a '${t.name}': capturado por valor en lambda`);
                }

                if (t.kind === 'MemberAccess') {
                    const sm = this.resolveStaticMember(t);
                    if (sm && sm.kind === 'field') {
                        this.emitExprCoerced(b, node.expr, sm.fieldInfo!.type);
                        b.globalSet(sm.fieldInfo!.globalName);
                        return;
                    }
                }

                const targetType = this.getExprType(t);
                const targetCi = targetType ? this.classInfo.get(targetType) : null;
                if (targetCi && targetCi.isStruct && t.kind === 'Identifier' && this.locals.has(t.name)) {
                    const l = this.locals.get(t.name)!;
                    b.getLocal(l.index); this.emitExpr(b, node.expr);
                    b.i32Const(targetCi.sizeof); b.memoryCopy();
                    return;
                }

                if (t.kind === 'Identifier') {
                    if (this.locals.has(t.name)) {
                        const l = this.locals.get(t.name)!;
                        this.emitExprCoerced(b, node.expr, l.type);
                        b.setLocal(l.index); return;
                    }
                    if (this.curClass) {
                        const ci = this.classInfo.get(this.curClass)!;
                        if (ci.fields.has(t.name)) {
                            const f = ci.fields.get(t.name)!;
                            b.getLocal(this.locals.get('this')!.index);
                            this.emitExprCoerced(b, node.expr, f.type);
                            if (f.type === 'float') b.f32Store(f.offset, 2);
                            else if (f.type === 'double') b.f64Store(f.offset, 3);
                            else if (f.type === 'int64' || f.type === 'uint64') b.i64Store(f.offset, 3);
                            else b.i32Store(f.offset, 2);
                            return;
                        }
                        if (ci.statics.has(t.name)) {
                            this.emitExprCoerced(b, node.expr, ci.statics.get(t.name)!.type);
                            b.globalSet(ci.statics.get(t.name)!.globalName); return;
                        }
                    }
                    throw new Error(`WASM: assignment a '${t.name}' no soportado`);
                }
                if (t.kind === 'MemberAccess') {
                    const objT = this.getExprType(t.object);
                    if (!objT) throw new Error(`WASM: no sé el tipo de ${t.property}`);
                    const ci = this.classInfo.get(objT);
                    if (!ci) throw new Error(`WASM: clase '${objT}' no declarada`);
                    const f = ci.fields.get(t.property);
                    if (!f) throw new Error(`WASM: campo '${t.property}' no existe en '${objT}'`);
                    this.emitExpr(b, t.object);
                    this.emitExprCoerced(b, node.expr, f.type);
                    if (f.type === 'float') b.f32Store(f.offset, 2);
                    else if (f.type === 'double') b.f64Store(f.offset, 3);
                    else if (f.type === 'int64' || f.type === 'uint64') b.i64Store(f.offset, 3);
                    else b.i32Store(f.offset, 2);
                    return;
                }
                if (t.kind === 'IndexExpr') {
                    const elemT = this.arrayElemType(t.array);
                    const es = elemT ? this.elemSizeOf(elemT) : 4;
                    this.emitIndexAddr(b, t.array, t.index, es);
                    this.emitExprCoerced(b, node.expr, elemT);
                    if (this.isF32Elem(elemT)) b.f32Store(0, 2);
                    else if (this.isF64Elem(elemT)) b.f64Store(0, 3);
                    else if (this.isI64Elem(elemT)) b.i64Store(0, 3);
                    else b.i32Store(0, 2);
                    return;
                }
                throw new Error(`WASM: assignment target no soportado (${t.kind})`);
            }

            case 'CompoundAssignment': {
                const t = node.target;
                if (t.kind === 'Identifier' && this.captures.has(t.name)) {
                    throw new Error(`WASM: no se puede modificar '${t.name}': capturado por valor en lambda`);
                }

                if (t.kind === 'MemberAccess') {
                    const sm = this.resolveStaticMember(t);
                    if (sm && sm.kind === 'field') {
                        const fInfo = sm.fieldInfo!;
                        const t32 = fInfo.type === 'float';
                        const t64 = fInfo.type === 'double';
                        const ti64 = fInfo.type === 'int64' || fInfo.type === 'uint64';
                        b.globalGet(fInfo.globalName);
                        this.emitExprCoerced(b, node.expr, fInfo.type);
                        if (t32) {
                            const fm: any = { '+': 'f32Add', '-': 'f32Sub', '*': 'f32Mul', '/': 'f32Div' };
                            (b as any)[fm[node.binOp]]();
                        } else if (t64) {
                            const fm: any = { '+': 'f64Add', '-': 'f64Sub', '*': 'f64Mul', '/': 'f64Div' };
                            (b as any)[fm[node.binOp]]();
                        } else if (ti64) {
                            const im: any = { '+': 'i64Add', '-': 'i64Sub', '*': 'i64Mul', '/': 'i64DivS', '%': 'i64RemS' };
                            (b as any)[im[node.binOp]]();
                        } else {
                            const im: any = { '+': 'i32Add', '-': 'i32Sub', '*': 'i32Mul', '/': 'i32DivS', '%': 'i32RemS' };
                            (b as any)[im[node.binOp]]();
                        }
                        b.globalSet(fInfo.globalName);
                        return;
                    }
                }

                if (t.kind === 'Identifier') {
                    const l = this.locals.get(t.name);
                    if (!l) throw new Error(`WASM: compound a no-local`);
                    const isI64 = l.type === 'int64' || l.type === 'uint64';
                    const isF32 = l.type === 'float';
                    const isF64 = l.type === 'double';
                    b.getLocal(l.index);
                    this.emitExprCoerced(b, node.expr, l.type);
                    if (isI64) {
                        const im: any = { '+': 'i64Add', '-': 'i64Sub', '*': 'i64Mul', '/': 'i64DivS', '%': 'i64RemS' };
                        (b as any)[im[node.binOp]]();
                    } else if (isF32) {
                        const fm: any = { '+': 'f32Add', '-': 'f32Sub', '*': 'f32Mul', '/': 'f32Div' };
                        (b as any)[fm[node.binOp]]();
                    } else if (isF64) {
                        const fm: any = { '+': 'f64Add', '-': 'f64Sub', '*': 'f64Mul', '/': 'f64Div' };
                        (b as any)[fm[node.binOp]]();
                    } else {
                        const im: any = { '+': 'i32Add', '-': 'i32Sub', '*': 'i32Mul', '/': 'i32DivS', '%': 'i32RemS' };
                        (b as any)[im[node.binOp]]();
                    }
                    b.setLocal(l.index);
                    return;
                }
                if (t.kind === 'IndexExpr') {
                    const elemT = this.arrayElemType(t.array);
                    const es = elemT ? this.elemSizeOf(elemT) : 4;
                    const isF32 = this.isF32Elem(elemT);
                    const isF64 = this.isF64Elem(elemT);
                    const isI64 = this.isI64Elem(elemT);
                    const addrTmp = b.addLocal(`__ca_${this.tmpCounter++}`, 'i32');
                    const valTmp = b.addLocal(`__cv_${this.tmpCounter++}`, isF32 ? 'f32' : isF64 ? 'f64' : isI64 ? 'i64' : 'i32');
                    this.emitIndexAddr(b, t.array, t.index, es); b.setLocal(addrTmp);
                    b.getLocal(addrTmp);
                    if (isF32) b.f32Load(0, 2);
                    else if (isF64) b.f64Load(0, 3);
                    else if (isI64) b.i64Load(0, 3);
                    else b.i32Load(0, 2);
                    this.emitExprCoerced(b, node.expr, elemT);
                    if (isF32) {
                        const fm: any = { '+': 'f32Add', '-': 'f32Sub', '*': 'f32Mul', '/': 'f32Div' };
                        (b as any)[fm[node.binOp]]();
                    } else if (isF64) {
                        const fm: any = { '+': 'f64Add', '-': 'f64Sub', '*': 'f64Mul', '/': 'f64Div' };
                        (b as any)[fm[node.binOp]]();
                    } else if (isI64) {
                        const im: any = { '+': 'i64Add', '-': 'i64Sub', '*': 'i64Mul', '/': 'i64DivS', '%': 'i64RemS' };
                        (b as any)[im[node.binOp]]();
                    } else {
                        const im: any = { '+': 'i32Add', '-': 'i32Sub', '*': 'i32Mul', '/': 'i32DivS', '%': 'i32RemS' };
                        (b as any)[im[node.binOp]]();
                    }
                    b.setLocal(valTmp);
                    b.getLocal(addrTmp); b.getLocal(valTmp);
                    if (isF32) b.f32Store(0, 2);
                    else if (isF64) b.f64Store(0, 3);
                    else if (isI64) b.i64Store(0, 3);
                    else b.i32Store(0, 2);
                    return;
                }
                throw new Error(`WASM: compound target no soportado (${t.kind})`);
            }

            case 'IncrementExpr': {
                const t = node.target;
                if (t.kind === 'Identifier' && this.captures.has(t.name)) {
                    throw new Error(`WASM: no se puede modificar '${t.name}': capturado por valor en lambda`);
                }

                if (t.kind === 'MemberAccess') {
                    const sm = this.resolveStaticMember(t);
                    if (sm && sm.kind === 'field') {
                        const fInfo = sm.fieldInfo!;
                        const isI64 = fInfo.type === 'int64' || fInfo.type === 'uint64';
                        b.globalGet(fInfo.globalName);
                        if (isI64) {
                            b.i64Const(1);
                            if (node.op === '++') b.i64Add(); else b.i64Sub();
                        } else {
                            b.i32Const(1);
                            if (node.op === '++') b.i32Add(); else b.i32Sub();
                        }
                        b.globalSet(fInfo.globalName);
                        return;
                    }
                }

                if (t.kind === 'Identifier') {
                    const l = this.locals.get(t.name);
                    if (!l) throw new Error(`WASM: incremento a no-local`);
                    const isI64 = l.type === 'int64' || l.type === 'uint64';
                    b.getLocal(l.index);
                    if (isI64) {
                        b.i64Const(1);
                        if (node.op === '++') b.i64Add(); else b.i64Sub();
                    } else {
                        b.i32Const(1);
                        if (node.op === '++') b.i32Add(); else b.i32Sub();
                    }
                    b.setLocal(l.index);
                    return;
                }
                throw new Error(`WASM: incremento no soportado en ${t.kind}`);
            }

            case 'SuperCall': {
                if (!this.curClass) throw new Error('WASM: super() fuera de una clase');
                const thisL = this.locals.get('this');
                if (!thisL) throw new Error('WASM: super() fuera de un método de instancia');
                const ci = this.classInfo.get(this.curClass);
                if (!ci || !ci.baseName) throw new Error(`WASM: '${this.curClass}' no tiene clase base`);
                const baseName = this.resolveTypeName(ci.baseName);
                const baseCi = this.classInfo.get(baseName);
                if (!baseCi) throw new Error(`WASM: clase base '${ci.baseName}' no registrada`);

                const ctor = this.findCtorForArgCount(baseCi, node.args.length);
                if (!ctor) throw new Error(`WASM: clase base '${ci.baseName}' no tiene ctor con ${node.args.length} args`);
                b.getLocal(thisL.index);
                for (let i = 0; i < node.args.length; i++) {
                    this.emitExprCoerced(b, node.args[i], ctor.paramTypes[i] || null);
                }
                b.callByName(ctor.wasmName);
                return;
            }

            case 'Call': {
                const bpath = this.pathOf(node.callee);
                if (bpath && this.emitBuiltinCall(bpath, b, node.args)) return;

                if (node.callee.kind === 'Identifier' && this.importedFunctions.has(node.callee.name)) {
                    const imp = this.importedFunctions.get(node.callee.name)!;
                    for (let i = 0; i < node.args.length; i++) {
                        this.emitExprCoerced(b, node.args[i], imp.paramTypes[i] || null);
                    }
                    b.callByName(node.callee.name);
                    return;
                }

                const callee = node.callee;

                if (callee.kind === 'Identifier') {
                    const l = this.locals.get(callee.name);
                    if (l && this.isFnPtrType(l.type)) {
                        const fp = this.parseFnPtrType(l.type)!;
                        const wasmParams: WasmPrim[] = ['i32', ...fp.params.map(t => this.toWasmType(t))];
                        const wasmRet: WasmPrim[] = fp.ret === 'void' ? [] : [this.toWasmType(fp.ret) as WasmPrim];
                        const typeIdx = this.mod.getTypeIndex(wasmParams as any, wasmRet as any);

                        const tmp = b.addLocal(`__cl_${this.tmpCounter++}`, 'i32');
                        b.getLocal(l.index);
                        b.setLocal(tmp);
                        b.getLocal(tmp);
                        for (let i = 0; i < node.args.length; i++) {
                            this.emitExprCoerced(b, node.args[i], fp.params[i] || null);
                        }
                        b.getLocal(tmp); b.i32Load(0, 2);
                        b.callIndirect(typeIdx);
                        return;
                    }
                }

                if (callee.kind === 'MemberAccess') {
                    const sm = this.resolveStaticMember(callee, node._resolvedMethodSig);
                    if (sm && sm.kind === 'method') {
                        const m = sm.methodInfo!;
                        b.i32Const(0);
                        for (let i = 0; i < node.args.length; i++) {
                            this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
                        }
                        b.callByName(m.wasmName);
                        return;
                    }
                }
                if (callee.kind === 'MemberAccess') {
                    const objT = this.getExprType(callee.object);
                    if (!objT) throw new Error(`WASM: no sé el tipo del receptor de '${callee.property}'`);
                    const ci = this.classInfo.get(objT);
                    if (!ci) throw new Error(`WASM: clase '${objT}' no declarada`);

                    let m: MethodInfo | null = null;
                    if (node._resolvedMethodSig) m = ci.methods.get(node._resolvedMethodSig) || null;
                    if (!m) m = this.findMethodByName(ci, callee.property);
                    if (!m) throw new Error(`WASM: método '${callee.property}' no existe en '${objT}'`);

                    if (m.isVirtual && !m.isStatic) {
                        if (!ci.isPolymorphic) {
                            throw new Error(`WASM: '${callee.property}' es virtual pero '${objT}' no es polimórfica (bug interno)`);
                        }
                        const sigKey = node._resolvedMethodSig || this.methodSig(callee.property, m.paramTypes);
                        const slot = ci.virtualSlots.get(sigKey);
                        if (slot === undefined) {
                            throw new Error(`WASM: slot virtual no asignado para '${objT}.${sigKey}'`);
                        }
                        const wasmParamTypes: WasmPrim[] = ['i32', ...m.paramTypes.map(t => this.toWasmType(t))];
                        const wasmRetTypes: WasmPrim[] = m.retType === 'void' ? [] : [m.retType as WasmPrim];
                        const typeIdx = this.mod.getTypeIndex(wasmParamTypes as any, wasmRetTypes as any);

                        const objTmp = b.addLocal(`__vt_${this.tmpCounter++}`, 'i32');
                        this.emitExpr(b, callee.object);
                        b.setLocal(objTmp);
                        b.getLocal(objTmp);
                        for (let i = 0; i < node.args.length; i++) {
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
                        for (let i = 0; i < node.args.length; i++) {
                            this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
                        }
                    } else {
                        this.emitExpr(b, callee.object);
                        for (let i = 0; i < node.args.length; i++) {
                            this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
                        }
                    }
                    b.callByName(m.wasmName); return;
                }
                if (callee.kind === 'Identifier') {
                    const name = callee.name;

                    if (node._resolvedMethodSig && node._resolvedMethodClass) {
                        const ci = this.classInfo.get(node._resolvedMethodClass);
                        if (ci) {
                            const m = ci.methods.get(node._resolvedMethodSig);
                            if (m) {
                                b.i32Const(0);
                                for (let i = 0; i < node.args.length; i++) {
                                    this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
                                }
                                b.callByName(m.wasmName);
                                return;
                            }
                        }
                    }

                    if (this.curClass) {
                        const ci = this.classInfo.get(this.curClass)!;
                        const m = this.findStaticMethod(ci, name);
                        if (m) {
                            b.i32Const(0);
                            for (let i = 0; i < node.args.length; i++) {
                                this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
                            }
                            b.callByName(m.wasmName); return;
                        }
                    }
                    for (const [, ci] of this.classInfo) {
                        const m = this.findStaticMethod(ci, name);
                        if (m) {
                            b.i32Const(0);
                            for (let i = 0; i < node.args.length; i++) {
                                this.emitExprCoerced(b, node.args[i], m.paramTypes[i] || null);
                            }
                            b.callByName(m.wasmName); return;
                        }
                    }
                    throw new Error(`WASM: función '${name}' no encontrada`);
                }
                throw new Error(`WASM: call no soportado (${callee.kind})`);
            }

            case 'NewExpr': {
                const rawName = typeof node.className === 'string'
                    ? node.className
                    : (node.className.kind === 'QualifiedName' ? node.className.parts.join('::') : String(node.className));
                const resolved = node._resolvedClassName
                    || this.resolveClassNameForStatic(rawName)
                    || this.resolveTypeName(rawName);
                const ci = this.classInfo.get(resolved);
                if (!ci) throw new Error(`WASM: clase '${rawName}' no declarada`);
                const tmp = b.addLocal(`__new_${this.tmpCounter++}`, 'i32');
                b.i32Const(ci.sizeof); b.callByName(this.allocator.malloc); b.setLocal(tmp);
                b.getLocal(tmp); b.i32Const(0); b.i32Const(ci.sizeof); b.memoryFill();
                if (ci.isPolymorphic) {
                    b.getLocal(tmp);
                    b.i32Const(ci.typeTag);
                    b.i32Store(ci.tagOffset, 2);
                }

                let ctor: CtorInfo | null = null;
                if (node._resolvedCtorSig) ctor = ci.ctors.get(node._resolvedCtorSig) || null;
                if (!ctor) ctor = this.findCtorForArgCount(ci, node.args.length);

                if (ctor) {
                    b.getLocal(tmp);
                    for (let i = 0; i < node.args.length; i++) {
                        this.emitExprCoerced(b, node.args[i], ctor.paramTypes[i] || null);
                    }
                    b.callByName(ctor.wasmName);
                }
                b.getLocal(tmp); return;
            }

            case 'NewArrayExpr': {
                const sizes = node.sizes || [];
                if (sizes.length === 0) throw new Error('WASM: new[] sin dimensiones');
                const elemT = node._resolvedElementType
                    || this.resolveClassNameForStatic(String(node.elementType))
                    || this.resolveTypeName(String(node.elementType));

                const buildNested = (dimIdx: number, resultLocal: number) => {
                    if (dimIdx === sizes.length - 1) {
                        const elemSize = this.elemSizeOf(elemT);
                        const nLoc   = b.addLocal(`__na_${this.tmpCounter++}`, 'i32');
                        const blkLoc = b.addLocal(`__nab_${this.tmpCounter++}`, 'i32');
                        this.emitExpr(b, sizes[dimIdx]); b.setLocal(nLoc);
                        b.i32Const(4);
                        b.getLocal(nLoc); b.i32Const(elemSize); b.i32Mul(); b.i32Add();
                        b.callByName(this.allocator.malloc); b.setLocal(blkLoc);
                        b.getLocal(blkLoc); b.getLocal(nLoc); b.i32Store(0, 2);
                        b.getLocal(blkLoc); b.i32Const(4); b.i32Add(); b.setLocal(resultLocal);
                        return;
                    }

                    const nLoc     = b.addLocal(`__na_${this.tmpCounter++}`, 'i32');
                    const iLoc     = b.addLocal(`__nai_${this.tmpCounter++}`, 'i32');
                    const outerLoc = b.addLocal(`__nao_${this.tmpCounter++}`, 'i32');
                    const subLoc   = b.addLocal(`__nas_${this.tmpCounter++}`, 'i32');
                    const topL = `na_top_${this.tmpCounter++}`;
                    const endL = `na_end_${this.tmpCounter++}`;

                    this.emitExpr(b, sizes[dimIdx]); b.setLocal(nLoc);
                    b.i32Const(4);
                    b.getLocal(nLoc); b.i32Const(4); b.i32Mul(); b.i32Add();
                    b.callByName(this.allocator.malloc); b.setLocal(outerLoc);
                    b.getLocal(outerLoc); b.getLocal(nLoc); b.i32Store(0, 2);

                    b.i32Const(0); b.setLocal(iLoc);
                    b.block('void', endL);
                    b.loop('void', topL);
                        b.getLocal(iLoc); b.getLocal(nLoc); b.i32GeU(); b.brIfTo(endL);

                        buildNested(dimIdx + 1, subLoc);

                        b.getLocal(outerLoc); b.i32Const(4); b.i32Add();
                        b.getLocal(iLoc); b.i32Const(4); b.i32Mul(); b.i32Add();
                        b.getLocal(subLoc); b.i32Store(0, 2);

                        b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
                        b.brTo(topL);
                    b.end(); b.end();

                    b.getLocal(outerLoc); b.i32Const(4); b.i32Add(); b.setLocal(resultLocal);
                };

                const resultLoc = b.addLocal(`__nar_${this.tmpCounter++}`, 'i32');
                buildNested(0, resultLoc);
                b.getLocal(resultLoc);
                return;
            }

            case 'IndexExpr': {
                const elemT = this.arrayElemType(node.array);
                const es = elemT ? this.elemSizeOf(elemT) : 4;
                this.emitIndexAddr(b, node.array, node.index, es);
                if (this.isF32Elem(elemT)) b.f32Load(0, 2);
                else if (this.isF64Elem(elemT)) b.f64Load(0, 3);
                else if (this.isI64Elem(elemT)) b.i64Load(0, 3);
                else b.i32Load(0, 2);
                return;
            }

            case 'MemberAccess': {
                const em = this.resolveEnumMember(node);
                if (em) { b.i32Const(em.member.address | 0); return; }
                const sm = this.resolveStaticMember(node);
                if (sm && sm.kind === 'field') {
                    b.globalGet(sm.fieldInfo!.globalName); return;
                }
                const objT = this.getExprType(node.object);
                if (!objT) throw new Error(`WASM: no sé el tipo de ${node.property}`);
                if (node.property === 'length' && (objT === 'string' || objT.endsWith('[]'))) {
                    this.emitExpr(b, node.object); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2); return;
                }
                const ci = this.classInfo.get(objT);
                if (!ci) throw new Error(`WASM: clase '${objT}' no declarada`);
                const f = ci.fields.get(node.property);
                if (!f) throw new Error(`WASM: campo '${node.property}' no existe en '${objT}'`);
                this.emitExpr(b, node.object);
                if (f.type === 'float') b.f32Load(f.offset, 2);
                else if (f.type === 'double') b.f64Load(f.offset, 3);
                else if (f.type === 'int64' || f.type === 'uint64') b.i64Load(f.offset, 3);
                else b.i32Load(f.offset, 2);
                return;
            }

            case 'AddressOfExpr': {
                const t = node.target;
                if (t.kind === 'Identifier') {
                    const l = this.locals.get(t.name);
                    if (!l) throw new Error(`WASM: &${t.name} - variable desconocida`);
                    const ci = this.classInfo.get(l.type);
                    if (ci) { b.getLocal(l.index); return; }
                    throw new Error(`WASM: &${t.name} - no se puede tomar la dirección de una variable local primitiva '${l.type}'. Usa un objeto stack (struct/class).`);
                }
                if (t.kind === 'MemberAccess') {
                    const objT = this.getExprType(t.object);
                    if (!objT) throw new Error(`WASM: &obj.field - objeto desconocido`);
                    const ci = this.classInfo.get(objT);
                    if (!ci) throw new Error(`WASM: &obj.field - '${objT}' no es clase/struct`);
                    const f = ci.fields.get(t.property);
                    if (!f) throw new Error(`WASM: &obj.field - '${t.property}' no existe en '${objT}'`);
                    this.emitExpr(b, t.object);
                    b.i32Const(f.offset); b.i32Add();
                    return;
                }
                if (t.kind === 'IndexExpr') {
                    const elemT = this.arrayElemType(t.array);
                    const es = elemT ? this.elemSizeOf(elemT) : 4;
                    this.emitIndexAddr(b, t.array, t.index, es);
                    return;
                }
                throw new Error(`WASM: & sobre expresión no soportada (${t.kind})`);
            }

            case 'ArrayLiteral':
                throw new Error(`WASM: array literals solo válidos dentro de System.wasi.Import`);

            default:
                throw new Error(`WASM: expresión no soportada '${node.kind}'`);
        }
    }
}


/// resolveStaticMember
