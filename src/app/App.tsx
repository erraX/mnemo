import { HashRouter, Outlet, Route, Routes } from 'react-router'
import { UpdatePrompt } from './UpdatePrompt'
import { useDictLoader } from './useDictLoader'
import { TabBar } from '@/components/TabBar'
import { Placeholder } from '@/screens/Placeholder'
import { SettingsStub } from '@/screens/SettingsStub'
import { Today } from '@/screens/Today'
import { AudioSpike } from '@/spikes/AudioSpike'
import { TtsSpike } from '@/spikes/TtsSpike'

function WithTabs() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  )
}

export function App() {
  const dict = useDictLoader()
  return (
    <HashRouter>
      <Routes>
        <Route element={<WithTabs />}>
          <Route path="/" element={<Today dict={dict} />} />
          <Route path="/cards" element={<Placeholder title="卡片" />} />
          <Route path="/settings" element={<SettingsStub />} />
        </Route>
        <Route path="/review" element={<Placeholder title="复习" />} />
        <Route path="/inbox" element={<Placeholder title="收集箱" />} />
        <Route path="/note/new" element={<Placeholder title="新卡片" />} />
        <Route path="/spike/audio" element={<AudioSpike />} />
        <Route path="/spike/tts" element={<TtsSpike />} />
        <Route path="*" element={<Placeholder title="未找到" />} />
      </Routes>
      <UpdatePrompt />
    </HashRouter>
  )
}
