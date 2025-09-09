import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { Button } from '~/components/ui/Button';
import {
  githubConnectionAtom,
  githubConnectionStore,
  isGitHubConnected,
  isGitHubConnecting,
  isGitHubLoadingStats,
} from '~/lib/stores/githubConnection';
import { AuthDialog } from './AuthDialog';
import { StatsDisplay } from './StatsDisplay';
import { RepositoryList } from './RepositoryList';
import { SignedIn, useAuth } from '@clerk/remix';
import { SIGN_IN_URL } from '~/utils/auth.config';

interface GitHubConnectionProps {
  onCloneRepository?: (repoUrl: string) => void;
}

export default function GitHubConnection({ onCloneRepository }: GitHubConnectionProps = {}) {
  const connection = useStore(githubConnectionAtom);
  const isConnected = useStore(isGitHubConnected);
  const isConnecting = useStore(isGitHubConnecting);
  const isLoadingStats = useStore(isGitHubLoadingStats);

  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isStatsExpanded, setIsStatsExpanded] = useState(false);
  const [isReposExpanded, setIsReposExpanded] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const { getToken, isSignedIn } = useAuth();

  const handleConnect = () => {
    setIsAuthDialogOpen(true);
  };

  const handleDisconnect = () => {
    githubConnectionStore.disconnect();
    setIsStatsExpanded(false);
    setIsReposExpanded(false);
    toast.success('Disconnected from GitHub');
  };

  const buildSignInUrl = () => '/sign-in';

  const buildManageConnectionsUrl = () => {
    try {
      const base = new URL(SIGN_IN_URL);
      base.pathname = '/user';
      base.searchParams.set('redirect_url', typeof window !== 'undefined' ? `${window.location.origin}/` : '/');

      return base.toString();
    } catch {
      return SIGN_IN_URL;
    }
  };

  const handleImportFromOAuth = async () => {
    setIsImporting(true);
    setImportError(null);

    try {
      const jwt = await getToken();

      if (!jwt) {
        window.location.href = buildSignInUrl();
        return;
      }

      const res = await fetch('/api.github-import-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || `Server error ${res.status}`);
      }

      const data = (await res.json()) as { token?: string };

      if (!data.token) {
        throw new Error('No token returned');
      }

      // Use OAuth token as Bearer (matches 'fine-grained' behavior in store)
      await githubConnectionStore.connect(data.token, 'fine-grained');
      toast.success('Imported GitHub OAuth token');
    } catch (e: any) {
      setImportError(e?.message || 'Unknown error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleRefreshStats = async () => {
    try {
      await githubConnectionStore.fetchStats();
      toast.success('GitHub stats refreshed');
    } catch (error) {
      toast.error(`Failed to refresh stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleTokenTypeChange = (tokenType: 'classic' | 'fine-grained') => {
    githubConnectionStore.updateTokenType(tokenType);
  };

  const handleCloneRepository = (repoUrl: string) => {
    if (onCloneRepository) {
      onCloneRepository(repoUrl);
    } else {
      window.open(repoUrl, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor">
            <div className="i-ph:git-repository text-bolt-elements-icon-primary w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">GitHub</h3>
            <p className="text-sm text-bolt-elements-textSecondary">
              {isConnected
                ? `Connected as ${connection.user?.login}`
                : 'Connect your GitHub account to manage repositories'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Button
                onClick={handleRefreshStats}
                disabled={isLoadingStats}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {isLoadingStats ? (
                  <>
                    <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <div className="i-ph:arrows-clockwise w-4 h-4" />
                    Refresh Stats
                  </>
                )}
              </Button>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                className="text-bolt-elements-textDanger hover:text-bolt-elements-textDanger"
              >
                <div className="i-ph:sign-out w-4 h-4 mr-2" />
                Disconnect
              </Button>
              <SignedIn>
                <Button
                  onClick={handleImportFromOAuth}
                  disabled={isImporting}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <div className="i-ph:github-logo w-4 h-4" />
                      Import OAuth Token
                    </>
                  )}
                </Button>
              </SignedIn>
            </>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              {isConnecting ? (
                <>
                  <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <div className="i-ph:plus w-4 h-4" />
                  Connect
                </>
              )}
            </Button>
          )}
          {!isConnected && (
            <SignedIn>
              <Button
                onClick={handleImportFromOAuth}
                disabled={isImporting}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <div className="i-ph:github-logo w-4 h-4" />
                    Import OAuth Token
                  </>
                )}
              </Button>
            </SignedIn>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="p-4 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-bolt-elements-textSecondary">
              <div className="font-medium text-bolt-elements-textPrimary mb-1">Use your GitHub OAuth token</div>
              <div>
                We can import your GitHub OAuth access token from your Clerk session. This avoids creating a personal
                access token.
              </div>
              {importError && <div className="mt-2 text-bolt-elements-textDanger">{importError}</div>}
            </div>
            <div className="flex items-center gap-2">
              {isSignedIn ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleImportFromOAuth} disabled={isImporting}>
                    {isImporting ? 'Importing…' : 'Import OAuth Token'}
                  </Button>
                  <a href={buildManageConnectionsUrl()} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm">
                      Manage connections
                    </Button>
                  </a>
                </>
              ) : (
                <a href={buildSignInUrl()}>
                  <Button variant="outline" size="sm">
                    Sign in to import
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div className="p-4 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor">
        <div className="flex items-center gap-3">
          <div
            className={classNames(
              'w-3 h-3 rounded-full',
              isConnected ? 'bg-bolt-elements-icon-success' : 'bg-bolt-elements-icon-secondary',
            )}
          />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">
            {isConnected ? 'Connected' : 'Not Connected'}
          </span>

          {connection.rateLimit && (
            <span className="text-xs text-bolt-elements-textSecondary ml-auto">
              Rate limit: {connection.rateLimit.remaining}/{connection.rateLimit.limit}
            </span>
          )}
        </div>

        {/* Token Type Selection */}
        {isConnected && (
          <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor">
            <label className="block text-xs font-medium text-bolt-elements-textPrimary mb-2">Token Type</label>
            <div className="flex gap-3">
              {(['classic', 'fine-grained'] as const).map((type) => (
                <label key={type} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    value={type}
                    checked={connection.tokenType === type}
                    onChange={() => handleTokenTypeChange(type)}
                    className="mr-2 text-bolt-elements-item-contentAccent focus:ring-bolt-elements-item-contentAccent"
                  />
                  <span className="text-xs text-bolt-elements-textSecondary capitalize">
                    {type.replace('-', ' ')} Token
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User Profile */}
      {isConnected && connection.user && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor"
        >
          <div className="flex items-center gap-4">
            <img
              src={connection.user.avatar_url}
              alt={connection.user.login}
              className="w-12 h-12 rounded-full border-2 border-bolt-elements-item-contentAccent"
            />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
                {connection.user.name || connection.user.login}
              </h4>
              <p className="text-sm text-bolt-elements-textSecondary">@{connection.user.login}</p>
              {connection.user.bio && (
                <p className="text-xs text-bolt-elements-textTertiary mt-1 line-clamp-2">{connection.user.bio}</p>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm font-medium text-bolt-elements-textPrimary">
                {connection.user.public_repos?.toLocaleString() || 0}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary">repositories</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats Section */}
      {isConnected && connection.stats && (
        <Collapsible open={isStatsExpanded} onOpenChange={setIsStatsExpanded}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-all duration-200 cursor-pointer">
              <div className="flex items-center gap-2">
                <div className="i-ph:chart-bar w-4 h-4 text-bolt-elements-item-contentAccent" />
                <span className="text-sm font-medium text-bolt-elements-textPrimary">GitHub Stats</span>
              </div>
              <div
                className={classNames(
                  'i-ph:caret-down w-4 h-4 transform transition-transform duration-200 text-bolt-elements-textSecondary',
                  isStatsExpanded ? 'rotate-180' : '',
                )}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden">
            <div className="mt-4 p-4 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor">
              <StatsDisplay stats={connection.stats} onRefresh={handleRefreshStats} isRefreshing={isLoadingStats} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Repositories Section */}
      {isConnected && connection.stats?.repos && connection.stats.repos.length > 0 && (
        <Collapsible open={isReposExpanded} onOpenChange={setIsReposExpanded}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-all duration-200 cursor-pointer">
              <div className="flex items-center gap-2">
                <div className="i-ph:git-repository w-4 h-4 text-bolt-elements-item-contentAccent" />
                <span className="text-sm font-medium text-bolt-elements-textPrimary">
                  Repositories ({connection.stats.repos.length})
                </span>
              </div>
              <div
                className={classNames(
                  'i-ph:caret-down w-4 h-4 transform transition-transform duration-200 text-bolt-elements-textSecondary',
                  isReposExpanded ? 'rotate-180' : '',
                )}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden">
            <div className="mt-4 p-4 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor">
              <RepositoryList
                repositories={connection.stats.repos}
                onClone={handleCloneRepository}
                onRefresh={handleRefreshStats}
                isRefreshing={isLoadingStats}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Auth Dialog */}
      <AuthDialog isOpen={isAuthDialogOpen} onClose={() => setIsAuthDialogOpen(false)} />
    </div>
  );
}
