import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card, EmptyState, PageLoader, SearchInput, StatusBadge, StatCard } from '../components/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface TeamAgent {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  is_active: boolean;
}

interface SupervisorTeam {
  supervisor_id: string;
  supervisor_first_name: string;
  supervisor_last_name: string;
  supervisor_email: string;
  supervisor_username: string;
  supervisor_is_active: boolean;
  agents: TeamAgent[];
}

const listTeams = (): Promise<{ data: SupervisorTeam[] }> =>
  api.get('/supervisor-teams').then((r) => r.data);

export default function SupervisorTeamsPage() {
  const [openSupervisors, setOpenSupervisors] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const { data: teamsData, isLoading } = useQuery({ queryKey: ['supervisor-teams'], queryFn: listTeams });
  const teams: SupervisorTeam[] = teamsData?.data ?? [];

  const toggleSupervisor = (id: string) =>
    setOpenSupervisors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        `${t.supervisor_first_name} ${t.supervisor_last_name}`.toLowerCase().includes(q) ||
        t.supervisor_email.toLowerCase().includes(q) ||
        (t.supervisor_username ?? '').toLowerCase().includes(q),
    );
  }, [teams, search]);

  const totalAgents = teams.reduce((sum, t) => sum + t.agents.length, 0);

  if (isLoading) return <PageLoader />;

  const hasFilters = !!search;

  return (
    <div className="p-6 md:p-8 w-full space-y-6 animate-fade-up">

      {/* Header */}
      <div className="page-header-bar">
        <div>
          <h1 className="text-2xl font-bold page-heading">Supervisor Teams</h1>
          <p className="text-sm text-gray-500 mt-1">
            {hasFilters
              ? `${filteredTeams.length} of ${teams.length} supervisor(s)`
              : 'View which agents report to each supervisor'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Supervisors"     value={teams.length}  color="orange" />
        <StatCard label="Assigned Agents" value={totalAgents}   color="amber"  />
        <StatCard label="Teams Active"    value={teams.filter((t) => t.agents.length > 0).length} color="red" />
      </div>

      {/* Search */}
      {teams.length > 0 && (
        <div className="filter-bar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search supervisors by name, email or username…" />
        </div>
      )}

      {/* Teams accordion */}
      <Card>
        {teams.length === 0 ? (
          <EmptyState
            title="No supervisors found"
            description="There are no supervisor accounts in this organisation yet."
          />
        ) : filteredTeams.length === 0 ? (
          <EmptyState title="No matches" description="Try adjusting the search above." />
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredTeams.map((team) => {
              const open = openSupervisors.has(team.supervisor_id);
              const initials = `${team.supervisor_first_name?.[0] ?? ''}${team.supervisor_last_name?.[0] ?? ''}`;

              return (
                <div key={team.supervisor_id}>
                  {/* Supervisor header row */}
                  <button
                    onClick={() => toggleSupervisor(team.supervisor_id)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-orange-50/50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F4521E] to-[#F5A623] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">
                        {team.supervisor_first_name} {team.supervisor_last_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {team.supervisor_username
                          ? `@${team.supervisor_username} · ${team.supervisor_email}`
                          : team.supervisor_email}
                      </div>
                    </div>
                    <span className="text-xs bg-[#F4521E]/10 text-[#F4521E] px-2.5 py-1 rounded-full font-medium flex-shrink-0">
                      {team.agents.length} agent{team.agents.length !== 1 ? 's' : ''}
                    </span>
                    {open
                      ? <ChevronDown  className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  </button>

                  {/* Agents list */}
                  {open && (
                    <div className="border-t border-orange-100 bg-orange-50/30">
                      {team.agents.length === 0 ? (
                        <div className="px-5 py-4 text-sm text-gray-400 italic pl-14">
                          No agents assigned to this supervisor yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-orange-100/60">
                          {team.agents.map((agent) => (
                            <div
                              key={agent.id}
                              className="flex items-center gap-3 pl-14 pr-5 py-3 hover:bg-orange-50 transition-colors"
                            >
                              <div className="w-7 h-7 rounded-full bg-[#F5A623]/20 flex items-center justify-center text-[#C07010] text-xs font-bold flex-shrink-0">
                                {agent.first_name?.[0]}{agent.last_name?.[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {agent.first_name} {agent.last_name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {agent.username
                                    ? `@${agent.username} · ${agent.email}`
                                    : agent.email}
                                </div>
                              </div>
                              <StatusBadge status={agent.is_active ? 'active' : 'inactive'} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}