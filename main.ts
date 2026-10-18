// main.ts
import { WASI } from 'node:wasi';
import * as path from 'node:path';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semantic';
import { WasmCodeGen } from './wasm-codegen';

const args = Bun.argv;
const mode = args.includes('--ast') ? 'ast' : 'wasm';

if (args.length < 3) {
    console.error('Uso: bun main.ts <archivo> [--ast]');
    process.exit(1);
}

const filePath = args[2];

try {
    const seen = new Set<string>();

    async function parseWithIncludes(absPath: string): Promise<any[]> {
        const abs = path.resolve(absPath);
        if (seen.has(abs)) return [];
        seen.add(abs);

        const src = await Bun.file(abs).text();
        const tokens = Lexer(src);
        const parser = new Parser(tokens, abs);
        const ast = parser.parseProgram();

        if (parser.errors.length > 0) {
            console.error(`--- Errores de Sintaxis en ${absPath} ---`);
            for (const e of parser.errors) console.error(e.message);
            process.exit(1);
        }

        const result: any[] = [];
        for (const node of ast.body) {
            if (node.kind === 'IncludeDecl') {
                let inc = node.path;
                if (!inc.endsWith('.cyn')) inc += '.cyn';
                const incAbs = path.resolve(path.dirname(abs), inc);
                if (!await Bun.file(incAbs).exists()) {
                    console.error(`Error: '${node.path}' incluido desde ${absPath} no existe (buscado en ${incAbs})`);
                    process.exit(1);
                }
                const includedBody = await parseWithIncludes(incAbs);
                result.push(...includedBody);
            } else if (node.kind === 'ImportDecl') {
                let inc = node.path;
                if (!inc.endsWith('.cyn')) inc += '.cyn';
                const incAbs = path.resolve(path.dirname(abs), inc);
                if (!await Bun.file(incAbs).exists()) {
                    console.error(`Error: '${node.path}' importado desde ${absPath} no existe (buscado en ${incAbs})`);
                    process.exit(1);
                }
                const includedBody = await parseWithIncludes(incAbs);
                result.push(...includedBody);
                for (const imp of node.imports) {
                    result.push({
                        kind: 'UsingDecl',
                        name: imp.parts.join('::'),
                        parts: imp.parts,
                        isWildcard: imp.parts.length === 1,
                    });
                }
            } else {
                result.push(node);
            }
        }
        return result;
    }

    let preludeBody: any[] = [];
    const stdFile = Bun.file('stdlib.cyn');
    if (await stdFile.exists()) {
        preludeBody = await parseWithIncludes(path.resolve('stdlib.cyn'));
    }

    const mainBody = await parseWithIncludes(filePath);
    const ast = { kind: 'Program', body: [...preludeBody, ...mainBody] };

    console.log(`Evaluando el archivo: ${filePath}\n`);

    const semantic = new SemanticAnalyzer(ast);
    semantic.analyze();

    if (mode === 'ast') {
        console.log(JSON.stringify(ast, null, 2));
        process.exit(0);
    }

    console.log('=== Compilando a WASM ===');
    const cg = new WasmCodeGen();
    // NUEVO: pasar los AST nodes generados por monomorfización
    const specializations = semantic.getSpecializedNodes();
    const wasmBytes = cg.compile(ast, specializations);
    await Bun.write('out.wasm', wasmBytes);
    console.log(`WASM: ${wasmBytes.length} bytes → out.wasm`);
    console.log(`Especializaciones genéricas: ${specializations.length}`);

    console.log('\n=== Ejecutando con WASI ===');

    const wasi = new WASI({
        version: 'preview1',
        args: [filePath],
        env: {},
        preopens: { '.': '.' },
    });

    const wasmModule = await WebAssembly.compile(wasmBytes);
    const importObject = (wasi as any).getImportObject
        ? wasi.getImportObject()
        : { wasi_snapshot_preview1: (wasi as any).wasiImport };

    const instance = await WebAssembly.instantiate(wasmModule, importObject);

    let exitCode = 0;
    try {
        wasi.start(instance);
    } catch (e: any) {
        if (typeof e?.code === 'number') {
            exitCode = e.code;
        } else if (e?.message && /exit/i.test(e.message)) {
            const m = /(\d+)/.exec(e.message);
            exitCode = m ? parseInt(m[1], 10) : 0;
        } else {
            throw e;
        }
    }

    console.log(`\n=== Resultado ===`);
    console.log(`exit code = ${exitCode}`);

    const exports = WebAssembly.Module.exports(wasmModule);
    const imports = WebAssembly.Module.imports(wasmModule);
    console.log(`\nexports: ${exports.map(e => `${e.name}(${e.kind})`).join(', ')}`);
    console.log(`imports: ${imports.map(i => `${i.module}.${i.name}`).join(', ')}`);
} catch (error) {
    console.error((error as Error).message);
    process.exit(1);
}