import React, { useState, useMemo } from 'react';
import { format, parseISO, isToday, differenceInCalendarDays, subDays, isSameDay } from 'date-fns';

// ─── helpers ────────────────────────────────────────────────
const wordCount = (text) => (text||'').trim().split(/\s+/).filter(Boolean).length;

const getStreaks = (entries) => {
  if (!entries.length) return { current: 0, longest: 0 };
  const days = [...new Set(entries.map(e => {
    try { return format(parseISO(e.created_at), 'yyyy-MM-dd'); } catch { return null; }
  }).filter(Boolean))].sort().reverse();

  let current = 0, longest = 0, streak = 0;
  let prev = null;
  for (const day of days) {
    const d = parseISO(day);
    if (prev === null) { streak = 1; }
    else {
      const diff = differenceInCalendarDays(parseISO(prev), d);
      if (diff === 1) streak++;
      else { longest = Math.max(longest, streak); streak = 1; }
    }
    prev = day;
  }
  longest = Math.max(longest, streak);
  // current: starts from today going back
  current = 0;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const daySet = new Set(days);
  let check = todayStr;
  while (daySet.has(check)) {
    current++;
    check = format(subDays(parseISO(check), 1), 'yyyy-MM-dd');
  }
  return { current, longest };
};

const get30DayHeatmap = (entries) => {
  const map = {};
  entries.forEach(e => {
    try {
      const day = format(parseISO(e.created_at), 'yyyy-MM-dd');
      if (!map[day]) map[day] = { count: 0, moods: [] };
      map[day].count++;
      map[day].moods.push(e.mood);
    } catch {}
  });
  return map;
};

const moodColors = {
  happy:'#fcd34d', grateful:'#fb923c', peaceful:'#6ee7b7', reflective:'#c4b5fd',
  seeking:'#7dd3fc', burdened:'#f9a8d4', wrestling:'#a78bfa', joyful:'#fde047'
};

const STOP_WORDS = new Set([
  'the','and','a','to','of','in','is','it','that','was','for','on','are','with',
  'as','i','his','they','be','at','one','have','this','from','or','had','by',
  'not','but','what','all','were','we','when','your','can','said','there',
  'use','an','each','which','she','do','how','their','if','will','up','other',
  'about','out','many','then','them','these','so','some','her','would','make',
  'like','him','into','time','has','look','two','more','go','no','way','could',
  'my','than','first','been','its','who','now','did','get','come','made',
  'may','you','me','he','just','am','our','us','lord','god','also','very',
  'back','after','day','feel','felt','know','think','want','need','really',
  'even','still','little','down','again','see','went','through','over','help'
]);

const buildWordCloud = (entries) => {
  const freq = {};
  entries.forEach(e => {
    const words = (e.content + ' ' + e.title).toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    words.forEach(w => { freq[w] = (freq[w]||0)+1; });
  });
  return Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,40)
    .map(([word, count]) => ({ word, count }));
};

const getScriptureCoverage = (entries) => {
  const books = {};
  const TESTAMENT = {
    OT: ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
      '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
      'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
      'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
      'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi'],
    NT: ['Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians',
      'Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians',
      '1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter',
      '1 John','2 John','3 John','Jude','Revelation']
  };
  entries.forEach(e => {
    const refs = [];
    try { const v = JSON.parse(e.verses||'[]'); v.forEach(r => refs.push(r.ref)); } catch {}
    if (e.scripture) refs.push(e.scripture);
    refs.forEach(ref => {
      for (const [t, list] of Object.entries(TESTAMENT)) {
        for (const book of list) {
          if (ref.toLowerCase().includes(book.toLowerCase())) {
            if (!books[book]) books[book] = { count: 0, testament: t };
            books[book].count++;
            break;
          }
        }
      }
    });
  });
  return books;
};

const getOnThisDay = (entries) => {
  const today = new Date();
  return entries.filter(e => {
    try {
      const d = parseISO(e.created_at);
      return d.getMonth() === today.getMonth() &&
             d.getDate()  === today.getDate() &&
             d.getFullYear() !== today.getFullYear();
    } catch { return false; }
  }).sort((a,b) => parseISO(b.created_at) - parseISO(a.created_at));
};

const getMoodTimeline = (entries) => {
  const MOOD_VAL = { joyful:5, happy:4, grateful:4, peaceful:3, reflective:3, seeking:2, burdened:1, wrestling:1 };
  return entries.slice().reverse().slice(-30).map(e => ({
    date: e.created_at,
    mood: e.mood,
    val:  MOOD_VAL[e.mood] || 3,
    title: e.title,
  }));
};

const getSpiritualSeason = (entries) => {
  const recent = entries.slice(0,10);
  if (!recent.length) return null;
  const moodMap = {};
  recent.forEach(e => { moodMap[e.mood] = (moodMap[e.mood]||0)+1; });
  const topMood = Object.entries(moodMap).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const allText = recent.map(e => (e.content||'').toLowerCase()).join(' ');
  const themes = [];
  if (/trust|faith|believe/.test(allText))  themes.push('faith & trust');
  if (/fear|anxious|worried|anxiety/.test(allText)) themes.push('working through anxiety');
  if (/grateful|thankful|blessed/.test(allText)) themes.push('gratitude');
  if (/purpose|calling|direction|vision/.test(allText)) themes.push('seeking direction');
  if (/heal|pain|hurt|grief|loss/.test(allText)) themes.push('healing & grief');
  if (/grow|change|transform|new/.test(allText)) themes.push('growth & transformation');
  if (/family|marriage|relationship/.test(allText)) themes.push('relationships');
  if (/work|career|job|ministry/.test(allText)) themes.push('calling & work');
  const SEASON_MAP = {
    joyful: 'a season of joy and celebration',
    happy: 'a season of brightness and hope',
    grateful: 'a season of deep gratitude',
    peaceful: 'a season of quiet rest in God',
    reflective: 'a season of deep reflection and discernment',
    seeking: 'a season of seeking and wrestling with God',
    burdened: 'a season of carrying heavy burdens',
    wrestling: 'a season of wrestling through hard questions',
  };
  const season = SEASON_MAP[topMood] || 'a season of growth';
  const themeStr = themes.length ? ` Your writing centers around ${themes.slice(0,2).join(' and ')}.` : '';
  return `Your recent entries suggest you are in ${season}.${themeStr}`;
};

// ─── Weekly Memory Verse Component ──────────────────────────
function WeeklyMemoryVerse() {
  const [verses, setVerses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mh_memory_verses')||'[]'); } catch { return []; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newRef, setNewRef] = useState('');
  const [newText, setNewText] = useState('');
  const [newDay, setNewDay] = useState('Sunday');
  const [showArchive, setShowArchive] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  const save = (arr) => {
    setVerses(arr);
    localStorage.setItem('mh_memory_verses', JSON.stringify(arr));
  };

  const current = verses.find(v => v.active) || verses[0] || null;

  const fetchVerse = async (ref) => {
    if (!ref.trim()) return '';
    try {
      const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=kjv`);
      const d = await res.json();
      if (d.error) return '';
      return (d.verses||[]).map(v => v.text.trim()).join(' ') || d.text || '';
    } catch { return ''; }
  };

  const handleAdd = async () => {
    if (!newRef.trim()) return;
    setFetchLoading(true);
    const text = newText.trim() || await fetchVerse(newRef);
    setFetchLoading(false);
    const now = new Date().toISOString();
    const updated = verses.map(v=>({...v,active:false}));
    updated.unshift({ ref: newRef.trim(), text, day: newDay, addedAt: now, active: true });
    save(updated);
    setNewRef(''); setNewText(''); setShowAdd(false);
  };

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  return (
    <div className="jd-card">
      <div className="jd-card-hd">
        <span className="jd-card-icon">📝</span>
        <span className="jd-card-title">Weekly Memory Verse</span>
        <button className="jd-small-btn" onClick={()=>setShowAdd(v=>!v)}>
          {showAdd ? 'Cancel' : '+ Set verse'}
        </button>
      </div>

      {showAdd && (
        <div className="jd-mv-form">
          <input className="jd-inp" placeholder="Reference (e.g. Philippians 4:13)"
            value={newRef} onChange={e=>setNewRef(e.target.value)} />
          <textarea className="jd-ta" rows={2}
            placeholder="Paste verse text, or leave blank to auto-fetch..."
            value={newText} onChange={e=>setNewText(e.target.value)} />
          <div className="jd-mv-form-row">
            <div style={{flex:1}}>
              <div className="jd-inp-lbl">Review day</div>
              <select className="jd-sel" value={newDay} onChange={e=>setNewDay(e.target.value)}>
                {DAYS.map(d=><option key={d}>{d}</option>)}
              </select>
            </div>
            <button className="jd-add-btn" onClick={handleAdd} disabled={fetchLoading||!newRef.trim()}>
              {fetchLoading ? '...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {current ? (
        <div className="jd-mv-current">
          <div className="jd-mv-ref">{current.ref}</div>
          <div className="jd-mv-text">"{current.text}"</div>
          <div className="jd-mv-meta">
            Review day: <b>{current.day}</b> · Added {format(parseISO(current.addedAt),'MMM d, yyyy')}
          </div>
        </div>
      ) : (
        <div className="jd-mv-empty">No verse set yet. Add one above to begin memorizing.</div>
      )}

      {verses.length > 1 && (
        <button className="jd-archive-btn" onClick={()=>setShowArchive(v=>!v)}>
          {showArchive ? '▲ Hide archive' : `▼ Archive (${verses.length-1} verses)`}
        </button>
      )}
      {showArchive && (
        <div className="jd-archive-list">
          {verses.slice(1).map((v,i) => (
            <div key={i} className="jd-archive-item">
              <div className="jd-archive-ref">{v.ref}</div>
              <div className="jd-archive-text">"{v.text.slice(0,80)}{v.text.length>80?'…':''}"</div>
              <div className="jd-archive-date">{format(parseISO(v.addedAt),'MMM d, yyyy')}</div>
              <button className="jd-archive-activate" onClick={()=>{
                const updated = verses.map((x,j)=>({...x,active:j===i+1}));
                save(updated);
              }}>Set current</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────
export default function JournalDashboard({ entries, onOpenNew, onOpenView }) {
  const [cloudExpanded, setCloudExpanded] = useState(false);

  const heatmap   = useMemo(() => get30DayHeatmap(entries), [entries]);
  const streaks   = useMemo(() => getStreaks(entries), [entries]);
  const wordCloud = useMemo(() => buildWordCloud(entries), [entries]);
  const coverage  = useMemo(() => getScriptureCoverage(entries), [entries]);
  const onThisDay = useMemo(() => getOnThisDay(entries), [entries]);
  const moodLine  = useMemo(() => getMoodTimeline(entries), [entries]);
  const season    = useMemo(() => getSpiritualSeason(entries), [entries]);
  const prompt    = useMemo(() => {
    const PROMPTS = [
      "What is God speaking to you about today?",
      "Where did you see God's hand in your life this week?",
      "What are you grateful for right now, even in difficulty?",
      "What is one area where you need to trust God more?",
      "Who has God placed on your heart to pray for?",
      "What scripture has been standing out to you lately?",
    ];
    return PROMPTS[new Date().getDate() % PROMPTS.length];
  }, []);

  // Entry length data — last 20 entries reversed chronologically
  const lengthData = useMemo(() =>
    entries.slice(0,20).reverse().map(e => ({
      date: e.created_at,
      words: wordCount(e.content),
      title: e.title,
      mood: e.mood,
    }))
  , [entries]);

  const maxWords  = Math.max(...lengthData.map(d=>d.words), 1);
  const maxCloud  = wordCloud[0]?.count || 1;
  const today     = new Date();
  const totalEntries = entries.length;
  const writtenToday = entries.filter(e => {
    try { return isToday(parseISO(e.created_at)); } catch { return false; }
  }).length;

  // 30-day grid
  const days30 = Array.from({length:30},(_,i)=>subDays(today,29-i));

  // Unique OT/NT books
  const covEntries = Object.entries(coverage);
  const otBooks = covEntries.filter(([,v])=>v.testament==='OT');
  const ntBooks = covEntries.filter(([,v])=>v.testament==='NT');

  if (entries.length === 0) return (
    <div className="j-dashboard">
      <div className="j-dash-glow" aria-hidden="true"/>
      <div className="jd-card" style={{textAlign:'center',padding:'40px 24px'}}>
        <div style={{fontSize:48,marginBottom:12,opacity:.5}}>📖</div>
        <div className="jd-empty-title">Begin your prayer journal</div>
        <div className="jd-empty-sub">Your dashboard will fill with writing patterns, themes, and spiritual insights as you write.</div>

        <div className="j-start-steps">
          <div className="j-start-title">First time? Try this:</div>
          <ol className="j-start-list">
            <li><b>Tap “New Entry”</b> in the top-right and write what’s on your heart.</li>
            <li><b>Pick a mood</b> (Peaceful, Grateful, Wrestling…) so we can show patterns over time.</li>
            <li><b>Add a scripture</b> if one’s standing out — verses load automatically.</li>
          </ol>
        </div>

        <button className="j-dash-write-btn" onClick={onOpenNew} style={{marginTop:16}}>✦ Write your first entry</button>
        <div className="j-empty-verse" style={{marginTop:20}}>
          "Do not be anxious about anything, but in every situation,<br/>
          by prayer and petition, present your requests to God."<br/>
          <span>— Philippians 4:6</span>
        </div>
      </div>
      <WeeklyMemoryVerse />
    </div>
  );

  return (
    <div className="j-dashboard">
      <div className="j-dash-glow" aria-hidden="true"/>

      {/* ── TODAY'S PROMPT ── */}
      <div className="jd-prompt-card">
        <div className="jd-prompt-lbl">✨ Today's Reflection Prompt</div>
        <div className="jd-prompt-text">"{prompt}"</div>
        <button className="j-dash-write-btn" onClick={onOpenNew}>✦ Write Today's Entry</button>
      </div>

      {/* ── STREAK + STATS ROW ── */}
      <div className="jd-stats-row">
        <div className="jd-stat-card jd-streak">
          <div className="jd-streak-nums">
            <div>
              <div className="jd-streak-n" style={{color:'#f59e0b'}}>{streaks.current}</div>
              <div className="jd-streak-lbl">Current streak</div>
            </div>
            <div className="jd-streak-sep">vs</div>
            <div>
              <div className="jd-streak-n" style={{color:'#fcd34d'}}>{streaks.longest}</div>
              <div className="jd-streak-lbl">Longest streak</div>
            </div>
          </div>
          <div className="jd-streak-sub">
            {streaks.current === streaks.longest && streaks.current > 0
              ? '🔥 You\'re on your longest streak ever!'
              : streaks.current > 0
              ? `🔥 ${streaks.longest - streaks.current} day${streaks.longest-streaks.current!==1?'s':''} from your record`
              : 'Write today to start a new streak'}
          </div>
        </div>
        <div className="jd-stat-card">
          <div className="jd-stat-n">{totalEntries}</div>
          <div className="jd-stat-lbl">Total Entries</div>
        </div>
        <div className="jd-stat-card">
          <div className="jd-stat-n" style={{color:'#fcd34d'}}>{writtenToday}</div>
          <div className="jd-stat-lbl">Written Today</div>
        </div>
        <div className="jd-stat-card">
          <div className="jd-stat-n" style={{color:'#6ee7b7'}}>{covEntries.length}</div>
          <div className="jd-stat-lbl">Books Referenced</div>
        </div>
      </div>

      {/* ── WRITING RHYTHM ── */}
      <div className="jd-card">
        <div className="jd-card-hd">
          <span className="jd-card-icon">📅</span>
          <span className="jd-card-title">Writing Rhythm</span>
          <span className="jd-card-sub">Last 30 days</span>
        </div>
        <div className="jd-heatmap">
          {days30.map((day, i) => {
            const key   = format(day, 'yyyy-MM-dd');
            const data  = heatmap[key];
            const count = data?.count || 0;
            const topMood = data?.moods?.[0];
            const color = count === 0 ? 'rgba(255,255,255,.06)'
              : count === 1 ? 'rgba(140,100,255,.4)'
              : 'rgba(140,100,255,.85)';
            return (
              <div key={i} className="jd-heat-cell" title={`${format(day,'MMM d')} · ${count} entr${count!==1?'ies':'y'}${topMood?' · '+topMood:''}`}
                style={{ background: count > 0 ? (moodColors[topMood]||color) : color, opacity: count > 0 ? (0.4 + count*0.3) : 1 }}>
              </div>
            );
          })}
        </div>
        <div className="jd-heatmap-legend">
          <span className="jd-heat-lbl">30 days ago</span>
          <div style={{display:'flex',gap:3,alignItems:'center'}}>
            <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>Less</span>
            {[0,.15,.35,.6,.85].map((o,i)=>
              <div key={i} style={{width:10,height:10,borderRadius:2,background:`rgba(140,100,255,${o||.06})`}}/>
            )}
            <span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>More</span>
          </div>
          <span className="jd-heat-lbl">Today</span>
        </div>
      </div>

      {/* ── SPIRITUAL SEASON ── */}
      {season && (
        <div className="jd-card jd-season-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">🌱</span>
            <span className="jd-card-title">Spiritual Season</span>
            <span className="jd-card-sub">Based on recent entries</span>
          </div>
          <div className="jd-season-text">"{season}"</div>
        </div>
      )}

      {/* ── ENTRY LENGTH OVER TIME ── */}
      {lengthData.length > 1 && (
        <div className="jd-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">📏</span>
            <span className="jd-card-title">Entry Length Over Time</span>
            <span className="jd-card-sub">Words per entry</span>
          </div>
          <div className="jd-length-chart">
            {lengthData.map((d,i) => (
              <div key={i} className="jd-length-col"
                title={`${d.title}\n${format(parseISO(d.date),'MMM d')} · ${d.words} words`}>
                <div className="jd-length-bar-wrap">
                  <div className="jd-length-bar"
                    style={{
                      height: `${Math.max(4, Math.round((d.words/maxWords)*100))}%`,
                      background: moodColors[d.mood] || '#8b5cf6',
                    }}/>
                </div>
                <div className="jd-length-lbl">{format(parseISO(d.date),'M/d')}</div>
              </div>
            ))}
          </div>
          <div className="jd-length-legend">
            <span>Colored by mood · hover for details</span>
            <span>Max: {Math.max(...lengthData.map(d=>d.words))} words</span>
          </div>
        </div>
      )}

      {/* ── MOOD JOURNEY ── */}
      {moodLine.length > 1 && (
        <div className="jd-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">💭</span>
            <span className="jd-card-title">Mood Journey</span>
            <span className="jd-card-sub">Last {moodLine.length} entries</span>
          </div>
          <div className="jd-mood-line">
            <svg viewBox={`0 0 ${moodLine.length*24} 60`} className="jd-mood-svg">
              <polyline
                points={moodLine.map((d,i)=>`${i*24+12},${60-(d.val/5)*50}`).join(' ')}
                fill="none" stroke="rgba(140,100,255,.6)" strokeWidth="1.5" strokeLinejoin="round"
              />
              {moodLine.map((d,i) => (
                <circle key={i} cx={i*24+12} cy={60-(d.val/5)*50} r="4"
                  fill={moodColors[d.mood]||'#8b5cf6'}
                  stroke="rgba(14,10,32,.8)" strokeWidth="1.5">
                  <title>{d.title} · {d.mood} · {format(parseISO(d.date),'MMM d')}</title>
                </circle>
              ))}
            </svg>
          </div>
          <div className="jd-mood-line-labels">
            <span>😔 Low</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[...new Set(moodLine.map(d=>d.mood))].map(m=>(
                <span key={m} style={{fontSize:10,color:moodColors[m],display:'flex',alignItems:'center',gap:3}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:moodColors[m],display:'inline-block'}}/>
                  {m}
                </span>
              ))}
            </div>
            <span>✨ High</span>
          </div>
        </div>
      )}

      {/* ── WORD CLOUD / THEMES ── */}
      {wordCloud.length > 0 && (
        <div className="jd-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">💬</span>
            <span className="jd-card-title">Themes & Words</span>
            <span className="jd-card-sub">Most common across all entries</span>
            <button className="jd-small-btn" onClick={()=>setCloudExpanded(v=>!v)}>
              {cloudExpanded ? 'Less' : 'More'}
            </button>
          </div>
          <div className="jd-word-cloud">
            {(cloudExpanded ? wordCloud : wordCloud.slice(0,20)).map(({word,count},i) => {
              const size = 10 + Math.round((count/maxCloud)*16);
              const opacity = 0.4 + (count/maxCloud)*0.6;
              const colors = ['#c4b5fd','#7dd3fc','#6ee7b7','#fcd34d','#f9a8d4','#fb923c'];
              return (
                <span key={i} className="jd-word"
                  style={{ fontSize:size, opacity, color: colors[i%colors.length] }}
                  title={`"${word}" · ${count} time${count!==1?'s':''}`}>
                  {word}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SCRIPTURE COVERAGE ── */}
      {covEntries.length > 0 && (
        <div className="jd-card">
          <div className="jd-card-hd">
            <span className="jd-card-icon">📜</span>
            <span className="jd-card-title">Scripture Coverage</span>
            <span className="jd-card-sub">{otBooks.length} OT · {ntBooks.length} NT books</span>
          </div>
          {[['Old Testament', otBooks], ['New Testament', ntBooks]].map(([label, books]) =>
            books.length > 0 ? (
              <div key={label} className="jd-coverage-section">
                <div className="jd-coverage-lbl">{label}</div>
                <div className="jd-coverage-books">
                  {books.sort((a,b)=>b[1].count-a[1].count).map(([book, data]) => (
                    <div key={book} className="jd-book-chip"
                      style={{ opacity: Math.min(1, 0.5 + data.count*0.15) }}
                      title={`${book} · ${data.count} reference${data.count!==1?'s':''}`}>
                      {book.length > 8 ? book.split(' ').map(w=>w[0]).join('') : book}
                      <span className="jd-book-count">{data.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* ── ON THIS DAY ── */}
      {onThisDay.length > 0 && (
        <div className="jd-card jd-on-this-day">
          <div className="jd-card-hd">
            <span className="jd-card-icon">🕰</span>
            <span className="jd-card-title">On This Day</span>
            <span className="jd-card-sub">{format(today,'MMMM d')} in past years</span>
          </div>
          {onThisDay.map(e => {
            const yr = parseISO(e.created_at).getFullYear();
            const ago = today.getFullYear() - yr;
            return (
              <div key={e.id} className="jd-otd-item" onClick={()=>onOpenView(e)}>
                <div className="jd-otd-year">{yr}<span>{ago}yr ago</span></div>
                <div className="jd-otd-body">
                  <div className="jd-otd-title">{e.title}</div>
                  <div className="jd-otd-snippet">{(e.content||'').slice(0,100)}{e.content?.length>100?'…':''}</div>
                </div>
                <button className="jd-otd-read">Read →</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── WEEKLY MEMORY VERSE ── */}
      <WeeklyMemoryVerse />

    </div>
  );
}
