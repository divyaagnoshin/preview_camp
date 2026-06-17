import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  clearOrgContext as apiClearOrgContext,
  getOrgContext,
  login as apiLogin,
  OrgContext,
  setOrgContext as apiSetOrgContext,
} from '../api/client';

interface User {
  id: string; email: string; firstName: string; lastName: string;
  role: string; orgId: string; orgName: string;
}
interface AuthCtx {
  user: User | null; token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean; isSupervisor: boolean; isSuperadmin: boolean;
  // Superadmin "act-as" helpers; null when no organization is selected.
  orgContext: OrgContext | null;
  setOrgContext: (ctx: OrgContext) => void;
  clearOrgContext: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [orgContext, setOrgContextState] = useState<OrgContext | null>(getOrgContext());

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) try { setUser(JSON.parse(stored)); } catch {}
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiLogin(username, password);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    apiClearOrgContext();
    setOrgContextState(null);
    setToken(null); setUser(null);
  };

  const setOrgContext = (ctx: OrgContext) => {
    apiSetOrgContext(ctx);
    setOrgContextState(ctx);
  };
  const clearOrgContext = () => {
    apiClearOrgContext();
    setOrgContextState(null);
  };

  return (
    <AuthContext.Provider value={{
      user, token, login, logout,
      isAdmin: user?.role === 'admin',
      isSupervisor: ['admin','supervisor'].includes(user?.role || ''),
      isSuperadmin: user?.role === 'superadmin',
      orgContext, setOrgContext, clearOrgContext,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
