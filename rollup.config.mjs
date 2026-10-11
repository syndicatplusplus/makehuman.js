import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
    input: './src/main.tsx',
    output: {
      name: 'makehuman',
      file: 'dist/makehuman.js',
      format: 'iife',
      sourcemap: true
    },
    plugins: [
        typescript({
            tsconfig: "./tsconfig.build.json",
            useTsconfigDeclarationDir: true,
            sourceMap: true
        }),
        nodeResolve(),
        commonjs(),
        terser()
    ]
}
