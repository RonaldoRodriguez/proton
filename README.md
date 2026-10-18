## ProtonCompiler
# Demo rápido:
```shell
  deno run --sloppy-imports --allow-write --allow-read=. main.ts demo.cyn -o demo.wasm
```
# Deno + Wasmtime:
```shell
  deno run --sloppy-imports --allow-write --allow-read=. main.ts generic.cyn -o generic.wasm
  wasmtime run generic.wasm
```
# Mi recomendación:
```shell
  bun run main.ts demo.cyn
```

Para el caso de Deno, `--allow-read=.`, puede ser reemplazado por `deno run --sloppy-imports --allow-write --allow-read main.ts generic.cyn -o generic.wasm`
