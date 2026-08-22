'use client';

import { useState, useEffect, useRef, memo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, orderBy, serverTimestamp, onSnapshot,
  updateDoc, increment, where, deleteDoc,
} from 'firebase/firestore';

// twemoji ships without TS types — this repo doesn't need a real .d.ts,
// we only ever call .parse(). Requires `npm install twemoji`.
// @ts-ignore
import twemoji from 'twemoji';

const DEVELOPER_EMAIL = 'ascendmaxxforum@gmail.com';
const DEVELOPER_USERNAME = 'ascendmaxx';

const allForums = [
  { id: 1,  section: 'Important',    name: 'Rules',                desc: 'Everything you need to know before posting. Staff-only board — please read it in full.' },
  { id: 2,  section: 'Important',    name: 'Announcements',        desc: 'New features, site changes, and important notices straight from the staff team.' },
  { id: 3,  section: 'Off topic',    name: 'Lounge',                desc: 'Hang out, chat about whatever\u2019s on your mind, and get to know the community.' },
  { id: 4,  section: 'Off topic',    name: 'Music',                 desc: 'Drop tracks, swap playlists, and talk about anything music related.' },
  { id: 5,  section: 'Off topic',    name: 'Media',                 desc: 'Share pictures, clips, and other media worth showing off.' },
  { id: 6,  section: 'Looksmaxxing', name: 'Rate Me',                desc: 'Drop a photo and get straightforward feedback from the community.' },
  { id: 7,  section: 'Looksmaxxing', name: 'Looksmaxxing',           desc: 'Talk routines, tips, and general advice for improving your look.' },
  { id: 8,  section: 'Biohacking',   name: 'Cognitive improvement', desc: 'Sleep, focus, and other habits that sharpen how your brain performs.' },
  { id: 9,  section: 'Moneymaxxing', name: 'Moneymaxxing',          desc: 'Building wealth, careers, and financial self-improvement.' },
  { id: 10, section: 'Larpmaxxing',  name: 'Larpmaxxing',           desc: 'Off-beat and joke threads. Take everything here with a grain of salt.' },

  // ── Added sections/topics ──────────────────────────────────────────────
  { id: 11, section: 'Bulletin',     name: 'Site Updates',          desc: 'What changed, what\u2019s new, and anything the team wants you to see.' },

  { id: 12, section: 'Fuel',         name: 'Eating & Macros',       desc: 'Meals, tracking, and whatever\u2019s working (or not) for you lately.' },
  { id: 13, section: 'Fuel',         name: 'Stacks & Supplements',  desc: 'Compare what people are running and how it\u2019s actually going.' },
  { id: 14, section: 'Fuel',         name: 'Panel Results',         desc: 'Post your numbers, compare markers, figure out what they actually mean.' },
  { id: 15, section: 'Fuel',         name: 'Plate Ratings',         desc: 'Rate what you ate — restaurants, meals, products, all of it.' },

  { id: 16, section: 'Body',         name: 'Training Log',          desc: 'Programs, lifts, and progress toward whatever you\u2019re chasing.' },
  { id: 17, section: 'Body',         name: 'Grooming & Skin',       desc: 'Routines, products, and upkeep for skin and hair.' },
  { id: 23, section: 'Body',         name: 'Rest & Recovery',       desc: 'Sleep habits and everything that helps you actually recover.' },

  { id: 18, section: 'Think Tank',   name: 'Evidence Locker',       desc: 'Studies and sources only — leave the vibes at the door.' },
  { id: 19, section: 'Think Tank',   name: 'Playbooks',             desc: 'Write-ups and reference material worth saving.' },
  { id: 24, section: 'Think Tank',   name: 'Debates & Hot Takes',   desc: 'Pick a side and argue it out — keep it civil.' },

  { id: 20, section: 'Off topic',    name: 'Venting & Stories',     desc: 'A place to get things off your chest or share what\u2019s been going on in your life.' },
  { id: 25, section: 'Off topic',    name: 'Wins & Success Stories', desc: 'Made progress on something? Post it here and celebrate a bit.' },

  { id: 21, section: 'Other',        name: 'Ban Appeals',           desc: 'The only board banned members can post in — make your case to the mod team here.' },
  { id: 22, section: 'Other',        name: 'Suggestions',           desc: 'Suggest features to improve the forum.' },
];

const forumSections = ['Important','Off topic','Looksmaxxing','Biohacking','Moneymaxxing','Larpmaxxing','Bulletin','Fuel','Body','Think Tank','Other'];

// ── Preset thread tags ────────────────────────────────────────────────────
// Users no longer get to pick their own tag text/color — they choose from
// this fixed, color-coded list instead.
const THREAD_TAGS: { name: string; color: string }[] = [
  { name: 'Discussion', color: '#3b82f6' }, // blue
  { name: 'Question',   color: '#8b5cf6' }, // purple
  { name: 'Important',  color: '#ef4444' }, // red
  { name: 'Info',       color: '#06b6d4' }, // cyan
  { name: 'Guide',      color: '#10b981' }, // emerald
  { name: 'Solved',     color: '#84cc16' }, // lime
  { name: 'Warning',    color: '#f59e0b' }, // amber
  { name: 'Off-Topic',  color: '#71717a' }, // zinc
];
const THREAD_TAG_COLOR: Record<string, string> = Object.fromEntries(THREAD_TAGS.map(t => [t.name, t.color]));

const sectionDescriptions: Record<string, string> = {
  'Important':    'Staff notices and site-wide rules. Worth reading before you post anywhere else.',
  'Off topic':    'Anything that doesn\u2019t fit neatly under Looksmaxxing, Biohacking, or Moneymaxxing goes here.',
  'Looksmaxxing': 'Get advice from others about hardmaxxing, softmaxxing, and aesthetics in general.',
  'Biohacking':   'Habits, supplements, and routines for getting more out of your body and mind.',
  'Moneymaxxing': 'Building wealth, careers, and financial self-improvement.',
  'Larpmaxxing':  'Off-beat and joke threads. Take everything here with a grain of salt.',
  'Bulletin':     'Site updates and anything staff want you to see first.',
  'Fuel':         'Food, supplements, labs, and what you\u2019re putting into your body.',
  'Body':         'Training, recovery, and the physical side of self-improvement.',
  'Think Tank':   'Research, write-ups, and conversation that doesn\u2019t fit neatly under Fuel or Body.',
  'Other':        'Ban appeals and site suggestions live here.',
};

const THREADMAXXER_COLORS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Sky',     value: '#0ea5e9' },
  { name: 'Violet',  value: '#8b5cf6' },
  { name: 'Rose',    value: '#f43f5e' },
  { name: 'Amber',   value: '#f59e0b' },
  { name: 'Orange',  value: '#f97316' },
  { name: 'Pink',    value: '#ec4899' },
  { name: 'Cyan',    value: '#06b6d4' },
  { name: 'Lime',    value: '#84cc16' },
  { name: 'White',   value: '#f4f4f5' },
];

// ── CHANGE 1: All rank labels now UPPERCASE, fixed label names ───────────────
function getRank(total: number): { label: string; isThreadmaxxer: boolean } {
  if (total >= 200) return { label: 'THREADMAXXER', isThreadmaxxer: true };
  if (total >= 5)   return { label: 'BLUE',          isThreadmaxxer: false };
  return               { label: 'GREY',              isThreadmaxxer: false };
}

// ── CHANGE 2: RankTag now also handles the ADMIN default for developer ───────
// tagLabel from Firestore takes priority, then rank label
function RankTag({ total, color, bgColor, textColor, tagLabel, username }: {
  total: number; color?: string; bgColor?: string; textColor?: string; tagLabel?: string; username?: string;
}) {
  const { label, isThreadmaxxer } = getRank(total);

  // Developer account always defaults to ADMIN if no custom tagLabel set
  const isDev = username === DEVELOPER_USERNAME;
  const displayLabel = tagLabel || (isDev ? 'ADMIN' : label);

  // Dev gets special styling if no custom colours set
  const isCustomOrThreadmaxxer = !!(tagLabel || bgColor || textColor) || isThreadmaxxer || isDev;

  const defaultDevBg   = '#ef4444'; // red for admin
  const defaultDevText = '#ffffff';

  if (isCustomOrThreadmaxxer) {
    return (
      <span
        className="inline-block px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest rounded-sm"
        style={{
          backgroundColor: bgColor || (isDev && !tagLabel ? defaultDevBg : color || '#10b981'),
          color: textColor || (isDev && !tagLabel ? defaultDevText : '#000'),
        }}>
        {displayLabel}
      </span>
    );
  }
  const isBlue = label === 'BLUE';
  return (
    <span
      className="inline-block px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest rounded-sm"
      style={isBlue ? { backgroundColor: '#3b82f6', color: '#ffffff' } : { backgroundColor: '#3f3f46', color: '#d4d4d8' }}>
      {displayLabel}
    </span>
  );
}

function Avatar({ src, username, size = 32 }: { src?: string; username: string; size?: number }) {
  const initials = username ? username.slice(0, 2).toUpperCase() : '??';
  const style = { width: size, height: size, minWidth: size };
  if (src) return (
    <img src={src} alt={username} style={style}
      className="rounded-full object-cover border border-zinc-700 flex-shrink-0" />
  );
  return (
    <div style={{ ...style, fontSize: size < 28 ? 9 : 13 }}
      className="rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center flex-shrink-0 font-mono font-bold text-zinc-300">
      {initials}
    </div>
  );
}

// ── Monoline icon set, one per forum topic. No background/border — just a stroked glyph. ──
const FORUM_ICON_PATHS: Record<string, React.ReactNode> = {
  'Rules': (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </>
  ),
  'Announcements': (
    <>
      <path d="M3 10v4a1 1 0 001 1h2l3 4V5L6 9H4a1 1 0 00-1 1z" />
      <path d="M11 8.5a4 4 0 010 7" />
      <path d="M14.5 6a7.5 7.5 0 010 12" />
    </>
  ),
  'News & Announcements': (
    <>
      <path d="M3 10v4a1 1 0 001 1h2l3 4V5L6 9H4a1 1 0 00-1 1z" />
      <path d="M11 8.5a4 4 0 010 7" />
      <path d="M14.5 6a7.5 7.5 0 010 12" />
    </>
  ),
  'Lounge': (
    <>
      <path d="M4 18v-4a2 2 0 012-2h12a2 2 0 012 2v4" />
      <path d="M4 15v-1.5A1.5 1.5 0 015.5 12h13A1.5 1.5 0 0120 13.5V15" />
      <path d="M5 18v2M19 18v2" />
    </>
  ),
  'Music': (
    <>
      <circle cx="7" cy="18" r="2.2" />
      <circle cx="17" cy="16" r="2.2" />
      <path d="M9.2 18V6.5L19.2 4v11.5" />
    </>
  ),
  'Media': (
    <>
      <rect x="3.5" y="4.5" width="17" height="14" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M3.5 15.5l4.5-4 3 3 4-5 5.5 6" />
    </>
  ),
  'Rate Me': (
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L12 3.5z" />
  ),
  'Looksmaxxing': (
    <>
      <path d="M12 3c-4 0-6.5 3-6.5 7 0 5 3 8.5 6.5 10 3.5-1.5 6.5-5 6.5-10 0-4-2.5-7-6.5-7z" />
      <path d="M9.5 11l.01.01M14.5 11l.01.01" />
      <path d="M18 8l1.5-.5L18 6M6 8L4.5 7.5 6 6" />
    </>
  ),
  'Cognitive improvement': (
    <>
      <path d="M9 4a4 4 0 00-4 4c0 1 .3 1.7.8 2.3A3.3 3.3 0 004 13.5 3.5 3.5 0 007.5 17H9" />
      <path d="M15 4a4 4 0 014 4c0 1-.3 1.7-.8 2.3A3.3 3.3 0 0120 13.5a3.5 3.5 0 01-3.5 3.5H15" />
      <path d="M9 4v13a2 2 0 004 0V4" />
      <path d="M9 8.5h4M9 12.5h4" />
    </>
  ),
  'Moneymaxxing': (
    <>
      <path d="M4 16l4.5-5 3.5 3.5L19 6" />
      <path d="M14 6h5v5" />
    </>
  ),
  'Larpmaxxing': (
    <>
      <path d="M8.5 10.5a3.5 3.5 0 117 0c0 2-1.5 2.7-1.5 4.5H10c0-1.8-1.5-2.5-1.5-4.5z" />
      <path d="M10 17.5h4" />
      <path d="M12 3v1.5M4.5 8.5H6M18 8.5h1.5M6.5 4.5l1 1.2M17.5 4.5l-1 1.2" />
    </>
  ),
  'Nutrition & Diet': (
    <>
      <path d="M12 8c-3.5 0-6 3-6 6.5 0 3 1.7 5.5 3.3 5.5.9 0 1.2-.5 2.7-.5s1.8.5 2.7.5c1.6 0 3.3-2.5 3.3-5.5C18 11 15.5 8 12 8z" />
      <path d="M12 8c0-1.5.8-2.7 2.2-3.3" />
      <path d="M10.5 6.5c.6-1 .5-2 .1-3" />
    </>
  ),
  'Supplements & Vitamins': (
    <>
      <rect x="4" y="10.5" width="16" height="7" rx="3.5" transform="rotate(-20 12 14)" />
      <path d="M9.5 12.2l4.7 3.7" />
    </>
  ),
  'Blood Work & Labs': (
    <>
      <path d="M9 3h6M10 3v4.5L6 15a3 3 0 003 4.5h6a3 3 0 003-4.5L14 7.5V3" />
      <path d="M8.5 14.5h7" />
    </>
  ),
  'Food Reviews': (
    <>
      <path d="M6 3v7a2 2 0 002 2v9M6 3v9M8 3v9" />
      <path d="M16 3c-1.4 0-2.5 1.6-2.5 4.5S14.6 12 16 12v9" />
    </>
  ),
  'Fitness & Training': (
    <>
      <path d="M5 9v6M19 9v6" />
      <path d="M3 12h2M19 12h2" />
      <path d="M7 7v10M17 7v10" />
      <path d="M7 12h10" />
    </>
  ),
  'Skincare & Hair': (
    <>
      <path d="M12 3.5c3 3 5.5 6.6 5.5 9.8a5.5 5.5 0 11-11 0c0-3.2 2.5-6.8 5.5-9.8z" />
    </>
  ),
  'Health Research & Facts': (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  'Guides & Resources': (
    <>
      <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5v-13z" />
      <path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5v-13z" />
    </>
  ),
  'Venting & Stories': (
    <>
      <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v8a1.5 1.5 0 01-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 014 13.5v-8z" />
      <path d="M12 7.5v3.5M12 13.2v.01" />
    </>
  ),
  'Sleep & Recovery': (
    <>
      <path d="M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z" />
    </>
  ),
  'Debates & Hot Takes': (
    <>
      <path d="M3 5.5A1.5 1.5 0 014.5 4h8A1.5 1.5 0 0114 5.5v4A1.5 1.5 0 0112.5 11H8l-3 3v-3H4.5A1.5 1.5 0 013 9.5v-4z" />
      <path d="M10 14v1.5A1.5 1.5 0 0011.5 17H16l3 3v-3h.5a1.5 1.5 0 001.5-1.5v-4A1.5 1.5 0 0019.5 10H15" />
    </>
  ),
  'Wins & Success Stories': (
    <>
      <path d="M7 4h10v4a5 5 0 01-10 0V4z" />
      <path d="M7 5H4.5A1.5 1.5 0 003 6.5c0 2 1.5 3 3.5 3.2M17 5h2.5A1.5 1.5 0 0121 6.5c0 2-1.5 3-3.5 3.2" />
      <path d="M12 13v3.5M9 20h6M10 16.5h4v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2z" />
    </>
  ),
  'Ban Appeals': (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </>
  ),
  'Suggestions': (
    <>
      <path d="M9 18h6" />
      <path d="M8 14.5a4.5 4.5 0 118 0c0 1.5-1 2-1.5 3H9.5c-.5-1-1.5-1.5-1.5-3z" />
      <path d="M12 3v1.5M4.5 8h1.5M18 8h1.5M6.5 4.5l1 1M17.5 4.5l-1 1" />
    </>
  ),
};

function ForumIcon({ name }: { name: string }) {
  const paths = FORUM_ICON_PATHS[name] ?? (
    <circle cx="12" cy="12" r="7.5" />
  );
  return (
    <div className="w-9 h-9 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center text-zinc-500">
      <svg viewBox="0 0 24 24" className="w-[21px] h-[21px] sm:w-[27px] sm:h-[27px]" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {paths}
      </svg>
    </div>
  );
}

const Modal = memo(function Modal({ children, onClose, maxW = 'max-w-lg' }: {
  children: React.ReactNode; onClose: () => void; maxW?: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/85 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className={`bg-zinc-950 border border-zinc-800 w-full ${maxW} sm:my-4 max-h-[90vh] overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
});

const MembersList = memo(function MembersList({ openProfile, presenceMap, startDM, currentUid }: {
  openProfile: (u: string) => void;
  presenceMap: Record<string, boolean>;
  startDM: (uid: string, username: string) => void;
  currentUid: string;
}) {
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      (snap) => setMembers(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  const online  = members.filter(m => presenceMap[m.uid]);
  const offline = members.filter(m => !presenceMap[m.uid]);

  const Row = ({ m }: { m: any }) => {
    const total = (m.threadCount || 0) + (m.replyCount || 0);
    return (
      <div className="w-full flex items-center gap-3 py-3 px-4 border-b border-zinc-800 hover:bg-zinc-900/60 transition-colors">
        <button onClick={() => openProfile(m.username)} className="relative flex-shrink-0">
          <Avatar src={m.avatar} username={m.username} size={32} />
          <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-zinc-950 ${presenceMap[m.uid] ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={() => openProfile(m.username)} className="font-mono text-sm text-zinc-200 hover:text-emerald-400 transition">
            {m.username}
          </button>
          <div className="flex items-center gap-2 mt-0.5">
            {/* CHANGE 2: pass username so RankTag knows if it's the dev account */}
            <RankTag total={total} color={m.tagColor} bgColor={m.tagBgColor} textColor={m.tagTextColor} tagLabel={m.tagLabel} username={m.username} />
            <span className={`text-[10px] font-mono ${presenceMap[m.uid] ? 'text-emerald-500' : 'text-zinc-600'}`}>
              {presenceMap[m.uid] ? 'online' : 'offline'}
            </span>
          </div>
          {m.bio && <div className="text-[10px] font-mono text-zinc-600 truncate mt-0.5">{m.bio}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right text-[10px] font-mono text-zinc-600">{m.threadCount || 0}t · {m.replyCount || 0}r</div>
          {m.uid !== currentUid && (
            <button onClick={() => startDM(m.uid, m.username)}
              className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 border border-zinc-800 hover:border-emerald-700 px-2 py-1 transition">
              DM
            </button>
          )}
        </div>
      </div>
    );
  };

  if (members.length === 0) return (
    <div className="p-8 text-center text-zinc-600 text-xs font-mono">No members yet</div>
  );
  return (
    <div>
      {online.length > 0 && (
        <>
          <div className="px-4 py-2 bg-zinc-900/50 text-[10px] font-mono uppercase tracking-widest text-emerald-600 border-b border-zinc-800">
            Online — {online.length}
          </div>
          {online.map(m => <Row key={m.uid} m={m} />)}
        </>
      )}
      {offline.length > 0 && (
        <>
          <div className="px-4 py-2 bg-zinc-900/50 text-[10px] font-mono uppercase tracking-widest text-zinc-600 border-b border-zinc-800">
            Offline — {offline.length}
          </div>
          {offline.map(m => <Row key={m.uid} m={m} />)}
        </>
      )}
    </div>
  );
});

function AscendMaxxApp() {
  type View = 'home' | 'forums' | 'about' | 'dms' | 'members' | 'stickers' | 'trash';

  // ── Shareable URLs (?thread=… / ?forum=…) ──────────────────────────────────
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlHydrated = useRef(false);

  const [currentView, setCurrentView]     = useState<View>('home');
  const [selectedForum, setSelectedForum] = useState<any>(null);

  const [aboutText, setAboutText]   = useState('AscendMaxx is a self-improvement community focused on looksmaxxing, cognitive enhancement, and total life ascension.');
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');

  const [isLoggedIn, setIsLoggedIn]           = useState(false);
  const [currentUser, setCurrentUser]         = useState('');
  const [currentUid, setCurrentUid]           = useState('');
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [isDeveloper, setIsDeveloper]         = useState(false);
  const [authLoading, setAuthLoading]         = useState(true);

  // ── Moderation: derived from the logged-in user's own doc ────────────────
  const isModerator  = !!currentUserData?.isModerator && !isDeveloper;
  const isStaff       = isDeveloper || isModerator; // dev + mods: delete/ban powers, rules-board posting
  const isBannedUser  = !!currentUserData?.banned;
  const BAN_APPEALS_FORUM_ID = 21;

  const [showLogin, setShowLogin]       = useState(false);
  const [loginData, setLoginData]       = useState({ email: '', password: '' });
  const [loginError, setLoginError]     = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [showRegister, setShowRegister]         = useState(false);
  const [registerData, setRegisterData]         = useState({ username: '', email: '', password: '' });
  const [registerError, setRegisterError]       = useState('');
  const [registerLoading, setRegisterLoading]   = useState(false);

  const [threads, setThreads]           = useState<any[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [forumPage, setForumPage]       = useState(1);
  const [showNewThreadModal, setShowNewThreadModal]     = useState(false);
  const [newThreadTitle, setNewThreadTitle]             = useState('');
  const [newThreadDescription, setNewThreadDescription] = useState('');
  const [newThreadImages, setNewThreadImages]           = useState<string[]>([]);
  const [postingThread, setPostingThread]               = useState(false);

  const [viewingThread, setViewingThread]     = useState<any>(null);
  const [threadReplies, setThreadReplies]     = useState<any[]>([]);
  const [replyText, setReplyText]             = useState('');
  const [postingReply, setPostingReply]       = useState(false);
  const [threadUserCache, setThreadUserCache] = useState<Record<string, any>>({});
  // CHANGE: live avatar cache for thread-list rows, keyed by authorUid, so
  // list previews also show the author's current avatar retroactively
  // instead of the static snapshot stored on the thread at post time.
  const [authorAvatarCache, setAuthorAvatarCache] = useState<Record<string, string>>({});

  const [pinnedIds, setPinnedIds]                   = useState<string[]>(['ann-1']);
  const [defaultAnnouncement, setDefaultAnnouncement] = useState<any>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [annDraft, setAnnDraft]                     = useState({ title: '', description: '' });

  const [viewingProfile, setViewingProfile]     = useState<any>(null);
  const [showEditProfile, setShowEditProfile]   = useState(false);
  const [profileBio, setProfileBio]             = useState('');
  const [profileAvatar, setProfileAvatar]       = useState('');
  const [profileTagColor, setProfileTagColor]   = useState('');
  const [savingProfile, setSavingProfile]       = useState(false);
  const [followingList, setFollowingList]       = useState<string[]>([]);
  const [profileFollowers, setProfileFollowers] = useState<any[]>([]);
  const [profileFollowing, setProfileFollowing] = useState<any[]>([]);
  const [showFollowers, setShowFollowers]       = useState(false);
  const [showFollowing, setShowFollowing]       = useState(false);

  // CHANGE 3: Rep system state
  const [repGivenMap, setRepGivenMap] = useState<Record<string, boolean>>({});

  // Dev tag editor
  const [showDevTagEditor, setShowDevTagEditor] = useState(false);
  const [devTagTarget, setDevTagTarget]         = useState<any>(null);
  const [devTagBgColor, setDevTagBgColor]       = useState('#3f3f46');
  const [devTagTextColor, setDevTagTextColor]   = useState('#d4d4d8');
  const [devTagLabel, setDevTagLabel]           = useState('');
  const [savingDevTag, setSavingDevTag]         = useState(false);

  const [showDmPanel, setShowDmPanel]           = useState(false);
  const [conversations, setConversations]       = useState<any[]>([]);
  const [activeConvo, setActiveConvo]           = useState<any>(null);
  const [messages, setMessages]                 = useState<any[]>([]);
  const [dmInput, setDmInput]                   = useState('');
  const [dmUnread, setDmUnread]                 = useState(0);
  const [dmListenerError, setDmListenerError]   = useState('');
  const [dmSearch, setDmSearch]                 = useState('');
  const [dmSearchResults, setDmSearchResults]   = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers]     = useState(false);
  const messagesEndRef                          = useRef<any>(null);

  const [totalUsers, setTotalUsers]     = useState(0);
  const [latestUser, setLatestUser]     = useState<any>(null);
  const [onlineCount, setOnlineCount]   = useState(0);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [presenceMap, setPresenceMap]   = useState<Record<string, boolean>>({});

  const [showThemePicker, setShowThemePicker] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showMobileLatest, setShowMobileLatest] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [activeBg, setActiveBg]               = useState('#0d0d0d');
  const themes = [
    { name: 'Default',  bg: '#0d0d0d' }, { name: 'Midnight', bg: '#0d1117' },
    { name: 'Navy',     bg: '#0a0f1e' }, { name: 'Forest',   bg: '#0a130d' },
    { name: 'Crimson',  bg: '#130a0a' }, { name: 'Purple',   bg: '#0f0a1a' },
    { name: 'White',    bg: '#ffffff' }, { name: 'Original', bg: '#d8dfe8' },
  ];

  const [showRateModal, setShowRateModal]     = useState(false);

  // ── Thread tags ───────────────────────────────────────────────────────────
  const [newThreadTag, setNewThreadTag]         = useState('');
  const [newThreadTagColor, setNewThreadTagColor] = useState('#6366f1');
  const [showTagPicker, setShowTagPicker]       = useState(false);

  // ── Reactions ─────────────────────────────────────────────────────────────
  // reactions stored per thread/reply as subcollection: reactions/{targetId}/votes/{uid}
  // { type: 'like'|'dislike'|string(stickerUrl), uid, createdAt }
  const [reactionsMap, setReactionsMap]         = useState<Record<string, any[]>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null); // targetId
  const [reactionPickerType, setReactionPickerType] = useState<'thread'|'reply'>('thread');

  // ── Site logo ─────────────────────────────────────────────────────────────
  const [siteLogos, setSiteLogos]       = useState<Record<string, { url: string; size: number }>>({});
  const [editingLogo, setEditingLogo]   = useState(false);
  const [logoUrlDraft, setLogoUrlDraft] = useState('');
  const [logoSizeDraft, setLogoSizeDraft] = useState(32);

  // ── Stickers ──────────────────────────────────────────────────────────────
  const [stickers, setStickers]                     = useState<any[]>([]);
  const [stickerRequests, setStickerRequests]       = useState<any[]>([]);
  const [showStickerCatalog, setShowStickerCatalog] = useState(false);
  const [stickerTarget, setStickerTarget]           = useState<'reply'|'dm'|null>(null);
  const [showAddSticker, setShowAddSticker]         = useState(false);
  const [newStickerName, setNewStickerName]         = useState('');
  const [newStickerUrl, setNewStickerUrl]           = useState('');
  const [addingStickerError, setAddingStickerError] = useState('');
  const [showRequestSticker, setShowRequestSticker] = useState(false);
  const [reqStickerName, setReqStickerName]         = useState('');
  const [reqStickerUrl, setReqStickerUrl]           = useState('');
  const [showReviewQueue, setShowReviewQueue]       = useState(false);
  const [showStickersPage, setShowStickersPage]     = useState(false);

  // ── Custom forum topics (dev-created) ─────────────────────────────────────
  const [customForums, setCustomForums]         = useState<any[]>([]);
  const [showNewTopicModal, setShowNewTopicModal] = useState(false);
  const [newTopicSection, setNewTopicSection]   = useState('');
  const [newTopicName, setNewTopicName]         = useState('');
  const [addingTopic, setAddingTopic]           = useState(false);
  const [ratingMode, setRatingMode]           = useState<'ai'|'community'>('ai');
  const [imagePreview, setImagePreview]       = useState<string | null>(null);
  const [faceDescription, setFaceDescription] = useState('');
  const [aiRating, setAiRating]               = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing]         = useState(false);

  const inputCls     = "w-full bg-black border border-zinc-700 px-3 py-2.5 text-sm font-mono text-zinc-200 focus:outline-none focus:border-emerald-600 placeholder-zinc-600";
  const btnPrimary   = "bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-mono font-bold uppercase tracking-wider px-4 py-2.5 transition-colors disabled:opacity-50";
  const btnSecondary = "border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-xs font-mono uppercase tracking-wider px-4 py-2.5 transition-colors";

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'announcement'), (snap) => {
      if (snap.exists()) setDefaultAnnouncement(snap.data());
    });
    return () => unsub();
  }, []);

  const siteAnnouncement = {
    id: 'ann-1', forum: 'Announcements', forumId: 2,
    title: defaultAnnouncement?.title ?? 'Welcome to AscendMaxx — Rules & Community Guidelines',
    description: defaultAnnouncement?.description ?? 'Welcome to AscendMaxx. Please read the community rules before posting. Be respectful, stay on topic, and help each other ascend. Toxic behaviour, doxxing, or harassment will result in an immediate ban.',
    author: DEVELOPER_USERNAME, date: 'June 9, 2026', pinned: true, images: [] as string[], authorAvatar: '',
  };
  // Announcement lives in settings/announcement rather than the `threads`
  // collection, so it needs its own soft-delete flag instead of deleteThread.
  const isAnnouncementDeleted = !!defaultAnnouncement?.hidden;

  // ── Deep link: URL → state (runs once, after threads have loaded) ────────
  // Lets someone open a copied link like ascendmaxx.me/?thread=abc123 and
  // land straight on that thread instead of the homepage.
  useEffect(() => {
    if (urlHydrated.current || threadsLoading) return;
    const threadId = searchParams.get('thread');
    const forumParam = searchParams.get('forum');
    const viewParam = searchParams.get('view') as View | null;

    if (threadId) {
      const t = threadId === 'ann-1' ? siteAnnouncement : threads.find(t => t.id === threadId);
      if (t) {
        const forumForThread = allForums.find(f => f.id === t.forumId) || customForums.find(f => f.id === t.forumId);
        if (forumForThread) { setSelectedForum(forumForThread); setCurrentView('forums'); }
        setViewingThread(t);
      }
    } else if (forumParam) {
      const f = allForums.find(f => String(f.id) === forumParam) || customForums.find(f => String(f.id ?? f.firestoreId) === forumParam);
      if (f) { setSelectedForum(f); setCurrentView('forums'); }
    } else if (viewParam) {
      setCurrentView(viewParam);
    }
    urlHydrated.current = true;
  }, [threadsLoading, threads, customForums, searchParams]);

  // ── Deep link: state → URL ────────────────────────────────────────────────
  // Keeps the address bar in sync so the "copy link" button (and just
  // copying the URL bar) always points at whatever's currently on screen.
  useEffect(() => {
    if (!urlHydrated.current) return; // don't stomp the URL before we've read it once
    const params = new URLSearchParams();
    if (viewingThread) {
      params.set('thread', viewingThread.id);
    } else if (selectedForum && currentView === 'forums') {
      params.set('forum', String(selectedForum.id ?? selectedForum.firestoreId));
    } else if (currentView !== 'home') {
      params.set('view', currentView);
    }
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }, [viewingThread, selectedForum, currentView, router]);

  const deleteAnnouncement = async () => {
    if (!confirm('Delete this pinned announcement?')) return;
    try {
      await setDoc(doc(db, 'settings', 'announcement'), {
        title: siteAnnouncement.title,
        description: siteAnnouncement.description,
        hidden: true,
      });
      setViewingThread(null);
    } catch { alert('Failed to delete.'); }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setCurrentUser(data.username);
          setCurrentUserData(data);
        }
        setCurrentUid(user.uid);
        setIsLoggedIn(true);
        setIsDeveloper(user.email === DEVELOPER_EMAIL);
        await setDoc(doc(db, 'presence', user.uid), { online: true, lastSeen: serverTimestamp() }, { merge: true });
      } else {
        setIsLoggedIn(false); setCurrentUser(''); setCurrentUid('');
        setCurrentUserData(null); setIsDeveloper(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'threads'), orderBy('createdAt', 'desc')),
      (snap) => {
        setThreads(snap.docs.map((d) => ({
          id: d.id, ...d.data(),
          date: d.data().createdAt?.toDate
            ? d.data().createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Just now',
        })));
        setThreadsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ── Trash (dev-only) — soft-deleted threads/replies, so a bad mod's ───────
  // deletions can be reviewed and restored instead of being gone for good.
  const [deletedThreadsList, setDeletedThreadsList] = useState<any[]>([]);
  const [deletedRepliesList, setDeletedRepliesList] = useState<any[]>([]);
  useEffect(() => {
    if (!isDeveloper) { setDeletedThreadsList([]); setDeletedRepliesList([]); return; }
    const unsub1 = onSnapshot(query(collection(db, 'deletedThreads'), orderBy('deletedAt', 'desc')), (snap) => {
      setDeletedThreadsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsub2 = onSnapshot(query(collection(db, 'deletedReplies'), orderBy('deletedAt', 'desc')), (snap) => {
      setDeletedRepliesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub1(); unsub2(); };
  }, [isDeveloper]);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'about')).then((snap) => {
      if (snap.exists() && snap.data().text) setAboutText(snap.data().text);
    });
  }, []);

  // CHANGE: keep authorAvatarCache filled with live avatars for every
  // author currently visible in the thread list.
  useEffect(() => {
    const uids = [...new Set(threads.map((t: any) => t.authorUid).filter(Boolean))]
      .filter((uid: string) => !(uid in authorAvatarCache));
    if (uids.length === 0) return;
    (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(uids.map(async (uid: string) => {
        try {
          const s = await getDoc(doc(db, 'users', uid));
          updates[uid] = s.exists() ? (s.data().avatar || '') : '';
        } catch { updates[uid] = ''; }
      }));
      setAuthorAvatarCache(prev => ({ ...prev, ...updates }));
    })();
  }, [threads, authorAvatarCache]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      (snap) => {
        setTotalUsers(snap.size);
        if (snap.docs.length > 0) setLatestUser(snap.docs[0].data());
        setStaffMembers(
          snap.docs
            .filter(d => d.data().username === DEVELOPER_USERNAME || d.data().isModerator === true)
            .map(d => ({ uid: d.id, ...d.data() } as any))
            .sort((a, b) => (b.username === DEVELOPER_USERNAME ? 1 : 0) - (a.username === DEVELOPER_USERNAME ? 1 : 0))
        );
      }
    );
    // CHANGE: online = flag says online AND lastSeen is recent (within
    // ~2 heartbeat intervals). A session that dies without writing
    // online:false — killed tab, crashed browser, lost network before
    // pagehide fires — ages out instead of counting as online forever.
    const STALE_AFTER_MS = 45000;
    const presUnsub = onSnapshot(collection(db, 'presence'), (snap) => {
      const now = Date.now();
      const map: Record<string, boolean> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        const lastSeenMs = data.lastSeen?.toDate ? data.lastSeen.toDate().getTime() : 0;
        map[d.id] = !!data.online && (now - lastSeenMs) < STALE_AFTER_MS;
      });
      setPresenceMap(map);
      setOnlineCount(Object.values(map).filter(Boolean).length);
    });
    return () => { unsub(); presUnsub(); };
  }, []);

  useEffect(() => {
    if (!currentUid) { setFollowingList([]); return; }
    const unsub = onSnapshot(collection(db, 'users', currentUid, 'following'), (snap) => {
      setFollowingList(snap.docs.map(d => d.id));
    });
    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'pinned'), (snap) => {
      if (snap.exists() && snap.data().ids) setPinnedIds(snap.data().ids);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentUid) { setConversations([]); return; }
    const unsub = onSnapshot(
      query(collection(db, 'conversations'), where('participants', 'array-contains', currentUid), orderBy('lastMessageAt', 'desc')),
      async (snap) => {
        const convos = await Promise.all(snap.docs.map(async (d) => {
          const data = d.data();
          const otherUid = data.participants.find((p: string) => p !== currentUid);
          let otherUser: any = { username: 'Unknown', avatar: '' };
          try {
            const userSnap = await getDoc(doc(db, 'users', otherUid));
            if (userSnap.exists()) otherUser = userSnap.data();
          } catch {}
          return { id: d.id, ...data, otherUser };
        }));
        setConversations(convos);
        setDmUnread(convos.filter(c => (c as any).lastSenderUid !== currentUid && !(c as any).readBy?.[currentUid]).length);
        setDmListenerError('');
      },
      // CHANGE: surface listener errors (e.g. missing composite index, rule
      // denials) instead of failing silently and leaving the DM list empty.
      // This query needs a composite index (participants array-contains +
      // lastMessageAt orderBy) — see firestore.indexes.json. Without it this
      // listener fails permanently for every user and conversations never
      // appear automatically, which is why manually searching a username
      // (startDM uses a plain where() with no orderBy, so it needs no index)
      // looked like the only way to "unlock" a DM.
      (err) => {
        console.error('conversations listener error:', err);
        setDmListenerError(
          err?.code === 'failed-precondition'
            ? 'Missing Firestore index for conversations — deploy firestore.indexes.json.'
            : 'Could not load conversations: ' + (err?.message || err?.code || 'unknown error')
        );
      }
    );
    return () => unsub();
  }, [currentUid]);

  useEffect(() => {
    if (!activeConvo) { setMessages([]); return; }
    const unsub = onSnapshot(
      query(collection(db, 'conversations', activeConvo.id, 'messages'), orderBy('createdAt', 'asc')),
      (snap) => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      (err) => {
        console.error('messages listener error:', err);
      }
    );
    updateDoc(doc(db, 'conversations', activeConvo.id), { [`readBy.${currentUid}`]: true }).catch(() => {});
    return () => unsub();
  }, [activeConvo]);

  useEffect(() => {
    if (!viewingThread) { setThreadReplies([]); setThreadUserCache({}); return; }
    const threadId = viewingThread.id;
    const unsub = onSnapshot(
      query(collection(db, 'replies', threadId, 'comments'), orderBy('createdAt', 'asc')),
      async (snap) => {
        const replies = snap.docs.map(d => ({
          id: d.id, ...d.data(),
          date: d.data().createdAt?.toDate
            ? d.data().createdAt.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Just now',
        }));
        setThreadReplies(replies);
        // CHANGE: include the OP's authorUid, not just reply authors —
        // otherwise the original post's live avatar/tag never resolve.
        const uids = [...new Set([viewingThread.authorUid, ...replies.map((r: any) => r.authorUid)].filter(Boolean))];
        const cache: Record<string, any> = {};
        await Promise.all(uids.map(async (uid: string) => {
          try {
            const s = await getDoc(doc(db, 'users', uid));
            if (s.exists()) cache[uid] = s.data();
          } catch {}
        }));
        setThreadUserCache(cache);
      }
    );
    return () => unsub();
  }, [viewingThread]);

  useEffect(() => {
    if (!dmSearch.trim()) { setDmSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearchingUsers(true);
      const snap = await getDocs(collection(db, 'users'));
      const q = dmSearch.toLowerCase();
      setDmSearchResults(
        snap.docs.map(d => ({ uid: d.id, ...d.data() }))
          .filter((u: any) => u.username?.toLowerCase().includes(q) && u.uid !== currentUid)
          .slice(0, 8)
      );
      setSearchingUsers(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [dmSearch, currentUid]);

  // CHANGE: presence heartbeat. beforeunload alone is unreliable (doesn't
  // fire on mobile Safari tab-close/app-switch, crashes, lost network, etc.),
  // so stale 'online: true' docs used to pile up until the online count
  // just tracked total members. Now every active tab refreshes lastSeen on
  // an interval, tabs mark themselves offline on visibilitychange/pagehide
  // too, and — most importantly — "online" is computed from a recency
  // window (see the presence onSnapshot below) rather than trusting a flag
  // that can get stuck forever.
  useEffect(() => {
    if (!currentUid) return;
    const HEARTBEAT_MS = 20000;
    const beat = () => setDoc(doc(db, 'presence', currentUid), { online: true, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    const markOffline = () => { setDoc(doc(db, 'presence', currentUid), { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {}); };
    const handleVisibility = () => { if (document.visibilityState === 'visible') beat(); else markOffline(); };
    window.addEventListener('beforeunload', markOffline);
    window.addEventListener('pagehide', markOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', markOffline);
      window.removeEventListener('pagehide', markOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUid]);

  // CHANGE 3: Load which users current user has already repped
  useEffect(() => {
    if (!currentUid) { setRepGivenMap({}); return; }
    const unsub = onSnapshot(collection(db, 'users', currentUid, 'repGiven'), (snap) => {
      const map: Record<string, boolean> = {};
      snap.docs.forEach(d => { map[d.id] = true; });
      setRepGivenMap(map);
    });
    return () => unsub();
  }, [currentUid]);

  // ── Stickers (realtime) ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'stickers'), orderBy('createdAt', 'desc')), (snap) => {
      setStickers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ── Sticker requests (dev only, realtime) ─────────────────────────────────
  useEffect(() => {
    if (!isDeveloper) return;
    const unsub = onSnapshot(query(collection(db, 'stickerRequests'), orderBy('createdAt', 'desc')), (snap) => {
      setStickerRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isDeveloper]);

  // ── Custom forum topics (realtime) ────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'forumTopics'), orderBy('createdAt', 'asc')), (snap) => {
      setCustomForums(snap.docs.map(d => ({
        id: d.data().name,
        firestoreId: d.id,
        section: d.data().section,
        name: d.data().name,
        isCustom: true,
      })));
    });
    return () => unsub();
  }, []);

  // ── Site logo (from Firestore settings, one per theme) ───────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'logo'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.byTheme) {
          setSiteLogos(data.byTheme);
        } else if (data.url) {
          // Legacy single-logo doc from before per-theme logos existed —
          // treat it as the Default theme's logo so nothing disappears.
          setSiteLogos({ Default: { url: data.url, size: data.size || 32 } });
        }
      }
    });
    return () => unsub();
  }, []);

  // ── Reactions — load for viewing thread ───────────────────────────────────
  useEffect(() => {
    if (!viewingThread) return;
    const threadId = viewingThread.id;
    // Load thread OP reactions
    const unsubThread = onSnapshot(
      collection(db, 'reactions', threadId, 'votes'),
      (snap) => {
        setReactionsMap(prev => ({ ...prev, [threadId]: snap.docs.map(d => ({ uid: d.id, ...d.data() })) }));
      }
    );
    return () => { unsubThread(); };
  }, [viewingThread]);

  useEffect(() => {
    if (!viewingThread || threadReplies.length === 0) return;
    const unsubs = threadReplies.map(r => {
      return onSnapshot(
        collection(db, 'reactions', r.id, 'votes'),
        (snap) => {
          setReactionsMap(prev => ({ ...prev, [r.id]: snap.docs.map(d => ({ uid: d.id, ...d.data() })) }));
        }
      );
    });
    return () => unsubs.forEach(u => u());
  }, [viewingThread, threadReplies]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const register = async () => {
    setRegisterError('');
    const { username, email, password } = registerData;
    if (!username || !email || !password) { setRegisterError('All fields required.'); return; }
    if (username.length < 3) { setRegisterError('Username must be at least 3 characters.'); return; }
    if (password.length < 6) { setRegisterError('Password must be at least 6 characters.'); return; }
    setRegisterLoading(true);
    try {
      const usernameDoc = await getDoc(doc(db, 'usernames', username.toLowerCase()));
      if (usernameDoc.exists()) { setRegisterError('Username taken.'); setRegisterLoading(false); return; }
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      await setDoc(doc(db, 'users', uid), {
        username, email, bio: '', avatar: '', tagColor: '',
        tagBgColor: '', tagTextColor: '', tagLabel: '',
        // CHANGE 4: Initialize counters correctly
        threadCount: 0, replyCount: 0, rep: 0, createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'usernames', username.toLowerCase()), { uid });
      setCurrentUser(username); setCurrentUid(uid); setIsLoggedIn(true);
      setIsDeveloper(email === DEVELOPER_EMAIL);
      setShowRegister(false); setRegisterData({ username: '', email: '', password: '' });
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') setRegisterError('Email already in use.');
      else if (e.code === 'auth/invalid-email') setRegisterError('Invalid email address.');
      else setRegisterError('Registration failed. Try again.');
    }
    setRegisterLoading(false);
  };

  const login = async () => {
    setLoginError('');
    if (!loginData.email || !loginData.password) { setLoginError('Enter email and password.'); return; }
    setLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginData.email, loginData.password);
      setShowLogin(false); setLoginData({ email: '', password: '' });
    } catch { setLoginError('Incorrect email or password.'); }
    setLoginLoading(false);
  };

  const logout = async () => {
    if (currentUid) await setDoc(doc(db, 'presence', currentUid), { online: false, lastSeen: serverTimestamp() }, { merge: true });
    await signOut(auth);
    setIsLoggedIn(false); setCurrentUser(''); setCurrentUid(''); setCurrentUserData(null); setIsDeveloper(false);
  };

  // ── Threads ───────────────────────────────────────────────────────────────
  const createThread = async () => {
    if (!newThreadTitle.trim()) { alert('Title required'); return; }
    if (selectedForum?.id === 2 && !isDeveloper) { alert('Only administrators can post in Announcements.'); return; }
    if (selectedForum?.id === 1 && !isStaff) { alert('Only staff and moderators can post in Rules.'); return; }
    if (isBannedUser && selectedForum?.id !== BAN_APPEALS_FORUM_ID) { alert('Your account is banned. You can only post in Ban Appeals.'); return; }
    setPostingThread(true);
    const payload = {
      title: newThreadTitle, description: newThreadDescription,
      forum: selectedForum?.name ?? 'Lounge', forumId: selectedForum?.id ?? 3,
      author: currentUser, authorUid: currentUid,
      authorAvatar: currentUserData?.avatar || '',
      images: newThreadImages, replies: 0, views: 1,
      tag: newThreadTag.trim() || null,
      tagColor: newThreadTag.trim() ? (THREAD_TAG_COLOR[newThreadTag.trim()] || '#6366f1') : null,
    };
    // TEMP DEBUG — remove once posting works again. Each write below is
    // wrapped separately so the console tells us exactly which one is
    // denied, instead of one generic "failed to post" for both.
    console.log('[createThread] payload:', payload);
    console.log('[createThread] currentUid:', currentUid, 'isDeveloper:', isDeveloper, 'isModerator:', isModerator, 'isStaff:', isStaff, 'isBannedUser:', isBannedUser);

    let newThreadId: string | null = null;
    try {
      const ref = await addDoc(collection(db, 'threads'), { ...payload, createdAt: serverTimestamp() });
      newThreadId = ref.id;
      console.log('[createThread] STEP 1 (create thread) — OK, id:', ref.id);
    } catch (e: any) {
      console.error('[createThread] STEP 1 (create thread) — FAILED:', e);
      alert(`Failed at STEP 1 (creating the thread): ${e?.message || 'unknown error'}`);
      setPostingThread(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'users', currentUid), { threadCount: increment(1) });
      console.log('[createThread] STEP 2 (your thread count) — OK');
    } catch (e: any) {
      console.error('[createThread] STEP 2 (your thread count) — FAILED:', e);
      alert(`Thread posted (id: ${newThreadId}), but STEP 2 (updating your thread count) failed: ${e?.message || 'unknown error'}`);
    }

    setShowNewThreadModal(false);
    setNewThreadTitle(''); setNewThreadDescription(''); setNewThreadImages([]);
    setNewThreadTag(''); setNewThreadTagColor('#6366f1');
    setPostingThread(false);
  };

  const handleThreadImages = (e: any) => {
    Array.from(e.target.files as File[]).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setNewThreadImages((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  // Staff/mod delete for a thread — moved to Trash (deletedThreads) instead of
  // being wiped outright, so the dev can review and restore it later if a
  // mod removed something they shouldn't have.
  const deleteThread = async (threadId: string) => {
    if (!confirm('Delete this thread? It will go to Trash and can be restored later.')) return;
    try {
      const thread = threads.find(t => t.id === threadId);
      const threadSnap = await getDoc(doc(db, 'threads', threadId));
      if (threadSnap.exists()) {
        await setDoc(doc(db, 'deletedThreads', threadId), {
          ...threadSnap.data(),
          deletedAt: serverTimestamp(),
          deletedBy: currentUid,
          deletedByUsername: currentUser,
        });
      }
      await deleteDoc(doc(db, 'threads', threadId));
      // Decrement the author's threadCount so sidebar stays accurate
      if (thread?.authorUid) {
        await updateDoc(doc(db, 'users', thread.authorUid), {
          threadCount: increment(-1),
        });
      }
      if (viewingThread?.id === threadId) setViewingThread(null);
    } catch { alert('Failed to delete thread.'); }
  };

  // Staff/mod delete for a single reply — moved to Trash (deletedReplies)
  // instead of hard-deleted; decrements author replyCount and the thread's
  // reply counter as before.
  const deleteReply = async (threadId: string, replyId: string, authorUid?: string) => {
    if (!confirm('Delete this reply? It will go to Trash and can be restored later.')) return;
    try {
      const replySnap = await getDoc(doc(db, 'replies', threadId, 'comments', replyId));
      if (replySnap.exists()) {
        await addDoc(collection(db, 'deletedReplies'), {
          ...replySnap.data(),
          threadId, replyId,
          deletedAt: serverTimestamp(),
          deletedBy: currentUid,
          deletedByUsername: currentUser,
        });
      }
      await deleteDoc(doc(db, 'replies', threadId, 'comments', replyId));
      if (authorUid) await updateDoc(doc(db, 'users', authorUid), { replyCount: increment(-1) });
      if (threadId !== 'ann-1') await updateDoc(doc(db, 'threads', threadId), { replies: increment(-1) });
    } catch { alert('Failed to delete reply.'); }
  };

  // ── Dev-only: Trash — restore or permanently remove soft-deleted content ──
  const restoreThread = async (d: any) => {
    try {
      const { deletedAt, deletedBy, deletedByUsername, id, ...original } = d;
      await setDoc(doc(db, 'threads', id), original);
      await deleteDoc(doc(db, 'deletedThreads', id));
      if (original.authorUid) await updateDoc(doc(db, 'users', original.authorUid), { threadCount: increment(1) });
    } catch { alert('Failed to restore thread.'); }
  };

  const permanentlyDeleteThread = async (d: any) => {
    if (!confirm('Permanently delete this thread and all its replies? This cannot be undone.')) return;
    try {
      const repliesSnap = await getDocs(collection(db, 'replies', d.id, 'comments'));
      await Promise.all(repliesSnap.docs.map(rd => deleteDoc(doc(db, 'replies', d.id, 'comments', rd.id))));
      await deleteDoc(doc(db, 'deletedThreads', d.id));
    } catch { alert('Failed to permanently delete thread.'); }
  };

  const restoreReply = async (d: any) => {
    try {
      const { deletedAt, deletedBy, deletedByUsername, threadId, replyId, id, ...original } = d;
      await setDoc(doc(db, 'replies', threadId, 'comments', replyId), original);
      await deleteDoc(doc(db, 'deletedReplies', d.id));
      if (original.authorUid) await updateDoc(doc(db, 'users', original.authorUid), { replyCount: increment(1) });
      if (threadId !== 'ann-1') await updateDoc(doc(db, 'threads', threadId), { replies: increment(1) });
    } catch { alert('Failed to restore reply.'); }
  };

  const permanentlyDeleteReply = async (d: any) => {
    if (!confirm('Permanently delete this reply? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'deletedReplies', d.id));
    } catch { alert('Failed to permanently delete reply.'); }
  };

  // ── Dev-only: edit thread/reply content in place — a lighter-touch ────────
  // alternative to deleting the whole thing over a single bad word.
  const editThreadContent = async (thread: any) => {
    const newTitle = window.prompt('Edit thread title:', thread.title || '');
    if (newTitle === null) return;
    const newDesc = window.prompt('Edit thread description:', thread.description || '');
    if (newDesc === null) return;
    try {
      await updateDoc(doc(db, 'threads', thread.id), {
        title: newTitle.trim() || thread.title,
        description: newDesc.trim(),
      });
    } catch { alert('Failed to edit thread.'); }
  };

  const editReplyContent = async (threadId: string, replyId: string, currentText: string) => {
    const newText = window.prompt('Edit reply text:', currentText || '');
    if (newText === null || !newText.trim()) return;
    try {
      await updateDoc(doc(db, 'replies', threadId, 'comments', replyId), { text: newText.trim() });
    } catch { alert('Failed to edit reply.'); }
  };

  // Staff/mod ban toggle — banned users may only post/reply in Ban Appeals.
  const toggleBan = async (targetUid: string, currentlyBanned: boolean) => {
    if (!confirm(currentlyBanned ? 'Unban this user?' : 'Ban this user? They will only be able to post in Ban Appeals.')) return;
    try {
      await updateDoc(doc(db, 'users', targetUid), { banned: !currentlyBanned });
      setViewingProfile((prev: any) => prev && prev.uid === targetUid ? { ...prev, banned: !currentlyBanned } : prev);
    } catch { alert('Failed to update ban status.'); }
  };

  // Dev-only: grant/revoke moderator privileges from a user's profile.
  const toggleModerator = async (targetUid: string, currentlyMod: boolean) => {
    if (!confirm(currentlyMod ? 'Remove moderator privileges?' : 'Grant this user moderator privileges?')) return;
    try {
      await updateDoc(doc(db, 'users', targetUid), { isModerator: !currentlyMod });
      setViewingProfile((prev: any) => prev && prev.uid === targetUid ? { ...prev, isModerator: !currentlyMod } : prev);
    } catch { alert('Failed to update moderator status.'); }
  };

  // ── Dev-only: rename a user, and backfill the display name on every ────────
  // existing thread/reply they've posted.
  //
  // Editing `users/{uid}.username` directly (e.g. from the Firestore
  // console) is NOT enough — every thread and reply stores the author's
  // username as a snapshot string at post time, and the `usernames`
  // collection is a separate username -> uid lookup table used for login
  // and profile links. This function keeps all three in sync in one go.
  const [renamingUser, setRenamingUser]   = useState(false);
  const renameUser = async (targetUid: string, oldUsername: string) => {
    const input = window.prompt(`Rename "${oldUsername}" to:`, oldUsername);
    if (!input) return;
    const newUsername = input.trim();
    if (newUsername.length < 3) { alert('Username must be at least 3 characters.'); return; }
    if (newUsername.toLowerCase() === oldUsername.toLowerCase()) return;

    const oldKey = oldUsername.toLowerCase();
    const newKey = newUsername.toLowerCase();
    setRenamingUser(true);
    try {
      // 1. Make sure the new name isn't already taken.
      const existing = await getDoc(doc(db, 'usernames', newKey));
      if (existing.exists()) { alert('That username is already taken.'); setRenamingUser(false); return; }

      // 2. Point a new usernames/{newKey} doc at this uid, then remove the old mapping.
      await setDoc(doc(db, 'usernames', newKey), { uid: targetUid });
      await deleteDoc(doc(db, 'usernames', oldKey));

      // 3. Update the canonical username on the user doc itself.
      await updateDoc(doc(db, 'users', targetUid), { username: newUsername });

      // 4. Backfill every thread this user authored.
      const threadSnap = await getDocs(query(collection(db, 'threads'), where('authorUid', '==', targetUid)));
      await Promise.all(threadSnap.docs.map(d => updateDoc(doc(db, 'threads', d.id), { author: newUsername })));

      // 5. Backfill every reply this user posted, across every thread on the site.
      const allThreadsSnap = await getDocs(collection(db, 'threads'));
      await Promise.all(allThreadsSnap.docs.map(async (t) => {
        const repliesSnap = await getDocs(query(collection(db, 'replies', t.id, 'comments'), where('authorUid', '==', targetUid)));
        await Promise.all(repliesSnap.docs.map(r => updateDoc(doc(db, 'replies', t.id, 'comments', r.id), { author: newUsername })));
      }));

      setViewingProfile((prev: any) => prev && prev.uid === targetUid ? { ...prev, username: newUsername } : prev);
      if (currentUid === targetUid) setCurrentUser(newUsername);
      alert('Username updated everywhere.');
    } catch (e) {
      console.error(e);
      alert('Failed to fully rename user — check the console. Some threads/replies may need a manual fix.');
    }
    setRenamingUser(false);
  };

  const togglePin = async (threadId: string) => {
    const next = pinnedIds.includes(threadId)
      ? pinnedIds.filter(id => id !== threadId)
      : [...pinnedIds, threadId];
    setPinnedIds(next);
    await setDoc(doc(db, 'settings', 'pinned'), { ids: next });
  };

  const postReply = async () => {
    if (!replyText.trim() || !viewingThread) return;
    if (isBannedUser && viewingThread.forumId !== BAN_APPEALS_FORUM_ID) { alert('Your account is banned. You can only reply in Ban Appeals.'); return; }
    setPostingReply(true);
    const threadId = viewingThread.id;
    const payload = {
      text: replyText.trim(), author: currentUser, authorUid: currentUid,
      authorAvatar: currentUserData?.avatar || '',
      forumId: viewingThread.forumId ?? null,
    };
    // TEMP DEBUG — remove once posting works again. Each write below is
    // wrapped separately so the console tells us exactly which one is
    // denied, instead of one generic "failed to post reply" for all three.
    console.log('[postReply] payload:', payload);
    console.log('[postReply] threadId:', threadId, 'viewingThread.forumId:', viewingThread.forumId);
    console.log('[postReply] currentUid:', currentUid, 'isDeveloper:', isDeveloper, 'isModerator:', isModerator, 'isStaff:', isStaff, 'isBannedUser:', isBannedUser);

    try {
      await addDoc(collection(db, 'replies', threadId, 'comments'), { ...payload, createdAt: serverTimestamp() });
      console.log('[postReply] STEP 1 (create reply) — OK');
    } catch (e: any) {
      console.error('[postReply] STEP 1 (create reply) — FAILED:', e);
      alert(`Failed at STEP 1 (creating the reply): ${e?.message || 'unknown error'}`);
      setPostingReply(false);
      return;
    }

    try {
      if (threadId !== 'ann-1') await updateDoc(doc(db, 'threads', threadId), { replies: increment(1) });
      console.log('[postReply] STEP 2 (thread reply count) — OK');
    } catch (e: any) {
      console.error('[postReply] STEP 2 (thread reply count) — FAILED:', e);
      alert(`Reply posted, but STEP 2 (updating the thread's reply count) failed: ${e?.message || 'unknown error'}`);
    }

    try {
      await updateDoc(doc(db, 'users', currentUid), { replyCount: increment(1) });
      console.log('[postReply] STEP 3 (your reply count) — OK');
    } catch (e: any) {
      console.error('[postReply] STEP 3 (your reply count) — FAILED:', e);
      alert(`Reply posted, but STEP 3 (updating your reply count) failed: ${e?.message || 'unknown error'}`);
    }

    setReplyText('');
    setPostingReply(false);
  };

  // CHANGE 3: Rep system — give +1 rep, one rep per user per user
  const giveRep = async (targetUid: string) => {
    if (!currentUid || !isLoggedIn) { setShowLogin(true); return; }
    if (targetUid === currentUid) return; // can't rep yourself
    if (repGivenMap[targetUid]) return;   // already repped this user

    try {
      // Record that this user gave rep to target
      await setDoc(doc(db, 'users', currentUid, 'repGiven', targetUid), {
        givenAt: serverTimestamp(),
      });
      // Increment target's rep count
      await updateDoc(doc(db, 'users', targetUid), { rep: increment(1) });

      // Update viewingProfile optimistically
      setViewingProfile((prev: any) => prev ? { ...prev, rep: (prev.rep || 0) + 1 } : prev);
      // Update threadUserCache optimistically
      setThreadUserCache(prev => ({
        ...prev,
        [targetUid]: { ...prev[targetUid], rep: ((prev[targetUid]?.rep) || 0) + 1 },
      }));
    } catch (e) {
      console.error('Failed to give rep:', e);
    }
  };

  // ── Profile ───────────────────────────────────────────────────────────────
  // ── Shared image upload helper (file → base64 data URL) ──────────────────
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setLogoUrlDraft(dataUrl);
  };

  const handleStickerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setNewStickerUrl(dataUrl);
  };

  const handleReqStickerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setReqStickerUrl(dataUrl);
  };

  // ── Sticker actions ───────────────────────────────────────────────────────
  const addSticker = async () => {
    setAddingStickerError('');
    if (!newStickerName.trim()) { setAddingStickerError('Name required.'); return; }
    if (!newStickerUrl.trim()) { setAddingStickerError('URL required.'); return; }
    try {
      await addDoc(collection(db, 'stickers'), {
        name: newStickerName.trim(),
        url: newStickerUrl.trim(),
        addedBy: currentUser,
        createdAt: serverTimestamp(),
      });
      setNewStickerName(''); setNewStickerUrl(''); setShowAddSticker(false);
    } catch { setAddingStickerError('Failed to add sticker.'); }
  };

  const requestSticker = async () => {
    if (!reqStickerName.trim() || !reqStickerUrl.trim()) { alert('Name and URL required.'); return; }
    try {
      await addDoc(collection(db, 'stickerRequests'), {
        name: reqStickerName.trim(),
        url: reqStickerUrl.trim(),
        requestedBy: currentUser,
        requestedByUid: currentUid,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setReqStickerName(''); setReqStickerUrl(''); setShowRequestSticker(false);
      alert('Sticker request submitted!');
    } catch { alert('Failed to submit request.'); }
  };

  const approveSticker = async (req: any) => {
    try {
      await addDoc(collection(db, 'stickers'), {
        name: req.name, url: req.url,
        addedBy: currentUser, createdAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'stickerRequests', req.id));
    } catch { alert('Failed to approve.'); }
  };

  const rejectSticker = async (reqId: string) => {
    try { await deleteDoc(doc(db, 'stickerRequests', reqId)); }
    catch { alert('Failed to reject.'); }
  };

  const insertSticker = (url: string) => {
    if (stickerTarget === 'reply') {
      setReplyText(prev => prev + `\n[sticker:${url}]`);
    } else if (stickerTarget === 'dm') {
      setDmInput(prev => prev + `\n[sticker:${url}]`);
    }
    setShowStickerCatalog(false);
    setStickerTarget(null);
  };

  // ── Custom forum topic actions ─────────────────────────────────────────────
  const createForumTopic = async () => {
    if (!newTopicName.trim()) { alert('Topic name required.'); return; }
    if (!newTopicSection) { alert('Section required.'); return; }
    setAddingTopic(true);
    try {
      await addDoc(collection(db, 'forumTopics'), {
        name: newTopicName.trim(),
        section: newTopicSection,
        createdBy: currentUser,
        createdAt: serverTimestamp(),
      });
      setNewTopicName(''); setShowNewTopicModal(false);
    } catch { alert('Failed to create topic.'); }
    setAddingTopic(false);
  };

  // ── Render sticker text with images inline ────────────────────────────────
  // Also swaps any regular unicode emoji the person typed/picked from their
  // own device's emoji keyboard for the Twemoji artwork instead, which reads
  // with a lot more personality than most default OS emoji sets.
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderWithStickers = (text: string) => {
    const parts = text.split(/(\[sticker:[^\]]+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[sticker:(.+)\]$/);
      if (match) {
        return <img key={i} src={match[1]} alt="sticker" className="max-h-24 max-w-[150px] object-contain inline-block my-1" />;
      }
      // Escape first so any HTML the person typed stays inert text, THEN
      // let twemoji swap emoji characters for <img> tags — never the other
      // way around, or raw HTML could slip through.
      const safeHtml = twemoji.parse(escapeHtml(part), {
        folder: 'svg', ext: '.svg', className: 'twemoji-img',
      });
      return <span key={i} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
    });
  };

  // ── Reactions ─────────────────────────────────────────────────────────────
  const toggleReaction = async (targetId: string, type: string) => {
    if (!currentUid) { setShowLogin(true); return; }
    const ref = doc(db, 'reactions', targetId, 'votes', currentUid);
    const existing = reactionsMap[targetId]?.find(v => v.uid === currentUid);
    if (existing?.type === type) {
      // Same reaction — remove it
      await deleteDoc(ref);
    } else {
      // New or different reaction — set it
      await setDoc(ref, { type, uid: currentUid, createdAt: serverTimestamp() });
    }
    setShowReactionPicker(null);
  };

  const getReactionCounts = (targetId: string) => {
    const votes = reactionsMap[targetId] || [];
    const counts: Record<string, number> = {};
    votes.forEach(v => { counts[v.type] = (counts[v.type] || 0) + 1; });
    return counts;
  };

  const myReaction = (targetId: string) =>
    reactionsMap[targetId]?.find(v => v.uid === currentUid)?.type || null;

  // ── Monoline icons (thumbs up / down / plus) ──────────────────────────────
  const ThumbUpIcon = ({ className = '' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 10.5v10" />
      <path d="M7 10.5 11.2 3.6a1.6 1.6 0 0 1 2.85 1.3L13 10h5.2a2 2 0 0 1 1.94 2.48l-1.6 6.5A2 2 0 0 1 16.6 20.5H10a3 3 0 0 1-3-3v-7Z" />
    </svg>
  );
  const ThumbDownIcon = ({ className = '' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 13.5v-10" />
      <path d="M17 13.5 12.8 20.4a1.6 1.6 0 0 1-2.85-1.3L11 14H5.8a2 2 0 0 1-1.94-2.48l1.6-6.5A2 2 0 0 1 7.4 3.5H14a3 3 0 0 1 3 3v7Z" />
    </svg>
  );
  const PlusIcon = ({ className = '' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );

  // ── Reaction bar component ────────────────────────────────────────────────
  // Compact, inline, monoline — sits beside the post itself (no separate
  // bordered footer section). "+" opens the sticker-reaction picker; thumbs
  // up/down sit beside it with counts.
  const ReactionBar = ({ targetId }: { targetId: string }) => {
    const counts = getReactionCounts(targetId);
    const my = myReaction(targetId);
    const topReactions = Object.entries(counts)
      .filter(([type]) => type !== 'like' && type !== 'dislike')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return (
      <div className="flex items-center gap-2.5">
        {isLoggedIn && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowReactionPicker(targetId); }}
            title="Add sticker reaction"
            className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleReaction(targetId, 'like'); }}
          className={`flex items-center gap-1 text-[10px] font-mono transition-colors ${my === 'like' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
          <ThumbUpIcon className="w-3.5 h-3.5" />
          {counts['like'] || 0}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleReaction(targetId, 'dislike'); }}
          className={`flex items-center gap-1 text-[10px] font-mono transition-colors ${my === 'dislike' ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
          <ThumbDownIcon className="w-3.5 h-3.5" />
          {counts['dislike'] || 0}
        </button>
        {topReactions.map(([type, count]) => (
          <button key={type}
            onClick={(e) => { e.stopPropagation(); toggleReaction(targetId, type); }}
            className={`flex items-center gap-1 transition-opacity ${my === type ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}>
            <img src={type} alt="reaction" className="w-3.5 h-3.5 object-contain" />
            <span className="text-[10px] font-mono text-zinc-400">{count}</span>
          </button>
        ))}
      </div>
    );
  };

  const openProfile = useCallback(async (username: string) => {
    try {
      const unameSnap = await getDoc(doc(db, 'usernames', username.toLowerCase()));
      if (!unameSnap.exists()) return;
      const uid = unameSnap.data().uid;
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) return;
      const followerSnap  = await getDocs(collection(db, 'users', uid, 'followers'));
      const followingSnap = await getDocs(collection(db, 'users', uid, 'following'));
      setViewingProfile({
        ...userSnap.data(), uid,
        threadCount: threads.filter(t => t.author === username).length,
        followerCount: followerSnap.size,
        followingCount: followingSnap.size,
      });
    } catch {}
  }, [threads]);

  const toggleFollow = async (targetUid: string, targetUsername: string) => {
    if (!currentUid) return;
    if (followingList.includes(targetUid)) {
      await deleteDoc(doc(db, 'users', currentUid, 'following', targetUid));
      await deleteDoc(doc(db, 'users', targetUid, 'followers', currentUid));
    } else {
      await setDoc(doc(db, 'users', currentUid, 'following', targetUid), { username: targetUsername, followedAt: serverTimestamp() });
      await setDoc(doc(db, 'users', targetUid, 'followers', currentUid), { username: currentUser, followedAt: serverTimestamp() });
    }
    if (viewingProfile?.uid === targetUid) {
      const followerSnap = await getDocs(collection(db, 'users', targetUid, 'followers'));
      setViewingProfile((prev: any) => ({ ...prev, followerCount: followerSnap.size }));
    }
  };

  const loadFollowersFollowing = async (uid: string) => {
    const fSnap  = await getDocs(collection(db, 'users', uid, 'followers'));
    const fgSnap = await getDocs(collection(db, 'users', uid, 'following'));
    setProfileFollowers(fSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
    setProfileFollowing(fgSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updates: any = { bio: profileBio, avatar: profileAvatar };
      const total = (currentUserData?.threadCount || 0) + (currentUserData?.replyCount || 0);
      if (getRank(total).isThreadmaxxer) updates.tagColor = profileTagColor;
      await updateDoc(doc(db, 'users', currentUid), updates);
      setCurrentUserData((prev: any) => ({ ...prev, bio: profileBio, avatar: profileAvatar, tagColor: profileTagColor }));
      setShowEditProfile(false);
    } catch { alert('Failed to save profile.'); }
    setSavingProfile(false);
  };

  const handleAvatarUpload = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setProfileAvatar(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // ── Dev Tag Editor ────────────────────────────────────────────────────────
  const openDevTagEditor = (profile: any) => {
    setDevTagTarget(profile);
    const total = (profile.threadCount || 0) + (profile.replyCount || 0);
    const isThreadmaxxer = getRank(total).isThreadmaxxer;
    setDevTagBgColor(profile.tagBgColor || (isThreadmaxxer ? (profile.tagColor || '#10b981') : '#3f3f46'));
    setDevTagTextColor(profile.tagTextColor || (isThreadmaxxer ? '#000000' : '#d4d4d8'));
    setDevTagLabel(profile.tagLabel || '');
    setShowDevTagEditor(true);
  };

  const saveDevTag = async () => {
    if (!devTagTarget) return;
    setSavingDevTag(true);
    try {
      await updateDoc(doc(db, 'users', devTagTarget.uid), {
        tagBgColor: devTagBgColor,
        tagTextColor: devTagTextColor,
        tagLabel: devTagLabel,
      });
      setShowDevTagEditor(false);
      if (viewingProfile?.uid === devTagTarget.uid) {
        setViewingProfile((prev: any) => ({
          ...prev,
          tagBgColor: devTagBgColor,
          tagTextColor: devTagTextColor,
          tagLabel: devTagLabel,
        }));
      }
    } catch { alert('Failed to save tag.'); }
    setSavingDevTag(false);
  };

  // ── DMs ───────────────────────────────────────────────────────────────────
  const startDM = useCallback(async (otherUid: string, otherUsername: string) => {
    if (!currentUid) { setShowLogin(true); return; }
    if (otherUid === currentUid) return;
    const snap = await getDocs(query(collection(db, 'conversations'), where('participants', 'array-contains', currentUid)));
    const existing = snap.docs.find(d => d.data().participants.includes(otherUid));
    if (existing) {
      const data = existing.data();
      const otherUserSnap = await getDoc(doc(db, 'users', otherUid));
      const otherUser = otherUserSnap.exists() ? otherUserSnap.data() : { username: otherUsername };
      setActiveConvo({ id: existing.id, ...data, otherUser });
      setShowDmPanel(true); setViewingProfile(null); return;
    }
    const docRef = await addDoc(collection(db, 'conversations'), {
      participants: [currentUid, otherUid],
      participantNames: { [currentUid]: currentUser, [otherUid]: otherUsername },
      lastMessage: '', lastMessageAt: serverTimestamp(), lastSenderUid: '',
      readBy: { [currentUid]: true, [otherUid]: false },
    });
    setActiveConvo({ id: docRef.id, participants: [currentUid, otherUid], otherUser: { username: otherUsername } });
    setShowDmPanel(true); setViewingProfile(null);
  }, [currentUid, currentUser]);

  const sendDM = useCallback(async () => {
    if (!dmInput.trim() || !activeConvo) return;
    const text = dmInput.trim(); setDmInput('');
    const otherUid = activeConvo.participants?.find((p: string) => p !== currentUid) || '';
    await addDoc(collection(db, 'conversations', activeConvo.id, 'messages'), {
      text, senderUid: currentUid, senderName: currentUser, createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'conversations', activeConvo.id), {
      lastMessage: text, lastMessageAt: serverTimestamp(), lastSenderUid: currentUid,
      [`readBy.${currentUid}`]: true, [`readBy.${otherUid}`]: false,
    });
  }, [dmInput, activeConvo, currentUid, currentUser]);

  // ── AI ────────────────────────────────────────────────────────────────────
  const handleImageUpload = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      const r = new FileReader();
      r.onload = (ev) => setImagePreview(ev.target?.result as string);
      r.readAsDataURL(file);
    }
  };

  const analyzeFace = async () => {
    if (!imagePreview && !faceDescription) { alert('Upload a photo or add a description'); return; }
    setIsAnalyzing(true); setAiRating(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imagePreview?.split(',')[1], description: faceDescription }),
      });
      const data = await response.json();
      if (data.result) setAiRating({ raw: data.result }); else alert('Analysis failed.');
    } catch { alert('Could not connect to AI.'); }
    setIsAnalyzing(false);
  };

  const postAiRating = async () => {
    if (!aiRating) return;
    await addDoc(collection(db, 'threads'), {
      title: `AI Rating — ${currentUser}`, description: aiRating.raw,
      forum: 'Rate Me', forumId: 6, author: currentUser, authorUid: currentUid,
      authorAvatar: currentUserData?.avatar || '',
      images: imagePreview ? [imagePreview] : [], replies: 0, views: 1, createdAt: serverTimestamp(),
    });
    setShowRateModal(false); setAiRating(null); setImagePreview(null); setFaceDescription('');
  };

  const visibleThreads = selectedForum ? threads.filter(t => t.forumId === selectedForum.id) : threads;
  const pinnedThreads  = threads.filter(t => pinnedIds.includes(t.id));

  useEffect(() => { setForumPage(1); }, [selectedForum?.id]);

  // ── ThreadCard ────────────────────────────────────────────────────────────
  const ThreadCard = useCallback(({ thread, isAnnouncement = false, largePfp = false }: { thread: any; isAnnouncement?: boolean; largePfp?: boolean }) => {
    const isPinned = pinnedIds.includes(thread.id) || isAnnouncement;
    return (
      <div
        onClick={() => setViewingThread(thread)}
        className={`border-b border-zinc-800 px-4 py-3 hover:bg-zinc-900/60 transition-colors cursor-pointer
          ${isPinned && !isAnnouncement ? 'bg-zinc-900/30 border-l-2 border-l-yellow-600' : ''}
          ${isAnnouncement ? 'bg-zinc-900/40 border-l-2 border-l-emerald-600' : ''}`}>
        {isAnnouncement && <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-500 mb-1 block">Pinned</span>}
        {!isAnnouncement && isPinned && <span className="text-[10px] font-mono uppercase tracking-widest text-yellow-500 mb-1 block">Pinned</span>}
        {!isAnnouncement && !isPinned && thread.forum && <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1 block">{thread.forum}</span>}
        <div className="flex gap-3 items-start">
          {/* Avatar — large on forums page */}
          {largePfp && (
            <button onClick={(e) => { e.stopPropagation(); openProfile(thread.author); }} className="flex-shrink-0 mt-0.5">
              <Avatar src={authorAvatarCache[thread.authorUid] || thread.authorAvatar} username={thread.author} size={48} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              {/* Tag badge */}
              {thread.tag && (
                <span
                  className="inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider flex-shrink-0 text-white"
                  style={{ backgroundColor: thread.tagColor || '#6366f1' }}>
                  {thread.tag}
                </span>
              )}
              <div className="flex justify-between items-start gap-3 flex-1 min-w-0">
                <h3 className={`font-semibold leading-snug text-sm sm:text-base ${isAnnouncement ? 'text-emerald-400' : isPinned ? 'text-yellow-400' : 'text-zinc-100'}`}>
                  {thread.title}
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {isDeveloper && !isAnnouncement && (
                    <button onClick={() => togglePin(thread.id)}
                      className={`text-[10px] font-mono ${isPinned ? 'text-yellow-500' : 'text-zinc-600 hover:text-yellow-500'}`}>
                      {isPinned ? 'unpin' : 'pin'}
                    </button>
                  )}
                  {isDeveloper && (
                    <button onClick={() => editThreadContent(thread)} className="text-zinc-600 hover:text-sky-400 text-[10px] font-mono">edit</button>
                  )}
                  {!isAnnouncement && isStaff && (
                    <button onClick={() => deleteThread(thread.id)} className="text-zinc-600 hover:text-red-400 text-xs font-mono">del</button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2 mt-1">{thread.description}</p>
            {thread.images?.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {thread.images.map((img: string, i: number) => (
                  <img key={i} src={img} alt="" className="h-12 w-12 object-cover border border-zinc-700" />
                ))}
              </div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <button onClick={(e) => { e.stopPropagation(); openProfile(thread.author); }}
                className="flex items-center gap-1.5 hover:opacity-80 transition">
                {!largePfp && <Avatar src={authorAvatarCache[thread.authorUid] || thread.authorAvatar} username={thread.author} size={18} />}
                <span className="text-emerald-500 text-xs font-mono">{thread.author}</span>
              </button>
              <span className="text-zinc-600 text-xs font-mono">{thread.date}</span>
              {!isAnnouncement && <span className="text-zinc-600 text-xs font-mono">{thread.replies} replies</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }, [pinnedIds, isDeveloper, isStaff, editThreadContent, openProfile, authorAvatarCache]);

  // ── ForumIndex — nutria-style categorized forum list (used on Home + Forums tab) ──
  const renderForumIndex = useCallback(() => {
    const retro = activeBg === '#d8dfe8';
    if (retro) {
      return (
        <div className="px-3 py-3">
          {forumSections.map(section => {
            const sectionForums = [
              ...allForums.filter(f => f.section === section),
              ...customForums.filter(f => f.section === section),
            ];
            if (sectionForums.length === 0) return null;
            return (
              <table key={section} className="retro-table mb-4">
                <tbody>
                  <tr><th className="retro-catbar" colSpan={4}>{section}</th></tr>
                  <tr>
                    <th style={{ width: 34 }}></th>
                    <th>Forum</th>
                    <th className="retro-stat-col">Threads</th>
                    <th style={{ width: 200 }}>Last Post</th>
                  </tr>
                  {sectionForums.map(forum => {
                    const forumThreads = threads.filter(t => t.forumId === forum.id);
                    const latestThread = forumThreads[0] || null;
                    const threadCount = forumThreads.length;
                    return (
                      <tr key={forum.id ?? forum.firestoreId} className="retro-row"
                        onClick={() => { setSelectedForum(forum); setCurrentView('forums'); setViewingThread(null); }}>
                        <td style={{ textAlign: 'center', fontSize: 18 }}><ForumIcon name={forum.name} /></td>
                        <td>
                          <div className="retro-forum-title">{forum.name}</div>
                          <div className="retro-forum-desc">{forum.desc || `Discuss ${forum.name.toLowerCase()}.`}</div>
                        </td>
                        <td className="retro-stat-col">{threadCount}</td>
                        <td>
                          {latestThread ? (
                            <>
                              <span style={{ display: 'block', fontWeight: 'bold', color: '#2b5797' }}>{latestThread.title}</span>
                              <span style={{ color: '#888' }}>by {latestThread.author} &middot; {latestThread.date}</span>
                            </>
                          ) : <span style={{ color: '#999' }}>No threads yet</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })}
        </div>
      );
    }
    return (
    <>
      {forumSections.map(section => {
        const sectionForums = [
          ...allForums.filter(f => f.section === section),
          ...customForums.filter(f => f.section === section),
        ];
        if (sectionForums.length === 0) return null;
        return (
          <div key={section} className="mb-1">
            {/* Section header */}
            <div className="px-4 py-3 sm:py-2.5 bg-zinc-900/70 border-y border-zinc-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-zinc-300">{section}</div>
                <div className="text-[10px] font-mono text-zinc-600 mt-0.5 leading-snug">{sectionDescriptions[section] || ''}</div>
              </div>
              {isDeveloper && (
                <button
                  onClick={() => { setNewTopicSection(section); setShowNewTopicModal(true); }}
                  className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 transition px-1 flex-shrink-0"
                  title="Add forum topic">
                  + Add Topic
                </button>
              )}
            </div>
            {/* Forum rows */}
            {sectionForums.map(forum => {
              const forumThreads = threads.filter(t => t.forumId === forum.id);
              const latestThread = forumThreads[0] || null;
              const threadCount = forumThreads.length;
              const replySum = forumThreads.reduce((sum: number, t: any) => sum + (t.replies || 0), 0);
              const messageCount = threadCount + replySum;
              return (
                <div key={forum.id ?? forum.firestoreId}
                  onClick={() => { setSelectedForum(forum); setCurrentView('forums'); setViewingThread(null); }}
                  className="border-b border-zinc-800 hover:bg-zinc-900/50 active:bg-zinc-900/70 cursor-pointer transition-colors group">
                  <div className="flex items-stretch">
                    {/* Left: icon + forum name + description */}
                    <div className="flex items-start gap-3 flex-1 min-w-0 px-4 py-3.5 sm:py-3">
                      <ForumIcon name={forum.name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors truncate">
                            {forum.name}
                          </span>
                          {forum.isCustom && isDeveloper && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Delete forum "${forum.name}"?`)) return;
                                await deleteDoc(doc(db, 'forumTopics', forum.firestoreId));
                              }}
                              className="text-[9px] font-mono text-zinc-700 hover:text-red-400 transition">
                              del
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-zinc-600 mt-0.5 leading-snug">
                          {forum.desc || `Discuss ${forum.name.toLowerCase()}.`}
                        </p>
                        {/* Condensed stats + latest activity — mobile only */}
                        <div className="sm:hidden flex items-center gap-3 mt-1.5 text-[10px] font-mono text-zinc-600">
                          <span><span className="text-zinc-400 font-bold">{threadCount}</span> threads</span>
                          <span className="text-zinc-800">·</span>
                          <span><span className="text-zinc-400 font-bold">{messageCount}</span> msgs</span>
                          {latestThread && (
                            <>
                              <span className="text-zinc-800">·</span>
                              <span className="truncate text-emerald-500">{latestThread.author}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Middle: thread/message counts */}
                    <div className="hidden md:flex items-center gap-6 px-4 border-l border-zinc-800/60 flex-shrink-0">
                      <div className="text-center w-14">
                        <div className="text-sm font-mono font-bold text-zinc-300">{threadCount}</div>
                        <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Threads</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="text-sm font-mono font-bold text-zinc-300">{messageCount}</div>
                        <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Messages</div>
                      </div>
                    </div>
                    {/* Right: latest thread preview */}
                    <div className="hidden sm:flex flex-col justify-center px-4 py-3 min-w-0 w-64 border-l border-zinc-800/60 flex-shrink-0">
                      {latestThread ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Avatar
                              src={authorAvatarCache[latestThread.authorUid] || latestThread.authorAvatar}
                              username={latestThread.author}
                              size={30}
                            />
                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                              {latestThread.tag && (
                                <span
                                  className="inline-block px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-white flex-shrink-0"
                                  style={{ backgroundColor: latestThread.tagColor || '#6366f1' }}>
                                  {latestThread.tag}
                                </span>
                              )}
                              <p className="text-xs font-mono text-zinc-300 truncate leading-snug">
                                {latestThread.title}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 pl-[38px]">
                            <span className="text-[10px] font-mono text-emerald-500 truncate">{latestThread.author}</span>
                            <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0">{latestThread.date}</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] font-mono text-zinc-700">No threads yet</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
    );
  }, [threads, customForums, authorAvatarCache, isDeveloper, activeBg]);

  // ── ThreadView ────────────────────────────────────────────────────────────
  const ThreadView = useCallback(() => {
    if (!viewingThread) return null;
    const isAnn = viewingThread.id === 'ann-1';
    const opUserData = threadUserCache[viewingThread.authorUid || ''] || null;

    // CHANGE 3 + CHANGE 4 + CHANGE 2: PostRow now shows Messages AND Rep, with correct counts and UPPERCASE tags
    const PostRow = ({ userData, authorName, authorAvatar, authorUid, date, text, images, postNum }: any) => {
      const total = (userData?.threadCount || 0) + (userData?.replyCount || 0);
      const repCount = userData?.rep || 0;
      const canRep = isLoggedIn && currentUid && authorUid && authorUid !== currentUid && !repGivenMap[authorUid];
      const alreadyRepped = !!repGivenMap[authorUid];

      return (
        <div className="flex border-b border-zinc-800">
          <div className="w-28 sm:w-36 flex-shrink-0 border-r border-zinc-800 p-3 flex flex-col items-center text-center">
            <button onClick={() => openProfile(authorName)} className="hover:opacity-80 transition mb-2">
              {/* CHANGE: prefer the live avatar from the author's current
                  user doc (userData) over the static snapshot stored on the
                  post at creation time, so avatar updates apply retroactively
                  to old posts — same as the tag already does below. */}
              <Avatar src={userData?.avatar || authorAvatar} username={authorName} size={48} />
            </button>
            <button onClick={() => openProfile(authorName)}
              className="text-emerald-400 text-xs font-mono font-bold hover:underline truncate w-full text-center mb-1">
              {authorName}
            </button>
            {/* CHANGE 2: pass username for dev ADMIN tag */}
            <RankTag total={total} color={userData?.tagColor} bgColor={userData?.tagBgColor} textColor={userData?.tagTextColor} tagLabel={userData?.tagLabel} username={authorName} />
            <div className="mt-2 w-full space-y-1">
              <div className="text-[9px] font-mono text-zinc-600">
                Threads: <span className="text-zinc-400">{userData?.threadCount || 0}</span>
              </div>
              <div className="text-[9px] font-mono text-zinc-600">
                Replies: <span className="text-zinc-400">{userData?.replyCount || 0}</span>
              </div>
              <div className="text-[9px] font-mono text-zinc-600">
                Rep: <span className="text-amber-400 font-bold">{repCount}</span>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/30">
              <span className="text-[10px] font-mono text-zinc-500">{date}</span>
              <div className="flex items-center gap-3">
                <ReactionBar targetId={postNum === 1 ? viewingThread?.id || '' : threadReplies[postNum - 2]?.id || ''} />
                {isDeveloper && postNum === 1 && viewingThread?.id !== 'ann-1' && (
                  <button
                    onClick={() => editThreadContent(viewingThread)}
                    className="text-[10px] font-mono text-zinc-600 hover:text-sky-400">
                    edit
                  </button>
                )}
                {isDeveloper && postNum > 1 && threadReplies[postNum - 2] && (
                  <button
                    onClick={() => editReplyContent(viewingThread.id, threadReplies[postNum - 2].id, threadReplies[postNum - 2].text)}
                    className="text-[10px] font-mono text-zinc-600 hover:text-sky-400">
                    edit
                  </button>
                )}
                {isStaff && postNum > 1 && threadReplies[postNum - 2] && (
                  <button
                    onClick={() => deleteReply(viewingThread.id, threadReplies[postNum - 2].id, threadReplies[postNum - 2].authorUid)}
                    className="text-[10px] font-mono text-zinc-600 hover:text-red-400">
                    del
                  </button>
                )}
                <span className="text-[10px] font-mono text-zinc-600">#{postNum}</span>
              </div>
            </div>
            <div className="px-4 py-4">
              <div className="text-sm text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">{renderWithStickers(text)}</div>
              {images && images.length > 0 && (
                <div className="flex gap-3 mt-4 flex-wrap">
                  {images.map((img: string, i: number) => (
                    <img key={i} src={img} alt="" className="max-h-72 max-w-full object-contain border border-zinc-700" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div>
        <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/30">
          <button onClick={() => setViewingThread(null)}
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 uppercase tracking-widest mb-1 block">
            ← Back
          </button>
          {viewingThread.forum && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1 block">{viewingThread.forum}</span>
          )}
          <div className="flex items-start justify-between gap-3">
            <h2 className={`font-bold text-base leading-snug ${isAnn ? 'text-emerald-400' : 'text-zinc-100'}`}>
              {viewingThread.title}
            </h2>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/?thread=${viewingThread.id}`;
                  navigator.clipboard.writeText(url).then(() => {
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 1500);
                  });
                }}
                className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400">
                {linkCopied ? 'Copied!' : 'Copy Link'}
              </button>
              {isDeveloper && !isAnn && (
                <button onClick={() => togglePin(viewingThread.id)}
                  className={`text-[10px] font-mono ${pinnedIds.includes(viewingThread.id) ? 'text-yellow-500' : 'text-zinc-600 hover:text-yellow-500'}`}>
                  {pinnedIds.includes(viewingThread.id) ? 'Unpin' : 'Pin'}
                </button>
              )}
              {isDeveloper && isAnn && (
                <button
                  onClick={() => {
                    setAnnDraft({ title: viewingThread.title, description: viewingThread.description });
                    setEditingAnnouncement(true);
                    setViewingThread(null);
                  }}
                  className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 uppercase tracking-widest">
                  Edit
                </button>
              )}
              {isDeveloper && isAnn && (
                <button onClick={deleteAnnouncement}
                  className="text-[10px] font-mono text-zinc-600 hover:text-red-400 uppercase tracking-widest">
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        <PostRow userData={opUserData} authorName={viewingThread.author} authorAvatar={viewingThread.authorAvatar}
          authorUid={viewingThread.authorUid}
          date={viewingThread.date} text={viewingThread.description} images={viewingThread.images} postNum={1} />

        {threadReplies.map((r, i) => (
          <PostRow key={r.id} userData={threadUserCache[r.authorUid] || null} authorName={r.author}
            authorAvatar={r.authorAvatar} authorUid={r.authorUid} date={r.date} text={r.text} postNum={i + 2} />
        ))}

        <div className="px-4 py-2 bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          {threadReplies.length} {threadReplies.length === 1 ? 'Reply' : 'Replies'}
        </div>

        {isLoggedIn && isBannedUser && viewingThread.forumId !== BAN_APPEALS_FORUM_ID ? (
          <div className="px-4 py-4 border-t border-zinc-800 text-center text-xs font-mono text-red-400">
            Your account is banned. You can only post in Ban Appeals.
          </div>
        ) : isLoggedIn ? (
          <div className="px-4 py-4 border-t border-zinc-800 bg-zinc-950/50">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">Leave a reply</div>
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="Write your reply..." rows={3} className={`${inputCls} resize-none mb-3`} />
            <div className="flex items-center gap-2">
              <button onClick={postReply} disabled={postingReply || !replyText.trim()} className={btnPrimary}>
                {postingReply ? 'Posting...' : 'Post Reply'}
              </button>
              <button
                onClick={() => { setStickerTarget('reply'); setShowStickerCatalog(true); }}
                className={btnSecondary + ' px-3 py-2.5'}
                title="Insert sticker">
                Sticker
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 border-t border-zinc-800 text-center">
            <button onClick={() => setShowLogin(true)} className={btnPrimary}>Log in to reply</button>
          </div>
        )}
      </div>
    );
  }, [viewingThread, threadReplies, threadUserCache, isLoggedIn, replyText, postingReply, pinnedIds, isDeveloper, isStaff, isBannedUser, deleteReply, editThreadContent, editReplyContent, postReply, openProfile, repGivenMap, currentUid, giveRep, renderWithStickers, stickerTarget, ReactionBar, reactionsMap, linkCopied]);

  // ── StatsPanel ────────────────────────────────────────────────────────────
  const StatsPanel = useCallback(() => {
    return (
      <div className="p-4 space-y-5">
        {threads.length > 0 && (
          <div className="border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">Latest Posts</div>
            <div className="space-y-3">
              {threads.slice(0, 5).map(t => (
                <button key={`lp-${t.id}`} onClick={() => setViewingThread(t)}
                  className="w-full text-left hover:opacity-80 transition block">
                  <div className="flex items-center gap-2">
                    <Avatar src={authorAvatarCache[t.authorUid] || t.authorAvatar} username={t.author} size={34} />
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      {t.tag && (
                        <span
                          className="inline-block px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-white flex-shrink-0"
                          style={{ backgroundColor: t.tagColor || '#6366f1' }}>
                          {t.tag}
                        </span>
                      )}
                      <span className="text-xs font-mono text-zinc-200 truncate">{t.title}</span>
                    </div>
                  </div>
                  <div className="pl-[42px]">
                    <div className="text-[10px] font-mono text-zinc-600 truncate">
                      <span className="text-emerald-500">{t.author}</span> · {t.date}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-700 truncate">{t.forum}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {threads.length > 0 && (
          <div className="border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">Latest Threads</div>
            <div className="space-y-2.5">
              {threads.slice(0, 5).map(t => (
                <button key={`lt-${t.id}`} onClick={() => setViewingThread(t)}
                  className="w-full text-left hover:opacity-80 transition block">
                  <div className="flex items-center gap-2">
                    <Avatar src={authorAvatarCache[t.authorUid] || t.authorAvatar} username={t.author} size={34} />
                    <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                      {t.tag && (
                        <span
                          className="inline-block px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider text-white flex-shrink-0"
                          style={{ backgroundColor: t.tagColor || '#6366f1' }}>
                          {t.tag}
                        </span>
                      )}
                      <span className="text-xs font-mono text-zinc-200 truncate">{t.title}</span>
                    </div>
                  </div>
                  <div className="pl-[42px]">
                    <div className="text-[10px] font-mono text-zinc-600 truncate">
                      Started by <span className="text-emerald-500">{t.author}</span> · {t.replies || 0} {t.replies === 1 ? 'reply' : 'replies'}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-700 truncate">{t.forum}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">Statistics</div>
          <div className="space-y-2">
            {([['Members', totalUsers, 'text-zinc-200'], ['Online', onlineCount, 'text-emerald-400'], ['Threads', threads.length, 'text-zinc-200']] as const).map(([label, val, cls]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-xs font-mono text-zinc-500">{label}</span>
                <span className={`text-sm font-mono font-bold ${cls}`}>{val}</span>
              </div>
            ))}
          </div>
        </div>
        {staffMembers.length > 0 && (
          <div className="border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">Staff</div>
            <div className="space-y-3">
              {staffMembers.map(member => {
                const online = !!presenceMap[member.uid];
                const isAdmin = member.username === DEVELOPER_USERNAME;
                return (
                  <button key={member.uid} onClick={() => openProfile(member.username)} className="w-full flex items-center gap-3 hover:opacity-80 transition">
                    <div className="relative flex-shrink-0">
                      <Avatar src={member.avatar} username={member.username} size={38} />
                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-xs font-mono text-zinc-100 font-bold truncate">{member.username}</div>
                      <div className={`text-[10px] font-mono mt-0.5 ${isAdmin ? 'text-emerald-500' : 'text-sky-400'}`}>
                        {isAdmin ? 'Administrator' : 'Moderator'}
                      </div>
                      <div className={`text-[10px] font-mono mt-0.5 ${online ? 'text-emerald-400' : 'text-zinc-600'}`}>
                        {online ? '● online' : '○ offline'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {latestUser && (
          <div className="border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">Latest Member</div>
            <button onClick={() => openProfile(latestUser.username)} className="w-full flex items-center gap-3 hover:opacity-80 transition">
              <div className="relative flex-shrink-0">
                <Avatar src={latestUser.avatar} username={latestUser.username} size={38} />
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${presenceMap[latestUser.uid] ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs font-mono text-zinc-100 truncate">{latestUser.username}</div>
                <div className="text-[10px] font-mono text-zinc-600 mt-0.5">New member</div>
              </div>
            </button>
          </div>
        )}
      </div>
    );
  }, [staffMembers, presenceMap, totalUsers, onlineCount, threads, latestUser, openProfile, authorAvatarCache]);

  // ── DmPanel ───────────────────────────────────────────────────────────────
  const DmPanel = useCallback(() => (
    <div className="fixed bottom-14 sm:bottom-16 right-4 sm:right-6 w-80 sm:w-96 bg-zinc-950 border border-zinc-800 shadow-2xl z-[200] flex flex-col" style={{ maxHeight: '70vh' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 flex-shrink-0">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-300 font-bold">Messages</span>
        <div className="flex items-center gap-2">
          {activeConvo && (
            <button onClick={() => setActiveConvo(null)} className="text-zinc-600 hover:text-zinc-300 text-[10px] font-mono">← back</button>
          )}
          <button onClick={() => setShowDmPanel(false)} className="text-zinc-600 hover:text-zinc-300 font-mono text-sm">x</button>
        </div>
      </div>

      {dmListenerError && (
        <div className="px-3 py-1.5 border-b border-red-900 bg-red-950/40 text-red-400 text-[9px] font-mono flex-shrink-0">
          {dmListenerError}
        </div>
      )}
      {!activeConvo ? (
        <>
          <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0">
            <input value={dmSearch} onChange={e => setDmSearch(e.target.value)}
              placeholder="Search users to message..."
              className="w-full bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-600 placeholder-zinc-600" />
          </div>
          <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
            {dmSearch.trim() ? (
              searchingUsers
                ? <div className="text-zinc-600 text-xs font-mono text-center py-4">Searching...</div>
                : dmSearchResults.length === 0
                  ? <div className="text-zinc-600 text-xs font-mono text-center py-4">No users found</div>
                  : (
                    <>
                      <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600 border-b border-zinc-800">Users</div>
                      {dmSearchResults.map((u: any) => (
                        <button key={u.uid} onClick={() => { setDmSearch(''); startDM(u.uid, u.username); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-900 transition text-left">
                          <Avatar src={u.avatar} username={u.username} size={28} />
                          <div>
                            <div className="text-xs font-mono text-zinc-200">{u.username}</div>
                            <div className={`text-[10px] font-mono ${presenceMap[u.uid] ? 'text-emerald-500' : 'text-zinc-600'}`}>
                              {presenceMap[u.uid] ? 'online' : 'offline'}
                            </div>
                          </div>
                        </button>
                      ))}
                    </>
                  )
            ) : conversations.length === 0 ? (
              <div className="text-zinc-600 text-xs font-mono text-center py-8">
                No conversations yet.<br />Search for a user to start messaging.
              </div>
            ) : conversations.map(c => (
              <button key={c.id} onClick={() => setActiveConvo(c)}
                className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-900 transition text-left">
                <Avatar src={c.otherUser?.avatar} username={c.otherUser?.username || '?'} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-zinc-200 truncate">{c.otherUser?.username}</div>
                  <div className="text-[10px] text-zinc-600 truncate font-mono">{c.lastMessage || 'No messages yet'}</div>
                </div>
                {c.lastSenderUid !== currentUid && !c.readBy?.[currentUid] && (
                  <span className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2 flex-shrink-0">
            <Avatar src={activeConvo.otherUser?.avatar} username={activeConvo.otherUser?.username || '?'} size={24} />
            <span className="font-mono text-xs text-zinc-200">{activeConvo.otherUser?.username}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'none' }}>
            {messages.length === 0 && <div className="text-center text-zinc-600 text-xs font-mono py-4">Say hello!</div>}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.senderUid === currentUid ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 text-xs font-mono break-words ${m.senderUid === currentUid ? 'bg-emerald-700 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                  {renderWithStickers(m.text)}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="px-3 py-2 border-t border-zinc-800 flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => { setStickerTarget('dm'); setShowStickerCatalog(true); }}
              className="text-zinc-500 hover:text-zinc-200 text-sm px-2 py-1.5 transition-colors flex-shrink-0"
              title="Stickers">
              
            </button>
            <input value={dmInput} onChange={e => setDmInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendDM()} placeholder="Message..."
              className="flex-1 bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-600 placeholder-zinc-600" />
            <button onClick={sendDM} className="bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-mono font-bold px-3 py-1.5 transition-colors">Send</button>
          </div>
        </>
      )}
    </div>
  ), [activeConvo, dmSearch, searchingUsers, dmSearchResults, conversations, messages, dmInput, presenceMap, currentUid, startDM, sendDM, dmListenerError, renderWithStickers]);

  if (authLoading) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="text-emerald-500 text-lg font-mono tracking-widest">ASCENDMAXX</div>
    </div>
  );

  const isWhiteTheme = activeBg === '#ffffff';
  const isRetroTheme = activeBg === '#d8dfe8';
  const currentThemeName = themes.find(t => t.bg === activeBg)?.name || 'Default';
  const siteLogoUrl  = siteLogos[currentThemeName]?.url || '';
  const siteLogoSize = siteLogos[currentThemeName]?.size || 32;

  return (
    <div className={`min-h-screen font-sans pb-16 sm:pb-0 ${isWhiteTheme ? 'theme-white' : isRetroTheme ? 'theme-retro' : 'text-zinc-200'}`} style={{ backgroundColor: activeBg }}>
      <style>{`
        .twemoji-img {
          height: 1.2em;
          width: 1.2em;
          margin: 0 0.05em 0 0.1em;
          vertical-align: -0.2em;
          display: inline-block;
        }
      `}</style>
      {isRetroTheme && (
        <style>{`
          .theme-retro { color: #222; font-family: Verdana, Geneva, Tahoma, sans-serif; }
          .theme-retro table.retro-table { border-collapse: collapse; width: 100%; background: #fff; border: 1px solid #b6c2d1; }
          .theme-retro table.retro-table th { background: linear-gradient(#5b82ab, #3a5f8a); color: #fff; text-align: left; padding: 6px 10px; font-size: 11px; font-weight: normal; border-right: 1px solid #2c4a6e; }
          .theme-retro table.retro-table th.retro-catbar { background: linear-gradient(#7a94b0, #58749a); font-size: 12px; padding: 5px 10px; font-weight: bold; }
          .theme-retro table.retro-table td { padding: 8px 10px; border-bottom: 1px solid #dde3ec; vertical-align: top; font-size: 11.5px; color: #222; }
          .theme-retro table.retro-table tr.retro-row:hover td { background: #eef4fc; cursor: pointer; }
          .theme-retro table.retro-table tr.retro-thread:nth-child(even) td { background: #f4f7fb; }
          .theme-retro table.retro-table tr.retro-thread:hover td { background: #eaf1fb; }
          .theme-retro .retro-forum-title { font-weight: bold; font-size: 12.5px; color: #2b5797; }
          .theme-retro .retro-forum-desc { color: #666; font-size: 11px; margin-top: 2px; }
          .theme-retro .retro-stat-col { width: 70px; text-align: center; color: #333; font-size: 11px; }
          .theme-retro .retro-badge { display: inline-block; font-size: 9.5px; font-weight: bold; padding: 1px 5px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
          .theme-retro .retro-badge-sticky { background: #e8c46a; color: #5b4400; }
          .theme-retro .retro-badge-hot { background: #e07a5f; color: #fff; }
          .theme-retro a { color: #2b5797; }
          .theme-retro a:hover { text-decoration: underline; }

          /* Site-wide fallback recolor for views not rebuilt as tables (DMs, profile, admin, modals) */
          .theme-retro .bg-black,
          .theme-retro .bg-zinc-950,
          .theme-retro .bg-zinc-950\\/50,
          .theme-retro .bg-zinc-950\\/95,
          .theme-retro .bg-zinc-900,
          .theme-retro .bg-zinc-900\\/30,
          .theme-retro .bg-zinc-900\\/40,
          .theme-retro .bg-zinc-900\\/50,
          .theme-retro .bg-zinc-900\\/60,
          .theme-retro .bg-zinc-900\\/70,
          .theme-retro .bg-zinc-800,
          .theme-retro .bg-zinc-700 { background-color: #eef1f5; }

          .theme-retro .border-zinc-950,
          .theme-retro .border-zinc-900,
          .theme-retro .border-zinc-800,
          .theme-retro .border-zinc-800\\/50,
          .theme-retro .border-zinc-800\\/60,
          .theme-retro .border-zinc-700,
          .theme-retro .border-zinc-600,
          .theme-retro .border-zinc-500,
          .theme-retro .divide-zinc-800 { border-color: #b6c2d1; }

          .theme-retro .text-zinc-100,
          .theme-retro .text-zinc-200,
          .theme-retro .text-zinc-300,
          .theme-retro .text-zinc-400 { color: #234064; }
          .theme-retro .text-zinc-500,
          .theme-retro .text-zinc-600,
          .theme-retro .text-zinc-700,
          .theme-retro .text-zinc-800 { color: #55698a; }

          .theme-retro .placeholder-zinc-600::placeholder { color: #7a8ba8; }

          .theme-retro .hover\\:bg-zinc-800:hover,
          .theme-retro .hover\\:bg-zinc-900:hover { background-color: #dde6f2; }
          .theme-retro .hover\\:text-zinc-200:hover,
          .theme-retro .hover\\:text-zinc-300:hover,
          .theme-retro .hover\\:text-zinc-400:hover { color: #17263c; }
          .theme-retro .hover\\:border-zinc-500:hover,
          .theme-retro .hover\\:border-zinc-600:hover { border-color: #7a94b0; }
        `}</style>
      )}
      {isWhiteTheme && (
        <style>{`
          .theme-white { color: #14532d; }
          .theme-white .bg-black,
          .theme-white .bg-zinc-950,
          .theme-white .bg-zinc-950\\/50,
          .theme-white .bg-zinc-950\\/95,
          .theme-white .bg-zinc-900,
          .theme-white .bg-zinc-900\\/30,
          .theme-white .bg-zinc-900\\/40,
          .theme-white .bg-zinc-900\\/50,
          .theme-white .bg-zinc-900\\/60,
          .theme-white .bg-zinc-900\\/70,
          .theme-white .bg-zinc-800,
          .theme-white .bg-zinc-700 { background-color: #f0fdf4; }

          .theme-white .border-zinc-950,
          .theme-white .border-zinc-900,
          .theme-white .border-zinc-800,
          .theme-white .border-zinc-800\\/50,
          .theme-white .border-zinc-800\\/60,
          .theme-white .border-zinc-700,
          .theme-white .border-zinc-600,
          .theme-white .border-zinc-500,
          .theme-white .divide-zinc-800 { border-color: #86efac; }

          .theme-white .text-zinc-100,
          .theme-white .text-zinc-200,
          .theme-white .text-zinc-300,
          .theme-white .text-zinc-400 { color: #14532d; }
          .theme-white .text-zinc-500,
          .theme-white .text-zinc-600,
          .theme-white .text-zinc-700,
          .theme-white .text-zinc-800 { color: #166534; }

          .theme-white .placeholder-zinc-600::placeholder { color: #4d7c5f; }

          .theme-white .hover\\:bg-zinc-800:hover,
          .theme-white .hover\\:bg-zinc-900:hover { background-color: #dcfce7; }
          .theme-white .hover\\:text-zinc-200:hover,
          .theme-white .hover\\:text-zinc-300:hover,
          .theme-white .hover\\:text-zinc-400:hover { color: #052e16; }
          .theme-white .hover\\:border-zinc-500:hover,
          .theme-white .hover\\:border-zinc-600:hover { border-color: #4ade80; }
        `}</style>
      )}

      <header className={isRetroTheme ? 'sticky top-0 z-50' : 'bg-zinc-950 border-b border-zinc-800 sticky top-0 z-50'}
        style={isRetroTheme ? { background: 'linear-gradient(#3a5f8a, #234064)', borderBottom: '3px solid #17263c' } : undefined}>
        {/* ── Logo row — large wordmark/image, its own row ─────────────────── */}
        <div className={isRetroTheme ? 'max-w-5xl mx-auto px-4 pt-3 pb-2.5 flex items-center justify-between gap-4' : 'max-w-7xl mx-auto px-4 pt-3.5 pb-2.5 sm:pt-4 sm:pb-3 flex items-center justify-between gap-4'}>
          <div
            className="cursor-pointer flex items-center gap-3 min-w-0"
            onClick={() => { setCurrentView('home'); setSelectedForum(null); setViewingThread(null); }}>
            {siteLogoUrl ? (
              <img
                src={siteLogoUrl}
                alt="Logo"
                style={{ height: `clamp(30px, 8vw, ${Math.max(siteLogoSize, 40)}px)`, width: 'auto' }}
                className="object-contain"
              />
            ) : isRetroTheme ? (
              <div className="min-w-0">
                <div className="text-2xl font-bold text-white truncate" style={{ fontFamily: '"Trebuchet MS", Verdana, sans-serif', letterSpacing: '0.5px' }}>
                  Ascend<span style={{ color: '#8fc7ff' }}>Maxx</span>.me
                </div>
                <div className="text-[11px] truncate" style={{ color: '#b8cbe0' }}>The new frontier of personal optimization</div>
              </div>
            ) : (
              <span className="text-emerald-500 font-mono font-bold tracking-widest text-xl sm:text-3xl truncate">ASCENDMAXX</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {isDeveloper && (
              <button
                onClick={() => { setLogoUrlDraft(siteLogoUrl); setLogoSizeDraft(siteLogoSize); setEditingLogo(true); }}
                className="hidden sm:block text-[9px] font-mono text-zinc-700 hover:text-zinc-400 transition">
                {siteLogoUrl ? `edit ${currentThemeName} logo` : `add ${currentThemeName} logo`}
              </button>
            )}
            <button
              onClick={() => setShowMobileSearch(v => !v)}
              aria-label="Search"
              className={`sm:hidden w-9 h-9 flex items-center justify-center border transition-colors ${showMobileSearch ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 text-zinc-400'}`}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M19.5 19.5l-4.3-4.3" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Mobile search — expands under the logo row ────────────────────── */}
        {showMobileSearch && (
          <div className="sm:hidden px-4 pb-3">
            <input type="text" placeholder="Search the forums..." autoFocus
              className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-600 text-zinc-200 placeholder-zinc-600" />
          </div>
        )}

        {/* ── Nav bar — tabs on the left, search & auth on the right ───────── */}
        <nav className={isRetroTheme ? '' : 'border-t border-zinc-800'}
          style={isRetroTheme ? { background: '#cdd8e6', borderBottom: '1px solid #a9bad0' } : undefined}>
          <div className={isRetroTheme ? 'max-w-5xl mx-auto px-4 h-9 flex items-center justify-between gap-4' : 'max-w-7xl mx-auto px-4 h-12 sm:h-11 flex items-center justify-between gap-4'}>
            {/* Tabs — shown on desktop; on mobile the bottom nav already covers these, so this row focuses on account actions */}
            <div className="hidden sm:flex items-center gap-0.5 text-xs font-mono overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none' }}>
              {([...(['Home','Forums','Members','About','Stickers'] as const), ...(isDeveloper ? ['Trash' as const] : [])]).map(v => (
                <button key={v}
                  onClick={() => {
                    if (v === 'Home') { setCurrentView('home'); setSelectedForum(null); setViewingThread(null); }
                    else setCurrentView(v.toLowerCase() as View);
                    setViewingThread(null);
                  }}
                  className={isRetroTheme
                    ? `px-3 py-1.5 whitespace-nowrap font-bold ${currentView === v.toLowerCase() ? 'bg-[#eef1f5]' : ''}`
                    : `px-3 py-1.5 whitespace-nowrap transition-colors ${currentView === v.toLowerCase() ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  style={isRetroTheme ? { color: '#234064', borderRight: '1px solid #b6c2d1' } : undefined}>
                  {v}
                </button>
              ))}
              {isLoggedIn && (
                <button onClick={() => { setCurrentView('dms'); setViewingThread(null); setShowDmPanel(false); }}
                  className={isRetroTheme
                    ? `relative px-3 py-1.5 whitespace-nowrap font-bold ${currentView === 'dms' ? 'bg-[#eef1f5]' : ''}`
                    : `relative px-3 py-1.5 whitespace-nowrap transition-colors ${currentView === 'dms' ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                  style={isRetroTheme ? { color: '#234064' } : undefined}>
                  DMs
                  {dmUnread > 0 && (
                    <span className="absolute -top-0.5 right-0.5 bg-emerald-500 text-black text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                      {dmUnread}
                    </span>
                  )}
                </button>
              )}
            </div>
            {/* Current section label — mobile only, replaces the tab row */}
            <div className="sm:hidden text-[11px] font-mono uppercase tracking-widest text-zinc-500 truncate">
              {currentView}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input type="text" placeholder="Search..."
                className="hidden md:block bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs font-mono w-36 focus:outline-none focus:border-emerald-600 text-zinc-300 placeholder-zinc-600" />
              {isLoggedIn && (
                <button onClick={() => setShowDmPanel(v => !v)}
                  className="relative text-zinc-500 hover:text-zinc-200 text-xs font-mono px-2 py-1.5 transition-colors">
                  DM
                  {dmUnread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-emerald-500 text-black text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                      {dmUnread}
                    </span>
                  )}
                </button>
              )}
              {!isLoggedIn ? (
                <>
                  <button onClick={() => setShowLogin(true)}
                    className="text-xs font-mono px-3 py-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white transition-colors">
                    Log in
                  </button>
                  <button onClick={() => setShowRegister(true)}
                    className="text-xs font-mono px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-bold transition-colors">
                    Register
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => openProfile(currentUser)} className="flex items-center gap-1.5 hover:opacity-80 transition">
                    <Avatar src={currentUserData?.avatar} username={currentUser} size={22} />
                    <span className="text-emerald-400 font-mono text-xs hidden sm:block truncate max-w-[80px]">{currentUser}</span>
                  </button>
                  <button onClick={logout} className="text-zinc-600 text-xs font-mono hover:text-zinc-300 transition-colors">logout</button>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      {showDmPanel && isLoggedIn && DmPanel()}

      {/* ── MOBILE SIDEBAR TAB — always visible below lg, since the sidebar itself is hidden there ── */}
      <button
        onClick={() => setShowMobileLatest(true)}
        aria-label="Show sidebar"
        className="lg:hidden fixed right-4 z-40 bg-zinc-950 border border-zinc-800 hover:border-emerald-700 px-3 py-2 flex items-center gap-2 shadow-lg transition-colors"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Sidebar</span>
        <span className="text-emerald-500 text-xs">▲</span>
      </button>

      {showMobileLatest && (
        <Modal onClose={() => setShowMobileLatest(false)} maxW="max-w-sm">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center sticky top-0 bg-zinc-950 z-10">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Sidebar</span>
            <button onClick={() => setShowMobileLatest(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          {StatsPanel()}
        </Modal>
      )}

      <div className="max-w-7xl mx-auto flex">
        <div className="flex-1 min-w-0 lg:pl-6 xl:pl-10">

          {currentView === 'home' && !viewingThread && (
            <div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Forums</h1>
                <div className="flex items-center gap-2">
                  {isDeveloper && !isAnnouncementDeleted && (
                    <button onClick={() => { setAnnDraft({ title: siteAnnouncement.title, description: siteAnnouncement.description }); setEditingAnnouncement(true); }}
                      className={btnSecondary + ' text-[10px] py-1.5 px-3'}>
                      Edit Announcement
                    </button>
                  )}
                  {isDeveloper && !isAnnouncementDeleted && (
                    <button onClick={deleteAnnouncement}
                      className="text-zinc-600 hover:text-red-400 text-xs font-mono">
                      del
                    </button>
                  )}
                  {isLoggedIn && <button onClick={() => setShowNewThreadModal(true)} className={btnPrimary}>+ New Thread</button>}
                </div>
              </div>
              {!isAnnouncementDeleted && <ThreadCard thread={siteAnnouncement} isAnnouncement />}
              {pinnedThreads.map(t => <ThreadCard key={t.id} thread={t} />)}
              {threadsLoading ? (
                <div className="text-center py-6 text-zinc-600 font-mono text-xs">Loading...</div>
              ) : renderForumIndex()}
            </div>
          )}

          {viewingThread && ThreadView()}

          {currentView === 'forums' && !selectedForum && !viewingThread && (
            <div>
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Forums</h2>
              </div>
              {threadsLoading
                ? <div className="text-center py-6 text-zinc-600 font-mono text-xs">Loading...</div>
                : renderForumIndex()}
            </div>
          )}

          {currentView === 'forums' && selectedForum && !viewingThread && (() => {
            const PAGE_SIZE = 15;
            const totalPages = Math.max(1, Math.ceil(visibleThreads.length / PAGE_SIZE));
            const page = Math.min(forumPage, totalPages);
            const pageThreads = visibleThreads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

            const pageNumbers: (number | '...')[] = [];
            for (let i = 1; i <= totalPages; i++) {
              if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) pageNumbers.push(i);
              else if (pageNumbers[pageNumbers.length - 1] !== '...') pageNumbers.push('...');
            }

            if (isRetroTheme) {
              return (
                <div className="px-3 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <button style={{ color: '#2b5797', fontSize: 11 }} onClick={() => setSelectedForum(null)}>&laquo; Forums</button>
                      <h2 style={{ fontWeight: 'bold', fontSize: 14, color: '#234064' }}>{selectedForum.name}</h2>
                    </div>
                    {isLoggedIn && (selectedForum.id !== 2 || isDeveloper) && (selectedForum.id !== 1 || isStaff) && (!isBannedUser || selectedForum.id === BAN_APPEALS_FORUM_ID) && (
                      <button onClick={() => setShowNewThreadModal(true)} className={btnPrimary}>+ New Thread</button>
                    )}
                  </div>
                  <table className="retro-table">
                    <tbody>
                      <tr>
                        <th style={{ width: 28 }}></th>
                        <th>Thread</th>
                        <th style={{ width: 110 }}>Started by</th>
                        <th className="retro-stat-col">Replies</th>
                        <th className="retro-stat-col">Views</th>
                        <th style={{ width: 190 }}>Last Post</th>
                      </tr>
                      {threadsLoading ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#888' }}>Loading...</td></tr>
                      ) : visibleThreads.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#888' }}>No threads yet.</td></tr>
                      ) : pageThreads.map(t => {
                        const isPinned = pinnedIds.includes(t.id);
                        return (
                          <tr key={t.id} className="retro-thread retro-row" onClick={() => setViewingThread(t)}>
                            <td style={{ textAlign: 'center' }}>{isPinned ? '📌' : '💬'}</td>
                            <td>
                              {isPinned && <span className="retro-badge retro-badge-sticky">STICKY</span>}
                              {t.tag && (
                                <span className="retro-badge" style={{ backgroundColor: t.tagColor || '#6366f1', color: '#fff' }}>{t.tag}</span>
                              )}
                              <a href="#" onClick={e => e.preventDefault()} style={{ fontWeight: 'bold' }}>{t.title}</a>
                            </td>
                            <td style={{ color: '#2b5797' }}>{t.author}</td>
                            <td className="retro-stat-col">{t.replies || 0}</td>
                            <td className="retro-stat-col">{t.views || 1}</td>
                            <td style={{ fontSize: 10.5, color: '#555' }}>{t.date}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>
                      Page {page} of {totalPages} &nbsp;
                      {pageNumbers.map((n, i) => n === '...' ? (
                        <span key={`ellipsis-${i}`}>... </span>
                      ) : (
                        <a key={n} href="#" onClick={e => { e.preventDefault(); setForumPage(n as number); }} style={{ marginRight: 6, fontWeight: page === n ? 'bold' : 'normal' }}>{n}</a>
                      ))}
                      {page < totalPages && <a href="#" onClick={e => { e.preventDefault(); setForumPage(page + 1); }}>Next &raquo;</a>}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div>
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <div>
                    <button className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 uppercase tracking-widest mb-0.5 block" onClick={() => setSelectedForum(null)}>Forums /</button>
                    <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">{selectedForum.name}</h2>
                  </div>
                  {isLoggedIn && (selectedForum.id !== 2 || isDeveloper) && (selectedForum.id !== 1 || isStaff) && (!isBannedUser || selectedForum.id === BAN_APPEALS_FORUM_ID) && (
                    <button onClick={() => setShowNewThreadModal(true)} className={btnPrimary}>+ New Thread</button>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800/60 text-xs font-mono flex-wrap">
                    {pageNumbers.map((n, i) => n === '...' ? (
                      <span key={`ellipsis-${i}`} className="px-1.5 text-zinc-600">...</span>
                    ) : (
                      <button key={n} onClick={() => setForumPage(n as number)}
                        className={`px-2.5 py-1 border ${page === n ? 'border-emerald-600 text-emerald-400' : 'border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600'}`}>
                        {n}
                      </button>
                    ))}
                    {page < totalPages && (
                      <button onClick={() => setForumPage(page + 1)}
                        className="px-2.5 py-1 border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 ml-1">
                        Next ›
                      </button>
                    )}
                  </div>
                )}

                {threadsLoading ? (
                  <div className="text-center py-20 text-zinc-600 font-mono text-xs">Loading...</div>
                ) : visibleThreads.length === 0 ? (
                  <div className="text-center py-20 text-zinc-600 font-mono text-xs">No threads yet.{isLoggedIn && (selectedForum.id !== 2 || isDeveloper) && (selectedForum.id !== 1 || isStaff) && (!isBannedUser || selectedForum.id === BAN_APPEALS_FORUM_ID) ? ' Start one.' : ''}</div>
                ) : pageThreads.map(t => {
                  const isPinned = pinnedIds.includes(t.id);
                  return (
                    <div key={t.id} onClick={() => setViewingThread(t)}
                      className={`flex items-center gap-3 border-b border-zinc-800 px-4 py-2.5 hover:bg-zinc-900/50 cursor-pointer transition-colors ${isPinned ? 'bg-zinc-900/30 border-l-2 border-l-yellow-600' : ''}`}>
                      <button onClick={(e) => { e.stopPropagation(); openProfile(t.author); }} className="flex-shrink-0">
                        <Avatar src={authorAvatarCache[t.authorUid] || t.authorAvatar} username={t.author} size={36} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isPinned && <span className="text-[9px] font-mono uppercase tracking-widest text-yellow-500 flex-shrink-0">Pinned</span>}
                          {t.tag && (
                            <span
                              className="inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-white flex-shrink-0"
                              style={{ backgroundColor: t.tagColor || '#6366f1' }}>
                              {t.tag}
                            </span>
                          )}
                          <span className={`text-sm font-mono font-semibold truncate ${isPinned ? 'text-yellow-400' : 'text-zinc-100'}`}>{t.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-mono text-emerald-500">{t.author}</span>
                          <span className="text-[10px] font-mono text-zinc-600">· {t.date}</span>
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
                        <div className="text-center w-12">
                          <div className="text-xs font-mono font-bold text-zinc-300">{t.replies || 0}</div>
                          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Replies</div>
                        </div>
                        <div className="text-center w-12">
                          <div className="text-xs font-mono font-bold text-zinc-300">{t.views || 1}</div>
                          <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-600">Views</div>
                        </div>
                      </div>
                      {(isDeveloper || isStaff) && (
                        <div className="flex-shrink-0 flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                          {isDeveloper && (
                            <button onClick={() => togglePin(t.id)} className={`text-[9px] font-mono ${isPinned ? 'text-yellow-500' : 'text-zinc-600 hover:text-yellow-500'}`}>
                              {isPinned ? 'unpin' : 'pin'}
                            </button>
                          )}
                          {isDeveloper && (
                            <button onClick={() => editThreadContent(t)} className="text-[9px] font-mono text-zinc-600 hover:text-sky-400">edit</button>
                          )}
                          {isStaff && (
                            <button onClick={() => deleteThread(t.id)} className="text-[9px] font-mono text-zinc-600 hover:text-red-400">del</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {currentView === 'members' && (
            <div>
              <div className="px-4 py-3 border-b border-zinc-800">
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Members</h2>
              </div>
              <MembersList openProfile={openProfile} presenceMap={presenceMap} startDM={startDM} currentUid={currentUid} />
            </div>
          )}

          {currentView === 'dms' && (
            <div>
              <div className="px-4 py-3 border-b border-zinc-800">
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Direct Messages</h2>
              </div>
              {!isLoggedIn ? (
                <div className="text-center py-20 text-zinc-600 font-mono text-xs">Log in to use direct messages.</div>
              ) : (
                <div className="flex h-[calc(100vh-7rem)] flex-col">
                  {dmListenerError && (
                    <div className="px-3 py-2 border-b border-red-900 bg-red-950/40 text-red-400 text-[10px] font-mono">
                      {dmListenerError}
                    </div>
                  )}
                  <div className="flex flex-1 min-h-0">
                  <div className="w-44 sm:w-56 flex-shrink-0 border-r border-zinc-800 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                    <div className="p-2 border-b border-zinc-800">
                      <input value={dmSearch} onChange={e => setDmSearch(e.target.value)} placeholder="Search users..."
                        className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-600 placeholder-zinc-600" />
                    </div>
                    {dmSearch.trim()
                      ? dmSearchResults.map((u: any) => (
                          <button key={u.uid} onClick={() => { setDmSearch(''); startDM(u.uid, u.username); }}
                            className="w-full flex items-center gap-2 p-2 hover:bg-zinc-900 border-b border-zinc-800 text-left">
                            <Avatar src={u.avatar} username={u.username} size={24} />
                            <span className="text-xs font-mono text-zinc-300 truncate">{u.username}</span>
                          </button>
                        ))
                      : conversations.length === 0
                        ? <div className="p-4 text-zinc-600 text-xs font-mono text-center mt-8">No messages yet.</div>
                        : conversations.map(c => (
                            <button key={c.id} onClick={() => setActiveConvo(c)}
                              className={`w-full flex items-center gap-2 p-3 hover:bg-zinc-900 transition border-b border-zinc-800 ${activeConvo?.id === c.id ? 'bg-zinc-900' : ''}`}>
                              <Avatar src={c.otherUser?.avatar} username={c.otherUser?.username || '?'} size={28} />
                              <div className="text-left min-w-0">
                                <div className="text-xs font-mono text-zinc-200 truncate">{c.otherUser?.username}</div>
                                <div className="text-[10px] text-zinc-600 truncate font-mono">{c.lastMessage || 'No messages'}</div>
                              </div>
                              {c.lastSenderUid !== currentUid && !c.readBy?.[currentUid] && (
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0 ml-auto" />
                              )}
                            </button>
                          ))
                    }
                  </div>
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {!activeConvo ? (
                      <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs font-mono">Select a conversation</div>
                    ) : (
                      <>
                        <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-2">
                          <Avatar src={activeConvo.otherUser?.avatar} username={activeConvo.otherUser?.username || '?'} size={24} />
                          <span className="font-mono text-sm text-zinc-200">{activeConvo.otherUser?.username}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ scrollbarWidth: 'none' }}>
                          {messages.map(m => (
                            <div key={m.id} className={`flex ${m.senderUid === currentUid ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[70%] px-3 py-2 text-xs font-mono ${m.senderUid === currentUid ? 'bg-emerald-700 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
                                {renderWithStickers(m.text)}
                              </div>
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                        <div className="px-3 py-2 border-t border-zinc-800 flex gap-1.5">
                          <button
                            onClick={() => { setStickerTarget('dm'); setShowStickerCatalog(true); }}
                            className="text-zinc-500 hover:text-zinc-200 text-sm px-2 py-1.5 transition-colors flex-shrink-0"
                            title="Stickers">
                            
                          </button>
                          <input value={dmInput} onChange={e => setDmInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendDM()} placeholder="Message..."
                            className={`${inputCls} flex-1`} />
                          <button onClick={sendDM} className={btnPrimary}>Send</button>
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentView === 'about' && (
            <div className="p-6 sm:p-10 max-w-2xl">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">About AscendMaxx</h1>
                {isDeveloper && !editingAbout && (
                  <button onClick={() => { setAboutDraft(aboutText); setEditingAbout(true); }} className={btnSecondary}>Edit</button>
                )}
              </div>
              {editingAbout ? (
                <div>
                  <textarea value={aboutDraft} onChange={e => setAboutDraft(e.target.value)} rows={8} className={`${inputCls} resize-none mb-4`} />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingAbout(false)} className={btnSecondary}>Cancel</button>
                    <button onClick={async () => { setAboutText(aboutDraft); setEditingAbout(false); await setDoc(doc(db, 'settings', 'about'), { text: aboutDraft }); }} className={btnPrimary}>Save</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap">{aboutText}</p>
              )}
            </div>
          )}

          {/* ── TRASH (dev-only) ──────────────────────────────────────────── */}
          {currentView === 'trash' && isDeveloper && (
            <div>
              <div className="px-4 py-3 border-b border-zinc-800">
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Trash</h2>
                <p className="text-[10px] font-mono text-zinc-600 mt-1">Deleted threads and replies land here first. Restore them, or delete them for good.</p>
              </div>

              <div className="px-4 py-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Deleted Threads ({deletedThreadsList.length})</div>
                {deletedThreadsList.length === 0 ? (
                  <div className="text-xs font-mono text-zinc-600 py-4">Nothing here.</div>
                ) : (
                  <div className="space-y-2 mb-6">
                    {deletedThreadsList.map(d => (
                      <div key={d.id} className="border border-zinc-800 px-3 py-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-zinc-200 truncate">{d.title}</div>
                          <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                            by {d.author} in {d.forum} · deleted by {d.deletedByUsername || 'unknown'}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <button onClick={() => restoreThread(d)} className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 border border-zinc-800 hover:border-emerald-700 px-2 py-1 uppercase tracking-widest">Restore</button>
                          <button onClick={() => permanentlyDeleteThread(d)} className="text-[10px] font-mono text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 px-2 py-1 uppercase tracking-widest">Delete Forever</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Deleted Replies ({deletedRepliesList.length})</div>
                {deletedRepliesList.length === 0 ? (
                  <div className="text-xs font-mono text-zinc-600 py-4">Nothing here.</div>
                ) : (
                  <div className="space-y-2">
                    {deletedRepliesList.map(d => (
                      <div key={d.id} className="border border-zinc-800 px-3 py-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-zinc-300 line-clamp-2">{d.text}</div>
                          <div className="text-[10px] font-mono text-zinc-600 mt-0.5">
                            by {d.author} · deleted by {d.deletedByUsername || 'unknown'}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <button onClick={() => restoreReply(d)} className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 border border-zinc-800 hover:border-emerald-700 px-2 py-1 uppercase tracking-widest">Restore</button>
                          <button onClick={() => permanentlyDeleteReply(d)} className="text-[10px] font-mono text-red-500 hover:text-red-400 border border-zinc-800 hover:border-red-700 px-2 py-1 uppercase tracking-widest">Delete Forever</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STICKERS PAGE ─────────────────────────────────────────────── */}
          {currentView === 'stickers' && (
            <div>
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Sticker Catalog</h2>
                <div className="flex gap-2">
                  {isLoggedIn && (
                    <button onClick={() => setShowRequestSticker(true)} className={btnSecondary + ' text-[10px] py-1.5 px-3'}>
                      Request Sticker
                    </button>
                  )}
                  {isDeveloper && (
                    <>
                      <button onClick={() => setShowReviewQueue(true)}
                        className={btnSecondary + ' text-[10px] py-1.5 px-3 relative'}>
                        Review Queue
                        {stickerRequests.filter(r => r.status === 'pending').length > 0 && (
                          <span className="absolute -top-1 -right-1 bg-emerald-500 text-black text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                            {stickerRequests.filter(r => r.status === 'pending').length}
                          </span>
                        )}
                      </button>
                      <button onClick={() => setShowAddSticker(true)} className={btnPrimary + ' text-[10px] py-1.5 px-3'}>
                        + Add Sticker
                      </button>
                    </>
                  )}
                </div>
              </div>
              {stickers.length === 0 ? (
                <div className="text-center py-20 text-zinc-600 font-mono text-xs">
                  No stickers yet.{isDeveloper ? ' Add the first one!' : ' Check back soon.'}
                </div>
              ) : (
                <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {stickers.map(s => (
                    <div key={s.id} className="flex flex-col items-center gap-1 p-2 border border-zinc-800 hover:border-zinc-600 transition-colors group">
                      <img src={s.url} alt={s.name} className="w-16 h-16 object-contain" />
                      <span className="text-[9px] font-mono text-zinc-500 truncate w-full text-center">{s.name}</span>
                      {isDeveloper && (
                        <button onClick={() => deleteDoc(doc(db, 'stickers', s.id))}
                          className="text-[9px] font-mono text-zinc-700 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                          remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="hidden lg:block w-56 flex-shrink-0 border-l border-zinc-800 sticky top-11 h-[calc(100vh-2.75rem)] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {StatsPanel()}
        </div>
      </div>

      <button onClick={() => setShowRateModal(true)}
        className="hidden sm:block fixed bottom-6 right-4 sm:right-6 bg-emerald-600 hover:bg-emerald-500 text-black font-mono font-bold px-4 py-2.5 text-xs uppercase tracking-wider shadow-2xl z-50 transition-colors">
        AI Analysis
      </button>

      {/* ── PROFILE MODAL ─────────────────────────────────────────────────── */}
      {viewingProfile && (() => {
        const profTotal = (viewingProfile.threadCount || 0) + (viewingProfile.replyCount || 0);
        const profRep = viewingProfile.rep || 0;
        const canRepProfile = isLoggedIn && currentUid && viewingProfile.uid !== currentUid && !repGivenMap[viewingProfile.uid];
        const alreadyReppedProfile = !!repGivenMap[viewingProfile.uid];
        const isTargetSelf = viewingProfile.uid === currentUid;
        const isTargetDev  = viewingProfile.username === DEVELOPER_USERNAME;
        // Mods can ban regular members, but only the developer can ban/unban a moderator.
        const canModerateTarget = isStaff && !isTargetSelf && !isTargetDev && (isDeveloper || !viewingProfile.isModerator);
        const canGrantModTarget = isDeveloper && !isTargetSelf && !isTargetDev;

        return (
          <Modal onClose={() => setViewingProfile(null)} maxW="max-w-md">
            <div className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar src={viewingProfile.avatar} username={viewingProfile.username} size={48} />
                <div>
                  <div className="font-mono font-bold text-zinc-100">{viewingProfile.username}</div>
                  <div className="mt-1">
                    {/* CHANGE 1 + 2: Pass username so dev gets ADMIN tag correctly */}
                    <RankTag total={profTotal} color={viewingProfile.tagColor} bgColor={viewingProfile.tagBgColor} textColor={viewingProfile.tagTextColor} tagLabel={viewingProfile.tagLabel} username={viewingProfile.username} />
                  </div>
                  <div className="text-[10px] font-mono text-zinc-600 mt-1">
                    Member since {viewingProfile.createdAt?.toDate
                      ? viewingProfile.createdAt.toDate().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                      : '2026'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {isDeveloper && (
                  <button onClick={() => openDevTagEditor(viewingProfile)}
                    className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 border border-zinc-800 hover:border-emerald-700 px-2 py-1 transition uppercase tracking-widest">
                    Edit Tag
                  </button>
                )}
                {isDeveloper && !isTargetSelf && (
                  <button onClick={() => renameUser(viewingProfile.uid, viewingProfile.username)}
                    disabled={renamingUser}
                    className="text-[10px] font-mono text-zinc-600 hover:text-violet-400 border border-zinc-800 hover:border-violet-700 px-2 py-1 transition uppercase tracking-widest disabled:opacity-50">
                    {renamingUser ? 'Renaming...' : 'Rename'}
                  </button>
                )}
                {canGrantModTarget && (
                  <button onClick={() => toggleModerator(viewingProfile.uid, !!viewingProfile.isModerator)}
                    className="text-[10px] font-mono text-zinc-600 hover:text-sky-400 border border-zinc-800 hover:border-sky-700 px-2 py-1 transition uppercase tracking-widest">
                    {viewingProfile.isModerator ? 'Remove Mod' : 'Mod'}
                  </button>
                )}
                {canModerateTarget && (
                  <button onClick={() => toggleBan(viewingProfile.uid, !!viewingProfile.banned)}
                    className="text-[10px] font-mono text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-700 px-2 py-1 transition uppercase tracking-widest">
                    {viewingProfile.banned ? 'Unban' : 'Ban'}
                  </button>
                )}
                <button onClick={() => setViewingProfile(null)} className="text-zinc-600 hover:text-zinc-300 font-mono text-sm">x</button>
              </div>
            </div>
            {(viewingProfile.isModerator || viewingProfile.banned) && (
              <div className="px-5 py-2 border-b border-zinc-800 flex gap-2">
                {viewingProfile.isModerator && (
                  <span className="text-[9px] font-mono uppercase tracking-widest text-sky-400 border border-sky-800 px-1.5 py-0.5">Moderator</span>
                )}
                {viewingProfile.banned && (
                  <span className="text-[9px] font-mono uppercase tracking-widest text-red-400 border border-red-800 px-1.5 py-0.5">Banned</span>
                )}
              </div>
            )}

            {viewingProfile.bio && (
              <div className="px-5 py-3 border-b border-zinc-800">
                <p className="text-xs font-mono text-zinc-400 leading-relaxed">{viewingProfile.bio}</p>
              </div>
            )}

            {/* CHANGE 3: Rep display and Rep+1 button in profile */}
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-lg font-mono font-bold text-amber-400">{profRep}</div>
                  <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Rep</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-mono font-bold text-zinc-200">{viewingProfile.replyCount || 0}</div>
                  <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Replies</div>
                </div>
              </div>
              {/* Rep+1 button — only shows when logged in and viewing someone else's profile */}
              {isLoggedIn && viewingProfile.uid !== currentUid && (
                <button
                  onClick={() => giveRep(viewingProfile.uid)}
                  disabled={alreadyReppedProfile}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors border ${
                    alreadyReppedProfile
                      ? 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                      : 'border-amber-700 text-amber-400 hover:bg-amber-950 hover:border-amber-500'
                  }`}
                  title={alreadyReppedProfile ? 'Already repped' : 'Give +1 rep'}>
                  {alreadyReppedProfile ? '✓ Repped' : '▲ Rep +1'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 border-b border-zinc-800">
              {([
                ['Threads', viewingProfile.threadCount || 0, null],
                ['Followers', viewingProfile.followerCount || 0, () => { loadFollowersFollowing(viewingProfile.uid); setShowFollowers(true); }],
                ['Following', viewingProfile.followingCount || 0, () => { loadFollowersFollowing(viewingProfile.uid); setShowFollowing(true); }],
              ] as [string, number, (() => void) | null][]).map(([label, val, fn]) => (
                <button key={label} onClick={fn ?? undefined}
                  className={`py-4 text-center border-r border-zinc-800 last:border-none ${fn ? 'hover:bg-zinc-900 transition-colors' : ''}`}>
                  <div className="font-mono font-bold text-zinc-100 text-base">{val}</div>
                  <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mt-0.5">{label}</div>
                </button>
              ))}
            </div>

            <div className="px-5 py-4 flex gap-2">
              {isLoggedIn && viewingProfile.uid !== currentUid && (
                <>
                  <button onClick={() => toggleFollow(viewingProfile.uid, viewingProfile.username)}
                    className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase tracking-wider transition-colors ${followingList.includes(viewingProfile.uid) ? 'border border-zinc-700 text-zinc-400 hover:border-zinc-500' : 'bg-emerald-600 hover:bg-emerald-500 text-black'}`}>
                    {followingList.includes(viewingProfile.uid) ? 'Following' : 'Follow'}
                  </button>
                  <button onClick={() => startDM(viewingProfile.uid, viewingProfile.username)}
                    className="flex-1 py-2.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 text-xs font-mono uppercase tracking-wider transition-colors">
                    Message
                  </button>
                </>
              )}
              {isLoggedIn && viewingProfile.uid === currentUid && (
                <button onClick={() => { setProfileBio(currentUserData?.bio || ''); setProfileAvatar(currentUserData?.avatar || ''); setProfileTagColor(currentUserData?.tagColor || ''); setShowEditProfile(true); }}
                  className="flex-1 py-2.5 border border-zinc-700 hover:border-zinc-500 text-zinc-400 text-xs font-mono uppercase tracking-wider transition-colors">
                  Edit Profile
                </button>
              )}
            </div>

            {threads.filter(t => t.author === viewingProfile.username).length > 0 && (
              <div className="border-t border-zinc-800">
                <div className="px-5 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600">Recent Threads</div>
                {threads.filter(t => t.author === viewingProfile.username).slice(0, 3).map(t => (
                  <div key={t.id} className="px-5 py-2.5 border-t border-zinc-800">
                    <p className="text-xs font-mono text-zinc-300">{t.title}</p>
                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">{t.forum} · {t.date}</p>
                  </div>
                ))}
              </div>
            )}
          </Modal>
        );
      })()}

      {/* ── DEV TAG EDITOR ────────────────────────────────────────────────── */}
      {showDevTagEditor && devTagTarget && (
        <div className="fixed inset-0 bg-black/90 z-[500] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-sm my-4">
            <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
              <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Edit Tag — {devTagTarget.username}</span>
              <button onClick={() => setShowDevTagEditor(false)} className="text-zinc-600 font-mono text-sm">x</button>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Preview:</span>
                <RankTag
                  total={(devTagTarget.threadCount || 0) + (devTagTarget.replyCount || 0)}
                  bgColor={devTagBgColor}
                  textColor={devTagTextColor}
                  tagLabel={devTagLabel}
                  username={devTagTarget.username}
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">
                  Custom Tag Text <span className="text-zinc-700 normal-case">(leave blank for default rank)</span>
                </label>
                <input
                  type="text"
                  value={devTagLabel}
                  onChange={e => setDevTagLabel(e.target.value)}
                  placeholder="e.g. Admin, Mod, Legend..."
                  className="w-full bg-black border border-zinc-700 px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-600 placeholder-zinc-600"
                />
                {devTagLabel && (
                  <button onClick={() => setDevTagLabel('')} className="mt-1 text-[10px] font-mono text-zinc-600 hover:text-red-400 transition">
                    clear (revert to rank)
                  </button>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">Tag Background Colour</label>
                <div className="flex items-center gap-3 mb-2">
                  <input type="color" value={devTagBgColor} onChange={e => setDevTagBgColor(e.target.value)}
                    className="w-10 h-10 rounded border border-zinc-700 bg-transparent cursor-pointer flex-shrink-0" />
                  <input type="text" value={devTagBgColor} onChange={e => setDevTagBgColor(e.target.value)}
                    className="flex-1 bg-black border border-zinc-700 px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-600" placeholder="#3f3f46" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[...THREADMAXXER_COLORS, { name: 'Dark', value: '#27272a' }, { name: 'Black', value: '#000000' }, { name: 'Grey', value: '#3f3f46' }].map(c => (
                    <button key={c.value} onClick={() => setDevTagBgColor(c.value)}
                      className={`w-6 h-6 rounded-sm border-2 transition-all ${devTagBgColor === c.value ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value }} title={c.name} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">Tag Text Colour</label>
                <div className="flex items-center gap-3 mb-2">
                  <input type="color" value={devTagTextColor} onChange={e => setDevTagTextColor(e.target.value)}
                    className="w-10 h-10 rounded border border-zinc-700 bg-transparent cursor-pointer flex-shrink-0" />
                  <input type="text" value={devTagTextColor} onChange={e => setDevTagTextColor(e.target.value)}
                    className="flex-1 bg-black border border-zinc-700 px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-600" placeholder="#d4d4d8" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: 'White',   value: '#ffffff' }, { name: 'Black',   value: '#000000' },
                    { name: 'Zinc',    value: '#d4d4d8' }, { name: 'Emerald', value: '#10b981' },
                    { name: 'Sky',     value: '#0ea5e9' }, { name: 'Rose',    value: '#f43f5e' },
                    { name: 'Amber',   value: '#f59e0b' }, { name: 'Violet',  value: '#8b5cf6' },
                  ].map(c => (
                    <button key={c.value} onClick={() => setDevTagTextColor(c.value)}
                      className={`w-6 h-6 rounded-sm border-2 transition-all ${devTagTextColor === c.value ? 'border-emerald-400 scale-110' : 'border-zinc-700'}`}
                      style={{ backgroundColor: c.value }} title={c.name} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowDevTagEditor(false)} className={btnSecondary}>Cancel</button>
                <button onClick={saveDevTag} disabled={savingDevTag} className={btnPrimary}>
                  {savingDevTag ? 'Saving...' : 'Save Tag'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGO EDIT MODAL (dev only) ────────────────────────────────────── */}
      {editingLogo && isDeveloper && (
        <Modal onClose={() => setEditingLogo(false)} maxW="max-w-sm">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Logo — {currentThemeName} Theme</span>
            <button onClick={() => setEditingLogo(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-[10px] font-mono text-zinc-600 -mt-1">
              This logo only shows when the <b>{currentThemeName}</b> theme is active. Switch themes first to set a different logo for another theme.
            </p>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Image URL</label>
              <input value={logoUrlDraft.startsWith('data:') ? '' : logoUrlDraft}
                onChange={e => setLogoUrlDraft(e.target.value)}
                placeholder="https://example.com/logo.png" className={inputCls} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">or</span>
              <label className={btnSecondary + ' cursor-pointer text-[10px] py-1.5 px-3'}>
                Upload from Device
                <input type="file" accept="image/*,image/gif" className="hidden" onChange={handleLogoFileUpload} />
              </label>
              {logoUrlDraft.startsWith('data:') && (
                <span className="text-[10px] font-mono text-emerald-500">File loaded ✓</span>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">
                Height: {logoSizeDraft}px
              </label>
              <input type="range" min={16} max={80} value={logoSizeDraft}
                onChange={e => setLogoSizeDraft(Number(e.target.value))}
                className="w-full accent-emerald-500" />
            </div>
            {logoUrlDraft && (
              <div className="border border-zinc-800 p-3 flex items-center justify-center bg-black">
                <img src={logoUrlDraft} alt="preview" style={{ height: logoSizeDraft, width: 'auto' }} className="object-contain" />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditingLogo(false)} className={btnSecondary}>Cancel</button>
              {siteLogoUrl && (
                <button onClick={async () => {
                  await setDoc(doc(db, 'settings', 'logo'), { byTheme: { ...siteLogos, [currentThemeName]: { url: '', size: 32 } } }, { merge: true });
                  setEditingLogo(false);
                }} className="border border-red-800 text-red-400 text-xs font-mono px-4 py-2.5 hover:bg-red-900/20 transition-colors">
                  Remove
                </button>
              )}
              <button onClick={async () => {
                await setDoc(doc(db, 'settings', 'logo'), { byTheme: { ...siteLogos, [currentThemeName]: { url: logoUrlDraft, size: logoSizeDraft } } }, { merge: true });
                setEditingLogo(false);
              }} className={btnPrimary}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── STICKER REACTION PICKER ──────────────────────────────────────── */}
      {showReactionPicker && (
        <Modal onClose={() => setShowReactionPicker(null)} maxW="max-w-lg">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">React with a Sticker</span>
            <button onClick={() => setShowReactionPicker(null)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-4">
            {stickers.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 font-mono text-xs">No stickers in catalog yet.</div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {stickers.map(s => (
                  <button key={s.id}
                    onClick={() => toggleReaction(showReactionPicker, s.url)}
                    className={`flex flex-col items-center gap-1 p-2 border transition-colors ${
                      myReaction(showReactionPicker) === s.url
                        ? 'border-emerald-600 bg-emerald-950/30'
                        : 'border-zinc-800 hover:border-emerald-600'
                    }`}>
                    <img src={s.url} alt={s.name} className="w-14 h-14 object-contain" />
                    <span className="text-[9px] font-mono text-zinc-500 truncate w-full text-center">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── STICKER CATALOG PICKER ────────────────────────────────────────── */}
      {showStickerCatalog && (
        <Modal onClose={() => { setShowStickerCatalog(false); setStickerTarget(null); }} maxW="max-w-lg">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Pick a Sticker</span>
            <button onClick={() => { setShowStickerCatalog(false); setStickerTarget(null); }} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-4">
            {stickers.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 font-mono text-xs">No stickers available yet.</div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {stickers.map(s => (
                  <button key={s.id} onClick={() => insertSticker(s.url)}
                    className="flex flex-col items-center gap-1 p-2 border border-zinc-800 hover:border-emerald-600 transition-colors">
                    <img src={s.url} alt={s.name} className="w-14 h-14 object-contain" />
                    <span className="text-[9px] font-mono text-zinc-500 truncate w-full text-center">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── ADD STICKER MODAL (dev only) ──────────────────────────────────── */}
      {showAddSticker && isDeveloper && (
        <Modal onClose={() => setShowAddSticker(false)} maxW="max-w-sm">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Add Sticker</span>
            <button onClick={() => setShowAddSticker(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-5 space-y-3">
            {addingStickerError && <p className="text-red-400 text-xs font-mono border border-red-800 px-3 py-2">{addingStickerError}</p>}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Name</label>
              <input value={newStickerName} onChange={e => setNewStickerName(e.target.value)} placeholder="e.g. Pay Attention" className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Image URL</label>
              <input value={newStickerUrl.startsWith('data:') ? '' : newStickerUrl}
                onChange={e => setNewStickerUrl(e.target.value)} placeholder="https://..." className={inputCls} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">or</span>
              <label className={btnSecondary + ' cursor-pointer text-[10px] py-1.5 px-3'}>
                Upload from Device
                <input type="file" accept="image/*,image/gif" className="hidden" onChange={handleStickerFileUpload} />
              </label>
              {newStickerUrl.startsWith('data:') && (
                <span className="text-[10px] font-mono text-emerald-500">File loaded ✓</span>
              )}
            </div>
            {newStickerUrl && (
              <div className="border border-zinc-800 p-3 flex items-center justify-center bg-black">
                <img src={newStickerUrl} alt="preview" className="max-h-24 max-w-full object-contain" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddSticker(false)} className={btnSecondary}>Cancel</button>
              <button onClick={addSticker} className={btnPrimary}>Add Sticker</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── REQUEST STICKER MODAL ─────────────────────────────────────────── */}
      {showRequestSticker && isLoggedIn && (
        <Modal onClose={() => setShowRequestSticker(false)} maxW="max-w-sm">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Request a Public Sticker</span>
            <button onClick={() => setShowRequestSticker(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-[10px] font-mono text-zinc-500">Submit a sticker for the developer to review and add to the public catalog.</p>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Name</label>
              <input value={reqStickerName} onChange={e => setReqStickerName(e.target.value)} placeholder="Sticker name" className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Image URL</label>
              <input value={reqStickerUrl.startsWith('data:') ? '' : reqStickerUrl}
                onChange={e => setReqStickerUrl(e.target.value)} placeholder="https://..." className={inputCls} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">or</span>
              <label className={btnSecondary + ' cursor-pointer text-[10px] py-1.5 px-3'}>
                Upload from Device
                <input type="file" accept="image/*,image/gif" className="hidden" onChange={handleReqStickerFileUpload} />
              </label>
              {reqStickerUrl.startsWith('data:') && (
                <span className="text-[10px] font-mono text-emerald-500">File loaded ✓</span>
              )}
            </div>
            {reqStickerUrl && (
              <div className="border border-zinc-800 p-3 flex items-center justify-center bg-black">
                <img src={reqStickerUrl} alt="preview" className="max-h-24 max-w-full object-contain" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowRequestSticker(false)} className={btnSecondary}>Cancel</button>
              <button onClick={requestSticker} className={btnPrimary}>Submit Request</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── REVIEW QUEUE (dev only) ───────────────────────────────────────── */}
      {showReviewQueue && isDeveloper && (
        <Modal onClose={() => setShowReviewQueue(false)} maxW="max-w-lg">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">
              Sticker Requests ({stickerRequests.filter(r => r.status === 'pending').length} pending)
            </span>
            <button onClick={() => setShowReviewQueue(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="divide-y divide-zinc-800">
            {stickerRequests.length === 0 ? (
              <div className="text-center py-10 text-zinc-600 font-mono text-xs">No pending requests.</div>
            ) : stickerRequests.map(r => (
              <div key={r.id} className="flex items-center gap-4 p-4">
                <img src={r.url} alt={r.name} className="w-14 h-14 object-contain border border-zinc-800 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-zinc-200 font-bold">{r.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500 mt-0.5">by {r.requestedBy}</div>
                  <div className="text-[10px] font-mono text-zinc-700 truncate mt-0.5">{r.url}</div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button onClick={() => approveSticker(r)} className={btnPrimary + ' py-1.5 px-3 text-[10px]'}>Approve</button>
                  <button onClick={() => rejectSticker(r.id)} className="border border-red-800 text-red-400 text-[10px] font-mono px-3 py-1.5 hover:bg-red-900/20 transition-colors">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ── NEW FORUM TOPIC MODAL (dev only) ─────────────────────────────── */}
      {showNewTopicModal && isDeveloper && (
        <Modal onClose={() => setShowNewTopicModal(false)} maxW="max-w-sm">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Add Forum Topic</span>
            <button onClick={() => setShowNewTopicModal(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Section</label>
              <select value={newTopicSection} onChange={e => setNewTopicSection(e.target.value)}
                className={inputCls + ' cursor-pointer'}>
                <option value="">Select section...</option>
                {forumSections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Topic Name</label>
              <input value={newTopicName} onChange={e => setNewTopicName(e.target.value)}
                placeholder="e.g. Chess, Fitness, Art..." className={inputCls} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNewTopicModal(false)} className={btnSecondary}>Cancel</button>
              <button onClick={createForumTopic} disabled={addingTopic} className={btnPrimary}>
                {addingTopic ? 'Creating...' : 'Create Topic'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── EDIT ANNOUNCEMENT ─────────────────────────────────────────────── */}
      {editingAnnouncement && (
        <Modal onClose={() => setEditingAnnouncement(false)} maxW="max-w-lg">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Edit Homepage Announcement</span>
            <button onClick={() => setEditingAnnouncement(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Title</label>
              <input value={annDraft.title} onChange={e => setAnnDraft(p => ({ ...p, title: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Body</label>
              <textarea value={annDraft.description} onChange={e => setAnnDraft(p => ({ ...p, description: e.target.value }))} rows={6} className={`${inputCls} resize-none`} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingAnnouncement(false)} className={btnSecondary}>Cancel</button>
              <button onClick={async () => { await setDoc(doc(db, 'settings', 'announcement'), { title: annDraft.title, description: annDraft.description }); setEditingAnnouncement(false); }} className={btnPrimary}>
                Save Announcement
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── FOLLOWERS ─────────────────────────────────────────────────────── */}
      {showFollowers && (
        <div className="fixed inset-0 bg-black/80 z-[400] flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-xs max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
              <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Followers</span>
              <button onClick={() => setShowFollowers(false)} className="text-zinc-600 font-mono text-sm">x</button>
            </div>
            {profileFollowers.length === 0
              ? <p className="text-zinc-600 text-xs font-mono text-center py-8">No followers yet</p>
              : profileFollowers.map(f => (
                  <button key={f.uid} onClick={() => { setShowFollowers(false); openProfile(f.username); }}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-800 hover:bg-zinc-900 transition">
                    <Avatar username={f.username} size={28} />
                    <span className="text-xs font-mono text-zinc-300">{f.username}</span>
                  </button>
                ))
            }
          </div>
        </div>
      )}

      {/* ── FOLLOWING ─────────────────────────────────────────────────────── */}
      {showFollowing && (
        <div className="fixed inset-0 bg-black/80 z-[400] flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-xs max-h-[70vh] overflow-y-auto">
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
              <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Following</span>
              <button onClick={() => setShowFollowing(false)} className="text-zinc-600 font-mono text-sm">x</button>
            </div>
            {profileFollowing.length === 0
              ? <p className="text-zinc-600 text-xs font-mono text-center py-8">Not following anyone</p>
              : profileFollowing.map(f => (
                  <button key={f.uid} onClick={() => { setShowFollowing(false); openProfile(f.username); }}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-800 hover:bg-zinc-900 transition">
                    <Avatar username={f.username} size={28} />
                    <span className="text-xs font-mono text-zinc-300">{f.username}</span>
                  </button>
                ))
            }
          </div>
        </div>
      )}

      {/* ── EDIT PROFILE ──────────────────────────────────────────────────── */}
      {showEditProfile && (() => {
        const myTotal = (currentUserData?.threadCount || 0) + (currentUserData?.replyCount || 0);
        const isThreadmaxxer = getRank(myTotal).isThreadmaxxer;
        return (
          <div className="fixed inset-0 bg-black/90 z-[400] flex items-end sm:items-center justify-center">
            <div className="bg-zinc-950 border border-zinc-800 w-full sm:max-w-md">
              <div className="px-5 py-3 border-b border-zinc-800">
                <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Edit Profile</span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-4 mb-5">
                  <Avatar src={profileAvatar} username={currentUser} size={48} />
                  <label className={`${btnSecondary} cursor-pointer`}>
                    Change Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </label>
                  {profileAvatar && (
                    <button onClick={() => setProfileAvatar('')} className="text-red-500 text-xs font-mono">Remove</button>
                  )}
                </div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Bio</label>
                <textarea value={profileBio} onChange={e => setProfileBio(e.target.value)}
                  placeholder="Tell the community about yourself..." rows={4} className={`${inputCls} resize-none mb-4`} />
                {isThreadmaxxer && (
                  <div className="mb-4">
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-2">Threadmaxxer Tag Colour</label>
                    <div className="flex flex-wrap gap-2">
                      {THREADMAXXER_COLORS.map(c => (
                        <button key={c.value} onClick={() => setProfileTagColor(c.value)}
                          className={`w-7 h-7 rounded-sm border-2 transition-all ${profileTagColor === c.value ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c.value }} title={c.name} />
                      ))}
                    </div>
                    <div className="mt-2">
                      <span className="text-[10px] font-mono text-zinc-500">Preview: </span>
                      <RankTag total={200} color={profileTagColor || currentUserData?.tagColor} tagLabel={currentUserData?.tagLabel} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setShowEditProfile(false)} className={btnSecondary}>Cancel</button>
                  <button onClick={saveProfile} disabled={savingProfile} className={btnPrimary}>
                    {savingProfile ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── NEW THREAD ────────────────────────────────────────────────────── */}
      {showNewThreadModal && (
        <Modal onClose={() => setShowNewThreadModal(false)} maxW="max-w-2xl">
          <div className="px-5 py-3 border-b border-zinc-800">
            <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">New Thread</div>
            <div className="text-[10px] font-mono text-zinc-600 mt-0.5">{selectedForum ? `Posting in ${selectedForum.name}` : 'General feed'}</div>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Title *</label>
              <input value={newThreadTitle} onChange={e => setNewThreadTitle(e.target.value)} placeholder="Enter a clear title..." className={inputCls} />
            </div>
            {/* Tag */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">
                Tag <span className="text-zinc-700 normal-case tracking-normal">(optional — shown before title)</span>
              </label>
              <select
                value={newThreadTag}
                onChange={e => setNewThreadTag(e.target.value)}
                className={inputCls}>
                <option value="">No tag</option>
                {THREAD_TAGS.map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
              {newThreadTag.trim() && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-600">Preview:</span>
                  <span
                    className="inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: THREAD_TAG_COLOR[newThreadTag] || '#6366f1' }}>
                    {newThreadTag}
                  </span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-1.5">Body</label>
              <textarea value={newThreadDescription} onChange={e => setNewThreadDescription(e.target.value)} placeholder="Add details..." rows={5} className={`${inputCls} resize-none`} />
            </div>
            <label className="flex items-center gap-2 border border-dashed border-zinc-700 px-3 py-2.5 cursor-pointer hover:border-zinc-500 transition-colors">
              <span className="text-xs font-mono text-zinc-500">Attach images</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleThreadImages} />
            </label>
            {newThreadImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {newThreadImages.map((img, i) => (
                  <div key={i} className="relative">
                    <img src={img} alt="" className="h-14 w-14 object-cover border border-zinc-700" />
                    <button onClick={() => setNewThreadImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white w-4 h-4 text-xs flex items-center justify-center font-mono">x</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowNewThreadModal(false); setNewThreadTitle(''); setNewThreadDescription(''); setNewThreadImages([]); }} className={btnSecondary}>Cancel</button>
              <button onClick={createThread} disabled={postingThread} className={btnPrimary}>
                {postingThread ? 'Posting...' : 'Post Thread'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── LOGIN ─────────────────────────────────────────────────────────── */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/90 z-[400] flex items-end sm:items-center justify-center">
          <div className="bg-zinc-950 border border-zinc-800 w-full sm:max-w-sm">
            <div className="px-5 py-3 border-b border-zinc-800">
              <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Log In</span>
            </div>
            <div className="p-5 space-y-3">
              {loginError && <p className="text-red-400 text-xs font-mono border border-red-800 px-3 py-2">{loginError}</p>}
              <input type="email" placeholder="Email" value={loginData.email}
                onChange={e => setLoginData({ ...loginData, email: e.target.value })} className={inputCls} />
              <input type="password" placeholder="Password" value={loginData.password}
                onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && login()} className={inputCls} />
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowLogin(false); setLoginError(''); }} className={btnSecondary}>Cancel</button>
                <button onClick={login} disabled={loginLoading} className={btnPrimary}>
                  {loginLoading ? 'Logging in...' : 'Log In'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REGISTER ──────────────────────────────────────────────────────── */}
      {showRegister && (
        <div className="fixed inset-0 bg-black/90 z-[400] flex items-end sm:items-center justify-center">
          <div className="bg-zinc-950 border border-zinc-800 w-full sm:max-w-sm">
            <div className="px-5 py-3 border-b border-zinc-800">
              <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Create Account</span>
            </div>
            <div className="p-5 space-y-3">
              {registerError && <p className="text-red-400 text-xs font-mono border border-red-800 px-3 py-2">{registerError}</p>}
              <input type="text" placeholder="Username (min 3 chars)" value={registerData.username}
                onChange={e => setRegisterData({ ...registerData, username: e.target.value })} className={inputCls} />
              <input type="email" placeholder="Email" value={registerData.email}
                onChange={e => setRegisterData({ ...registerData, email: e.target.value })} className={inputCls} />
              <input type="password" placeholder="Password (min 6 chars)" value={registerData.password}
                onChange={e => setRegisterData({ ...registerData, password: e.target.value })} className={inputCls} />
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowRegister(false); setRegisterError(''); }} className={btnSecondary}>Cancel</button>
                <button onClick={register} disabled={registerLoading} className={btnPrimary}>
                  {registerLoading ? 'Creating...' : 'Register'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI MODAL ──────────────────────────────────────────────────────── */}
      {showRateModal && (
        <Modal onClose={() => setShowRateModal(false)} maxW="max-w-2xl">
          <div className="px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">AI Face Analysis</span>
            <button onClick={() => { setShowRateModal(false); setAiRating(null); }} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-5">
            <div className="flex gap-2 mb-5">
              <button onClick={() => setRatingMode('ai')} className={ratingMode === 'ai' ? btnPrimary : btnSecondary}>AI Analysis</button>
              <button onClick={() => setRatingMode('community')} className={ratingMode === 'community' ? btnPrimary : btnSecondary}>Community</button>
            </div>
            {ratingMode === 'ai' && (
              <div className="space-y-4">
                <div className="border border-dashed border-zinc-700 p-6 text-center">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="face" />
                  <label htmlFor="face" className="cursor-pointer block">
                    {imagePreview
                      ? <img src={imagePreview} className="max-h-56 mx-auto" alt="preview" />
                      : <div className="py-8 text-zinc-600 text-xs font-mono">Click to upload a photo</div>
                    }
                  </label>
                </div>
                <textarea value={faceDescription} onChange={e => setFaceDescription(e.target.value)}
                  placeholder="Age, height, other details..." className={`${inputCls} resize-none h-20`} />
                <button onClick={analyzeFace} disabled={isAnalyzing} className={btnPrimary + ' w-full'}>
                  {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                </button>
                {aiRating && (
                  <div className="border border-zinc-700 p-4 bg-black">
                    <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-xs font-mono">{aiRating.raw}</p>
                  </div>
                )}
                {aiRating && isLoggedIn && (
                  <button onClick={postAiRating} className={btnSecondary + ' w-full'}>Post to Rate Me Forum</button>
                )}
              </div>
            )}
            {ratingMode === 'community' && (
              <div className="text-center py-10 text-zinc-600 text-xs font-mono">
                Post your photo in the Rate Me forum for community feedback.
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── THEME PICKER ──────────────────────────────────────────────────── */}
      {showThemePicker && (
        <div className="fixed bottom-14 left-4 sm:bottom-16 sm:left-4 bg-zinc-950 border border-zinc-800 p-4 z-50">
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-3">Theme</p>
          <div className="grid grid-cols-3 gap-2">
            {themes.map((t) => (
              <button key={t.name} onClick={() => { setActiveBg(t.bg); setShowThemePicker(false); }}
                className={`flex flex-col items-center gap-1 p-2 hover:bg-zinc-800 transition-colors ${activeBg === t.bg ? 'ring-1 ring-emerald-500' : ''}`}>
                <div className="w-6 h-6 border border-zinc-700" style={{ backgroundColor: t.bg }} />
                <span className="text-[9px] font-mono text-zinc-500">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV — icon + label, snap-scrollable so all tabs stay reachable and easy to tap */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 sm:hidden z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as any}>
          {[
            { label: 'Home',     view: 'home',       icon: <path d="M4 11.5l8-7 8 7M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9" /> },
            { label: 'Forums',   view: 'forums',      icon: <><rect x="4" y="4.5" width="7" height="7" rx="1" /><rect x="13" y="4.5" width="7" height="7" rx="1" /><rect x="4" y="13.5" width="7" height="7" rx="1" /><rect x="13" y="13.5" width="7" height="7" rx="1" /></> },
            { label: 'DMs',      view: 'dms',         icon: <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v8a1.5 1.5 0 01-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 014 13.5v-8z" /> },
            { label: 'Members',  view: 'members',     icon: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M15.5 6.5a3 3 0 010 5.8" /><path d="M16.5 14.2c2.3.4 3.8 2.2 3.8 4.8" /></> },
            { label: 'Stickers', view: 'stickers',    icon: <><circle cx="12" cy="12" r="8" /><path d="M9.5 10.2h.01M14.5 10.2h.01" /><path d="M8.5 14a4 4 0 007 0" /></> },
            { label: 'Analysis', view: '__ai__',      icon: <><circle cx="12" cy="12" r="7.5" /><path d="M12 8v4l2.5 2.5" /></> },
            { label: 'About',    view: 'about',       icon: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5.5M12 8v.01" /></> },
            { label: 'Theme',    view: '__theme__',   icon: <><circle cx="12" cy="12" r="8" /><circle cx="9" cy="10" r="1" /><circle cx="13.5" cy="8.5" r="1" /><circle cx="16" cy="12.5" r="1" /><path d="M12 4a8 8 0 000 16c1 0 1.5-.5 1.5-1.3 0-.5-.3-.8-.3-1.3 0-.7.5-1.2 1.2-1.2h1.4A3.2 3.2 0 0019 13.7C19 8 16 4 12 4z" /></> },
            ...(isDeveloper ? [{ label: 'Trash', view: 'trash', icon: <><path d="M4.5 7h15" /><path d="M9 7V4.5a1 1 0 011-1h4a1 1 0 011 1V7" /><path d="M6.5 7l1 12.5a1.5 1.5 0 001.5 1.4h6a1.5 1.5 0 001.5-1.4L17.5 7" /></> }] : []),
          ].map(({ label, view, icon }) => {
            const active = currentView === view;
            return (
              <button
                key={view}
                onClick={() => {
                  if (view === '__theme__') { setShowThemePicker(v => !v); return; }
                  if (view === '__ai__') { setShowRateModal(true); return; }
                  setCurrentView(view as View);
                  if (view !== 'forums') setSelectedForum(null);
                  setViewingThread(null);
                }}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-shrink-0 snap-start flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[58px] px-3 transition-colors ${
                  active ? 'text-emerald-400' : 'text-zinc-500 active:text-zinc-300'
                }`}>
                {active && <span className="absolute top-0 left-3 right-3 h-0.5 bg-emerald-400" />}
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {icon}
                </svg>
                <span className="text-[9px] font-mono uppercase tracking-wider whitespace-nowrap">
                  {label}
                  {view === 'dms' && dmUnread > 0 && <span className="ml-1 text-emerald-400">({dmUnread})</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={() => setShowThemePicker(v => !v)}
        className="hidden sm:block fixed bottom-6 left-4 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-400 text-xs font-mono uppercase tracking-wider px-3 py-2 z-50 transition-colors">
        Theme
      </button>
    </div>
  );
}

// useSearchParams() (used above for shareable thread/forum URLs) requires a
// Suspense boundary in Next.js App Router, so the actual page export just
// wraps the real component.
export default function AscendMaxx() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="text-emerald-500 text-lg font-mono tracking-widest">ASCENDMAXX</div>
      </div>
    }>
      <AscendMaxxApp />
    </Suspense>
  );
}
