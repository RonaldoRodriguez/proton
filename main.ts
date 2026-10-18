// main.ts
import { WASI } from 'node:wasi';
import * as path from 'node:path';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semantic';
import { WasmCodeGen } from './wasm-codegen';

// Detectar entorno e igualar el comportamiento de los argumentos de CLI
const isDeno = typeof (globalThis as any).Deno !== 'undefined';
const rawArgs = isDeno ? (globalThis as any).Deno.args : process.argv.slice(2);

const mode = rawArgs.includes('--ast') ? 'ast' : 'wasm';

// Buscar el valor de la bandera de salida (-o o --output)
let outputFile = 'out.wasm'; // Valor por defecto
const oIndex = rawArgs.indexOf('-o') !== -1 ? rawArgs.indexOf('-o') : rawArgs.indexOf('--output');
if (oIndex !== -1 && oIndex + 1 < rawArgs.length) {
    outputFile = rawArgs[oIndex + 1];
}

// Filtrar todas las banderas y sus respectivos valores adjuntos para aislar el archivo de entrada
const positionalArgs: string[] = [];
for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '-o' || rawArgs[i] === '--output') {
        i++; // Saltar el siguiente argumento ya que es el nombre del archivo de salida
        continue;
    }
    if (rawArgs[i].startsWith('-')) {
        continue; // Saltar otras banderas como --ast
    }
    positionalArgs.push(rawArgs[i]);
}

if (positionalArgs.length < 1) {
    console.error('Uso: [bun|node|deno] main.ts <archivo> [-o | --output <salida>] [--ast]');
    process.exit(1);
}

const filePath = positionalArgs[0];

async function fileExists(targetPath: string): Promise<boolean> {
    try {
        await stat(targetPath);
        return true;
    } catch {
        return false;
    }
}

try {
    const seen = new Set<string>();

    async function parseWithIncludes(absPath: string): Promise<any[]> {
        const abs = path.resolve(absPath);
        if (seen.has(abs)) return [];
        seen.add(abs);

        const src = await readFile(abs, 'utf-8');
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
            if (node.kind === 'IncludeDecl' || node.kind === 'ImportDecl') {
                let inc = node.path;
                if (!inc.endsWith('.cyn')) inc += '.cyn';
                const incAbs = path.resolve(path.dirname(abs), inc);
                
                if (!await fileExists(incAbs)) {
                    console.error(`Error: '${node.path}' desde ${absPath} no existe (buscado en ${incAbs})`);
                    process.exit(1);
                }
                const includedBody = await parseWithIncludes(incAbs);
                result.push(...includedBody);

                if (node.kind === 'ImportDecl') {
                    for (const imp of node.imports) {
                        result.push({
                            kind: 'UsingDecl',
                            name: imp.parts.join('::'),
                            parts: imp.parts,
                            isWildcard: imp.parts.length === 1,
                        });
                    }
                }
            } else {
                result.push(node);
            }
        }
        return result;
    }

    let preludeBody: any[] = [];
    if (await fileExists('stdlib.cyn')) {
        preludeBody = await parseWithIncludes(path.resolve('stdlib.cyn'));
    }

    const mainBody = await parseWithIncludes(filePath);
    const ast = { kind: 'Program', body: [...preludeBody, ...mainBody] };

    const semantic = new SemanticAnalyzer(ast);
    semantic.analyze();

    if (mode === 'ast') {
        console.log(JSON.stringify(ast, null, 2));
        process.exit(0);
    }

    const cg = new WasmCodeGen();
    const specializations = semantic.getSpecializedNodes();
    const wasmBytes = cg.compile(ast, specializations);
    
    await writeFile(outputFile, wasmBytes);
    console.log(`¡Compilación exitosa! Archivo generado: ${outputFile} (${wasmBytes.length} bytes)`);

    const wasi = new WASI({
        version: 'preview1',
        args: [filePath],
        env: {},
        preopens: { '.': '.' },
    });

    const wasmModule = await WebAssembly.compile(wasmBytes);
    const importObject = (wasi as any).getImportObject
        ? (wasi as any).getImportObject()
        : { wasi_snapshot_preview1: (wasi as any).wasiImport };

    const instance = await WebAssembly.instantiate(wasmModule, importObject);

    try {
        wasi.start(instance);
    } catch (e: any) {
        if (typeof e?.code === 'number') {
            // Manejo silencioso del código de salida de WASI
        } else if (e?.message && /exit/i.test(e.message)) {
            // Manejo silencioso
        } else {
            throw e;
        }
    }

} catch (error) {
    console.error((error as Error).message);
    process.exit(1);
}
