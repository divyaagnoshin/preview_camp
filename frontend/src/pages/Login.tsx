import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Zap, Mail, Lock, ArrowRight } from 'lucide-react';

/* ─────────────────────────────────────────
   Animated SVG: Agent → System → Customers
───────────────────────────────────────────*/
function CallAnimation() {
  const animRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const TRAVEL = 1400;
    const RING   = 1100;
    const CYCLE  = 7000;
    let t0: number | null = null;

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function getPos(pts: {x:number;y:number}[], t: number) {
      if (t <= 0) return pts[0];
      if (t >= 1) return pts[pts.length - 1];
      const s = t * (pts.length - 1);
      const i = Math.floor(s);
      const f = s - i;
      return { x: lerp(pts[i].x, pts[i+1].x, f), y: lerp(pts[i].y, pts[i+1].y, f) };
    }

    const g = (id: string) => svgRef.current?.getElementById(id) as SVGElement | null;

    const calls = [
      {
        dot:'d1', ra:'r1a', rb:'r1b', ph:'ph1', cs:'cs1',
        pts:[{x:52,y:148},{x:95,y:148},{x:130,y:145},{x:158,y:138},{x:188,y:110},{x:210,y:82},{x:232,y:62}],
        delay:0,
      },
      {
        dot:'d2', ra:'r2a', rb:'r2b', ph:'ph2', cs:'cs2',
        pts:[{x:52,y:148},{x:95,y:148},{x:130,y:148},{x:158,y:148},{x:188,y:148},{x:212,y:148},{x:236,y:148}],
        delay:2000,
      },
      {
        dot:'d3', ra:'r3a', rb:'r3b', ph:'ph3', cs: null,
        pts:[{x:52,y:148},{x:95,y:148},{x:130,y:150},{x:158,y:158},{x:188,y:186},{x:210,y:210},{x:232,y:234}],
        delay:3800,
      },
    ];

    function frame(ts: number) {
      if (!t0) t0 = ts;
      const elapsed = (ts - t0) % CYCLE;

      // hub pulse
      const hp = 0.5 + 0.5 * Math.sin(ts * 0.0022);
      const hr1 = g('h-r1'); const hr2 = g('h-r2'); const hr3 = g('h-r3');
      if (hr1) { hr1.setAttribute('r', String(26 + hp * 7)); hr1.setAttribute('opacity', String(0.12 + hp * 0.22)); }
      if (hr2) { hr2.setAttribute('r', String(34 + hp * 8)); hr2.setAttribute('opacity', String(0.07 + hp * 0.13)); }
      if (hr3) { hr3.setAttribute('r', String(44 + hp * 10)); hr3.setAttribute('opacity', String(0.03 + hp * 0.07)); }

      // agent status pulse
      const ast = g('a-status');
      if (ast) ast.setAttribute('r', String(4 + hp * 1.5));

      calls.forEach(c => {
        const el = Math.max(0, elapsed - c.delay);
        const prog = Math.min(el / TRAVEL, 1);
        const pos = getPos(c.pts, prog);

        const dot = g(c.dot);
        const ra  = g(c.ra);
        const rb  = g(c.rb);
        const ph  = g(c.ph);
        const cs  = c.cs ? g(c.cs) : null;

        if (!dot || !ra || !rb || !ph) return;

        dot.setAttribute('cx', String(pos.x));
        dot.setAttribute('cy', String(pos.y));

        if (prog < 1) {
          const fade = prog < 0.06 ? prog / 0.06 : prog > 0.88 ? (1 - prog) / 0.12 : 1;
          dot.setAttribute('opacity', String(fade * 0.95));
          ra.setAttribute('opacity', '0');
          rb.setAttribute('opacity', '0');
          ph.setAttribute('opacity', '0');
          if (cs) cs.setAttribute('fill', 'rgba(255,255,255,0.25)');
        } else {
          dot.setAttribute('opacity', '0');
          const rt = Math.min((el - TRAVEL) / RING, 1);
          if (rt < 1) {
            const rf = rt < 0.2 ? rt / 0.2 : rt > 0.65 ? (1 - rt) / 0.35 : 1;
            ra.setAttribute('opacity', String(rf * 0.95));
            rb.setAttribute('opacity', String(rf * 0.5));
            ph.setAttribute('opacity', rt > 0.1 ? '1' : '0');
            if (cs) cs.setAttribute('fill', '#4ade80');
          } else {
            ra.setAttribute('opacity', '0');
            rb.setAttribute('opacity', '0');
            ph.setAttribute('opacity', '0');
            if (cs) cs.setAttribute('fill', 'rgba(255,255,255,0.25)');
          }
        }
      });

      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 290 296"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-[290px]"
      style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.25))' }}
    >
      {/* ── AGENT card ── */}
      <rect x="2" y="100" width="80" height="96" rx="14"
        fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2"/>
      <circle cx="42" cy="128" r="15" fill="rgba(255,255,255,0.18)"/>
      {/* face */}
      <circle cx="42" cy="125" r="6" fill="rgba(244,82,30,0.85)"/>
      <path d="M38 131 Q42 135 46 131" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" strokeLinecap="round"/>
      {/* headset arc */}
      <path d="M30 125 Q30 110 42 110 Q54 110 54 125" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" strokeLinecap="round"/>
      <rect x="28" y="123" width="5" height="9" rx="2.5" fill="rgba(255,255,255,0.95)"/>
      <rect x="51" y="123" width="5" height="9" rx="2.5" fill="rgba(255,255,255,0.95)"/>
      {/* mic */}
      <path d="M54 128 Q60 128 60 134" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="60" cy="135" r="2.2" fill="rgba(255,255,255,0.65)"/>
      {/* label */}
      <rect x="10" y="150" width="62" height="16" rx="6" fill="rgba(255,255,255,0.12)"/>
      <text x="41" y="161.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="rgba(255,255,255,0.9)" fontFamily="'Plus Jakarta Sans', sans-serif">Agent</text>
      {/* status dot */}
      <circle cx="42" cy="182" r="4" fill="#4ade80" id="a-status"/>
      <text x="42" y="194" textAnchor="middle" fontSize="7.5" fill="rgba(255,255,255,0.4)" fontFamily="sans-serif">Online</text>

      {/* ── SYSTEM HUB ── */}
      <circle cx="145" cy="148" r="44" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="2" id="h-r3"/>
      <circle cx="145" cy="148" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" id="h-r2"/>
      <circle cx="145" cy="148" r="26" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" id="h-r1"/>
      <circle cx="145" cy="148" r="20" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.38)" strokeWidth="1.5"/>
      {/* server rows */}
      <rect x="136" y="139" width="18" height="4" rx="1.5" fill="rgba(255,255,255,0.75)"/>
      <rect x="136" y="146" width="18" height="4" rx="1.5" fill="rgba(255,255,255,0.75)"/>
      <rect x="136" y="153" width="18" height="4" rx="1.5" fill="rgba(255,255,255,0.75)"/>
      <circle cx="152" cy="141" r="1.7" fill="#4ade80"/>
      <circle cx="152" cy="148" r="1.7" fill="#facc15"/>
      <circle cx="152" cy="155" r="1.7" fill="#4ade80"/>
      {/* hub label */}
      <rect x="118" y="171" width="54" height="15" rx="6" fill="rgba(255,255,255,0.12)"/>
      <text x="145" y="182" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="rgba(255,255,255,0.88)" fontFamily="'Plus Jakarta Sans', sans-serif">PreviewCamp</text>

      {/* ── CUSTOMER 1 — top right ── */}
      <rect x="208" y="18" width="78" height="90" rx="14"
        fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" id="cb1"/>
      <circle cx="247" cy="44" r="15" fill="rgba(255,255,255,0.18)"/>
      <circle cx="247" cy="41" r="6" fill="rgba(124,58,237,0.75)"/>
      <path d="M243 47 Q247 51 251 47" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M235 66 Q235 59 247 59 Q259 59 259 66 L259 72 Q253 68 247 68 Q241 68 235 72Z" fill="rgba(255,255,255,0.32)"/>
      <rect x="216" y="76" width="62" height="16" rx="6" fill="rgba(255,255,255,0.12)"/>
      <text x="247" y="87.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="rgba(255,255,255,0.9)" fontFamily="'Plus Jakarta Sans', sans-serif">Customer</text>
      <circle cx="247" cy="104" r="3.5" fill="rgba(255,255,255,0.25)" id="cs1"/>

      {/* ── CUSTOMER 2 — middle right ── */}
      <rect x="212" y="110" width="78" height="90" rx="14"
        fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" id="cb2"/>
      <circle cx="251" cy="136" r="15" fill="rgba(255,255,255,0.18)"/>
      <circle cx="251" cy="133" r="6" fill="rgba(13,148,136,0.8)"/>
      <path d="M247 139 Q251 143 255 139" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M239 158 Q239 151 251 151 Q263 151 263 158 L263 164 Q257 160 251 160 Q245 160 239 164Z" fill="rgba(255,255,255,0.32)"/>
      <rect x="220" y="168" width="62" height="16" rx="6" fill="rgba(255,255,255,0.12)"/>
      <text x="251" y="179.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="rgba(255,255,255,0.9)" fontFamily="'Plus Jakarta Sans', sans-serif">Customer</text>
      <circle cx="251" cy="196" r="3.5" fill="rgba(255,255,255,0.25)" id="cs2"/>

      {/* ── CUSTOMER 3 — bottom right ── */}
      <rect x="208" y="200" width="78" height="90" rx="14"
        fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" id="cb3"/>
      <circle cx="247" cy="226" r="15" fill="rgba(255,255,255,0.18)"/>
      <circle cx="247" cy="223" r="6" fill="rgba(180,83,9,0.8)"/>
      <path d="M243 229 Q247 233 251 229" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M235 248 Q235 241 247 241 Q259 241 259 248 L259 254 Q253 250 247 250 Q241 250 235 254Z" fill="rgba(255,255,255,0.32)"/>
      <rect x="216" y="258" width="62" height="16" rx="6" fill="rgba(255,255,255,0.12)"/>
      <text x="247" y="269.5" textAnchor="middle" fontSize="9" fontWeight="600" fill="rgba(255,255,255,0.9)" fontFamily="'Plus Jakarta Sans', sans-serif">Customer</text>

      {/* ── DASHED CONNECTOR LINES ── */}
      {/* agent → hub */}
      <line x1="82" y1="148" x2="119" y2="148" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4,3"/>
      {/* hub → cust1 */}
      <line x1="163" y1="132" x2="208" y2="76" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4,3"/>
      {/* hub → cust2 */}
      <line x1="165" y1="148" x2="212" y2="154" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4,3"/>
      {/* hub → cust3 */}
      <line x1="163" y1="164" x2="208" y2="228" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4,3"/>

      {/* ── ANIMATED DOTS ── */}
      <circle r="6.5" fill="#ffffff" id="d1" opacity="0"/>
      <circle r="6.5" fill="#ffffff" id="d2" opacity="0"/>
      <circle r="6.5" fill="#ffffff" id="d3" opacity="0"/>

      {/* ── RINGING RINGS ── */}
      <circle cx="247" cy="44"  r="19" fill="none" stroke="#F5A623" strokeWidth="2"   id="r1a" opacity="0"/>
      <circle cx="247" cy="44"  r="28" fill="none" stroke="rgba(245,166,35,0.3)" strokeWidth="1.5" id="r1b" opacity="0"/>
      <circle cx="251" cy="136" r="19" fill="none" stroke="#F5A623" strokeWidth="2"   id="r2a" opacity="0"/>
      <circle cx="251" cy="136" r="28" fill="none" stroke="rgba(245,166,35,0.3)" strokeWidth="1.5" id="r2b" opacity="0"/>
      <circle cx="247" cy="226" r="19" fill="none" stroke="#F5A623" strokeWidth="2"   id="r3a" opacity="0"/>
      <circle cx="247" cy="226" r="28" fill="none" stroke="rgba(245,166,35,0.3)" strokeWidth="1.5" id="r3b" opacity="0"/>

      {/* ── PHONE BADGES ── */}
      <g id="ph1" opacity="0">
        <rect x="232" y="28" width="30" height="24" rx="8" fill="#F5A623"/>
        <text x="247" y="45" textAnchor="middle" fontSize="14" fontFamily="sans-serif">📞</text>
      </g>
      <g id="ph2" opacity="0">
        <rect x="236" y="120" width="30" height="24" rx="8" fill="#F5A623"/>
        <text x="251" y="137" textAnchor="middle" fontSize="14" fontFamily="sans-serif">📞</text>
      </g>
      <g id="ph3" opacity="0">
        <rect x="232" y="210" width="30" height="24" rx="8" fill="#F5A623"/>
        <text x="247" y="227" textAnchor="middle" fontSize="14" fontFamily="sans-serif">📞</text>
      </g>
    </svg>
  );
}

/* ─────────────────────────────────────────
   Main Login Page
───────────────────────────────────────────*/
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      const stored = localStorage.getItem('user');
      const role   = stored ? (JSON.parse(stored).role as string) : '';
      navigate(role === 'superadmin' ? '/organizations' : '/workspace');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className='min-h-screen flex' style={{ background: '#FFF8F2' }}>

      {/* ── LEFT BANNER (60% wide) ── */}
      <div
        className='hidden lg:flex flex-col justify-between p-10 relative overflow-hidden'
        style={{
          width: '58%',
          background: 'linear-gradient(145deg, #1A0F00 0%, #2D1200 40%, #3D1A00 100%)',
        }}
      >
        {/* Decorative radial glows */}
        <div className='absolute top-[-100px] left-[-100px] w-[420px] h-[420px] rounded-full opacity-25 pointer-events-none'
          style={{ background: 'radial-gradient(circle, #F4521E, transparent)' }}/>
        <div className='absolute bottom-[-80px] right-[-80px] w-[320px] h-[320px] rounded-full opacity-20 pointer-events-none'
          style={{ background: 'radial-gradient(circle, #F5A623, transparent)' }}/>
        {/* subtle dot grid */}
        <div className='absolute inset-0 pointer-events-none' style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}/>

        {/* Brand */}
        <div className='flex items-center gap-3 relative z-10'>
          <div className='w-10 h-10 rounded-xl flex items-center justify-center'
            style={{ background: 'linear-gradient(135deg, #F4521E, #F5A623)', boxShadow: '0 4px 20px rgba(244,82,30,0.5)' }}>
            <Zap className='w-5 h-5 text-white' fill='white'/>
          </div>
          <span className='text-xl font-bold text-white' style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-0.02em' }}>
            PreviewCamp
          </span>
        </div>

        {/* ── CENTER ANIMATION ── */}
        <div className='flex-1 flex flex-col items-center justify-center relative z-10 py-4'>
          <CallAnimation/>
          {/* caption below animation */}
          <div className='mt-6 text-center'>
            <p className='text-sm font-semibold text-[#E8C9B0]' style={{ fontFamily: 'Syne, sans-serif' }}>
              Agent → System → Customer
            </p>
            <p className='text-xs text-[#7A5C44] mt-1'>Live preview call routing in action</p>
          </div>
        </div>

        {/* Bottom headline + feature pills */}
        <div className='relative z-10 space-y-5'>
          <div>
            <h2 className='text-3xl font-bold text-white leading-tight' style={{ fontFamily: 'Syne, sans-serif' }}>
              Power your{' '}
              <span style={{ background: 'linear-gradient(135deg, #F4521E, #F5A623)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                campaigns
              </span>
            </h2>
            <p className='text-[#7A5C44] text-sm mt-2 leading-relaxed'>
              Manage preview campaigns, agents, and contact lists — all in one place.
            </p>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            {[
              ['🚀', 'Fast Dialing',    'Preview & power modes'],
              ['🎯', 'Smart Routing',   'Priority-based agents'],
              ['📊', 'Live Reports',    'Real-time analytics'],
              ['🛡️', 'DNC Compliance', 'Auto-filter lists'],
            ].map(([icon, title, sub]) => (
              <div key={title} className='rounded-xl p-3'
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className='text-lg mb-1'>{icon}</div>
                <div className='text-xs font-semibold text-[#E8C9B0]' style={{ fontFamily: 'Syne, sans-serif' }}>{title}</div>
                <div className='text-xs text-[#7A5C44]'>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT LOGIN PANEL ── */}
      <div
        className='flex-1 flex items-center justify-center p-6 relative'
        style={{ background: 'linear-gradient(135deg, #FFF8F2 0%, #FFF0E5 100%)' }}
      >
        {/* faint blob decorations */}
        <div className='absolute top-[-60px] right-[-60px] w-72 h-72 rounded-full pointer-events-none'
          style={{ background: 'radial-gradient(circle, rgba(244,82,30,0.07), transparent)' }}/>
        <div className='absolute bottom-[-40px] left-[-40px] w-56 h-56 rounded-full pointer-events-none'
          style={{ background: 'radial-gradient(circle, rgba(245,166,35,0.07), transparent)' }}/>

        <div className='w-full max-w-[380px] relative z-10'>

          {/* Mobile logo */}
          <div className='flex items-center gap-3 mb-8 lg:hidden'>
            <div className='w-10 h-10 rounded-xl flex items-center justify-center'
              style={{ background: 'linear-gradient(135deg, #F4521E, #F5A623)' }}>
              <Zap className='w-5 h-5 text-white' fill='white'/>
            </div>
            <span className='text-xl font-bold text-[#1A0F00]' style={{ fontFamily: 'Syne, sans-serif' }}>PreviewCamp</span>
          </div>

          {/* ── LOGIN CARD ── */}
          <div
            style={{
              background: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(16px)',
              border: '1.5px solid rgba(244,82,30,0.18)',
              borderRadius: '24px',
              padding: '38px 36px',
              boxShadow: '0 8px 40px rgba(194,65,12,0.12), 0 1px 0 rgba(255,255,255,0.95) inset',
            }}
          >
            {/* Card header */}
            <div className='mb-7'>
              <h1 className='text-[26px] font-bold text-[#1A0F00] leading-tight mb-1.5'
                style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-0.03em' }}>
                Welcome back
              </h1>
              <p className='text-sm text-[#A16030]'>Sign in to your PreviewCamp account</p>
            </div>

            <form onSubmit={handleSubmit} className='space-y-5'>
              {/* Email */}
              <div>
                <label className='block text-[11px] font-bold text-[#5C4030] mb-2 uppercase tracking-wide'>
                  Email address
                </label>
                <div className='relative'>
                  <Mail className='absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4956A]'/>
                  <input
                    type='email' value={email}
                    onChange={e => setEmail(e.target.value)}
                    required autoFocus
                    placeholder='you@company.com'
                    style={{
                      width: '100%', border: '1.5px solid rgba(244,82,30,0.2)',
                      borderRadius: '12px', paddingLeft: '40px', paddingRight: '16px',
                      paddingTop: '11px', paddingBottom: '11px',
                      fontSize: '14px', background: 'rgba(255,255,255,0.9)',
                      color: '#1A0F00', outline: 'none', fontFamily: 'inherit',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#F4521E'; e.target.style.boxShadow = '0 0 0 3px rgba(244,82,30,0.12)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(244,82,30,0.2)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <label className='block text-[11px] font-bold text-[#5C4030] uppercase tracking-wide'>
                    Password
                  </label>
                  <a href='#' style={{ fontSize: '11.5px', color: '#F4521E', textDecoration: 'none', fontWeight: 500 }}>
                    Forgot password?
                  </a>
                </div>
                <div className='relative'>
                  <Lock className='absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#C4956A]'/>
                  <input
                    type='password' value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder='••••••••'
                    style={{
                      width: '100%', border: '1.5px solid rgba(244,82,30,0.2)',
                      borderRadius: '12px', paddingLeft: '40px', paddingRight: '16px',
                      paddingTop: '11px', paddingBottom: '11px',
                      fontSize: '14px', background: 'rgba(255,255,255,0.9)',
                      color: '#1A0F00', outline: 'none', fontFamily: 'inherit',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#F4521E'; e.target.style.boxShadow = '0 0 0 3px rgba(244,82,30,0.12)'; }}
                    onBlur={e  => { e.target.style.borderColor = 'rgba(244,82,30,0.2)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ borderRadius: '12px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type='submit' disabled={loading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '8px', padding: '12px', borderRadius: '13px',
                  fontSize: '14px', fontWeight: 700, color: '#fff', border: 'none',
                  background: 'linear-gradient(135deg, #F4521E, #F5A623)',
                  boxShadow: '0 4px 20px rgba(244,82,30,0.4)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  fontFamily: 'inherit', letterSpacing: '0.01em',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform='translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 6px 24px rgba(244,82,30,0.5)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform=''; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 4px 20px rgba(244,82,30,0.4)'; }}
              >
                {loading ? 'Signing in…' : <><span>Sign In</span><ArrowRight className='w-4 h-4'/></>}
              </button>
            </form>

            {/* Demo hint */}
            <div style={{
              marginTop: '20px', borderRadius: '12px', padding: '10px 14px',
              background: 'rgba(244,82,30,0.05)', border: '1px solid rgba(244,82,30,0.12)',
              fontSize: '11.5px', color: '#A16030', textAlign: 'center', lineHeight: 1.6,
            }}>
              <span style={{ fontWeight: 600, color: '#7C3A10' }}>Need access? </span>{' '}
               Contact your admin
            </div>
          </div>

          {/* Below card note */}
          <p className='text-center text-xs text-[#B89070] mt-5'>
            Need access? Contact your organization admin.
          </p>
        </div>
      </div>
    </div>
  );
}