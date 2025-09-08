import ignore from 'ignore';
import { useGit } from '~/lib/hooks/useGit';
import { detectProjectCommands, createCommandsMessage, escapeBoltTags } from '~/utils/projectCommands';
import type { ExtendedUIMessage } from '~/types/ExtendedUIMessage';
import { generateId } from '~/utils/fileUtils';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { LoadingOverlay } from '~/components/ui/LoadingOverlay';

// import { RepositorySelectionDialog } from '~/components/@settings/tabs/connections/components/RepositorySelectionDialog';
import { classNames } from '~/utils/classNames';
import { Button } from '~/components/ui/Button';
import type { IChatMetadata } from '~/lib/persistence/db';
import { X, Github, GitBranch } from 'lucide-react';

// Import GitLab and GitHub connections for unified repository access
import GitLabConnection from '~/components/@settings/tabs/connections/gitlab/GitLabConnection';
import GitHubConnection from '~/components/@settings/tabs/connections/github/GitHubConnection';
import { useAuth } from '@clerk/remix';
import { useStore } from '@nanostores/react';
import { githubConnectionAtom, githubConnectionStore, isGitHubConnected } from '~/lib/stores/githubConnection';
import { SIGN_IN_URL } from '~/utils/auth.config';

const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.github/**',
  '.vscode/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',

  // Include this so npm install runs much faster '**/*lock.json',
  '**/*lock.yaml',
];

const ig = ignore().add(IGNORE_PATTERNS);

const MAX_FILE_SIZE = 100 * 1024; // 100KB limit per file
const MAX_TOTAL_SIZE = 500 * 1024; // 500KB total limit

interface GitCloneButtonProps {
  className?: string;
  importChat?: (description: string, messages: ExtendedUIMessage[], metadata?: IChatMetadata) => Promise<void>;
}

export default function GitCloneButton({ importChat, className }: GitCloneButtonProps) {
  const { ready, gitClone } = useGit();
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'github' | 'gitlab' | null>(null);
  const { getToken, isSignedIn } = useAuth();
  const connected = useStore(isGitHubConnected);
  const connection = useStore(githubConnectionAtom);
  const [attemptedImport, setAttemptedImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleClone = async (repoUrl: string) => {
    if (!ready) {
      return;
    }

    setLoading(true);
    setIsDialogOpen(false);
    setSelectedProvider(null);

    try {
      const { workdir, data } = await gitClone(repoUrl);

      if (importChat) {
        const filePaths = Object.keys(data).filter((filePath) => !ig.ignores(filePath));
        const textDecoder = new TextDecoder('utf-8');

        let totalSize = 0;
        const skippedFiles: string[] = [];
        const fileContents = [];

        for (const filePath of filePaths) {
          const { data: content, encoding } = data[filePath];

          // Skip binary files
          if (
            content instanceof Uint8Array &&
            !filePath.match(/\.(txt|md|astro|mjs|js|jsx|ts|tsx|json|html|css|scss|less|yml|yaml|xml|svg|vue|svelte)$/i)
          ) {
            skippedFiles.push(filePath);
            continue;
          }

          try {
            const textContent =
              encoding === 'utf8' ? content : content instanceof Uint8Array ? textDecoder.decode(content) : '';

            if (!textContent) {
              continue;
            }

            // Check file size
            const fileSize = new TextEncoder().encode(textContent).length;

            if (fileSize > MAX_FILE_SIZE) {
              skippedFiles.push(`${filePath} (too large: ${Math.round(fileSize / 1024)}KB)`);
              continue;
            }

            // Check total size
            if (totalSize + fileSize > MAX_TOTAL_SIZE) {
              skippedFiles.push(`${filePath} (would exceed total size limit)`);
              continue;
            }

            totalSize += fileSize;
            fileContents.push({
              path: filePath,
              content: textContent,
            });
          } catch (e: any) {
            skippedFiles.push(`${filePath} (error: ${e.message})`);
          }
        }

        const commands = await detectProjectCommands(fileContents);
        const commandsMessage = createCommandsMessage(commands);

        const filesText = `Cloning the repo ${repoUrl} into ${workdir}
${
  skippedFiles.length > 0
    ? `\nSkipped files (${skippedFiles.length}):
${skippedFiles.map((f) => `- ${f}`).join('\n')}`
    : ''
}

<boltArtifact id="imported-files" title="Git Cloned Files" type="bundled">
${fileContents
  .map(
    (file) =>
      `<boltAction type="file" filePath="${file.path}">
${escapeBoltTags(file.content)}
</boltAction>`,
  )
  .join('\n')}
</boltArtifact>`;
        const filesMessage: ExtendedUIMessage = {
          role: 'assistant',
          parts: [{ type: 'text', text: filesText }] as any,
          id: generateId(),
          createdAt: new Date(),
        };

        const messages = [filesMessage];

        if (commandsMessage) {
          messages.push(commandsMessage);
        }

        await importChat(`Git Project:${repoUrl.split('/').slice(-1)[0]}`, messages);
      }
    } catch (error) {
      console.error('Error during import:', error);
      toast.error('Failed to import repository');
    } finally {
      setLoading(false);
    }
  };

  const buildSignInUrl = () => {
    if (typeof window === 'undefined') {
      return SIGN_IN_URL;
    }

    const url = new URL(SIGN_IN_URL);
    url.searchParams.set('redirect_url', `${window.location.origin}/`);

    return url.toString();
  };

  const buildManageConnectionsUrl = () => {
    try {
      const base = new URL(SIGN_IN_URL);

      // Hosted Clerk typically exposes user profile at /user
      base.pathname = '/user';
      base.searchParams.set('redirect_url', typeof window !== 'undefined' ? `${window.location.origin}/` : '/');

      return base.toString();
    } catch {
      return SIGN_IN_URL;
    }
  };

  const handleImportFromOAuth = async () => {
    setImportError(null);
    setImporting(true);

    try {
      if (!isSignedIn) {
        if (typeof window !== 'undefined') {
          window.location.href = buildSignInUrl();
        }

        return;
      }

      const jwt = await getToken();

      if (!jwt) {
        setImportError('Unable to authenticate. Please sign in again.');
        return;
      }

      const res = await fetch('/api.github-import-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data?.error || `Server error ${res.status}`);
      }

      const data = (await res.json()) as { token?: string };

      if (!data.token) {
        throw new Error('No GitHub OAuth token found for this user. Try signing in with GitHub.');
      }

      await githubConnectionStore.connect(data.token, 'fine-grained');
      toast.success('Connected to GitHub via OAuth');
    } catch (e: any) {
      setImportError(e?.message || 'Failed to import token');
    } finally {
      setImporting(false);
    }
  };

  // Auto-import GitHub OAuth token when the GitHub dialog opens and user is signed in
  useEffect(() => {
    const run = async () => {
      if (!isDialogOpen || selectedProvider !== 'github' || attemptedImport) {
        return;
      }

      setAttemptedImport(true);

      if (!isSignedIn) {
        // Redirect to sign-in with redirect back
        if (typeof window !== 'undefined') {
          const url = new URL(SIGN_IN_URL);
          url.searchParams.set('redirect_url', `${window.location.origin}/`);
          window.location.href = url.toString();
        }

        return;
      }

      if (connected && connection?.token) {
        return;
      } // Already connected

      try {
        const jwt = await getToken();

        if (!jwt) {
          return;
        }

        const res = await fetch('/api.github-import-token', {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        });

        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as any as { token?: string; error?: string };

        if (!data.token) {
          return;
        }

        await githubConnectionStore.connect(data.token, 'fine-grained');
        toast.success('Connected to GitHub via OAuth');
      } catch {
        // Silent fail; UI still offers manual connect
      }
    };
    run();
  }, [isDialogOpen, selectedProvider, attemptedImport, isSignedIn, connected]);

  return (
    <>
      <Button
        onClick={() => {
          setSelectedProvider(null);
          setIsDialogOpen(true);
        }}
        title="Clone a repo"
        variant="default"
        size="lg"
        className={classNames(
          'gap-2 bg-bolt-elements-background-depth-1',
          'text-bolt-elements-textPrimary',
          'hover:bg-bolt-elements-background-depth-2',
          'border border-bolt-elements-borderColor',
          'h-10 px-4 py-2 min-w-[120px] justify-center',
          'transition-all duration-200 ease-in-out',
          className,
        )}
        disabled={!ready || loading}
      >
        Clone a repo
        <div className="flex items-center gap-1 ml-2">
          <Github className="w-4 h-4" />
          <GitBranch className="w-4 h-4" />
        </div>
      </Button>

      {/* Provider Selection Dialog */}
      {isDialogOpen && !selectedProvider && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-950 rounded-xl shadow-xl border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  Choose Repository Provider
                </h3>
                <button
                  onClick={() => setIsDialogOpen(false)}
                  className="p-2 rounded-lg bg-transparent hover:bg-bolt-elements-background-depth-1 dark:hover:bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  <X className="w-5 h-5 transition-transform duration-200 hover:rotate-90" />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setSelectedProvider('github')}
                  className="w-full p-4 rounded-lg bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive dark:hover:border-bolt-elements-borderColorActive transition-all duration-200 text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/20 dark:group-hover:bg-blue-500/30 transition-colors">
                      <Github className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <div className="font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                        GitHub
                      </div>
                      <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                        Clone from GitHub repositories
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedProvider('gitlab')}
                  className="w-full p-4 rounded-lg bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive dark:hover:border-bolt-elements-borderColorActive transition-all duration-200 text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/20 dark:group-hover:bg-orange-500/30 transition-colors">
                      <GitBranch className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <div className="font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                        GitLab
                      </div>
                      <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                        Clone from GitLab repositories
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Repository Selection */}
      {isDialogOpen && selectedProvider === 'github' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-950 rounded-xl shadow-xl border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-bolt-elements-borderColor dark:border-bolt-elements-borderColor flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                  <Github className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                    Import GitHub Repository
                  </h3>
                  <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                    Clone a repository from GitHub to your workspace
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsDialogOpen(false);
                  setSelectedProvider(null);
                }}
                className="p-2 rounded-lg bg-transparent hover:bg-bolt-elements-background-depth-1 dark:hover:bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <X className="w-5 h-5 transition-transform duration-200 hover:rotate-90" />
              </button>
            </div>

            <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
              {!connected && (
                <div className="mb-4 p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm text-bolt-elements-textSecondary">
                      <div className="font-medium text-bolt-elements-textPrimary mb-1">Use your GitHub OAuth token</div>
                      <div>
                        We can import your GitHub OAuth access token from your Clerk session. This avoids creating a
                        personal access token.
                      </div>
                      {importError && <div className="mt-2 text-bolt-elements-textDanger">{importError}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSignedIn ? (
                        <>
                          <Button variant="outline" size="sm" onClick={handleImportFromOAuth} disabled={importing}>
                            {importing ? 'Importing…' : 'Import OAuth Token'}
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
              <GitHubConnection onCloneRepository={handleClone} />
            </div>
          </div>
        </div>
      )}

      {/* GitLab Repository Selection */}
      {isDialogOpen && selectedProvider === 'gitlab' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-950 rounded-xl shadow-xl border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-bolt-elements-borderColor dark:border-bolt-elements-borderColor flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center">
                  <GitBranch className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                    Import GitLab Repository
                  </h3>
                  <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                    Clone a repository from GitLab to your workspace
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsDialogOpen(false);
                  setSelectedProvider(null);
                }}
                className="p-2 rounded-lg bg-transparent hover:bg-bolt-elements-background-depth-1 dark:hover:bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary dark:hover:text-bolt-elements-textPrimary transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <X className="w-5 h-5 transition-transform duration-200 hover:rotate-90" />
              </button>
            </div>

            <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
              <GitLabConnection onCloneRepository={handleClone} />
            </div>
          </div>
        </div>
      )}

      {loading && <LoadingOverlay message="Please wait while we clone the repository..." />}
    </>
  );
}
