import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['node_modules/**','dist/**','.local/**','playwright-report/**','test-results/**','public/sw.js']},js.configs.recommended,...ts.configs.recommended,{languageOptions:{globals:{process:'readonly',console:'readonly',URL:'readonly'}},rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}});
