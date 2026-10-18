// wasm-runtime.ts
//
// Runtime inyectado en el módulo WASM:
//   - __malloc / __free      : allocator con boundary tags, coalescing, split
//   - __str_eq               : comparación de strings por contenido
//   - __wasi_write_buf       : escribe bytes a stdout vía wasi.fd_write
//   - __i32_to_string        : i32 decimal ASCII
//   - __f64_to_string        : f64 decimal ASCII (2 decimales)
//   - __i64_to_string        : i64 signed decimal ASCII
//   - __u64_to_string        : i64 reinterpretado como unsigned decimal ASCII
//   - __{i32,f64,i64,u64}_to_heap_string : variantes que devuelven un string
//     con prefijo de longitud en el heap, consumibles por __builtin_string_concat
//   - __larena_top           : arena de objetos locales (stack alloc de clases/structs)

import { ModuleBuilder } from './compiler';

export const HEADER_BYTES = 8;
export const FOOTER_BYTES = 8;
export const OVERHEAD = HEADER_BYTES + FOOTER_BYTES;
export const MIN_PAYLOAD = 8;

export interface AllocatorRefs {
    malloc: string;
    free: string;
    heapStart: string;
    heapTop: string;
    heapLimit: string;
}

// ─────────────────────────────────────────────────────────────
//  __malloc / __free
// ─────────────────────────────────────────────────────────────
export function injectAllocator(
    mod: ModuleBuilder,
    heapStart: number,
    heapLimit: number,
): AllocatorRefs {
    const MALLOC  = '__malloc';
    const FREE    = '__free';
    const G_START = '__heap_start';
    const G_TOP   = '__heap_top';
    const G_LIMIT = '__heap_limit';

    mod.addGlobal(G_START, 'i32', true, heapStart);
    mod.addGlobal(G_TOP,   'i32', true, heapStart);
    mod.addGlobal(G_LIMIT, 'i32', true, heapLimit);

    mod.addFunction(MALLOC, ['i32'], 'i32', (b) => {
        const size     = 0;
        const aligned  = b.addLocal('aligned', 'i32');
        const block    = b.addLocal('block', 'i32');
        const sz       = b.addLocal('sz', 'i32');
        const flg      = b.addLocal('flg', 'i32');
        const need     = b.addLocal('need', 'i32');
        const leftover = b.addLocal('leftover', 'i32');
        const newBlk   = b.addLocal('newBlk', 'i32');

        b.getLocal(size); b.i32Const(7); b.i32Add();
        b.i32Const(-8);   b.i32And();
        b.setLocal(aligned);

        b.globalGet(G_START); b.setLocal(block);

        b.block('i32', 'done');
            b.block('void', 'scan_end');
            b.loop('void', 'scan_loop');
                b.getLocal(block);
                b.globalGet(G_TOP);
                b.i32GeU();
                b.brIfTo('scan_end');

                b.getLocal(block); b.i32Load(0, 2); b.setLocal(sz);
                b.getLocal(block); b.i32Load(4, 2); b.setLocal(flg);

                b.getLocal(flg); b.i32Eqz();
                b.if_('void');
                    b.getLocal(sz); b.getLocal(aligned); b.i32GeU();
                    b.if_('void');
                        b.getLocal(sz);
                        b.getLocal(aligned);
                        b.i32Const(OVERHEAD + MIN_PAYLOAD);
                        b.i32Add();
                        b.i32GeU();
                        b.if_('void');
                            b.getLocal(sz);
                            b.i32Const(OVERHEAD);
                            b.i32Sub();
                            b.getLocal(aligned);
                            b.i32Sub();
                            b.setLocal(leftover);

                            b.getLocal(block); b.getLocal(aligned); b.i32Store(0, 2);
                            b.getLocal(block); b.i32Const(1);       b.i32Store(4, 2);
                            b.getLocal(block); b.i32Const(HEADER_BYTES); b.i32Add();
                            b.getLocal(aligned); b.i32Add();
                            b.getLocal(aligned); b.i32Store(0, 2);

                            b.getLocal(block); b.i32Const(OVERHEAD); b.i32Add();
                            b.getLocal(aligned); b.i32Add(); b.setLocal(newBlk);

                            b.getLocal(newBlk); b.getLocal(leftover); b.i32Store(0, 2);
                            b.getLocal(newBlk); b.i32Const(0);        b.i32Store(4, 2);
                            b.getLocal(newBlk); b.i32Const(HEADER_BYTES); b.i32Add();
                            b.getLocal(leftover); b.i32Add();
                            b.getLocal(leftover); b.i32Store(0, 2);
                        b.else_();
                            b.getLocal(block); b.i32Const(1); b.i32Store(4, 2);
                        b.end();

                        b.getLocal(block); b.i32Const(HEADER_BYTES); b.i32Add();
                        b.brTo('done');
                    b.end();
                b.end();

                b.getLocal(block); b.i32Const(OVERHEAD); b.i32Add();
                b.getLocal(sz);    b.i32Add();
                b.setLocal(block);
                b.brTo('scan_loop');
            b.end();
            b.end();

            b.getLocal(aligned); b.i32Const(OVERHEAD); b.i32Add();
            b.setLocal(need);

            b.globalGet(G_TOP); b.getLocal(need); b.i32Add();
            b.globalGet(G_LIMIT);
            b.i32GtU();
            b.if_('void'); b.unreachable(); b.end();

            b.globalGet(G_TOP); b.setLocal(block);
            b.globalGet(G_TOP); b.getLocal(need); b.i32Add(); b.globalSet(G_TOP);

            b.getLocal(block); b.getLocal(aligned); b.i32Store(0, 2);
            b.getLocal(block); b.i32Const(1);       b.i32Store(4, 2);
            b.getLocal(block); b.i32Const(HEADER_BYTES); b.i32Add();
            b.getLocal(aligned); b.i32Add();
            b.getLocal(aligned); b.i32Store(0, 2);

            b.getLocal(block); b.i32Const(HEADER_BYTES); b.i32Add();
        b.end();
    }, ['size']);

    mod.addFunction(FREE, ['i32'], null, (b) => {
        const p         = 0;
        const header    = b.addLocal('header', 'i32');
        const size      = b.addLocal('size', 'i32');
        const flags     = b.addLocal('flags', 'i32');
        const next      = b.addLocal('next', 'i32');
        const nextFlags = b.addLocal('nextFlags', 'i32');
        const nextSize  = b.addLocal('nextSize', 'i32');
        const prevSize  = b.addLocal('prevSize', 'i32');
        const prevHdr   = b.addLocal('prevHdr', 'i32');
        const prevFlags = b.addLocal('prevFlags', 'i32');

        b.getLocal(p); b.i32Const(0); b.i32LeS();
        b.if_('void'); b.return_(); b.end();

        b.getLocal(p); b.i32Const(HEADER_BYTES); b.i32Sub(); b.setLocal(header);

        b.getLocal(header); b.i32Load(4, 2); b.setLocal(flags);
        b.getLocal(flags); b.i32Eqz();
        b.if_('void'); b.return_(); b.end();

        b.getLocal(header); b.i32Load(0, 2); b.setLocal(size);

        b.block('void', 'fw_done');
        b.loop('void', 'fw_loop');
            b.getLocal(header); b.i32Const(OVERHEAD); b.i32Add();
            b.getLocal(size);   b.i32Add(); b.setLocal(next);
            b.getLocal(next); b.globalGet(G_TOP); b.i32GeU();
            b.brIfTo('fw_done');
            b.getLocal(next); b.i32Load(4, 2); b.setLocal(nextFlags);
            b.getLocal(nextFlags); b.i32Eqz(); b.i32Eqz();
            b.brIfTo('fw_done');
            b.getLocal(next); b.i32Load(0, 2); b.setLocal(nextSize);
            b.getLocal(size); b.i32Const(OVERHEAD); b.i32Add();
            b.getLocal(nextSize); b.i32Add(); b.setLocal(size);
            b.brTo('fw_loop');
        b.end();
        b.end();

        b.block('void', 'bw_done');
        b.loop('void', 'bw_loop');
            b.getLocal(header); b.globalGet(G_START); b.i32LeU();
            b.brIfTo('bw_done');
            b.getLocal(header); b.i32Const(FOOTER_BYTES); b.i32Sub();
            b.i32Load(0, 2);
            b.setLocal(prevSize);
            b.getLocal(header); b.i32Const(OVERHEAD); b.i32Sub();
            b.getLocal(prevSize); b.i32Sub(); b.setLocal(prevHdr);
            b.getLocal(prevHdr); b.globalGet(G_START); b.i32LtU();
            b.brIfTo('bw_done');
            b.getLocal(prevHdr); b.i32Load(4, 2); b.setLocal(prevFlags);
            b.getLocal(prevFlags); b.i32Eqz(); b.i32Eqz();
            b.brIfTo('bw_done');
            b.getLocal(size); b.i32Const(OVERHEAD); b.i32Add();
            b.getLocal(prevSize); b.i32Add(); b.setLocal(size);
            b.getLocal(prevHdr); b.setLocal(header);
            b.brTo('bw_loop');
        b.end();
        b.end();

        b.getLocal(header); b.getLocal(size); b.i32Store(0, 2);
        b.getLocal(header); b.i32Const(0);    b.i32Store(4, 2);
        b.getLocal(header); b.i32Const(HEADER_BYTES); b.i32Add();
        b.getLocal(size);   b.i32Add();
        b.getLocal(size);   b.i32Store(0, 2);
        b.return_();
    }, ['p']);

    return {
        malloc: MALLOC,
        free: FREE,
        heapStart: G_START,
        heapTop: G_TOP,
        heapLimit: G_LIMIT,
    };
}

// ─────────────────────────────────────────────────────────────
//  __str_eq(a, b) -> i32  (1 si iguales por contenido)
// ─────────────────────────────────────────────────────────────
export function injectStringRuntime(mod: ModuleBuilder): { strEq: string } {
    const STR_EQ = '__str_eq';
    mod.addFunction(STR_EQ, ['i32', 'i32'], 'i32', (b) => {
        const a     = 0;
        const bb    = 1;
        const lenA  = b.addLocal('lenA', 'i32');
        const lenB  = b.addLocal('lenB', 'i32');
        const iLoc  = b.addLocal('i', 'i32');

        b.getLocal(a);  b.i32Const(4); b.i32Sub(); b.i32Load(0, 2); b.setLocal(lenA);
        b.getLocal(bb); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2); b.setLocal(lenB);

        b.getLocal(lenA); b.getLocal(lenB); b.i32Ne();
        b.if_('void'); b.i32Const(0); b.return_(); b.end();

        b.i32Const(0); b.setLocal(iLoc);
        b.block('void', 'eq_end');
        b.loop('void', 'eq_top');
            b.getLocal(iLoc); b.getLocal(lenA); b.i32GeU();
            b.brIfTo('eq_end');
            b.getLocal(a);  b.getLocal(iLoc); b.i32Add(); b.i32Load8U(0, 0);
            b.getLocal(bb); b.getLocal(iLoc); b.i32Add(); b.i32Load8U(0, 0);
            b.i32Ne();
            b.if_('void'); b.i32Const(0); b.return_(); b.end();
            b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
            b.brTo('eq_top');
        b.end();
        b.end();
        b.i32Const(1);
    }, ['a', 'b']);
    return { strEq: STR_EQ };
}

// ─────────────────────────────────────────────────────────────
//  __wasi_write_buf(ptr, len) -> void
// ─────────────────────────────────────────────────────────────
export function injectWasiRuntime(
    mod: ModuleBuilder,
    iovScratch: number,
    nwrittenScratch: number,
    fdWriteAlias: string,
): { writeBuf: string } {
    const WRITE_BUF = '__wasi_write_buf';
    mod.addFunction(WRITE_BUF, ['i32', 'i32'], null, (b) => {
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
    }, ['ptr', 'len']);
    return { writeBuf: WRITE_BUF };
}

// ─────────────────────────────────────────────────────────────
//  __i32_to_string(value: i32) -> len
// ─────────────────────────────────────────────────────────────
export function injectIntToString(mod: ModuleBuilder, bufOffset: number): { i32ToStr: string } {
    const FN = '__i32_to_string';
    const REV = bufOffset + 16;

    mod.addFunction(FN, ['i32'], 'i32', (b) => {
        const v     = 0;
        const neg   = b.addLocal('neg', 'i32');
        const i     = b.addLocal('i', 'i32');
        const j     = b.addLocal('j', 'i32');
        const digit = b.addLocal('digit', 'i32');

        b.getLocal(v); b.i32Eqz();
        b.if_('void');
            b.i32Const(bufOffset); b.i32Const(48); b.i32Store8(0, 0);
            b.i32Const(1); b.return_();
        b.end();

        b.getLocal(v); b.i32Const(0); b.i32LtS();
        b.setLocal(neg);

        b.getLocal(neg);
        b.if_('void');
            b.i32Const(0); b.getLocal(v); b.i32Sub(); b.setLocal(v);
        b.end();

        b.i32Const(0); b.setLocal(i);
        b.block('void', 'i32digits_done');
        b.loop('void', 'i32digits_loop');
            b.getLocal(v); b.i32Eqz(); b.brIfTo('i32digits_done');
            b.i32Const(48);
            b.getLocal(v); b.i32Const(10); b.i32RemU();
            b.i32Add();
            b.setLocal(digit);
            b.i32Const(REV); b.getLocal(i); b.i32Add();
            b.getLocal(digit); b.i32Store8(0, 0);
            b.getLocal(v); b.i32Const(10); b.i32DivU(); b.setLocal(v);
            b.getLocal(i); b.i32Const(1); b.i32Add(); b.setLocal(i);
            b.brTo('i32digits_loop');
        b.end();
        b.end();

        b.getLocal(neg);
        b.if_('void');
            b.i32Const(REV); b.getLocal(i); b.i32Add();
            b.i32Const(45); b.i32Store8(0, 0);
            b.getLocal(i); b.i32Const(1); b.i32Add(); b.setLocal(i);
        b.end();

        b.i32Const(0); b.setLocal(j);
        b.block('void', 'i32rev_done');
        b.loop('void', 'i32rev_loop');
            b.getLocal(j); b.getLocal(i); b.i32GeU(); b.brIfTo('i32rev_done');
            b.i32Const(bufOffset); b.getLocal(j); b.i32Add();
            b.i32Const(REV);
            b.getLocal(i); b.i32Const(1); b.i32Sub(); b.getLocal(j); b.i32Sub();
            b.i32Add();
            b.i32Load8U(0, 0); b.i32Store8(0, 0);
            b.getLocal(j); b.i32Const(1); b.i32Add(); b.setLocal(j);
            b.brTo('i32rev_loop');
        b.end();
        b.end();
        b.getLocal(i);
    }, ['value']);

    return { i32ToStr: FN };
}

// ─────────────────────────────────────────────────────────────
//  __f64_to_string(value: f64) -> len    ("N.MM")
// ─────────────────────────────────────────────────────────────
export function injectFloatToString(mod: ModuleBuilder, bufOffset: number): { f64ToStr: string } {
    const FN = '__f64_to_string';

    mod.addFunction(FN, ['f64'], 'i32', (b) => {
        const negL      = b.addLocal('neg', 'i32');
        const intPartL  = b.addLocal('intPart', 'i32');
        const fracPartL = b.addLocal('fracPart', 'i32');
        const lenL      = b.addLocal('len', 'i32');
        const posL      = b.addLocal('pos', 'i32');

        b.getLocal(0); b.f64Const(0.0); b.f64Lt();
        b.setLocal(negL);
        b.getLocal(negL);
        b.if_('void');
            b.getLocal(0); b.f64Neg(); b.setLocal(0);
        b.end();

        b.getLocal(0); b.f64Trunc(); b.i32TruncF64S();
        b.setLocal(intPartL);

        b.getLocal(0);
        b.getLocal(0); b.f64Trunc();
        b.f64Sub();
        b.f64Const(100.0); b.f64Mul();
        b.f64Const(0.5);   b.f64Add();
        b.i32TruncF64S();
        b.setLocal(fracPartL);

        b.getLocal(fracPartL); b.i32Const(100); b.i32GeS();
        b.if_('void');
            b.getLocal(intPartL); b.i32Const(1); b.i32Add(); b.setLocal(intPartL);
            b.i32Const(0); b.setLocal(fracPartL);
        b.end();

        b.getLocal(intPartL);
        b.callByName('__i32_to_string');
        b.setLocal(lenL);

        b.i32Const(bufOffset); b.getLocal(lenL); b.i32Add();
        b.i32Const(46); b.i32Store8(0, 0);
        b.getLocal(lenL); b.i32Const(1); b.i32Add(); b.setLocal(lenL);

        b.i32Const(bufOffset); b.getLocal(lenL); b.i32Add();
        b.getLocal(fracPartL); b.i32Const(10); b.i32DivU();
        b.i32Const(48); b.i32Add();
        b.i32Store8(0, 0);
        b.getLocal(lenL); b.i32Const(1); b.i32Add(); b.setLocal(lenL);

        b.i32Const(bufOffset); b.getLocal(lenL); b.i32Add();
        b.getLocal(fracPartL); b.i32Const(10); b.i32RemU();
        b.i32Const(48); b.i32Add();
        b.i32Store8(0, 0);
        b.getLocal(lenL); b.i32Const(1); b.i32Add(); b.setLocal(lenL);

        b.getLocal(negL);
        b.if_('void');
            b.getLocal(lenL); b.setLocal(posL);
            b.block('void', 'f64shift_end');
            b.loop('void', 'f64shift_loop');
                b.getLocal(posL); b.i32Eqz(); b.brIfTo('f64shift_end');
                b.i32Const(bufOffset); b.getLocal(posL); b.i32Add();
                b.i32Const(bufOffset); b.getLocal(posL); b.i32Const(1); b.i32Sub(); b.i32Add();
                b.i32Load8U(0, 0); b.i32Store8(0, 0);
                b.getLocal(posL); b.i32Const(1); b.i32Sub(); b.setLocal(posL);
                b.brTo('f64shift_loop');
            b.end();
            b.end();
            b.i32Const(bufOffset); b.i32Const(45); b.i32Store8(0, 0);
            b.getLocal(lenL); b.i32Const(1); b.i32Add(); b.setLocal(lenL);
        b.end();

        b.getLocal(lenL);
    }, ['value']);

    return { f64ToStr: FN };
}

// ─────────────────────────────────────────────────────────────
//  __i64_to_string(value: i64) -> len   (signed)
// ─────────────────────────────────────────────────────────────
export function injectI64ToString(mod: ModuleBuilder, bufOffset: number, revOffset: number): { i64ToStr: string } {
    const FN = '__i64_to_string';

    mod.addFunction(FN, ['i64'], 'i32', (b) => {
        const v     = 0;
        const neg   = b.addLocal('neg', 'i32');
        const i     = b.addLocal('i', 'i32');
        const j     = b.addLocal('j', 'i32');
        const digit = b.addLocal('digit', 'i32');

        b.getLocal(v); b.i64Eqz();
        b.if_('void');
            b.i32Const(bufOffset); b.i32Const(48); b.i32Store8(0, 0);
            b.i32Const(1); b.return_();
        b.end();

        b.getLocal(v); b.i64Const(0); b.i64LtS();
        b.setLocal(neg);

        b.getLocal(neg);
        b.if_('void');
            b.i64Const(0); b.getLocal(v); b.i64Sub(); b.setLocal(v);
        b.end();

        b.i32Const(0); b.setLocal(i);
        b.block('void', 'i64digits_done');
        b.loop('void', 'i64digits_loop');
            b.getLocal(v); b.i64Eqz(); b.brIfTo('i64digits_done');
            b.i32Const(48);
            b.getLocal(v); b.i64Const(10); b.i64RemU();
            b.i32WrapI64(); b.i32Add();
            b.setLocal(digit);
            b.i32Const(revOffset); b.getLocal(i); b.i32Add();
            b.getLocal(digit); b.i32Store8(0, 0);
            b.getLocal(v); b.i64Const(10); b.i64DivU(); b.setLocal(v);
            b.getLocal(i); b.i32Const(1); b.i32Add(); b.setLocal(i);
            b.brTo('i64digits_loop');
        b.end();
        b.end();

        b.getLocal(neg);
        b.if_('void');
            b.i32Const(revOffset); b.getLocal(i); b.i32Add();
            b.i32Const(45); b.i32Store8(0, 0);
            b.getLocal(i); b.i32Const(1); b.i32Add(); b.setLocal(i);
        b.end();

        b.i32Const(0); b.setLocal(j);
        b.block('void', 'i64rev_done');
        b.loop('void', 'i64rev_loop');
            b.getLocal(j); b.getLocal(i); b.i32GeU(); b.brIfTo('i64rev_done');
            b.i32Const(bufOffset); b.getLocal(j); b.i32Add();
            b.i32Const(revOffset);
            b.getLocal(i); b.i32Const(1); b.i32Sub(); b.getLocal(j); b.i32Sub();
            b.i32Add();
            b.i32Load8U(0, 0); b.i32Store8(0, 0);
            b.getLocal(j); b.i32Const(1); b.i32Add(); b.setLocal(j);
            b.brTo('i64rev_loop');
        b.end();
        b.end();
        b.getLocal(i);
    }, ['value']);

    return { i64ToStr: FN };
}

// ─────────────────────────────────────────────────────────────
//  __u64_to_string(value: i64) -> len   (unsigned)
// ─────────────────────────────────────────────────────────────
export function injectU64ToString(mod: ModuleBuilder, bufOffset: number, revOffset: number): { u64ToStr: string } {
    const FN = '__u64_to_string';

    mod.addFunction(FN, ['i64'], 'i32', (b) => {
        const v     = 0;
        const i     = b.addLocal('i', 'i32');
        const j     = b.addLocal('j', 'i32');
        const digit = b.addLocal('digit', 'i32');

        b.getLocal(v); b.i64Eqz();
        b.if_('void');
            b.i32Const(bufOffset); b.i32Const(48); b.i32Store8(0, 0);
            b.i32Const(1); b.return_();
        b.end();

        b.i32Const(0); b.setLocal(i);
        b.block('void', 'u64digits_done');
        b.loop('void', 'u64digits_loop');
            b.getLocal(v); b.i64Eqz(); b.brIfTo('u64digits_done');
            b.i32Const(48);
            b.getLocal(v); b.i64Const(10); b.i64RemU();
            b.i32WrapI64(); b.i32Add();
            b.setLocal(digit);
            b.i32Const(revOffset); b.getLocal(i); b.i32Add();
            b.getLocal(digit); b.i32Store8(0, 0);
            b.getLocal(v); b.i64Const(10); b.i64DivU(); b.setLocal(v);
            b.getLocal(i); b.i32Const(1); b.i32Add(); b.setLocal(i);
            b.brTo('u64digits_loop');
        b.end();
        b.end();

        b.i32Const(0); b.setLocal(j);
        b.block('void', 'u64rev_done');
        b.loop('void', 'u64rev_loop');
            b.getLocal(j); b.getLocal(i); b.i32GeU(); b.brIfTo('u64rev_done');
            b.i32Const(bufOffset); b.getLocal(j); b.i32Add();
            b.i32Const(revOffset);
            b.getLocal(i); b.i32Const(1); b.i32Sub(); b.getLocal(j); b.i32Sub();
            b.i32Add();
            b.i32Load8U(0, 0); b.i32Store8(0, 0);
            b.getLocal(j); b.i32Const(1); b.i32Add(); b.setLocal(j);
            b.brTo('u64rev_loop');
        b.end();
        b.end();
        b.getLocal(i);
    }, ['value']);

    return { u64ToStr: FN };
}

// ─────────────────────────────────────────────────────────────
//  Conversores numérico → heap-string (con prefijo de longitud)
//  Retornan i32 ptr al primer byte de data.
// ─────────────────────────────────────────────────────────────
export function injectHeapStringConv(
    mod: ModuleBuilder,
    bufOffset: number,
    i32ToStrName: string,
    f64ToStrName: string,
    i64ToStrName: string,
    u64ToStrName: string,
    mallocName: string,
): { i32ToHeap: string; f64ToHeap: string; i64ToHeap: string; u64ToHeap: string } {
    const I32H = '__i32_to_heap_string';
    const F64H = '__f64_to_heap_string';
    const I64H = '__i64_to_heap_string';
    const U64H = '__u64_to_heap_string';

    mod.addFunction(I32H, ['i32'], 'i32', (b) => {
        const lenL = b.addLocal('len', 'i32'), blockL = b.addLocal('block', 'i32'), iL = b.addLocal('i', 'i32');
        const topL = 'i32h_top', endL = 'i32h_end';
        b.getLocal(0); b.callByName(i32ToStrName); b.setLocal(lenL);
        b.getLocal(lenL); b.i32Const(4); b.i32Add(); b.callByName(mallocName); b.setLocal(blockL);
        b.getLocal(blockL); b.getLocal(lenL); b.i32Store(0, 2);
        b.i32Const(0); b.setLocal(iL);
        b.block('void', endL);
        b.loop('void', topL);
            b.getLocal(iL); b.getLocal(lenL); b.i32GeU(); b.brIfTo(endL);
            b.getLocal(blockL); b.i32Const(4); b.i32Add(); b.getLocal(iL); b.i32Add();
            b.i32Const(bufOffset); b.getLocal(iL); b.i32Add(); b.i32Load8U(0, 0);
            b.i32Store8(0, 0);
            b.getLocal(iL); b.i32Const(1); b.i32Add(); b.setLocal(iL);
            b.brTo(topL);
        b.end(); b.end();
        b.getLocal(blockL); b.i32Const(4); b.i32Add();
    }, ['value']);

    mod.addFunction(F64H, ['f64'], 'i32', (b) => {
        const lenL = b.addLocal('len', 'i32'), blockL = b.addLocal('block', 'i32'), iL = b.addLocal('i', 'i32');
        const topL = 'f64h_top', endL = 'f64h_end';
        b.getLocal(0); b.callByName(f64ToStrName); b.setLocal(lenL);
        b.getLocal(lenL); b.i32Const(4); b.i32Add(); b.callByName(mallocName); b.setLocal(blockL);
        b.getLocal(blockL); b.getLocal(lenL); b.i32Store(0, 2);
        b.i32Const(0); b.setLocal(iL);
        b.block('void', endL);
        b.loop('void', topL);
            b.getLocal(iL); b.getLocal(lenL); b.i32GeU(); b.brIfTo(endL);
            b.getLocal(blockL); b.i32Const(4); b.i32Add(); b.getLocal(iL); b.i32Add();
            b.i32Const(bufOffset); b.getLocal(iL); b.i32Add(); b.i32Load8U(0, 0);
            b.i32Store8(0, 0);
            b.getLocal(iL); b.i32Const(1); b.i32Add(); b.setLocal(iL);
            b.brTo(topL);
        b.end(); b.end();
        b.getLocal(blockL); b.i32Const(4); b.i32Add();
    }, ['value']);

    mod.addFunction(I64H, ['i64'], 'i32', (b) => {
        const lenL = b.addLocal('len', 'i32'), blockL = b.addLocal('block', 'i32'), iL = b.addLocal('i', 'i32');
        const topL = 'i64h_top', endL = 'i64h_end';
        b.getLocal(0); b.callByName(i64ToStrName); b.setLocal(lenL);
        b.getLocal(lenL); b.i32Const(4); b.i32Add(); b.callByName(mallocName); b.setLocal(blockL);
        b.getLocal(blockL); b.getLocal(lenL); b.i32Store(0, 2);
        b.i32Const(0); b.setLocal(iL);
        b.block('void', endL);
        b.loop('void', topL);
            b.getLocal(iL); b.getLocal(lenL); b.i32GeU(); b.brIfTo(endL);
            b.getLocal(blockL); b.i32Const(4); b.i32Add(); b.getLocal(iL); b.i32Add();
            b.i32Const(bufOffset); b.getLocal(iL); b.i32Add(); b.i32Load8U(0, 0);
            b.i32Store8(0, 0);
            b.getLocal(iL); b.i32Const(1); b.i32Add(); b.setLocal(iL);
            b.brTo(topL);
        b.end(); b.end();
        b.getLocal(blockL); b.i32Const(4); b.i32Add();
    }, ['value']);

    mod.addFunction(U64H, ['i64'], 'i32', (b) => {
        const lenL = b.addLocal('len', 'i32'), blockL = b.addLocal('block', 'i32'), iL = b.addLocal('i', 'i32');
        const topL = 'u64h_top', endL = 'u64h_end';
        b.getLocal(0); b.callByName(u64ToStrName); b.setLocal(lenL);
        b.getLocal(lenL); b.i32Const(4); b.i32Add(); b.callByName(mallocName); b.setLocal(blockL);
        b.getLocal(blockL); b.getLocal(lenL); b.i32Store(0, 2);
        b.i32Const(0); b.setLocal(iL);
        b.block('void', endL);
        b.loop('void', topL);
            b.getLocal(iL); b.getLocal(lenL); b.i32GeU(); b.brIfTo(endL);
            b.getLocal(blockL); b.i32Const(4); b.i32Add(); b.getLocal(iL); b.i32Add();
            b.i32Const(bufOffset); b.getLocal(iL); b.i32Add(); b.i32Load8U(0, 0);
            b.i32Store8(0, 0);
            b.getLocal(iL); b.i32Const(1); b.i32Add(); b.setLocal(iL);
            b.brTo(topL);
        b.end(); b.end();
        b.getLocal(blockL); b.i32Const(4); b.i32Add();
    }, ['value']);

    return { i32ToHeap: I32H, f64ToHeap: F64H, i64ToHeap: I64H, u64ToHeap: U64H };
}

// ─────────────────────────────────────────────────────────────
//  __larena_top : arena de objetos locales
//  Región [arenaStart, ...) reservada por el caller.
// ─────────────────────────────────────────────────────────────
export function injectLocalArena(
    mod: ModuleBuilder,
    arenaStart: number,
): { arenaTop: string } {
    const TOP = '__larena_top';
    mod.addGlobal(TOP, 'i32', true, arenaStart);
    return { arenaTop: TOP };
}

// ─────────────────────────────────────────────────────────────
//  __read_line() -> i32  (string ptr)
//  Lee una línea de stdin vía wasi_fd_read. Descarta \n y \r finales.
//  El resultado es un string con prefijo de longitud en el heap.
// ─────────────────────────────────────────────────────────────
export function injectReadLine(
    mod: ModuleBuilder,
    mallocName: string,
    freeName: string,
    fdReadAlias: string,
): { readLine: string } {
    const READLINE = '__read_line';

    mod.addFunction(READLINE, [], 'i32', (b) => {
        const bufLoc = b.addLocal('buf', 'i32');
        const iovLoc = b.addLocal('iov', 'i32');
        const nreadLoc = b.addLocal('nread', 'i32');
        const maxLoc = b.addLocal('max', 'i32');
        const realLoc = b.addLocal('real', 'i32');
        const chLoc = b.addLocal('ch', 'i32');
        const resultLoc = b.addLocal('result', 'i32');
        const iLoc = b.addLocal('i', 'i32');
        const topL = 'rl_top', endL = 'rl_end';
        const copyTopL = 'rl_c_top', copyEndL = 'rl_c_end';

        b.i32Const(1024); b.callByName(mallocName); b.setLocal(bufLoc);
        b.i32Const(8);    b.callByName(mallocName); b.setLocal(iovLoc);
        b.i32Const(4);    b.callByName(mallocName); b.setLocal(nreadLoc);

        b.getLocal(iovLoc); b.getLocal(bufLoc); b.i32Store(0, 2);
        b.getLocal(iovLoc); b.i32Const(1024);   b.i32Store(4, 2);

        b.i32Const(0);
        b.getLocal(iovLoc);
        b.i32Const(1);
        b.getLocal(nreadLoc);
        b.callByName(fdReadAlias); b.drop();

        b.getLocal(nreadLoc); b.i32Load(0, 2); b.setLocal(maxLoc);

        b.i32Const(0); b.setLocal(realLoc);
        b.block('void', endL);
        b.loop('void', topL);
        b.getLocal(realLoc); b.getLocal(maxLoc); b.i32GeU(); b.brIfTo(endL);
        b.getLocal(bufLoc); b.getLocal(realLoc); b.i32Add(); b.i32Load8U(0, 0); b.setLocal(chLoc);
        b.getLocal(chLoc); b.i32Const(10); b.i32Eq(); b.if_('void'); b.brTo(endL); b.end();
        b.getLocal(chLoc); b.i32Const(13); b.i32Eq(); b.if_('void'); b.brTo(endL); b.end();
        b.getLocal(realLoc); b.i32Const(1); b.i32Add(); b.setLocal(realLoc);
        b.brTo(topL);
        b.end(); b.end();

        b.i32Const(4); b.getLocal(realLoc); b.i32Add();
        b.callByName(mallocName); b.setLocal(resultLoc);
        b.getLocal(resultLoc); b.getLocal(realLoc); b.i32Store(0, 2);

        b.i32Const(0); b.setLocal(iLoc);
        b.block('void', copyEndL);
        b.loop('void', copyTopL);
        b.getLocal(iLoc); b.getLocal(realLoc); b.i32GeU(); b.brIfTo(copyEndL);
        b.getLocal(resultLoc); b.i32Const(4); b.i32Add(); b.getLocal(iLoc); b.i32Add();
        b.getLocal(bufLoc); b.getLocal(iLoc); b.i32Add(); b.i32Load8U(0, 0);
        b.i32Store8(0, 0);
        b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
        b.brTo(copyTopL);
        b.end(); b.end();

        b.getLocal(bufLoc);   b.callByName(freeName);
        b.getLocal(iovLoc);   b.callByName(freeName);
        b.getLocal(nreadLoc); b.callByName(freeName);

        b.getLocal(resultLoc); b.i32Const(4); b.i32Add();
    });

    return { readLine: READLINE };
}

// ─────────────────────────────────────────────────────────────
//  __parse_int(s: i32) -> i32
//  Interpreta el string como entero decimal (con signo opcional).
// ─────────────────────────────────────────────────────────────
export function injectParseInt(mod: ModuleBuilder): { parseInt: string } {
    const PARSE = '__parse_int';

    mod.addFunction(PARSE, ['i32'], 'i32', (b) => {
        const sLoc = 0;
        const nLoc = b.addLocal('n', 'i32');
        const iLoc = b.addLocal('i', 'i32');
        const signLoc = b.addLocal('sign', 'i32');
        const resultLoc = b.addLocal('result', 'i32');
        const chLoc = b.addLocal('ch', 'i32');
        const topL = 'pi_top', endL = 'pi_end';

        b.getLocal(sLoc); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2); b.setLocal(nLoc);
        b.i32Const(1); b.setLocal(signLoc);
        b.i32Const(0); b.setLocal(iLoc);

        b.getLocal(nLoc); b.i32Const(0); b.i32GtS();
        b.if_('void');
            b.getLocal(sLoc); b.i32Load8U(0, 0); b.i32Const(45); b.i32Eq();
            b.if_('void');
                b.i32Const(-1); b.setLocal(signLoc);
                b.i32Const(1);  b.setLocal(iLoc);
            b.end();
        b.end();

        b.i32Const(0); b.setLocal(resultLoc);

        b.block('void', endL);
        b.loop('void', topL);
        b.getLocal(iLoc); b.getLocal(nLoc); b.i32GeU(); b.brIfTo(endL);
        b.getLocal(sLoc); b.getLocal(iLoc); b.i32Add(); b.i32Load8U(0, 0); b.setLocal(chLoc);
        b.getLocal(chLoc); b.i32Const(48); b.i32LtS(); b.if_('void'); b.brTo(endL); b.end();
        b.getLocal(chLoc); b.i32Const(57); b.i32GtS(); b.if_('void'); b.brTo(endL); b.end();
        b.getLocal(resultLoc); b.i32Const(10); b.i32Mul();
        b.getLocal(chLoc); b.i32Const(48); b.i32Sub(); b.i32Add();
        b.setLocal(resultLoc);
        b.getLocal(iLoc); b.i32Const(1); b.i32Add(); b.setLocal(iLoc);
        b.brTo(topL);
        b.end(); b.end();

        b.getLocal(resultLoc); b.getLocal(signLoc); b.i32Mul();
    }, ['s']);

    return { parseInt: PARSE };
}

// ─────────────────────────────────────────────────────────────
//  File I/O sobre WASI preview1.
//  Preopen fd = 3 (asume un único preopen: "." → ".").
// ─────────────────────────────────────────────────────────────
export function injectFileIO(
    mod: ModuleBuilder,
    mallocName: string,
    freeName: string,
    fdReadAlias: string,
    fdWriteAlias: string,
    pathOpenAlias: string,
    fdCloseAlias: string,
    fdSeekAlias: string,
): {
    fsOpenRead: string;
    fsOpenWrite: string;
    fsReadAll: string;
    fsWriteStr: string;
    fsExists: string;
} {
    const FS_OPEN_READ = '__fs_open_read';
    const FS_OPEN_WRITE = '__fs_open_write';
    const FS_READ_ALL = '__fs_read_all';
    const FS_WRITE_STR = '__fs_write_str';
    const FS_EXISTS = '__fs_exists';

    // Rights WASI (bits válidos: 0..29)
    //   FD_READ      = 1 << 1 = 2
    //   FD_SEEK      = 1 << 2 = 4
    //   FD_WRITE     = 1 << 6 = 64
    // Para readAll necesitamos READ + SEEK (hace fd_seek para obtener tamaño).
    // Para writeAll/append solo WRITE (APPEND flag maneja el seek-to-end).
    const RIGHTS_READ_BASE  = 6n;    // FD_READ | FD_SEEK
    const RIGHTS_WRITE_BASE = 64n;   // FD_WRITE
    const RIGHTS_INHERIT    = 0n;    // los archivos no heredan nada

    // __fs_open_read(path: i32) -> i32 (fd o -1)
    mod.addFunction(FS_OPEN_READ, ['i32'], 'i32', (b) => {
        const pathLoc = 0;
        const fdOutLoc = b.addLocal('fdOut', 'i32');
        const fdLoc = b.addLocal('fd', 'i32');
        const errLoc = b.addLocal('err', 'i32');

        b.i32Const(4); b.callByName(mallocName); b.setLocal(fdOutLoc);

        b.i32Const(3);
        b.i32Const(0);
        b.getLocal(pathLoc);
        b.getLocal(pathLoc); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2);
        b.i32Const(0);
        b.i64Const(RIGHTS_READ_BASE);
        b.i64Const(RIGHTS_INHERIT);
        b.i32Const(0);
        b.getLocal(fdOutLoc);
        b.callByName(pathOpenAlias); b.setLocal(errLoc);

        b.getLocal(errLoc);
        b.if_('void');
            b.i32Const(-1); b.setLocal(fdLoc);
        b.else_();
            b.getLocal(fdOutLoc); b.i32Load(0, 2); b.setLocal(fdLoc);
        b.end();

        b.getLocal(fdOutLoc); b.callByName(freeName);
        b.getLocal(fdLoc);
    }, ['path']);

    // __fs_open_write(path: i32, mode: i32) -> i32
    //   mode 0 = write (crear + truncar)
    //   mode 1 = append (crear + append)
    mod.addFunction(FS_OPEN_WRITE, ['i32', 'i32'], 'i32', (b) => {
        const pathLoc = 0;
        const modeLoc = 1;
        const fdOutLoc = b.addLocal('fdOut', 'i32');
        const fdLoc = b.addLocal('fd', 'i32');
        const errLoc = b.addLocal('err', 'i32');
        const oflagsLoc = b.addLocal('oflags', 'i32');
        const fdflagsLoc = b.addLocal('fdflags', 'i32');

        b.i32Const(4); b.callByName(mallocName); b.setLocal(fdOutLoc);

        // oflags: CREAT=1, TRUNC=8 → write=9, append=1
        b.i32Const(1);
        b.getLocal(modeLoc); b.i32Const(0); b.i32Eq();
        b.if_('i32'); b.i32Const(8); b.else_(); b.i32Const(0); b.end();
        b.i32Add();
        b.setLocal(oflagsLoc);

        // fdflags: APPEND=1
        b.getLocal(modeLoc); b.i32Const(1); b.i32Eq();
        b.if_('i32'); b.i32Const(1); b.else_(); b.i32Const(0); b.end();
        b.setLocal(fdflagsLoc);

        b.i32Const(3);
        b.i32Const(0);
        b.getLocal(pathLoc);
        b.getLocal(pathLoc); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2);
        b.getLocal(oflagsLoc);
        b.i64Const(RIGHTS_WRITE_BASE);
        b.i64Const(RIGHTS_INHERIT);
        b.getLocal(fdflagsLoc);
        b.getLocal(fdOutLoc);
        b.callByName(pathOpenAlias); b.setLocal(errLoc);

        b.getLocal(errLoc);
        b.if_('void');
            b.i32Const(-1); b.setLocal(fdLoc);
        b.else_();
            b.getLocal(fdOutLoc); b.i32Load(0, 2); b.setLocal(fdLoc);
        b.end();

        b.getLocal(fdOutLoc); b.callByName(freeName);
        b.getLocal(fdLoc);
    }, ['path', 'mode']);

    // __fs_read_all(fd: i32) -> i32 (string ptr)
    mod.addFunction(FS_READ_ALL, ['i32'], 'i32', (b) => {
        const fdLoc = 0;
        const newoffLoc = b.addLocal('newoff', 'i32');
        const sizeLoc = b.addLocal('size', 'i32');
        const bufLoc = b.addLocal('buf', 'i32');
        const iovLoc = b.addLocal('iov', 'i32');
        const nreadLoc = b.addLocal('nread', 'i32');
        const totalLoc = b.addLocal('total', 'i32');
        const errLoc = b.addLocal('err', 'i32');
        const topL = 'ra_top', endL = 'ra_end';

        b.i32Const(8); b.callByName(mallocName); b.setLocal(newoffLoc);
        b.i32Const(8); b.callByName(mallocName); b.setLocal(iovLoc);
        b.i32Const(4); b.callByName(mallocName); b.setLocal(nreadLoc);

        b.getLocal(newoffLoc); b.i64Const(0n); b.i64Store(0, 3);

        b.getLocal(fdLoc); b.i64Const(0n); b.i32Const(2); b.getLocal(newoffLoc);
        b.callByName(fdSeekAlias); b.setLocal(errLoc);

        b.getLocal(errLoc); b.i32Eqz();
        b.if_('void');
            b.getLocal(newoffLoc); b.i32Load(0, 2); b.setLocal(sizeLoc);
        b.else_();
            b.i32Const(0); b.setLocal(sizeLoc);
        b.end();

        b.getLocal(fdLoc); b.i64Const(0n); b.i32Const(0); b.getLocal(newoffLoc);
        b.callByName(fdSeekAlias); b.drop();

        b.i32Const(4); b.getLocal(sizeLoc); b.i32Add(); b.callByName(mallocName); b.setLocal(bufLoc);
        b.getLocal(bufLoc); b.getLocal(sizeLoc); b.i32Store(0, 2);

        b.i32Const(0); b.setLocal(totalLoc);

        b.block('void', endL);
        b.loop('void', topL);
        b.getLocal(totalLoc); b.getLocal(sizeLoc); b.i32GeS(); b.brIfTo(endL);

        b.getLocal(iovLoc); b.getLocal(bufLoc); b.i32Const(4); b.i32Add();
        b.getLocal(totalLoc); b.i32Add(); b.i32Store(0, 2);
        b.getLocal(iovLoc); b.getLocal(sizeLoc); b.getLocal(totalLoc); b.i32Sub(); b.i32Store(4, 2);

        b.getLocal(fdLoc); b.getLocal(iovLoc); b.i32Const(1); b.getLocal(nreadLoc);
        b.callByName(fdReadAlias); b.setLocal(errLoc);

        b.getLocal(errLoc); b.if_('void'); b.brTo(endL); b.end();

        b.getLocal(nreadLoc); b.i32Load(0, 2); b.i32Eqz();
        b.if_('void'); b.brTo(endL); b.end();

        b.getLocal(totalLoc); b.getLocal(nreadLoc); b.i32Load(0, 2); b.i32Add(); b.setLocal(totalLoc);
        b.brTo(topL);
        b.end();
        b.end();

        b.getLocal(bufLoc); b.getLocal(totalLoc); b.i32Store(0, 2);

        b.getLocal(newoffLoc); b.callByName(freeName);
        b.getLocal(iovLoc);    b.callByName(freeName);
        b.getLocal(nreadLoc);  b.callByName(freeName);

        b.getLocal(bufLoc); b.i32Const(4); b.i32Add();
    }, ['fd']);

    // __fs_write_str(fd: i32, str: i32) -> i32 (bytes escritos o -1)
    mod.addFunction(FS_WRITE_STR, ['i32', 'i32'], 'i32', (b) => {
        const fdLoc = 0;
        const strLoc = 1;
        const iovLoc = b.addLocal('iov', 'i32');
        const writtenLoc = b.addLocal('written', 'i32');
        const errLoc = b.addLocal('err', 'i32');
        const resLoc = b.addLocal('res', 'i32');

        b.i32Const(8); b.callByName(mallocName); b.setLocal(iovLoc);
        b.i32Const(4); b.callByName(mallocName); b.setLocal(writtenLoc);

        b.getLocal(iovLoc); b.getLocal(strLoc); b.i32Store(0, 2);
        b.getLocal(iovLoc);
        b.getLocal(strLoc); b.i32Const(4); b.i32Sub(); b.i32Load(0, 2);
        b.i32Store(4, 2);

        b.getLocal(fdLoc);
        b.getLocal(iovLoc);
        b.i32Const(1);
        b.getLocal(writtenLoc);
        b.callByName(fdWriteAlias); b.setLocal(errLoc);

        b.getLocal(errLoc);
        b.if_('void');
            b.i32Const(-1); b.setLocal(resLoc);
        b.else_();
            b.getLocal(writtenLoc); b.i32Load(0, 2); b.setLocal(resLoc);
        b.end();

        b.getLocal(iovLoc);     b.callByName(freeName);
        b.getLocal(writtenLoc); b.callByName(freeName);

        b.getLocal(resLoc);
    }, ['fd', 'str']);

    // __fs_exists(path: i32) -> i32 (1 o 0)
    mod.addFunction(FS_EXISTS, ['i32'], 'i32', (b) => {
        const pathLoc = 0;
        const fdLoc = b.addLocal('fd', 'i32');

        b.getLocal(pathLoc); b.callByName(FS_OPEN_READ); b.setLocal(fdLoc);
        b.getLocal(fdLoc); b.i32Const(0); b.i32GeS();
        b.if_('i32');
            b.getLocal(fdLoc); b.callByName(fdCloseAlias); b.drop();
            b.i32Const(1);
        b.else_();
            b.i32Const(0);
        b.end();
    }, ['path']);

    return {
        fsOpenRead: FS_OPEN_READ,
        fsOpenWrite: FS_OPEN_WRITE,
        fsReadAll: FS_READ_ALL,
        fsWriteStr: FS_WRITE_STR,
        fsExists: FS_EXISTS,
    };
}