import { describe, expect, it } from 'vitest'
import { buildSql } from './sync-dict'

const entry = (word: string, forms: string[] = []) => ({
  word, phonetic: "x", translation: 'n. 释义', forms,
})

describe('buildSql', () => {
  it('每个词一条 dict 插入，变形各一条 dict_forms', () => {
    const [dictStmt, formsStmt] = buildSql([entry('concern', ['concerns', 'concerned'])])
    expect(dictStmt).toContain("('concern','x','n. 释义','[\"concerns\",\"concerned\"]')")
    expect(formsStmt).toContain("('concerns','concern')")
    expect(formsStmt).toContain("('concerned','concern')")
  })

  it('没有变形时不生成空的 dict_forms 语句', () => {
    const stmts = buildSql([entry('ephemeral')])
    expect(stmts).toHaveLength(1)
    expect(stmts[0]).not.toContain('dict_forms')
  })

  it('转义单引号，避免释义里的撇号破坏 SQL', () => {
    const [stmt] = buildSql([{ word: "don't", phonetic: '', translation: "v. don't 的缩写", forms: [] }])
    expect(stmt).toContain("'don''t'")
    expect(stmt).toContain("don''t 的缩写")
  })

  it('按 chunkSize 分批，控制单条语句体积', () => {
    const stmts = buildSql([entry('a'), entry('b'), entry('c')], 2)
    expect(stmts.filter((s) => s.startsWith('INSERT OR REPLACE INTO dict '))).toHaveLength(2)
  })
})
