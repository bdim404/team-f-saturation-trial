// Export only public questionnaire copy/metadata for a separate backend release.
import fs from 'node:fs'
import ts from 'typescript'
const transpile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const source = transpile('src/lib/study-bundle.ts').replace("'../i18n'", JSON.stringify(data(transpile('src/i18n.ts'))))
const { BUNDLE_REVISION, bundleQuestions, bundleFlow, bundleCopy } = await import(data(source))
process.stdout.write(JSON.stringify({ revision: BUNDLE_REVISION, source_commit: '73d43ab', questions: bundleQuestions(), flow: bundleFlow, copy: bundleCopy, track: 'synth-pop-loop', minimum_seconds: 3 }, null, 2) + '\n')
