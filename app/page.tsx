'use client';

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
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

const DEVELOPER_EMAIL = 'ascendmaxxforum@gmail.com';
const DEVELOPER_USERNAME = 'ascendmaxx';

const allForums = [
  { id: 1,  section: 'Important',    name: 'Rules' },
  { id: 2,  section: 'Important',    name: 'Announcements' },
  { id: 3,  section: 'Off topic',    name: 'Lounge' },
  { id: 4,  section: 'Off topic',    name: 'Music' },
  { id: 5,  section: 'Off topic',    name: 'Media' },
  { id: 6,  section: 'Looksmaxxing', name: 'Rate Me' },
  { id: 7,  section: 'Looksmaxxing', name: 'Looksmaxxing' },
  { id: 8,  section: 'Biohacking',   name: 'Cognitive improvement' },
  { id: 9,  section: 'Moneymaxxing', name: 'Moneymaxxing' },
  { id: 10, section: 'Larpmaxxing',  name: 'Larpmaxxing' },
];

const forumSections = ['Important','Off topic','Looksmaxxing','Biohacking','Moneymaxxing','Larpmaxxing'];

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

// ── Simple two-tier rank: GREY by default, BLUE once a member has 10+
// threads+replies combined. No more GREY+/GREY++/GREY+++/THREADMAXXER tiers.
function getRank(total: number): { label: string; isThreadmaxxer: boolean } {
  if (total >= 10) return { label: 'BLUE', isThreadmaxxer: false };
  return { label: 'GREY', isThreadmaxxer: false };
}

// ── RankTag: default GREY/BLUE background by rank, still overridable by
// admin-assigned custom tag (tagLabel/bgColor/textColor) or the ADMIN default.
function RankTag({ total, color, bgColor, textColor, tagLabel, username }: {
  total: number; color?: string; bgColor?: string; textColor?: string; tagLabel?: string; username?: string;
}) {
  const { label } = getRank(total);

  // Developer account always defaults to ADMIN if no custom tagLabel set
  const isDev = username === DEVELOPER_USERNAME;
  const displayLabel = tagLabel || (isDev ? 'ADMIN' : label);

  // Dev / custom-tagged members get special styling
  const isCustom = !!(tagLabel || bgColor || textColor) || isDev;

  const defaultDevBg   = '#ef4444'; // red for admin
  const defaultDevText = '#ffffff';
  const blueBg  = '#3b82f6';
  const blueText = '#0a0a0a';
  const greyBg  = '#3f3f46';
  const greyText = '#d4d4d8';

  if (isCustom) {
    return (
      <span
        className="inline-block px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest rounded-sm"
        style={{
          backgroundColor: bgColor || (isDev && !tagLabel ? defaultDevBg : color || blueBg),
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
      style={{ backgroundColor: isBlue ? blueBg : greyBg, color: isBlue ? blueText : greyText }}>
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

export default function AscendMaxx() {
  type View = 'home' | 'forums' | 'about' | 'dms' | 'members' | 'stickers';

  const [currentView, setCurrentView]     = useState<View>('home');
  const [selectedForum, setSelectedForum] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen]     = useState(false);

  // ── Site-wide UI theme (admin-selectable, applies to every visitor) ────────
  type SiteTheme = 'current' | 'looksmax-dark';
  const [siteTheme, setSiteTheme]         = useState<SiteTheme>('current');
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  const [aboutText, setAboutText]   = useState('AscendMaxx is a self-improvement community focused on looksmaxxing, cognitive enhancement, and total life ascension.');
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');

  const [isLoggedIn, setIsLoggedIn]           = useState(false);
  const [currentUser, setCurrentUser]         = useState('');
  const [currentUid, setCurrentUid]           = useState('');
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [isDeveloper, setIsDeveloper]         = useState(false);
  const [authLoading, setAuthLoading]         = useState(true);

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
  const [activeBg, setActiveBg]               = useState('#0d0d0d');
  const themes = [
    { name: 'Default',  bg: '#0d0d0d' }, { name: 'Midnight', bg: '#0d1117' },
    { name: 'Navy',     bg: '#0a0f1e' }, { name: 'Forest',   bg: '#0a130d' },
    { name: 'Crimson',  bg: '#130a0a' }, { name: 'Purple',   bg: '#0f0a1a' },
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
  const [siteLogoUrl, setSiteLogoUrl]   = useState('');
  const [siteLogoSize, setSiteLogoSize] = useState(32); // height in px
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

  // ── Site theme (realtime, so a switch by the admin applies to everyone) ───
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'theme'), (snap) => {
      if (snap.exists() && snap.data()?.theme) setSiteTheme(snap.data().theme as SiteTheme);
    });
    return () => unsub();
  }, []);

  const changeSiteTheme = async (t: SiteTheme) => {
    setSiteTheme(t);
    setShowThemeMenu(false);
    try { await setDoc(doc(db, 'settings', 'theme'), { theme: t }); } catch { alert('Failed to save theme.'); }
  };

  const siteAnnouncement = {
    id: 'ann-1', forum: 'Announcements', forumId: 2,
    title: defaultAnnouncement?.title ?? 'Welcome to AscendMaxx — Rules & Community Guidelines',
    description: defaultAnnouncement?.description ?? 'Welcome to AscendMaxx. Please read the community rules before posting. Be respectful, stay on topic, and help each other ascend. Toxic behaviour, doxxing, or harassment will result in an immediate ban.',
    author: DEVELOPER_USERNAME, date: 'June 9, 2026', pinned: true, images: [] as string[], authorAvatar: '',
  };
  // Announcement lives in settings/announcement rather than the `threads`
  // collection, so it needs its own soft-delete flag instead of deleteThread.
  const isAnnouncementDeleted = !!defaultAnnouncement?.hidden;

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
          snap.docs.filter(d => d.data().username === DEVELOPER_USERNAME)
            .map(d => ({ uid: d.id, ...d.data() }))
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

  // ── Site logo (from Firestore settings) ──────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'logo'), (snap) => {
      if (snap.exists()) {
        setSiteLogoUrl(snap.data().url || '');
        setSiteLogoSize(snap.data().size || 32);
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
    setPostingThread(true);
    try {
      await addDoc(collection(db, 'threads'), {
        title: newThreadTitle, description: newThreadDescription,
        forum: selectedForum?.name ?? 'Lounge', forumId: selectedForum?.id ?? 3,
        author: currentUser, authorUid: currentUid,
        authorAvatar: currentUserData?.avatar || '',
        images: newThreadImages, replies: 0, views: 1,
        tag: newThreadTag.trim() || null,
        tagColor: newThreadTag.trim() ? newThreadTagColor : null,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', currentUid), { threadCount: increment(1) });
      setShowNewThreadModal(false);
      setNewThreadTitle(''); setNewThreadDescription(''); setNewThreadImages([]);
      setNewThreadTag(''); setNewThreadTagColor('#6366f1');
    } catch { alert('Failed to post. Try again.'); }
    setPostingThread(false);
  };

  const handleThreadImages = (e: any) => {
    Array.from(e.target.files as File[]).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setNewThreadImages((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const deleteThread = async (threadId: string) => {
    if (!confirm('Delete this thread?')) return;
    try {
      // Find the thread to get the authorUid before deleting
      const thread = threads.find(t => t.id === threadId);
      await deleteDoc(doc(db, 'threads', threadId));
      // Decrement the author's threadCount so sidebar stays accurate
      if (thread?.authorUid) {
        await updateDoc(doc(db, 'users', thread.authorUid), {
          threadCount: increment(-1),
        });
      }
    } catch { alert('Failed to delete.'); }
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
    setPostingReply(true);
    const threadId = viewingThread.id;
    try {
      await addDoc(collection(db, 'replies', threadId, 'comments'), {
        text: replyText.trim(), author: currentUser, authorUid: currentUid,
        authorAvatar: currentUserData?.avatar || '', createdAt: serverTimestamp(),
      });
      if (threadId !== 'ann-1') await updateDoc(doc(db, 'threads', threadId), { replies: increment(1) });
      // CHANGE 4: increment replyCount so the message counter works
      await updateDoc(doc(db, 'users', currentUid), { replyCount: increment(1) });
      setReplyText('');
    } catch { alert('Failed to post reply.'); }
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
  const renderWithStickers = (text: string) => {
    const parts = text.split(/(\[sticker:[^\]]+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[sticker:(.+)\]$/);
      if (match) {
        return <img key={i} src={match[1]} alt="sticker" className="max-h-24 max-w-[150px] object-contain inline-block my-1" />;
      }
      return <span key={i}>{part}</span>;
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
      await updateDoc(doc(db, 'users', currentUid), updates);
      setCurrentUserData((prev: any) => ({ ...prev, bio: profileBio, avatar: profileAvatar }));
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
                  {!isAnnouncement && isDeveloper && (
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
  }, [pinnedIds, isDeveloper, openProfile, authorAvatarCache]);

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

        {isLoggedIn ? (
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
  }, [viewingThread, threadReplies, threadUserCache, isLoggedIn, replyText, postingReply, pinnedIds, isDeveloper, openProfile, repGivenMap, currentUid, giveRep, renderWithStickers, stickerTarget, ReactionBar, reactionsMap]);

  // ── StatsPanel ────────────────────────────────────────────────────────────
  const StatsPanel = useCallback(() => {
    const devMember = staffMembers[0];
    const devOnline = devMember ? presenceMap[devMember.uid] : false;
    return (
      <div className="p-4 space-y-5">
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
        {devMember && (
          <div className="border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3">Staff</div>
            <button onClick={() => openProfile(devMember.username)} className="w-full flex items-center gap-3 hover:opacity-80 transition">
              <div className="relative flex-shrink-0">
                <Avatar src={devMember.avatar} username={devMember.username} size={38} />
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${devOnline ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs font-mono text-zinc-100 font-bold truncate">{devMember.username}</div>
                <div className="text-[10px] font-mono text-emerald-500 mt-0.5">Administrator</div>
                <div className={`text-[10px] font-mono mt-0.5 ${devOnline ? 'text-emerald-400' : 'text-zinc-600'}`}>
                  {devOnline ? '● online' : '○ offline'}
                </div>
              </div>
            </button>
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
  }, [staffMembers, presenceMap, totalUsers, onlineCount, threads.length, latestUser, openProfile]);

  // ── SidebarContent ────────────────────────────────────────────────────────
  const SidebarContent = useCallback(() => (
    <div>
      <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600 border-b border-zinc-800">Forums</div>
      {forumSections.map(section => {
        const sectionForums = [
          ...allForums.filter(f => f.section === section),
          ...customForums.filter(f => f.section === section),
        ];
        return (
          <div key={section}>
            <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-600 bg-zinc-900/50">{section}</div>
            {sectionForums.map(f => (
              <div key={f.id ?? f.firestoreId}
                onClick={() => { setSelectedForum(f); setCurrentView('forums'); setSidebarOpen(false); setViewingThread(null); }}
                className={`px-4 py-2 text-sm cursor-pointer hover:bg-zinc-800 border-b border-zinc-800/50 transition-colors ${selectedForum?.id === f.id ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-300'}`}>
                {f.name}
              </div>
            ))}
          </div>
        );
      })}
      <div className="lg:hidden border-t border-zinc-800 mt-2">{StatsPanel()}</div>
    </div>
  ), [selectedForum, StatsPanel, customForums]);

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

  // ── Looksmax Dark theme (looksmax.org-style layout, site's black/green palette) ──
  const LK = {
    page: '#0a0a0a', nav: '#000000', card: '#111113',
    border: '#27272a', text: '#e4e4e7', muted: '#71717a', link: '#34d399', accent: '#10b981',
  };

  const LooksmaxDarkTheme = () => {
    const LKPostRow = ({ userData, authorName, authorAvatar, authorUid, date, text, images, postNum }: any) => {
      const total = (userData?.threadCount || 0) + (userData?.replyCount || 0);
      const repCount = userData?.rep || 0;
      return (
        <div className="flex border-b" style={{ borderColor: LK.border }}>
          <div className="w-32 sm:w-40 flex-shrink-0 border-r p-3 flex flex-col items-center text-center" style={{ borderColor: LK.border, backgroundColor: '#0d0d0f' }}>
            <button onClick={() => openProfile(authorName)} className="hover:opacity-80 transition mb-1.5">
              <Avatar src={userData?.avatar || authorAvatar} username={authorName} size={56} />
            </button>
            <button onClick={() => openProfile(authorName)}
              className="text-xs font-mono font-bold hover:underline truncate w-full text-center mb-1" style={{ color: LK.link }}>
              {authorName}
            </button>
            <RankTag total={total} color={userData?.tagColor} bgColor={userData?.tagBgColor} textColor={userData?.tagTextColor} tagLabel={userData?.tagLabel} username={authorName} />
            <div className="mt-1.5 text-lg font-mono font-bold" style={{ color: LK.accent }}>{repCount}</div>
            <div className="w-full mt-1.5 border-t pt-1.5 space-y-0.5" style={{ borderColor: LK.border }}>
              <div className="flex justify-between text-[10px] font-mono" style={{ color: LK.muted }}>
                <span>Joined:</span><span style={{ color: LK.text }}>{userData?.joinedDate || '—'}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono" style={{ color: LK.muted }}>
                <span>Posts:</span><span style={{ color: LK.text }}>{total}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono" style={{ color: LK.muted }}>
                <span>Reputation:</span><span style={{ color: LK.text }}>{repCount}</span>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0" style={{ backgroundColor: LK.card }}>
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: LK.border }}>
              <span className="text-[11px] font-mono" style={{ color: LK.muted }}>{date}</span>
              <div className="flex items-center gap-3">
                <ReactionBar targetId={postNum === 1 ? viewingThread?.id || '' : threadReplies[postNum - 2]?.id || ''} />
                <span className="text-[11px] font-mono" style={{ color: LK.muted }}>#{postNum}</span>
              </div>
            </div>
            <div className="px-4 py-4">
              <div className="text-sm font-mono leading-relaxed whitespace-pre-wrap" style={{ color: LK.text }}>{renderWithStickers(text)}</div>
              {images && images.length > 0 && (
                <div className="flex gap-3 mt-4 flex-wrap">
                  {images.map((img: string, i: number) => (
                    <img key={i} src={img} alt="" className="max-h-72 max-w-full object-contain border" style={{ borderColor: LK.border }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    const LKForumRow = ({ forum }: { forum: any }) => {
      const forumThreads = threads.filter((t: any) => t.forumId === forum.id);
      const latestThread = forumThreads[0] || null;
      const threadCount = forumThreads.length;
      const replyCount = forumThreads.reduce((s: number, t: any) => s + (t.replies || 0), 0);
      return (
        <div onClick={() => { setSelectedForum(forum); setCurrentView('forums'); setViewingThread(null); }}
          className="flex items-center gap-3 px-4 py-3 border-b hover:bg-[#151517] cursor-pointer transition-colors"
          style={{ borderColor: LK.border, backgroundColor: LK.card }}>
          <div className="w-9 h-9 flex-shrink-0 rounded-sm flex items-center justify-center font-mono font-bold text-xs border" style={{ borderColor: LK.accent, color: LK.accent }}>
            {forum.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono font-semibold hover:underline" style={{ color: LK.link }}>{forum.name}</div>
          </div>
          <div className="hidden sm:block text-[11px] font-mono text-center w-16 flex-shrink-0" style={{ color: LK.muted }}>
            <div className="font-semibold text-sm" style={{ color: LK.text }}>{threadCount}</div>
            Threads
          </div>
          <div className="hidden sm:block text-[11px] font-mono text-center w-16 flex-shrink-0" style={{ color: LK.muted }}>
            <div className="font-semibold text-sm" style={{ color: LK.text }}>{replyCount}</div>
            Messages
          </div>
          <div className="hidden md:flex items-center gap-2 w-56 flex-shrink-0 text-[11px] font-mono min-w-0">
            {latestThread ? (
              <>
                <Avatar src={authorAvatarCache[latestThread.authorUid] || latestThread.authorAvatar} username={latestThread.author} size={26} />
                <div className="min-w-0">
                  <div className="truncate" style={{ color: LK.text }}>{latestThread.title}</div>
                  <div style={{ color: LK.muted }}>{latestThread.date} · <span style={{ color: LK.link }}>{latestThread.author}</span></div>
                </div>
              </>
            ) : <span style={{ color: LK.muted }}>No threads yet</span>}
          </div>
        </div>
      );
    };

    const LKThreadRow = ({ t }: { t: any }) => (
      <div onClick={() => setViewingThread(t)}
        className="flex items-center gap-3 px-4 py-3 border-b hover:bg-[#151517] cursor-pointer transition-colors"
        style={{ borderColor: LK.border, backgroundColor: LK.card }}>
        <Avatar src={authorAvatarCache[t.authorUid] || t.authorAvatar} username={t.author} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {t.tag && (
              <span className="inline-block px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide text-black flex-shrink-0"
                style={{ backgroundColor: t.tagColor || LK.accent }}>{t.tag}</span>
            )}
            <span className="text-sm font-mono font-semibold hover:underline truncate" style={{ color: LK.link }}>{t.title}</span>
          </div>
          <div className="text-[11px] font-mono mt-0.5" style={{ color: LK.muted }}>
            {t.author} · {t.date}
          </div>
        </div>
        <div className="hidden sm:block text-center text-[11px] font-mono w-14 flex-shrink-0" style={{ color: LK.muted }}>
          <div className="font-semibold text-sm" style={{ color: LK.text }}>{t.replies || 0}</div>
          Replies
        </div>
      </div>
    );

    const LKSidebarCard = ({ title, children }: { title: string; children: any }) => (
      <div className="mb-4 border" style={{ borderColor: LK.border, backgroundColor: LK.card }}>
        <div className="px-3 py-2 text-xs font-mono font-bold uppercase tracking-widest border-b-2" style={{ color: LK.accent, borderColor: LK.accent, backgroundColor: LK.nav }}>{title}</div>
        <div className="p-3">{children}</div>
      </div>
    );

    const recentThreads = [...threads].slice(0, 6);
    const totalMessages = threads.reduce((s: number, t: any) => s + (t.replies || 0) + 1, 0);

    return (
      <div className="min-h-screen font-mono" style={{ backgroundColor: LK.page }}>
        {/* Nav */}
        <nav style={{ backgroundColor: LK.nav, borderBottom: `2px solid ${LK.accent}` }} className="sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
            <div className="flex items-center gap-5 min-w-0">
              <div className="cursor-pointer flex-shrink-0"
                onClick={() => { setCurrentView('home'); setSelectedForum(null); setViewingThread(null); }}>
                {siteLogoUrl ? (
                  <img src={siteLogoUrl} alt="Logo" style={{ height: 24, width: 'auto' }} className="object-contain" />
                ) : (
                  <span className="font-bold tracking-widest text-sm" style={{ color: LK.accent }}>ASCENDMAXX</span>
                )}
              </div>
              <div className="hidden sm:flex items-center gap-4 text-xs font-semibold" style={{ color: LK.muted }}>
                <button onClick={() => { setCurrentView('home'); setSelectedForum(null); setViewingThread(null); }} className="hover:text-white transition-colors">Home</button>
                <button onClick={() => { setCurrentView('forums'); setSelectedForum(null); setViewingThread(null); }} className="hover:text-white transition-colors">Forums</button>
                <button onClick={() => { setCurrentView('members'); setViewingThread(null); }} className="hover:text-white transition-colors">Members</button>
                <button onClick={() => { setCurrentView('about'); setViewingThread(null); }} className="hover:text-white transition-colors">About</button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isDeveloper && (
                <div className="relative hidden sm:block">
                  <button onClick={() => setShowThemeMenu(v => !v)}
                    className="text-[10px] hover:text-white border px-1.5 py-0.5" style={{ color: LK.muted, borderColor: LK.border }}>
                    theme ▾
                  </button>
                  {showThemeMenu && (
                    <div className="absolute top-full right-0 mt-1 border z-[100] w-44" style={{ backgroundColor: LK.card, borderColor: LK.border }}>
                      {([
                        { id: 'current', label: 'Current' },
                        { id: 'looksmax-dark', label: 'Looksmax (dark)' },
                      ] as { id: SiteTheme; label: string }[]).map(opt => (
                        <button key={opt.id} onClick={() => changeSiteTheme(opt.id)}
                          className="block w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-[#1c1c1f]"
                          style={{ color: siteTheme === opt.id ? LK.accent : LK.text }}>
                          {siteTheme === opt.id ? '● ' : ''}{opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!isLoggedIn ? (
                <>
                  <button onClick={() => setShowLogin(true)} className="text-xs px-2 py-1" style={{ color: LK.muted }}>Log in</button>
                  <button onClick={() => setShowRegister(true)} className="text-xs font-bold px-3 py-1.5 rounded-sm text-black" style={{ backgroundColor: LK.accent }}>Register</button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => openProfile(currentUser)} className="flex items-center gap-1.5">
                    <Avatar src={currentUserData?.avatar} username={currentUser} size={22} />
                    <span className="text-xs hidden sm:block" style={{ color: LK.text }}>{currentUser}</span>
                  </button>
                  <button onClick={logout} className="text-xs hover:text-white" style={{ color: LK.muted }}>logout</button>
                </div>
              )}
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto p-4 flex gap-4 items-start flex-wrap lg:flex-nowrap">
          {/* Main column */}
          <div className="flex-1 min-w-0 w-full">
            {!viewingThread && currentView === 'home' && (
              <>
                {!isAnnouncementDeleted && (
                  <div className="mb-4 border" style={{ borderColor: LK.border, backgroundColor: LK.card }}>
                    <div className="px-3 py-2 text-xs font-bold uppercase tracking-widest border-b-2 flex items-center justify-between" style={{ color: LK.accent, borderColor: LK.accent, backgroundColor: LK.nav }}>
                      <span>Important</span>
                      {isDeveloper && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setAnnDraft({ title: siteAnnouncement.title, description: siteAnnouncement.description }); setEditingAnnouncement(true); }} className="hover:text-white text-[10px]" style={{ color: LK.muted }}>edit</button>
                          <button onClick={deleteAnnouncement} className="hover:text-white text-[10px]" style={{ color: LK.muted }}>del</button>
                        </div>
                      )}
                    </div>
                    <div onClick={() => setViewingThread(siteAnnouncement)} className="px-4 py-3 cursor-pointer hover:bg-[#151517]">
                      <div className="text-sm font-semibold" style={{ color: LK.link }}>{siteAnnouncement.title}</div>
                      <div className="text-[11px] mt-1" style={{ color: LK.muted }}>{siteAnnouncement.author} · {siteAnnouncement.date}</div>
                    </div>
                  </div>
                )}
                {forumSections.map(section => {
                  const sectionForums = [
                    ...allForums.filter(f => f.section === section),
                    ...customForums.filter(f => f.section === section),
                  ];
                  if (sectionForums.length === 0) return null;
                  return (
                    <div key={section} className="mb-4 border" style={{ borderColor: LK.border }}>
                      <div className="px-3 py-2 text-xs font-bold uppercase tracking-widest border-b-2" style={{ color: LK.accent, borderColor: LK.accent, backgroundColor: LK.nav }}>{section}</div>
                      {sectionForums.map(forum => <LKForumRow key={forum.id} forum={forum} />)}
                    </div>
                  );
                })}
              </>
            )}

            {!viewingThread && currentView === 'forums' && !selectedForum && (
              <div className="border" style={{ borderColor: LK.border }}>
                <div className="px-3 py-2 text-xs font-bold uppercase tracking-widest border-b-2" style={{ color: LK.accent, borderColor: LK.accent, backgroundColor: LK.nav }}>Forums</div>
                {[...allForums, ...customForums].map(forum => <LKForumRow key={forum.id} forum={forum} />)}
              </div>
            )}

            {!viewingThread && currentView === 'forums' && selectedForum && (
              <div className="border" style={{ borderColor: LK.border }}>
                <div className="px-3 py-2 flex items-center justify-between border-b-2" style={{ backgroundColor: LK.nav, borderColor: LK.accent }}>
                  <div>
                    <button onClick={() => setSelectedForum(null)} className="text-[10px] hover:text-white block" style={{ color: LK.muted }}>← Forums</button>
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: LK.accent }}>{selectedForum.name}</span>
                  </div>
                  {isLoggedIn && (selectedForum.id !== 2 || isDeveloper) && (
                    <button onClick={() => setShowNewThreadModal(true)} className="text-xs font-bold px-3 py-1.5 rounded-sm text-black" style={{ backgroundColor: LK.accent }}>+ New Thread</button>
                  )}
                </div>
                {threadsLoading ? (
                  <div className="text-center py-16 text-sm" style={{ color: LK.muted }}>Loading...</div>
                ) : visibleThreads.length === 0 ? (
                  <div className="text-center py-16 text-sm" style={{ color: LK.muted }}>No threads yet.</div>
                ) : visibleThreads.map((t: any) => <LKThreadRow key={t.id} t={t} />)}
              </div>
            )}

            {viewingThread && (() => {
              const isAnn = viewingThread.id === 'ann-1';
              const opUserData = threadUserCache[viewingThread.authorUid || ''] || null;
              return (
                <div className="border" style={{ borderColor: LK.border }}>
                  <div className="px-4 py-3 border-b-2" style={{ backgroundColor: LK.nav, borderColor: LK.accent }}>
                    <button onClick={() => setViewingThread(null)} className="text-[10px] hover:text-white uppercase tracking-widest mb-1 block" style={{ color: LK.muted }}>← Back</button>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-bold text-base leading-snug" style={{ color: LK.text }}>{viewingThread.title}</h2>
                      <div className="flex gap-2 flex-shrink-0">
                        {isDeveloper && !isAnn && (
                          <button onClick={() => togglePin(viewingThread.id)} className="text-[10px] hover:text-white uppercase tracking-widest" style={{ color: LK.muted }}>
                            {pinnedIds.includes(viewingThread.id) ? 'Unpin' : 'Pin'}
                          </button>
                        )}
                        {isDeveloper && isAnn && (
                          <>
                            <button onClick={() => { setAnnDraft({ title: viewingThread.title, description: viewingThread.description }); setEditingAnnouncement(true); setViewingThread(null); }} className="text-[10px] hover:text-white uppercase tracking-widest" style={{ color: LK.muted }}>Edit</button>
                            <button onClick={deleteAnnouncement} className="text-[10px] hover:text-white uppercase tracking-widest" style={{ color: LK.muted }}>Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <LKPostRow userData={opUserData} authorName={viewingThread.author} authorAvatar={viewingThread.authorAvatar}
                    authorUid={viewingThread.authorUid} date={viewingThread.date} text={viewingThread.description}
                    images={viewingThread.images} postNum={1} />

                  {threadReplies.map((r: any, i: number) => (
                    <LKPostRow key={r.id} userData={threadUserCache[r.authorUid] || null} authorName={r.author}
                      authorAvatar={r.authorAvatar} authorUid={r.authorUid} date={r.date} text={r.text} postNum={i + 2} />
                  ))}

                  <div className="px-4 py-2 text-[11px] uppercase tracking-widest" style={{ color: LK.muted, backgroundColor: '#0d0d0f' }}>
                    {threadReplies.length} {threadReplies.length === 1 ? 'Reply' : 'Replies'}
                  </div>

                  {isLoggedIn ? (
                    <div className="px-4 py-4 border-t" style={{ borderColor: LK.border, backgroundColor: LK.card }}>
                      <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: LK.muted }}>Leave a reply</div>
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                        placeholder="Write your reply..." rows={3}
                        className="w-full border px-3 py-2.5 text-sm font-mono resize-none mb-3 focus:outline-none"
                        style={{ borderColor: LK.border, backgroundColor: '#0d0d0f', color: LK.text }} />
                      <button onClick={postReply} disabled={postingReply || !replyText.trim()}
                        className="text-xs font-bold px-4 py-2.5 rounded-sm text-black disabled:opacity-50" style={{ backgroundColor: LK.accent }}>
                        {postingReply ? 'Posting...' : 'Post Reply'}
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-center text-xs border-t" style={{ borderColor: LK.border, color: LK.muted }}>
                      <button onClick={() => setShowLogin(true)} className="underline" style={{ color: LK.link }}>Log in</button> to reply.
                    </div>
                  )}
                </div>
              );
            })()}

            {!viewingThread && currentView === 'members' && (
              <div className="border p-4" style={{ borderColor: LK.border, backgroundColor: LK.card }}>
                <MembersList openProfile={openProfile} presenceMap={presenceMap} startDM={startDM} currentUid={currentUid} />
              </div>
            )}

            {!viewingThread && currentView === 'about' && (
              <div className="border p-4 text-sm" style={{ borderColor: LK.border, backgroundColor: LK.card, color: LK.text }}>
                {aboutText}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-72 flex-shrink-0">
            <LKSidebarCard title="Latest Threads">
              <div className="space-y-3">
                {recentThreads.length === 0 && <div className="text-xs" style={{ color: LK.muted }}>No threads yet.</div>}
                {recentThreads.map((t: any) => (
                  <div key={t.id} onClick={() => setViewingThread(t)} className="cursor-pointer">
                    {t.tag && (
                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black mb-0.5"
                        style={{ backgroundColor: t.tagColor || LK.accent }}>{t.tag}</span>
                    )}
                    <div className="text-xs font-semibold hover:underline leading-snug" style={{ color: LK.link }}>{t.title}</div>
                    <div className="text-[10px]" style={{ color: LK.muted }}>Started by {t.author} · {t.date}</div>
                  </div>
                ))}
              </div>
            </LKSidebarCard>
            <LKSidebarCard title="Statistics">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span style={{ color: LK.muted }}>Threads:</span><span className="font-semibold" style={{ color: LK.text }}>{threads.length}</span></div>
                <div className="flex justify-between"><span style={{ color: LK.muted }}>Messages:</span><span className="font-semibold" style={{ color: LK.text }}>{totalMessages}</span></div>
              </div>
            </LKSidebarCard>
          </div>
        </div>
      </div>
    );
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="text-emerald-500 text-lg font-mono tracking-widest">ASCENDMAXX</div>
    </div>
  );

  return (
    <div className="min-h-screen text-zinc-200 font-sans" style={{ backgroundColor: activeBg }}>

      {siteTheme === 'looksmax-dark' && LooksmaxDarkTheme()}

      {siteTheme !== 'looksmax-dark' && (<>
      {sidebarOpen && <div className="fixed inset-0 bg-black/70 z-[60] lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className={`fixed top-0 left-0 h-full w-64 bg-zinc-950 border-r border-zinc-800 z-[70] overflow-y-auto transform transition-transform duration-200 lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-emerald-500 font-mono font-bold text-sm tracking-widest">ASCENDMAXX</span>
          <button onClick={() => setSidebarOpen(false)} className="text-zinc-500 hover:text-zinc-200 text-lg font-mono">x</button>
        </div>
        {SidebarContent()}
      </div>

      <nav className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-11 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-zinc-500 hover:text-zinc-200 font-mono text-sm flex-shrink-0">≡</button>

            {/* Logo — image if set, otherwise text fallback */}
            <div
              className="flex-shrink-0 cursor-pointer flex items-center"
              onClick={() => { setCurrentView('home'); setSelectedForum(null); setViewingThread(null); }}>
              {siteLogoUrl ? (
                <img
                  src={siteLogoUrl}
                  alt="Logo"
                  style={{ height: siteLogoSize, width: 'auto' }}
                  className="object-contain"
                />
              ) : (
                <span className="text-emerald-500 font-mono font-bold tracking-widest text-sm">ASCENDMAXX</span>
              )}
            </div>
            {isDeveloper && (
              <button
                onClick={() => { setLogoUrlDraft(siteLogoUrl); setLogoSizeDraft(siteLogoSize); setEditingLogo(true); }}
                className="hidden sm:block text-[9px] font-mono text-zinc-700 hover:text-zinc-400 transition flex-shrink-0">
                {siteLogoUrl ? 'edit logo' : 'add logo'}
              </button>
            )}
            {isDeveloper && (
              <div className="relative hidden sm:block flex-shrink-0">
                <button
                  onClick={() => setShowThemeMenu(v => !v)}
                  className="text-[9px] font-mono text-zinc-700 hover:text-zinc-400 transition border border-zinc-800 px-1.5 py-0.5">
                  theme: {siteTheme === 'looksmax-dark' ? 'looksmax' : 'current'} ▾
                </button>
                {showThemeMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-zinc-950 border border-zinc-800 z-[100] w-40">
                    {([
                      { id: 'current', label: 'Current' },
                      { id: 'looksmax-dark', label: 'Looksmax (dark)' },
                    ] as { id: SiteTheme; label: string }[]).map(opt => (
                      <button key={opt.id}
                        onClick={() => changeSiteTheme(opt.id)}
                        className={`block w-full text-left px-2.5 py-1.5 text-[10px] font-mono hover:bg-zinc-900 ${siteTheme === opt.id ? 'text-emerald-400' : 'text-zinc-400'}`}>
                        {siteTheme === opt.id ? '● ' : ''}{opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Desktop nav tabs */}
            <div className="hidden sm:flex items-center gap-0.5 text-xs font-mono overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {(['Home','Forums','Members','About','Stickers'] as const).map(v => (
                <button key={v}
                  onClick={() => {
                    if (v === 'Home') { setCurrentView('home'); setSelectedForum(null); setViewingThread(null); }
                    else setCurrentView(v.toLowerCase() as View);
                    setViewingThread(null);
                  }}
                  className={`px-3 py-1.5 whitespace-nowrap transition-colors ${currentView === v.toLowerCase() ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {v}
                </button>
              ))}
              {isLoggedIn && (
                <button onClick={() => { setCurrentView('dms'); setViewingThread(null); setShowDmPanel(false); }}
                  className={`relative px-3 py-1.5 whitespace-nowrap transition-colors ${currentView === 'dms' ? 'text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  DMs
                  {dmUnread > 0 && (
                    <span className="absolute -top-0.5 right-0.5 bg-emerald-500 text-black text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                      {dmUnread}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      {showDmPanel && isLoggedIn && DmPanel()}

      <div className="max-w-7xl mx-auto flex">
        <div className="hidden lg:block w-48 flex-shrink-0 border-r border-zinc-800 min-h-screen sticky top-11 h-[calc(100vh-2.75rem)] overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {SidebarContent()}
        </div>

        <div className="flex-1 min-w-0">

          {currentView === 'home' && !viewingThread && (
            <div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Latest Posts</h1>
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
                <div className="text-center py-20 text-zinc-600 font-mono text-xs">Loading...</div>
              ) : threads.filter(t => !pinnedIds.includes(t.id)).length === 0 ? (
                <div className="text-center py-20 text-zinc-600 font-mono text-xs">
                  No posts yet.{isLoggedIn ? ' Be the first.' : ' Log in to post.'}
                </div>
              ) : threads.filter(t => !pinnedIds.includes(t.id)).map(t => <ThreadCard key={t.id} thread={t} />)}
            </div>
          )}

          {viewingThread && ThreadView()}

          {currentView === 'forums' && !selectedForum && !viewingThread && (
            <div>
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">Forums</h2>
              </div>
              {forumSections.map(section => {
                const sectionForums = [
                  ...allForums.filter(f => f.section === section),
                  ...customForums.filter(f => f.section === section),
                ];
                return (
                  <div key={section} className="mb-1">
                    {/* Section header */}
                    <div className="px-4 py-2 bg-zinc-900/70 border-y border-zinc-800 flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-zinc-400">{section}</span>
                      {isDeveloper && (
                        <button
                          onClick={() => { setNewTopicSection(section); setShowNewTopicModal(true); }}
                          className="text-[10px] font-mono text-zinc-600 hover:text-emerald-400 transition px-1"
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
                      const replyCount = forumThreads.reduce((sum: number, t: any) => sum + (t.replies || 0), 0);
                      return (
                        <div key={forum.id}
                          onClick={() => setSelectedForum(forum)}
                          className="flex items-stretch border-b border-zinc-800 hover:bg-zinc-900/50 cursor-pointer transition-colors group">
                          {/* Left: forum name + description */}
                          <div className="flex-1 min-w-0 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-mono font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors">
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
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] font-mono text-zinc-600">{threadCount} threads</span>
                              <span className="text-[10px] font-mono text-zinc-600">{replyCount} replies</span>
                            </div>
                          </div>
                          {/* Right: latest thread */}
                          <div className="hidden sm:flex flex-col justify-center px-4 py-3 min-w-0 w-64 border-l border-zinc-800/60">
                            {latestThread ? (
                              <>
                                <p className="text-xs font-mono text-zinc-300 truncate leading-snug">
                                  {latestThread.title}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Avatar
                                    src={authorAvatarCache[latestThread.authorUid] || latestThread.authorAvatar}
                                    username={latestThread.author}
                                    size={14}
                                  />
                                  <span className="text-[10px] font-mono text-emerald-500 truncate">{latestThread.author}</span>
                                  <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0">{latestThread.date}</span>
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] font-mono text-zinc-700">No threads yet</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {currentView === 'forums' && selectedForum && !viewingThread && (
            <div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div>
                  <button className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 uppercase tracking-widest mb-0.5 block" onClick={() => setSelectedForum(null)}>Forums /</button>
                  <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300">{selectedForum.name}</h2>
                </div>
                {isLoggedIn && (selectedForum.id !== 2 || isDeveloper) && (
                  <button onClick={() => setShowNewThreadModal(true)} className={btnPrimary}>+ New Thread</button>
                )}
              </div>
              {threadsLoading
                ? <div className="text-center py-20 text-zinc-600 font-mono text-xs">Loading...</div>
                : visibleThreads.length === 0
                  ? <div className="text-center py-20 text-zinc-600 font-mono text-xs">No threads yet.{isLoggedIn && (selectedForum.id !== 2 || isDeveloper) ? ' Start one.' : ''}</div>
                  : visibleThreads.map(t => <ThreadCard key={t.id} thread={t} largePfp />)
              }
            </div>
          )}

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
        className="fixed bottom-14 sm:bottom-6 right-4 sm:right-6 bg-emerald-600 hover:bg-emerald-500 text-black font-mono font-bold px-4 py-2.5 text-xs uppercase tracking-wider shadow-2xl z-50 transition-colors">
        AI Analysis
      </button>
      </>)}

      {/* ── PROFILE MODAL ─────────────────────────────────────────────────── */}
      {viewingProfile && (() => {
        const profTotal = (viewingProfile.threadCount || 0) + (viewingProfile.replyCount || 0);
        const profRep = viewingProfile.rep || 0;
        const canRepProfile = isLoggedIn && currentUid && viewingProfile.uid !== currentUid && !repGivenMap[viewingProfile.uid];
        const alreadyReppedProfile = !!repGivenMap[viewingProfile.uid];

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
                <button onClick={() => setViewingProfile(null)} className="text-zinc-600 hover:text-zinc-300 font-mono text-sm">x</button>
              </div>
            </div>

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
                <button onClick={() => { setProfileBio(currentUserData?.bio || ''); setProfileAvatar(currentUserData?.avatar || ''); setShowEditProfile(true); }}
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
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Site Logo</span>
            <button onClick={() => setEditingLogo(false)} className="text-zinc-600 font-mono text-sm">x</button>
          </div>
          <div className="p-5 space-y-4">
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
                  await setDoc(doc(db, 'settings', 'logo'), { url: '', size: 32 });
                  setEditingLogo(false);
                }} className="border border-red-800 text-red-400 text-xs font-mono px-4 py-2.5 hover:bg-red-900/20 transition-colors">
                  Remove
                </button>
              )}
              <button onClick={async () => {
                await setDoc(doc(db, 'settings', 'logo'), { url: logoUrlDraft, size: logoSizeDraft });
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
              <div className="flex gap-2 items-center">
                <input
                  value={newThreadTag}
                  onChange={e => setNewThreadTag(e.target.value.slice(0, 20))}
                  placeholder="e.g. Discussion, Question, Guide..."
                  className={inputCls + ' flex-1'}
                  maxLength={20}
                />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="text-[10px] font-mono text-zinc-500">Color:</label>
                  <input
                    type="color"
                    value={newThreadTagColor}
                    onChange={e => setNewThreadTagColor(e.target.value)}
                    className="w-8 h-8 cursor-pointer border border-zinc-700 bg-transparent p-0.5"
                  />
                </div>
              </div>
              {newThreadTag.trim() && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-600">Preview:</span>
                  <span
                    className="inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: newThreadTagColor }}>
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

      {/* MOBILE BOTTOM NAV — horizontally scrollable so all tabs are reachable */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-800 sm:hidden z-50">
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as any}>
          {[
            { label: 'Home',     view: 'home' },
            { label: 'Forums',   view: 'forums' },
            { label: 'DMs',      view: 'dms' },
            { label: 'Members',  view: 'members' },
            { label: 'Stickers', view: 'stickers' },
            { label: 'About',    view: 'about' },
            { label: 'Theme',    view: '__theme__' },
          ].map(({ label, view }) => (
            <button
              key={view}
              onClick={() => {
                if (view === '__theme__') { setShowThemePicker(v => !v); return; }
                setCurrentView(view as View);
                if (view !== 'forums') setSelectedForum(null);
                setViewingThread(null);
              }}
              className={`flex-shrink-0 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider transition-colors whitespace-nowrap ${
                currentView === view ? 'text-emerald-400' : 'text-zinc-600'
              }`}>
              {label}
              {view === 'dms' && dmUnread > 0 && <span className="ml-1 text-emerald-400">({dmUnread})</span>}
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => setShowThemePicker(v => !v)}
        className="hidden sm:block fixed bottom-6 left-4 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-400 text-xs font-mono uppercase tracking-wider px-3 py-2 z-50 transition-colors">
        Theme
      </button>
    </div>
  );
}
