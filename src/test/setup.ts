import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// findBy* / waitFor 默认只等 1s。CI 的 2 核 runner 上 38 个测试文件并行 + fake-indexeddb 的
// 异步任务会让合法操作超过 1s，于是断言变成"谁的机器慢谁挂"。放宽上限，断言强度不变。
configure({ asyncUtilTimeout: 5_000 })

afterEach(cleanup)
