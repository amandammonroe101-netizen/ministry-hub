import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Journal from './pages/journal/Journal';
import Prayers from './pages/prayers/Prayers';
import Friends from './pages/friends/Friends';
import Calendar from './pages/calendar/Calendar';
import Habits from './pages/habits/Habits';
import Songs from './pages/songs/Songs';
import Studio from './pages/studio/Studio';
import Multitrack from './pages/multitrack/Multitrack';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<Navigate to="/journal" replace />} />
        <Route path="/journal"  element={<Journal />} />
        <Route path="/prayers"  element={<Prayers />} />
        <Route path="/friends"  element={<Friends />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/habits"   element={<Habits />} />
        <Route path="/songs"      element={<Songs />} />
        <Route path="/studio"     element={<Studio />} />
        <Route path="/multitrack" element={<Multitrack />} />
      </Routes>
    </BrowserRouter>
  );
}
