import { lazy, Suspense } from 'react'
import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { ErrorBoundary } from './ErrorBoundary'
import { UpdatePrompt } from './UpdatePrompt'
import { useDictLoader } from './useDictLoader'
import { useOnlinePrefetch } from './useOnlinePrefetch'
import { TabBar } from '@/components/TabBar'
import { Inbox } from '@/screens/Inbox'
import { NoteEditorRoute } from '@/screens/NoteEditor'
import { Cards } from '@/screens/Cards'
import { Placeholder } from '@/screens/Placeholder'
import { Review } from '@/screens/Review'
import { Settings } from '@/screens/Settings'
import { Today } from '@/screens/Today'
import { AudioSpike } from '@/spikes/AudioSpike'
import { TtsSpike } from '@/spikes/TtsSpike'

// 表格解析库只在进入导入页时加载；PWA 构建仍会预缓存这份异步 chunk。
const Import = lazy(() => import('@/screens/Import').then((module) => ({ default: module.Import })))

function WithTabs() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  )
}

function Shell() {
  const dict = useDictLoader()
  useOnlinePrefetch()
  const { pathname } = useLocation()
  return (
    <>
      <Routes>
        <Route element={<WithTabs />}>
          <Route path="/" element={<Today dict={dict} />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/review" element={<Review />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/import" element={<Suspense fallback={<p role="status" className="p-4 text-muted">正在加载导入…</p>}><Import /></Suspense>} />
        <Route path="/note/new" element={<NoteEditorRoute />} />
        <Route path="/note/:id" element={<NoteEditorRoute />} />
        <Route path="/spike/audio" element={<AudioSpike />} />
        <Route path="/spike/tts" element={<TtsSpike />} />
        <Route path="*" element={<Placeholder title="这个地址没有内容" hint="链接可能过期了，或者这一屏已经换地址。" />} />
      </Routes>
      {pathname !== '/review' && <UpdatePrompt />}
    </>
  )
}

export function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    </HashRouter>
  )
}
