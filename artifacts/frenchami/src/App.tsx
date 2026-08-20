import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flame,
  Heart,
  Languages,
  Lightbulb,
  Menu,
  PanelLeft,
  Play,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  MessageCircle,
  Target,
  TrendingUp,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import {
  getGetDailyQuizQueryKey,
  getGetDashboardQueryKey,
  getGetLearningStateQueryKey,
  getGetDictionaryEntryQueryKey,
  getGetVerbQueryKey,
  getGetVocabularyQueryKey,
  getListVocabularyCategoriesQueryKey,
  getSearchDictionaryQueryKey,
  useGetDailyQuiz,
  useGetBillingAccess,
  useGetBillingPlans,
  useGetDashboard,
  useGetDictionaryEntry,
  useGetVerb,
  useGetVocabulary,
  useGetLearningState,
  useMarkWordLearned,
  useRecordQuizAttempt,
  useSaveWord,
  useUnsaveWord,
  useHealthCheck,
  useCreateBillingCheckout,
  useListVocabularyCategories,
  useSearchDictionary,
  useTranslateText,
  useSendTutorMessage,
  useGetTutorMistakes,
  getGetTutorMistakesQueryKey,
} from '@workspace/api-client-react';
import type {
  Dashboard,
  BillingPlan,
  DictionaryEntry,
  Quiz,
  Verb,
  VocabularyCategory,
  VocabularyWord,
  TranslationResult,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { commitLearningState, learningStateQueryOptions } from '@/lib/learning-cache';
import NotFound from '@/pages/not-found';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const headerDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date());

function normalizeLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’]/g, "'")
    .trim()
    .toLowerCase();
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const navItems = [
  { href: '/', label: 'Home', icon: PanelLeft },
  { href: '/dictionary', label: 'Dictionary', icon: BookOpen },
  { href: '/translate', label: 'Translate', icon: Languages },
  { href: '/conjugation', label: 'Conjugation', icon: RotateCcw },
  { href: '/vocabulary', label: 'Vocabulary', icon: BookMarked },
  { href: '/practice', label: 'Practice', icon: Target },
  { href: '/tutor', label: 'AI Tutor', icon: MessageCircle },
  { href: '/dashboard', label: 'Progress', icon: BarChart3 },
];

function Shell({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = navItems.find((item) => item.href === location)?.label ?? 'Frenchami';
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="flex items-center gap-3 px-2">
          <div className="brand-mark">f</div>
          <div>
            <div className="brand-name">frenchami</div>
            <div className="brand-caption">your daily French</div>
          </div>
          <button className="button-ghost ml-auto text-[#e8f6ef] md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
        </div>
        <div className="nav-label">Your desk</div>
        <nav className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase()}`}>
              <Icon className="nav-icon" />
              <span>{label}</span>
              {label === 'Practice' && <span className="ml-auto rounded-full bg-[#f47c52] px-1.5 py-0.5 text-[9px] font-bold text-[#173f36]">1</span>}
            </Link>
          ))}
        </nav>
        <div className="nav-label">Keep going</div>
        <div className="rounded-2xl border border-[#5a8f7f] bg-[#2a654f] p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono-ui text-[10px] uppercase tracking-[.12em] text-[#b8d2c7]">This week</span>
            <TrendingUp size={14} className="text-[#f47c52]" />
          </div>
          <div className="mb-2 text-sm font-semibold text-[#f3fff8]">A little every day.</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#173f36]"><div className="h-full w-[68%] rounded-full bg-[#69c49a]" /></div>
          <div className="mt-2 text-[10px] text-[#b8d2c7]">4 of 6 practice days</div>
        </div>
        <div className="sidebar-bottom">
          {user ? <div className="flex items-center gap-2.5">
            <div className="profile-dot">{(user.firstName?.[0] ?? user.emailAddresses[0]?.emailAddress[0] ?? 'L').toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-[#f3fff8]">{user.fullName ?? user.emailAddresses[0]?.emailAddress}</div><div className="text-[10px] text-[#b8d2c7]">French learner</div></div>
            <button className="button-ghost p-1 text-[#b8d2c7]" onClick={() => signOut()} aria-label="Sign out" data-testid="button-sign-out"><Settings2 size={15} /></button>
          </div> : <div><div className="mb-2 text-xs font-semibold text-[#f3fff8]">Keep your learning trail</div><div className="flex gap-2"><Link href="/sign-in" className="text-xs text-[#d9f2e4] underline" data-testid="link-sidebar-sign-in">Sign in</Link><Link href="/sign-up" className="text-xs font-semibold text-white" data-testid="link-sidebar-sign-up">Create account</Link></div></div>}
        </div>
      </aside>
      <main className="main-column">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={21} /></button>
            <div><div className="topbar-title">{current}</div><div className="topbar-kicker">{headerDate} · bienvenue</div></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-full bg-[#f6e8c8] px-3 py-1.5 text-[11px] font-semibold text-[#b65c36] sm:flex"><Flame size={13} fill="currentColor" /> 7 day streak</div>
            <Link href="/pricing" className="button-secondary hidden sm:inline-flex" data-testid="link-premium-plan">Go Premium <ArrowUpRight size={13} /></Link>
            <button className="button-ghost rounded-full p-2" aria-label="Notifications" data-testid="button-notifications"><Bell size={17} /></button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" data-testid="status-loading">{Array.from({ length: rows }).map((_, index) => <div key={index} className="skeleton h-16 w-full" />)}</div>;
}

function ErrorMessage({ onRetry }: { onRetry?: () => void }) {
  return <div className="error-state" data-testid="status-error"><div className="flex items-center gap-2 font-semibold"><CircleHelp size={17} /> Something went a little sideways.</div><p className="mb-3 mt-1 text-xs">The lesson is still here. Try that request once more.</p>{onRetry && <button className="button-secondary" onClick={onRetry} data-testid="button-retry">Try again <RotateCcw size={13} /></button>}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state" data-testid="status-empty"><Sparkles className="mx-auto mb-3 text-[#f47c52]" size={24} /><div className="font-display text-lg font-bold">{title}</div><p className="mx-auto mt-1 max-w-sm text-xs leading-6 text-muted-foreground">{text}</p></div>;
}

function activityLabel(activity: string) {
  if (activity.startsWith('tutor-')) {
    const level = activity.slice('tutor-'.length);
    return `AI tutor · ${level.charAt(0).toUpperCase()}${level.slice(1)}`;
  }
  return activity.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function AuthPrompt({ title = 'Make this yours', text = 'Create a free account to save your progress and pick up where you left off.', redirectPath }: { title?: string; text?: string; redirectPath?: string }) {
  const redirectQuery = redirectPath ? `?redirect_url=${encodeURIComponent(redirectPath)}` : '';
  return <div className="rounded-2xl border border-[#b8d8c7] bg-[#eff8f2] p-5 text-center" data-testid="auth-prompt"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#247a61] text-white"><Bookmark size={18} /></div><div className="font-display text-xl font-bold">{title}</div><p className="mx-auto mt-1 max-w-sm text-xs leading-6 text-muted-foreground">{text}</p><div className="mt-4 flex justify-center gap-2"><Link href={`/sign-up${redirectQuery}`} className="button-primary" data-testid="link-create-account">Create free account</Link><Link href={`/sign-in${redirectQuery}`} className="button-secondary" data-testid="link-sign-in">Sign in</Link></div></div>;
}

function SearchBar({ value, onChange, onSubmit, placeholder = 'Search in French…', testId = 'input-search' }: { value: string; onChange: (value: string) => void; onSubmit: () => void; placeholder?: string; testId?: string }) {
  return <form className="search-wrap" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <Search size={18} className="shrink-0 text-muted-foreground" />
    <input className="input-field" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} data-testid={testId} />
    <button type="submit" className="button-primary" data-testid={`${testId}-submit`}>Look it up <ArrowRight size={14} /></button>
  </form>;
}

function MiniStat({ icon: Icon, label, value, detail, tone = 'blue' }: { icon: typeof Flame; label: string; value: string | number; detail: string; tone?: string }) {
  return <div className="card p-5" data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="mb-6 flex items-center justify-between"><span className={`chip ${tone === 'orange' ? 'chip-orange' : tone === 'green' ? 'chip-green' : 'chip-blue'}`}><Icon size={13} /> {label}</span><ArrowUpRight size={15} className="text-muted-foreground" /></div>
    <div className="stat-number">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div>
  </div>;
}

function Home() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const { user } = useUser();
  const dashboard = useGetDashboard({ query: { enabled: Boolean(user), queryKey: getGetDashboardQueryKey(), staleTime: 60000 } });
  const snapshot = dashboard.data as Dashboard | undefined;
  const submit = () => { if (query.trim()) setLocation(`/dictionary?query=${encodeURIComponent(query.trim())}`); };
  return <div className="content">
    <div className="grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
      <section className="fade-up">
        <div className="eyebrow">A better way to remember</div>
        <h1 className="page-heading">Make French feel<br /><span className="text-[#247a61]">like yours.</span></h1>
        <p className="page-subheading">A smart, kind companion for the in-between moments: one useful word, one clear explanation, one small win at a time.</p>
        <div className="mt-8 max-w-2xl"><SearchBar value={query} onChange={setQuery} onSubmit={submit} placeholder="Try “retrouver”, “chemin”, or “se débrouiller”…" /></div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span>Popular today</span>{['se débrouiller', 'pourtant', 'à bientôt'].map((item) => <button key={item} className="chip cursor-pointer hover:bg-[#dcebdc]" onClick={() => { setQuery(item); setLocation(`/dictionary?query=${encodeURIComponent(item)}`); }} data-testid={`button-popular-${item}`}>{item}</button>)}</div>
      </section>
        <div className="hero-orbit fade-up fade-up-delay-1"><div className="hero-word">bon<span>jour</span></div><div className="orbit-label">/ say it with confidence</div><div className="absolute left-6 top-5 rounded-lg bg-[#e8f5ed] px-2 py-1 font-mono-ui text-[9px] text-[#247a61] float-note">/bɔ̃.ʒuʁ/</div></div>
    </div>
    <div className="mt-12 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
      <section className="card overflow-hidden bg-[#247a61] p-6 text-[#f5fff9] sm:p-8" data-testid="card-daily-nudge">
        <div className="flex items-start justify-between"><div><div className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-[#b9dfcb]">Your daily nudge</div><h2 className="mt-3 font-display text-3xl font-bold tracking-[-.05em]">Une chose à la fois.</h2><p className="mt-3 max-w-md text-sm leading-6 text-[#dcefe4]">Consistency beats intensity. Give today’s five-minute practice a little room.</p></div><div className="rounded-2xl bg-[#f47c52] p-3 text-[#173f36]"><Sparkles size={22} /></div></div>
        <Link href="/practice" className="button-secondary mt-7" data-testid="link-start-practice">Start today’s practice <ArrowRight size={14} /></Link>
      </section>
      <section className="card p-6" data-testid="card-home-progress">
        <div className="mb-6 flex items-center justify-between"><div className="section-title">Your rhythm</div><Link href="/dashboard" className="text-xs font-semibold text-[#247a61]" data-testid="link-view-progress">See progress</Link></div>
        {!user ? <div className="rounded-xl bg-[#eff8f2] p-4"><div className="font-display text-xl font-bold">Keep the good stuff.</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Create a free account when you are ready to save words, track practice, and build your own rhythm.</p><Link href="/sign-up" className="button-secondary mt-4" data-testid="link-home-create-account">Save your progress <ArrowRight size={13} /></Link></div> : dashboard.isLoading ? <LoadingBlock rows={2} /> : dashboard.isError ? <ErrorMessage onRetry={() => dashboard.refetch()} /> : <><div className="mb-4 flex items-end justify-between"><div><div className="stat-number">{snapshot?.streak ?? 0}</div><div className="text-xs text-muted-foreground">days in a row</div></div><div className="text-right"><div className="font-mono-ui text-xs text-[#c56a46]">{snapshot?.xp ?? 0} XP</div><div className="text-xs text-muted-foreground">{snapshot?.level ?? 'A1 · Starter'}</div></div></div><div className="progress-track"><div className="progress-bar" style={{ width: `${snapshot?.progress ?? 0}%` }} /></div><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Keep your thread</span><span>{snapshot?.progress ?? 0}% to next level</span></div></>}
      </section>
    </div>
    <section className="mt-12">
      <div className="mb-5 flex items-end justify-between"><div><div className="eyebrow">Pick a doorway</div><h2 className="section-title mt-2">What are you here for?</h2></div><span className="font-mono-ui text-[10px] text-muted-foreground">01 — 04</span></div>
      <div className="grid-auto">
        {[['Dictionary', 'Find the exact shade of meaning.', '/dictionary', BookOpen], ['Translate', 'Turn your thought into French.', '/translate', Languages], ['Conjugation', 'See a verb in its whole shape.', '/conjugation', RotateCcw], ['Vocabulary', 'Build a useful little world.', '/vocabulary', BookMarked]].map(([title, text, href, Icon], index) => <Link href={href as string} key={title as string} className="card card-hover group p-5" data-testid={`link-home-${(title as string).toLowerCase()}`}><div className="mb-8 flex items-center justify-between"><div className={`rounded-xl p-2.5 ${index % 2 ? 'bg-[#f9dfd5] text-[#c85e3b]' : 'bg-[#dcebdc] text-[#28776a]'}`}><Icon size={19} /></div><ArrowUpRight size={16} className="text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></div><div className="font-display text-[17px] font-bold">{title as string}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{text as string}</p></Link>)}
      </div>
    </section>
  </div>;
}

function Dictionary() {
  const params = useParams<{ word?: string }>();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const initial = new URLSearchParams(window.location.search).get('query') ?? params.word ?? '';
  const [query, setQuery] = useState(initial);
  const [selected, setSelected] = useState('');
  const learningState = useGetLearningState({ query: learningStateQueryOptions(Boolean(user)) });
  const saved = (learningState.data as { savedWords?: string[] } | undefined)?.savedWords ?? [];
  const saveWord = useSaveWord({ mutation: { onSuccess: (state) => commitLearningState(queryClient, state) } });
  const unsaveWord = useUnsaveWord({ mutation: { onSuccess: (state) => commitLearningState(queryClient, state) } });
  const results = useSearchDictionary({ q: query.trim() }, { query: { enabled: query.trim().length > 0, queryKey: getSearchDictionaryQueryKey({ q: query.trim() }) } });
  const entry = useGetDictionaryEntry(selected, { query: { enabled: !!selected, queryKey: getGetDictionaryEntryQueryKey(selected) } });
  const words = (results.data as DictionaryEntry[] | undefined) ?? [];
  useEffect(() => {
    const normalizedQuery = normalizeLookup(query);
    if (!normalizedQuery) {
      setSelected('');
      return;
    }
    const exactMatch = words.find((word) => normalizeLookup(word.word) === normalizedQuery);
    if (exactMatch) {
      setSelected(exactMatch.word);
    } else if (!results.isLoading) {
      setSelected('');
    }
  }, [query, results.isLoading, words]);
  return <div className="content">
    <div className="mb-8"><div className="eyebrow">The good kind of rabbit hole</div><h1 className="page-heading">Dictionary<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">Meaning, register, pronunciation, and the little details that make a word stick.</p></div>
    <SearchBar value={query} onChange={setQuery} onSubmit={() => {
      const exactMatch = words.find((word) => normalizeLookup(word.word) === normalizeLookup(query));
      setSelected(exactMatch?.word ?? '');
    }} placeholder="Search a French word…" />
    <div className="mt-8 grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
      <section className="card p-5" data-testid="section-dictionary-results"><div className="mb-4 flex items-center justify-between"><div className="section-title">Search results</div>{words.length > 0 && <span className="font-mono-ui text-[10px] text-muted-foreground">{words.length} found</span>}</div>
        {results.isLoading ? <LoadingBlock /> : results.isError ? <ErrorMessage onRetry={() => results.refetch()} /> : words.length === 0 ? query.trim() ? <div className="flex min-h-[250px] flex-col items-center justify-center text-center" data-testid="status-dictionary-no-match"><div className="mb-4 rounded-2xl bg-[#f5f0e4] p-4 text-[#b65c36]"><Search size={28} /></div><div className="font-display text-xl font-bold">No entry for “{query.trim()}” yet</div><p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">Try a simpler spelling, an English meaning, or one of the everyday words in this dictionary.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{['bonjour', 'lundi', 'français'].map((suggestion) => <button key={suggestion} className="chip cursor-pointer hover:bg-[#dcebdc]" onClick={() => setQuery(suggestion)} data-testid={`button-dictionary-suggestion-${suggestion}`}>{suggestion}</button>)}</div></div> : <EmptyState title="Start with a word" text="Search for a word to see its definition, examples, and related vocabulary." /> : <div className="space-y-1">{words.map((word, index) => <button key={`${word.word}-${index}`} className={`w-full rounded-xl p-3 text-left transition-colors hover:bg-[#f5f0e4] ${selected === word.word ? 'bg-[#eef2f9]' : ''}`} onClick={() => setSelected(word.word)} data-testid={`button-dictionary-result-${word.word}`}><div className="flex items-center justify-between"><span className="font-display text-lg font-bold">{word.word}</span><ChevronRight size={15} className="text-muted-foreground" /></div><div className="mt-0.5 text-xs text-muted-foreground">{word.translation} · {word.partOfSpeech}</div></button>)}</div>}
      </section>
      <section className="card min-h-[410px] p-6" data-testid="section-word-detail">
        {entry.isLoading ? <LoadingBlock rows={5} /> : entry.isError ? <ErrorMessage onRetry={() => entry.refetch()} /> : entry.data ? <WordDetail entry={entry.data as DictionaryEntry} saved={saved.includes((entry.data as DictionaryEntry).word)} onSave={() => { if (!user) { setLocation('/sign-up'); return; } const word = (entry.data as DictionaryEntry).word; saved.includes(word) ? unsaveWord.mutate({ word }) : saveWord.mutate({ word }); }} /> : query.trim() && !results.isLoading && words.length === 0 ? <div className="flex h-full min-h-[370px] flex-col items-center justify-center text-center" data-testid="status-dictionary-detail-no-match"><div className="mb-4 rounded-2xl bg-[#f5f0e4] p-4 text-[#b65c36]"><Search size={28} /></div><div className="font-display text-xl font-bold">Keep exploring</div><p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">There is no saved entry for this search yet. Try a nearby word or an accented spelling.</p></div> : <div className="flex h-full min-h-[370px] flex-col items-center justify-center text-center"><div className="mb-4 rounded-2xl bg-[#dcebdc] p-4 text-[#28776a]"><BookOpen size={28} /></div><div className="font-display text-xl font-bold">A word is waiting</div><p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">Select a result to open its full entry. The nuance is usually in the details.</p></div>}
      </section>
    </div>
    <div className="mt-7 flex flex-wrap items-center gap-2"><Bookmark size={14} className="text-muted-foreground" /><span className="text-xs text-muted-foreground">Saved for later</span>{saved.length ? saved.map((word) => <span className="chip chip-orange" key={word}>{word}</span>) : user ? <span className="text-xs italic text-muted-foreground">Nothing saved yet.</span> : <Link href="/sign-up" className="text-xs font-semibold text-[#247a61]">Create an account to save words</Link>}</div>
  </div>;
}

function WordDetail({ entry, saved, onSave }: { entry: DictionaryEntry; saved: boolean; onSave: () => void }) {
  return <div className="fade-up"><div className="flex items-start justify-between gap-4"><div><div className="mb-2 flex flex-wrap gap-2"><span className="chip chip-blue">{entry.level}</span><span className="chip">{entry.partOfSpeech}{entry.gender ? ` · ${entry.gender}` : ''}</span></div><h2 className="font-display text-5xl font-bold tracking-[-.08em]">{entry.word}</h2><div className="mt-2 flex items-center gap-2 font-mono-ui text-xs text-muted-foreground"><Volume2 size={14} /> {entry.pronunciation ?? '/ — /'} <button className="button-ghost p-1" aria-label={`Hear ${entry.word}`} data-testid={`button-pronounce-${entry.word}`}><Play size={11} fill="currentColor" /></button></div></div><button className={`button-ghost rounded-full p-2 ${saved ? 'text-[#f47c52]' : ''}`} onClick={onSave} aria-label={saved ? 'Remove saved word' : 'Save word'} data-testid={`button-save-word-${entry.word}`}><Bookmark size={19} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="my-6 divider" /><div className="text-sm font-semibold text-muted-foreground">English</div><div className="mt-1 font-display text-2xl font-bold text-[#1f5ebd]">{entry.translation}</div><p className="mt-4 text-sm leading-7">{entry.definition}</p><div className="mt-6 rounded-xl bg-[#f5f0e4] p-4"><div className="mb-2 font-mono-ui text-[10px] uppercase tracking-[.12em] text-muted-foreground">In context</div>{entry.examples?.map((example, index) => <p key={index} className="text-sm italic leading-6 text-[#34415c]">“{example}”</p>)}</div>{entry.related?.length > 0 && <div className="mt-5"><div className="mb-2 text-xs font-semibold text-muted-foreground">Related words</div><div className="flex flex-wrap gap-2">{entry.related.map((word) => <span className="chip" key={word}>{word}</span>)}</div></div>}</div>;
}

function Translate() {
  const [source, setSource] = useState('');
  const [direction, setDirection] = useState<'auto' | 'en-fr' | 'fr-en'>('auto');
  const [copied, setCopied] = useState(false);
  const translation = useTranslateText();
  const result = translation.data as TranslationResult | undefined;
  const inputLanguage = direction === 'auto' ? 'English or Français' : direction === 'en-fr' ? 'English' : 'Français';
  const outputLanguage = direction === 'auto' ? 'Automatic translation' : direction === 'en-fr' ? 'Français' : 'English';
  const translate = () => translation.mutate({ data: { text: source.trim(), direction } });
  const swap = () => { setDirection(direction === 'en-fr' ? 'fr-en' : 'en-fr'); setSource(result?.translation ?? ''); translation.reset(); };
  return <div className="content"><div className="mb-8"><div className="eyebrow">Find your phrasing</div><h1 className="page-heading">Translate<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">A clear first draft, with enough context left for you to make it sound like yourself.</p></div>
    <div className="mb-5 flex items-center gap-2"><button className={`button-secondary ${direction === 'en-fr' ? 'bg-[#dcebdc] text-[#28776a]' : ''}`} onClick={() => setDirection('en-fr')} data-testid="button-direction-english">English</button><button className="button-ghost p-2" onClick={swap} aria-label="Swap languages" data-testid="button-swap-languages"><Languages size={17} /></button><button className={`button-secondary ${direction === 'fr-en' ? 'bg-[#dcebdc] text-[#28776a]' : ''}`} onClick={() => setDirection('fr-en')} data-testid="button-direction-french">Français</button></div>
    <div className="card overflow-hidden"><div className="grid lg:grid-cols-2"><div className="border-b border-border p-5 lg:border-b-0 lg:border-r"><div className="mb-3 flex items-center justify-between"><span className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">{inputLanguage} · input</span><button className="button-ghost" onClick={() => { setSource(''); translation.reset(); }} data-testid="button-clear-translation">Clear <X size={13} /></button></div><textarea className="textarea-field min-h-[255px] border-0 bg-transparent p-0 text-lg shadow-none focus:ring-0" value={source} onChange={(event) => setSource(event.target.value)} placeholder={direction === 'fr-en' ? 'Écrivez votre phrase…' : 'Type what you want to say…'} data-testid="textarea-translation-input" /><div className="mt-4 text-[11px] text-muted-foreground">{source.length} characters · language detected automatically</div></div><div className="bg-[#f5f0e4] p-5"><div className="mb-3 flex items-center justify-between"><span className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-muted-foreground">{outputLanguage} · your draft</span>{result && <button className="button-ghost" onClick={() => { navigator.clipboard?.writeText(result.translation); setCopied(true); setTimeout(() => setCopied(false), 1500); }} data-testid="button-copy-translation">{copied ? 'Copied' : 'Copy'}</button>}</div>{translation.isPending ? <div className="flex min-h-[255px] items-center justify-center text-sm text-muted-foreground">Finding the natural phrasing…</div> : translation.isError ? <div className="flex min-h-[255px] items-center justify-center text-center text-sm text-muted-foreground">That translation did not come through. Please try again.</div> : result ? <div className="fade-up"><div className="text-xl leading-9 text-[#243b70]" data-testid="text-translation-result">{result.translation}</div><div className="mt-5 rounded-xl bg-white/70 p-3 text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Why this phrasing: </span>{result.note}</div></div> : <div className="flex min-h-[255px] items-center justify-center text-center text-sm italic text-muted-foreground">Your translation will land here.<br />Keep it simple to start.</div>}</div></div><div className="flex items-center justify-between border-t border-border bg-card px-5 py-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Lightbulb size={14} className="text-[#f47c52]" /> Tip: translate the idea, not every word.</div><button className="button-primary" onClick={translate} disabled={!source.trim() || translation.isPending} data-testid="button-translate">{translation.isPending ? 'Translating…' : 'Translate'} <Send size={14} /></button></div></div>
    <div className="mt-7"><div className="mb-3 text-xs font-semibold text-muted-foreground">Try a phrase</div><div className="flex flex-wrap gap-2">{['Good morning', 'Where is the station?', 'I am learning French'].map((item) => <button className="chip cursor-pointer hover:bg-[#dcebdc]" key={item} onClick={() => setSource(item.toLowerCase())} data-testid={`button-phrase-${item}`}>{item}</button>)}</div></div>
  </div>;
}

function Conjugation() {
  const [query, setQuery] = useState('être');
  const [selected, setSelected] = useState('être');
  const verb = useGetVerb(selected, { query: { enabled: !!selected, queryKey: getGetVerbQueryKey(selected) } });
  const data = verb.data as Verb | undefined;
  return <div className="content"><div className="mb-8"><div className="eyebrow">See the whole shape</div><h1 className="page-heading">Conjugation<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">Stop memorising isolated forms. Notice the pattern, then use it in a sentence.</p></div><div className="max-w-2xl"><SearchBar value={query} onChange={setQuery} onSubmit={() => setSelected(query.trim())} placeholder="Search a verb, e.g. prendre…" /></div>
    {verb.isLoading ? <div className="card mt-8 p-6"><LoadingBlock rows={6} /></div> : verb.isError ? <div className="mt-8"><ErrorMessage onRetry={() => verb.refetch()} /></div> : data ? <div className="mt-8 fade-up"><div className="card mb-5 bg-[#214f9d] p-6 text-[#fff8e7] sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-3 flex gap-2"><span className="chip bg-[#466caf] text-[#eef3ff]">{data.group} group</span><span className="chip bg-[#466caf] text-[#eef3ff]">verb</span></div><h2 className="font-display text-5xl font-bold tracking-[-.08em]">{data.verb}</h2><div className="mt-2 text-sm text-[#cdd9f0]">{data.translation}</div></div><div className="rounded-xl bg-[#f47c52] p-3 text-[#173268]"><RotateCcw size={21} /></div></div></div><div className="grid gap-4 md:grid-cols-2">{data.tenses.map((tense, index) => <div className="card p-5" key={`${tense.name}-${index}`} data-testid={`card-tense-${tense.name}`}><div className="mb-4 flex items-center justify-between"><div className="font-display text-lg font-bold">{tense.name}</div><span className="font-mono-ui text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span></div><div className="space-y-2">{tense.forms.map((form, formIndex) => <div className="flex items-center gap-3 border-b border-border py-2 last:border-0" key={`${form}-${formIndex}`}><span className="w-5 font-mono-ui text-[10px] text-muted-foreground">{formIndex + 1}</span><span className="text-sm">{form}</span></div>)}</div><div className="mt-4 rounded-lg bg-[#f5f0e4] p-3 text-xs italic leading-5 text-[#34415c]">“{tense.example}”</div></div>)}</div></div> : <EmptyState title="Find a verb" text="Try être, avoir, aller, prendre, or any French verb you are curious about." />}
  </div>;
}

function Vocabulary() {
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const [selectedCategory, setSelectedCategory] = useState('');
  const learningState = useGetLearningState({ query: learningStateQueryOptions(Boolean(user)) });
  const state = learningState.data as { savedWords?: string[]; learnedWords?: string[] } | undefined;
  const saved = state?.savedWords ?? [];
  const learned = state?.learnedWords ?? [];
  const saveWord = useSaveWord({ mutation: { onSuccess: (state) => commitLearningState(queryClient, state) } });
  const unsaveWord = useUnsaveWord({ mutation: { onSuccess: (state) => commitLearningState(queryClient, state) } });
  const markLearned = useMarkWordLearned({ mutation: { onSuccess: (state) => commitLearningState(queryClient, state, { vocabularyCategory: selected, refreshDashboard: true }) } });
  const categories = useListVocabularyCategories({ query: { queryKey: getListVocabularyCategoriesQueryKey(), staleTime: 120000 } });
  const categoryData = categories.data as VocabularyCategory[] | undefined;
  const selected = selectedCategory || categoryData?.[0]?.slug || '';
  const words = useGetVocabulary(selected, { query: { enabled: !!selected, queryKey: getGetVocabularyQueryKey(selected) } });
  const wordData = words.data as VocabularyWord[] | undefined;
  return <div className="content"><div className="mb-8"><div className="eyebrow">Collect useful words</div><h1 className="page-heading">Vocabulary<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">Choose a small corner of the language. Learn it, revisit it, let it become familiar.</p></div>
    {categories.isLoading ? <LoadingBlock rows={4} /> : categories.isError ? <ErrorMessage onRetry={() => categories.refetch()} /> : categoryData?.length ? <><div className="grid-auto mb-8">{categoryData.map((category, index) => <button key={category.slug} onClick={() => setSelectedCategory(category.slug)} className={`card card-hover p-5 text-left ${selected === category.slug ? 'ring-2 ring-[#1f5ebd]' : ''}`} data-testid={`button-category-${category.slug}`}><div className="mb-7 flex items-start justify-between"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color || (index % 2 ? '#f47c52' : '#2d897c') }} /><span className="font-mono-ui text-[10px] text-muted-foreground">{category.wordCount} words</span></div><div className="font-display text-[17px] font-bold">{category.name}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{category.description}</p></button>)}</div><div className="card p-5 sm:p-7"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow">Now browsing</div><h2 className="section-title mt-2">{categoryData.find((cat) => cat.slug === selected)?.name}</h2></div>{user ? <span className="chip chip-orange">{saved.length} saved</span> : <Link href="/sign-up" className="text-xs font-semibold text-[#247a61]">Create an account to save</Link>}</div>{words.isLoading ? <LoadingBlock rows={5} /> : words.isError ? <ErrorMessage onRetry={() => words.refetch()} /> : wordData?.length ? <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">{wordData.map((word, index) => { const isSaved = saved.includes(word.word); const isLearned = learned.includes(word.word) || word.learned; return <div key={`${word.word}-${index}`} className="group border-b border-border py-4" data-testid={`row-vocabulary-${word.word}`}><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-display text-lg font-bold">{word.word}</span>{isLearned && <CheckCircle2 size={14} className="text-[#2d897c]" />}</div><div className="mt-0.5 text-xs text-[#1f5ebd]">{word.translation}</div><div className="mt-1 font-mono-ui text-[10px] text-muted-foreground">{word.pronunciation}</div></div><div className="flex items-center gap-1"><button className={`button-ghost rounded-full p-1.5 ${isSaved ? 'text-[#f47c52]' : ''}`} onClick={() => { if (!user) { setLocation('/sign-up'); return; } isSaved ? unsaveWord.mutate({ word: word.word }) : saveWord.mutate({ word: word.word }); }} aria-label={`Save ${word.word}`} data-testid={`button-save-vocabulary-${word.word}`}><Heart size={16} fill={isSaved ? 'currentColor' : 'none'} /></button><button className={`button-ghost rounded-full p-1.5 ${isLearned ? 'text-[#2d897c]' : ''}`} onClick={() => { if (!user) { setLocation('/sign-up'); return; } markLearned.mutate({ word: word.word, data: { learned: !isLearned } }); }} aria-label={isLearned ? `Mark ${word.word} unlearned` : `Mark ${word.word} learned`} data-testid={`button-learn-vocabulary-${word.word}`}><CheckCircle2 size={16} /></button></div></div><p className="mt-3 text-xs italic leading-5 text-muted-foreground">“{word.example}”</p></div> })}</div> : <EmptyState title="This shelf is quiet" text="No words are available in this category yet. Try another collection." />}</div></> : <EmptyState title="No categories yet" text="Your vocabulary shelves will appear here when they are ready." />}
  </div>;
}

function Practice() {
  const { user } = useUser();
  const quiz = useGetDailyQuiz({ query: { queryKey: getGetDailyQuizQueryKey(), staleTime: 60000 } });
  const data = quiz.data as Quiz | undefined;
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const recordAttempt = useRecordQuizAttempt({ mutation: { onSuccess: (state) => commitLearningState(queryClient, state, { refreshDashboard: true }) } });
  const choose = (option: string) => {
    if (!done && data) {
      setSelected(option);
      setDone(true);
      if (user) recordAttempt.mutate({
        data: {
          quizId: "daily-cafe-conversation",
          answer: option,
          correct: option === data.answer,
          xp: data.xp,
        },
      });
    }
  };
  return <div className="content"><div className="mb-8"><div className="eyebrow">Five minutes, no fuss</div><h1 className="page-heading">Daily practice<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">One question today. Answer it, understand it, take the small win with you.</p></div>
    {quiz.isLoading ? <div className="card p-7"><LoadingBlock rows={5} /></div> : quiz.isError ? <ErrorMessage onRetry={() => quiz.refetch()} /> : data ? <div className="mx-auto max-w-3xl"><div className="mb-4 flex items-center justify-between"><span className="chip chip-orange"><Flame size={13} /> Daily card</span><span className="font-mono-ui text-[10px] text-muted-foreground">+{data.xp} XP · 01 / 01</span></div><div className="card overflow-hidden"><div className="bg-[#214f9d] p-7 text-[#fff8e7] sm:p-10"><div className="font-mono-ui text-[10px] uppercase tracking-[.16em] text-[#bccbe7]">{data.title}</div><h2 className="mt-7 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-.05em] sm:text-4xl">{data.question}</h2></div><div className="space-y-2 p-5 sm:p-8">{data.options.map((option, index) => { const correct = done && option === data.answer; const wrong = done && selected === option && option !== data.answer; return <button key={option} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${correct ? 'border-[#2d897c] bg-[#e1f0e9]' : wrong ? 'border-[#d66949] bg-[#fae4dc]' : 'border-border hover:border-[#88a8d8] hover:bg-[#f5f0e4]'}`} onClick={() => choose(option)} data-testid={`button-quiz-option-${index}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono-ui text-[10px] ${correct ? 'bg-[#2d897c] text-white' : wrong ? 'bg-[#d66949] text-white' : 'bg-[#eef2f9] text-[#1f5ebd]'}`}>{correct ? <Check size={14} /> : wrong ? <X size={14} /> : String.fromCharCode(65 + index)}</span><span className="text-sm font-semibold">{option}</span>{correct && <CheckCircle2 className="ml-auto text-[#2d897c]" size={18} />}{wrong && <XCircle className="ml-auto text-[#d66949]" size={18} />}</button> })}</div>{done && <div className={`mx-5 mb-5 rounded-xl p-4 sm:mx-8 ${selected === data.answer ? 'bg-[#e1f0e9] text-[#236b60]' : 'bg-[#fae4dc] text-[#93452e]'}`} data-testid="status-quiz-feedback"><div className="flex items-center gap-2 font-display font-bold">{selected === data.answer ? 'Bien joué.' : `The answer is “${data.answer}”.`}</div><p className="mt-1 text-xs leading-5">{selected === data.answer ? `You earned ${data.xp} XP. Your ear is getting sharper.` : 'Notice the shape, then give it another try tomorrow.'}</p>{!user && <Link href="/sign-up" className="mt-3 inline-flex text-xs font-semibold underline">Create a free account to keep this progress</Link>}</div>}</div><div className="mt-5 flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-2"><Clock3 size={14} /> A tiny ritual counts.</span><Link href="/dashboard" className="font-semibold text-[#1f5ebd]" data-testid="link-practice-progress">View your progress <ArrowRight size={13} className="ml-1 inline" /></Link></div></div> : <EmptyState title="No practice card yet" text="Your next question will be ready soon. Check back in a little while." />}
  </div>;
}

function Tutor() {
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; explanation?: string; correction?: string | null; naturalPhrase?: string | null }[]>([
    { role: 'assistant', content: 'Bonjour ! Je suis ton ami de conversation. Qu’est-ce que tu as fait aujourd’hui ?', explanation: 'Hello! I’m your conversation friend. What did you do today?' },
  ]);
  const send = useSendTutorMessage({
    mutation: {
      onSuccess: (response) => {
        setMessages((current) => [...current, { role: 'assistant', content: response.reply, explanation: response.explanation, correction: response.correction, naturalPhrase: response.naturalPhrase }]);
        queryClient.invalidateQueries({ queryKey: getGetTutorMistakesQueryKey() });
      },
    },
  });
  const submit = () => {
    const message = draft.trim();
    if (!message || send.isPending) return;
    setDraft('');
    setMessages((current) => [...current, { role: 'user', content: message }]);
    send.mutate({ data: { level, message, history: messages.map(({ role, content }) => ({ role, content })) } });
  };
  return <div className="content"><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">Your patient conversation partner</div><h1 className="page-heading">Speak freely<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">Try a French thought. I’ll keep the conversation going, explain the tricky bits in English, and help your phrasing sound more natural.</p></div><Link href="/dashboard" className="button-secondary"><BarChart3 size={14} /> See patterns</Link></div>
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_280px]"><section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[#e8f5ed] p-5"><div><div className="section-title">A little café chat</div><div className="mt-1 text-xs text-muted-foreground">No grades here. Just useful momentum.</div></div><div className="flex rounded-xl bg-white/70 p-1">{(['beginner', 'intermediate', 'advanced'] as const).map((item) => <button key={item} onClick={() => setLevel(item)} className={`rounded-lg px-3 py-2 text-[10px] font-bold capitalize ${level === item ? 'bg-[#247a61] text-white' : 'text-muted-foreground'}`} data-testid={`button-tutor-level-${item}`}>{item}</button>)}</div></div><div className="max-h-[520px] space-y-5 overflow-y-auto p-5 sm:p-7">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-sm bg-[#247a61] text-white' : 'rounded-bl-sm bg-[#f5f0e4]'}`}>{message.content}</div>{message.role === 'assistant' && <div className="mt-2 space-y-1 pl-2 text-[11px] leading-5 text-muted-foreground">{message.explanation && <p><span className="font-semibold text-[#247a61]">English:</span> {message.explanation}</p>}{message.correction && <p><span className="font-semibold text-[#c56a46]">Correction:</span> {message.correction}</p>}{message.naturalPhrase && <p><span className="font-semibold text-[#1f5ebd]">More natural:</span> {message.naturalPhrase}</p>}</div>}</div></div>)}{send.isPending && <div className="text-xs text-muted-foreground">Your tutor is thinking…</div>}{send.isError && <p className="rounded-lg bg-[#fae4dc] p-3 text-xs text-[#93452e]">I couldn’t reach your tutor. Please try again.</p>}</div><div className="border-t border-border p-4"><div className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder="Écris quelque chose en français…" className="min-h-[44px] flex-1 rounded-xl border border-border bg-[#fffdf7] px-4 text-sm outline-none focus:border-[#247a61]" data-testid="input-tutor-message" /><button className="button-primary" onClick={submit} disabled={send.isPending || !draft.trim()} data-testid="button-send-tutor"><Send size={15} /> Send</button></div></div></section><aside className="card h-fit p-5"><div className="mb-4 flex items-center gap-2"><Sparkles size={16} className="text-[#f47c52]" /><div className="section-title text-base">How it works</div></div><ul className="space-y-3 text-xs leading-5 text-muted-foreground"><li><strong className="text-foreground">Stay in French.</strong> Your tutor answers in French and explains in English.</li><li><strong className="text-foreground">Make mistakes.</strong> Corrections are kind, specific, and saved to your progress.</li><li><strong className="text-foreground">Choose your stretch.</strong> Switch levels whenever you want.</li></ul></aside></div>
  </div>;
}
function ProgressDashboard() {
  const { user } = useUser();
  const dashboard = useGetDashboard({ query: { enabled: Boolean(user), queryKey: getGetDashboardQueryKey(), staleTime: 60000 } });
  const data = dashboard.data as Dashboard | undefined;
  const mistakes = useGetTutorMistakes({ query: { queryKey: getGetTutorMistakesQueryKey(), staleTime: 30000 } });
  if (!user) return <div className="content"><div className="mb-8"><div className="eyebrow">A quiet look back</div><h1 className="page-heading">Your progress<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">Your personal learning trail will be ready when you are.</p></div><AuthPrompt title="Save your Frenchami journey" text="Create a free account to track learned words, practice results, streaks, and XP across visits." /></div>;
  return <div className="content"><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">A quiet look back</div><h1 className="page-heading">Your progress<span className="text-[#f47c52]">.</span></h1><p className="page-subheading">You do not need a perfect week. You need a thread you can pick up again.</p></div><Link href="/practice" className="button-primary" data-testid="link-dashboard-practice"><Play size={14} fill="currentColor" /> Continue practice</Link></div>
    {dashboard.isLoading ? <LoadingBlock rows={6} /> : dashboard.isError ? <ErrorMessage onRetry={() => dashboard.refetch()} /> : data ? <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MiniStat icon={BookOpen} label="Words learned" value={data.wordsLearned} detail="A growing working set" /><MiniStat icon={Flame} label="Current streak" value={`${data.streak} days`} detail="Your most useful habit" tone="orange" /><MiniStat icon={Sparkles} label="Total XP" value={data.xp} detail="Earned through practice" /><MiniStat icon={TrendingUp} label="Level" value={data.level} detail="Keep exploring" tone="green" /></div><div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><section className="card p-6 sm:p-7"><div className="mb-8 flex items-center justify-between"><div><div className="section-title">Level journey</div><p className="mt-1 text-xs text-muted-foreground">Progress is a collection of ordinary days.</p></div><span className="chip chip-blue">{data.progress}%</span></div><div className="mb-3 flex items-end justify-between"><div className="font-display text-3xl font-bold">{data.level}</div><span className="font-mono-ui text-[10px] text-muted-foreground">next chapter</span></div><div className="progress-track h-3"><div className="progress-bar" style={{ width: `${data.progress}%` }} /></div><div className="mt-4 flex justify-between text-[10px] text-muted-foreground"><span>Keep showing up</span><span>{100 - data.progress} points to go</span></div><div className="mt-9 grid grid-cols-7 gap-2">{['M','T','W','T','F','S','S'].map((day, index) => <div key={`${day}-${index}`} className="text-center"><div className={`mx-auto mb-2 h-8 w-8 rounded-lg ${index < 4 ? 'bg-[#2d897c]' : index === 4 ? 'bg-[#f47c52]' : 'bg-[#e9e3d5]'}`} /> <span className="font-mono-ui text-[9px] text-muted-foreground">{day}</span></div>)}</div></section><section className="card p-6 sm:p-7"><div className="mb-6 flex items-center justify-between"><div><div className="section-title">Your next best move</div><p className="mt-1 text-xs text-muted-foreground">A recommendation, not a demand.</p></div><Lightbulb size={20} className="text-[#f47c52]" /></div><div className="rounded-xl bg-[#f5f0e4] p-4"><div className="font-mono-ui text-[10px] uppercase tracking-[.14em] text-[#b65c36]">Weak spot</div><div className="mt-2 font-display text-xl font-bold">{data.weakSpot}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Spend five minutes with a few examples, then use one in your own sentence.</p><Link href="/conjugation" className="button-secondary mt-4" data-testid="link-dashboard-recommendation">Review it <ArrowRight size={13} /></Link></div><div className="mt-7"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold">Recently touched</span><Link href="/vocabulary" className="text-[11px] font-semibold text-[#1f5ebd]" data-testid="link-dashboard-vocabulary">Open vocabulary</Link></div>{data.recentWords?.length ? <div className="flex flex-wrap gap-2">{data.recentWords.map((word) => <span className="chip" key={word}>{word}</span>)}</div> : <p className="text-xs text-muted-foreground">Your recent words will collect here.</p>}</div></section></div><section className="card mt-6 p-6 sm:p-7"><div className="mb-5 flex items-center justify-between"><div><div className="section-title">Patterns to revisit</div><p className="mt-1 text-xs text-muted-foreground">Your tutor keeps track of patterns that come up more than once.</p></div><Link href="/tutor" className="button-secondary">Practice with tutor <MessageCircle size={13} /></Link></div>{mistakes.isLoading ? <LoadingBlock rows={2} /> : mistakes.data?.length ? <div className="grid gap-3 md:grid-cols-2">{mistakes.data.slice(0, 6).map((mistake) => <div className="rounded-xl bg-[#f5f0e4] p-4" key={mistake.pattern}><div className="flex items-center justify-between"><span className="font-display font-bold">{mistake.pattern}</span><span className="chip chip-orange">{mistake.count}×</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{mistake.explanation}</p></div>)}</div> : <p className="text-xs text-muted-foreground">Start a conversation and your recurring patterns will appear here.</p>}</section></> : <EmptyState title="Your story starts here" text="Complete your first practice and your progress will begin to take shape." />}
  </div>;
}

function RecentActivity() {
  const { user } = useUser();
  const dashboard = useGetDashboard({ query: { enabled: Boolean(user), queryKey: getGetDashboardQueryKey(), staleTime: 60000 } });
  const data = dashboard.data as Dashboard | undefined;
  if (!user) return null;

  return <section className="card mb-6 p-6 sm:p-7" data-testid="card-recent-activity">
    <div className="mb-5 flex items-center justify-between">
      <div><div className="section-title">Recent practice</div><p className="mt-1 text-xs text-muted-foreground">A short trail of the work you have been doing.</p></div>
      <Clock3 size={20} className="text-[#247a61]" />
    </div>
    {dashboard.isLoading ? <LoadingBlock rows={3} /> : dashboard.isError ? <ErrorMessage onRetry={() => dashboard.refetch()} /> : data?.recentActivity?.length ? <div className="space-y-3">{data.recentActivity.map((session, index) => <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f5f0e4] px-4 py-3" key={`${session.completedAt}-${session.activity}-${index}`}><div className="flex min-w-0 items-center gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#dceee3] text-[#247a61]"><MessageCircle size={15} /></div><span className="truncate text-sm font-semibold">{activityLabel(session.activity)}</span></div><time className="shrink-0 font-mono-ui text-[10px] text-muted-foreground" dateTime={new Date(session.completedAt).toISOString()}>{activityDate(session.completedAt)}</time></div>)}</div> : <p className="rounded-xl bg-[#f5f0e4] p-4 text-xs leading-5 text-muted-foreground" data-testid="status-activity-empty">Your recent practice will appear here after your first session.</p>}
  </section>;
}

function Dashboard() {
  return <><div className="content pb-0"><RecentActivity /></div><ProgressDashboard /></>;
}

function Pricing() {
  const { user } = useUser();
  const [location, setLocation] = useLocation();
  const checkoutStatus = new URLSearchParams(window.location.search).get("checkout");
  const checkoutSessionId = new URLSearchParams(window.location.search).get("session_id") ?? undefined;
  const plans = useGetBillingPlans({ query: { queryKey: ["/api/billing/plans"], staleTime: 300000 } });
  const access = useGetBillingAccess(checkoutSessionId ? { session_id: checkoutSessionId } : undefined, {
    query: { enabled: Boolean(user), queryKey: ["/api/billing/access", checkoutSessionId ?? "current"], retry: false },
  });
  const checkout = useCreateBillingCheckout({
    mutation: {
      onSuccess: (result) => {
        window.location.assign(result.url);
      },
    },
  });

  useEffect(() => {
    if (checkoutStatus === "success" && access.data?.active && access.data.premiumUrl) {
      window.location.assign(access.data.premiumUrl);
    }
  }, [access.data, checkoutStatus]);

  const startCheckout = (planId: "basic" | "platinum") => {
    if (!user) {
      setLocation(`/sign-up?redirect_url=${encodeURIComponent(`${basePath}/pricing`)}`);
      return;
    }
    checkout.mutate({ data: { planId } });
  };

  const availablePlans = plans.data as BillingPlan[] | undefined;
  return <div className="content">
    <div className="mx-auto max-w-5xl text-center">
      <div className="eyebrow">Frenchami Premium</div>
      <h1 className="page-heading mt-3">Learn with more<br /><span className="text-[#247a61]">room to grow.</span></h1>
      <p className="page-subheading mx-auto max-w-2xl">Choose a plan, complete secure checkout with Stripe, then Frenchami confirms your subscription before opening the premium learning space.</p>
      {checkoutStatus === "success" && <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-[#eff8f2] p-4 text-left" data-testid="status-payment-verification">{access.isLoading ? <div className="text-sm font-semibold text-[#247a61]">Verifying your subscription with Stripe…</div> : access.data?.active ? <div className="text-sm font-semibold text-[#247a61]">Payment confirmed. Opening your premium learning space…</div> : <div><div className="text-sm font-semibold text-[#b65c36]">Your payment is still being confirmed.</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Refresh this page in a moment. The premium app will only open after Stripe confirms an active subscription.</p></div>}</div>}
      {checkoutStatus === "cancelled" && <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-[#f5f0e4] p-4 text-left text-sm text-muted-foreground" data-testid="status-checkout-cancelled">Checkout was cancelled. Your free Frenchami tools are still here whenever you need them.</div>}
    </div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2">
      {plans.isLoading ? <LoadingBlock rows={2} /> : plans.isError || !availablePlans?.length ? <div className="md:col-span-2"><ErrorMessage onRetry={() => plans.refetch()} /></div> : availablePlans.map((plan) => {
        const platinum = plan.id === "platinum";
        const billed = plan.interval === "year" ? "billed yearly" : "billed monthly";
        const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency.toUpperCase(), minimumFractionDigits: 2 }).format(plan.amount / 100);
        return <section key={plan.id} className={`card relative overflow-hidden p-7 sm:p-9 ${platinum ? "border-2 border-[#247a61] bg-[#f4fbf6]" : ""}`} data-testid={`card-pricing-${plan.id}`}>
          {platinum && <div className="absolute right-0 top-0 rounded-bl-xl bg-[#247a61] px-3 py-1.5 font-mono-ui text-[10px] font-bold uppercase tracking-[.12em] text-white">Best value</div>}
          <div className={`inline-flex rounded-xl p-3 ${platinum ? "bg-[#247a61] text-white" : "bg-[#e8effb] text-[#1f5ebd]"}`}>{platinum ? <Sparkles size={21} /> : <BookOpen size={21} />}</div>
          <div className="mt-7 font-display text-3xl font-bold">{plan.name}</div>
          <p className="mt-2 min-h-10 text-sm leading-6 text-muted-foreground">{plan.description}</p>
          <div className="mt-7 flex items-end gap-2"><span className="font-display text-5xl font-bold tracking-[-.06em]">{amount}</span><span className="mb-1.5 text-sm text-muted-foreground">/{plan.interval === "year" ? "year" : "month"}</span></div>
          <div className="mt-2 font-mono-ui text-[10px] uppercase tracking-[.13em] text-muted-foreground">{billed}</div>
          <div className="my-7 divider" />
          <ul className="space-y-3 text-sm">
            {(platinum ? ["Everything in Basic", "Full premium learning plan", "Priority access to new lessons"] : ["Guided French learning", "Save your personal progress", "Secure Stripe subscription"]).map((feature) => <li className="flex items-center gap-2" key={feature}><CheckCircle2 size={16} className="shrink-0 text-[#247a61]" />{feature}</li>)}
          </ul>
          {access.data?.active && access.data.premiumUrl ? <a href={access.data.premiumUrl} className="button-primary mt-8 w-full" data-testid={`button-open-premium-${plan.id}`}>Open premium app <ArrowUpRight size={14} /></a> : <button className={`mt-8 w-full ${platinum ? "button-primary" : "button-secondary"}`} onClick={() => startCheckout(plan.id as "basic" | "platinum")} disabled={checkout.isPending} data-testid={`button-checkout-${plan.id}`}>{checkout.isPending ? "Opening secure checkout…" : user ? `Choose ${plan.name}` : "Create account to subscribe"} <ArrowRight size={14} /></button>}
        </section>;
      })}
    </div>
    <p className="mx-auto mt-7 max-w-2xl text-center text-xs leading-5 text-muted-foreground">Payments are handled securely by Stripe. Premium access is unlocked only after your subscription is confirmed.</p>
    {!user && <div className="mx-auto mt-7 max-w-xl"><AuthPrompt title="Start with a free learner account" text="Create an account before checkout so Frenchami can safely connect your paid subscription to your learning space." redirectPath={`${basePath}/pricing`} /></div>}
    {user && access.data?.active && access.data.premiumUrl && checkoutStatus !== "success" && <div className="mx-auto mt-8 max-w-2xl rounded-2xl bg-[#eff8f2] p-5 text-center"><div className="font-display text-xl font-bold text-[#247a61]">Your Premium subscription is active.</div><p className="mt-1 text-xs text-muted-foreground">You can open the premium learning space whenever you are ready.</p><a href={access.data.premiumUrl} className="button-primary mt-4" data-testid="link-open-active-premium">Open premium app <ArrowUpRight size={14} /></a></div>}
    {checkout.isError && <div className="mx-auto mt-6 max-w-2xl"><ErrorMessage onRetry={() => checkout.reset()} /></div>}
  </div>;
}

function Router() {
  return <ErrorBoundary resetKey={useLocation()[0]}><Shell><Switch><Route path="/" component={Home} /><Route path="/dictionary" component={Dictionary} /><Route path="/dictionary/:word" component={Dictionary} /><Route path="/translate" component={Translate} /><Route path="/conjugation" component={Conjugation} /><Route path="/vocabulary" component={Vocabulary} /><Route path="/practice" component={Practice} /><Route path="/tutor" component={Tutor} /><Route path="/dashboard" component={Dashboard} /><Route path="/pricing" component={Pricing} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function PublicRouter() {
  return <Router />;
}

function HealthProbe() {
  useHealthCheck({ query: { queryKey: ['/api/healthz'], staleTime: 300000, retry: false } });
  return null;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  const authRedirect = (() => {
    const candidate = new URLSearchParams(window.location.search).get("redirect_url");
    if (!candidate) return basePath || "/";
    try {
      const url = new URL(candidate, window.location.origin);
      return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : basePath || "/";
    } catch {
      return basePath || "/";
    }
  })();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <HealthProbe />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?">
              <div className="auth-page">
                <SignIn
                  routing="path"
                  path={`${basePath}/sign-in`}
                  signUpUrl={`${basePath}/sign-up`}
                  fallbackRedirectUrl={authRedirect}
                />
              </div>
            </Route>
            <Route path="/sign-up/*?">
              <div className="auth-page">
                <SignUp
                  routing="path"
                  path={`${basePath}/sign-up`}
                  signInUrl={`${basePath}/sign-in`}
                  fallbackRedirectUrl={authRedirect}
                />
              </div>
            </Route>
            <Route>
              <PublicRouter />
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkApp />
    </WouterRouter>
  );
}

export default App;
