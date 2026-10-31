import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { UpdatePrompt } from './UpdatePrompt'
import { useDictLoader } from './useDictLoader'
import { TabBar } from '@/components/TabBar'
import { Inbox } from '@/screens/Inbox'
import { NoteEditorRoute } from '@/screens/NoteEditor'
import { Cards } from '@/screens/Cards'
import { Placeholder } from '@/screens/Placeholder'
import { Review } from '@/screens/Review'
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

function Shell() {
  const dict = useDictLoader()
  const { pathname } = useLocation()
  return (
    <>
      <Routes>
        <Route element={<WithTabs />}>
          <Route path="/" element={<Today dict={dict} />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/settings" element={<SettingsStub />} />
        </Route>
        <Route path="/review" element={<Review />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/note/new" element={<NoteEditorRoute />} />
        <Route path="/note/:id" element={<NoteEditorRoute />} />
        <Route path="/spike/audio" element={<AudioSpike />} />
        <Route path="/spike/tts" element={<TtsSpike />} />
        <Route path="*" element={<Placeholder title="未找到" />} />
      </Routes>
      {pathname !== '/review' && <UpdatePrompt />}
    </>
  )
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
