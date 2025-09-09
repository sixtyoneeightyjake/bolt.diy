import { createScopedLogger } from '~/utils/logger';
import { StreamingMessageParser, type StreamingMessageParserOptions } from './message-parser';

const logger = createScopedLogger('EnhancedMessageParser');

/**
 * Enhanced message parser that detects code blocks and file patterns
 * even when AI models don't wrap them in proper artifact tags.
 * Fixes issue #1797 where code outputs to chat instead of files.
 */
export class EnhancedStreamingMessageParser extends StreamingMessageParser {
  private _processedCodeBlocks = new Map<string, Set<string>>();
  private _artifactCounter = 0;

  constructor(options: StreamingMessageParserOptions = {}) {
    super(options);
  }

  parse(messageId: string, input: string): string {
    // First try the normal parsing
    let output = super.parse(messageId, input);

    // If no artifacts were detected, check for code blocks that should be files
    if (!this._hasDetectedArtifacts(input)) {
      let enhancedInput = this._detectAndWrapCodeBlocks(messageId, input);

      // As a safe enhancement, detect raw JSON blobs that clearly look like
      // package.json or app.json (Expo) even if not fenced in backticks
      // This only triggers for top-level JSON objects with well-known keys
      // to avoid false positives.
      enhancedInput = this._detectAndWrapRawJson(messageId, enhancedInput);

      if (enhancedInput !== input) {
        // Reset and reparse with enhanced input
        this.reset();
        output = super.parse(messageId, enhancedInput);
      }
    }

    return output;
  }

  private _hasDetectedArtifacts(input: string): boolean {
    return input.includes('<boltArtifact') || input.includes('</boltArtifact>');
  }

  private _detectAndWrapCodeBlocks(messageId: string, input: string): string {
    // Initialize processed blocks for this message if not exists
    if (!this._processedCodeBlocks.has(messageId)) {
      this._processedCodeBlocks.set(messageId, new Set());
    }

    const processed = this._processedCodeBlocks.get(messageId)!;

    // Regex patterns for detecting code blocks with file indicators
    const patterns = [
      // Pattern 1: Explicit file creation/modification mentions
      /(?:create|update|modify|edit|write|add|generate|here'?s?|file:?)\s+(?:a\s+)?(?:new\s+)?(?:file\s+)?(?:called\s+)?[`'"]*([\/\w\-\.]+\.\w+)[`'"]*:?\s*\n+```(\w*)\n([\s\S]*?)```/gi,

      // Pattern 2: Code blocks with filename comments
      /```(\w*)\n(?:\/\/|#|<!--)\s*(?:file:?|filename:?)\s*([\/\w\-\.]+\.\w+).*?\n([\s\S]*?)```/gi,

      // Pattern 3: File path followed by code block
      /(?:^|\n)([\/\w\-\.]+\.\w+):?\s*\n+```(\w*)\n([\s\S]*?)```/gim,

      // Pattern 4: Code block with "in <filename>" context
      /(?:in|for|update)\s+[`'"]*([\/\w\-\.]+\.\w+)[`'"]*:?\s*\n+```(\w*)\n([\s\S]*?)```/gi,

      // Pattern 5: HTML/Component files with clear structure
      /```(?:jsx?|tsx?|html?|vue|svelte)\n(<[\w\-]+[^>]*>[\s\S]*?<\/[\w\-]+>[\s\S]*?)```/gi,

      // Pattern 6: Package.json or config files
      /```(?:json)?\n(\{[\s\S]*?"(?:name|version|scripts|dependencies|devDependencies)"[\s\S]*?\})```/gi,
    ];

    let enhanced = input;

    // Process each pattern
    for (const pattern of patterns) {
      enhanced = enhanced.replace(pattern, (match, ...args) => {
        // Skip if already processed
        const blockHash = this._hashBlock(match);

        if (processed.has(blockHash)) {
          return match;
        }

        let filePath: string;
        let language: string;
        let content: string;

        // Extract based on pattern
        if (pattern.source.includes('file:?|filename:?')) {
          // Pattern 2: filename in comment
          [language, filePath, content] = args;
        } else if (pattern.source.includes('<[\w\-]+[^>]*>')) {
          // Pattern 5: HTML/Component detection
          content = args[0];
          language = 'jsx';
          filePath = this._inferFileNameFromContent(content, language);
        } else if (pattern.source.includes('"name"|"version"')) {
          // Pattern 6: package.json detection
          content = args[0];
          language = 'json';
          filePath = 'package.json';
        } else {
          // Other patterns
          [filePath, language, content] = args;
        }

        // Clean up the file path
        filePath = this._normalizeFilePath(filePath);

        // Validate file path
        if (!this._isValidFilePath(filePath)) {
          return match; // Return original if invalid
        }

        // Mark as processed
        processed.add(blockHash);

        // Generate artifact wrapper
        const artifactId = `artifact-${messageId}-${this._artifactCounter++}`;
        const wrapped = this._wrapInArtifact(artifactId, filePath, content);

        logger.debug(`Auto-wrapped code block as file: ${filePath}`);

        return wrapped;
      });
    }

    // Also detect standalone file operations without code blocks
    const fileOperationPattern =
      /(?:create|write|save|generate)\s+(?:a\s+)?(?:new\s+)?file\s+(?:at\s+)?[`'"]*([\/\w\-\.]+\.\w+)[`'"]*\s+with\s+(?:the\s+)?(?:following\s+)?content:?\s*\n([\s\S]+?)(?=\n\n|\n(?:create|write|save|generate|now|next|then|finally)|$)/gi;

    enhanced = enhanced.replace(fileOperationPattern, (match, filePath, content) => {
      const blockHash = this._hashBlock(match);

      if (processed.has(blockHash)) {
        return match;
      }

      filePath = this._normalizeFilePath(filePath);

      if (!this._isValidFilePath(filePath)) {
        return match;
      }

      processed.add(blockHash);

      const artifactId = `artifact-${messageId}-${this._artifactCounter++}`;

      // Clean content - remove leading/trailing whitespace but preserve indentation
      content = content.trim();

      const wrapped = this._wrapInArtifact(artifactId, filePath, content);
      logger.debug(`Auto-wrapped file operation: ${filePath}`);

      return wrapped;
    });

    // Fallback: wrap any remaining fenced code blocks generically to ensure
    // code lands in the workbench rather than flooding the chat UI.
    const genericCodeBlock = /```([\w\-]*)\n([\s\S]*?)```/g;

    enhanced = enhanced.replace(genericCodeBlock, (match, lang, code) => {
      const blockHash = this._hashBlock(match);

      if (processed.has(blockHash)) {
        return match;
      }

      processed.add(blockHash);

      const extMap: Record<string, string> = {
        javascript: 'js',
        js: 'js',
        typescript: 'ts',
        ts: 'ts',
        jsx: 'jsx',
        tsx: 'tsx',
        python: 'py',
        py: 'py',
        html: 'html',
        css: 'css',
        scss: 'scss',
        sass: 'sass',
        less: 'less',
        json: 'json',
        yaml: 'yaml',
        yml: 'yml',
        md: 'md',
        markdown: 'md',
        sh: 'sh',
        bash: 'sh',
        zsh: 'sh',
        sql: 'sql',
        vue: 'vue',
        svelte: 'svelte',
        xml: 'xml',
      };

      const normalized = String(lang || '').toLowerCase();
      const ext = extMap[normalized] || 'txt';
      const filePath = `/code-${Date.now()}.${ext}`;

      const artifactId = `artifact-${messageId}-${this._artifactCounter++}`;
      const wrapped = this._wrapInArtifact(artifactId, filePath, code);
      logger.debug(`Auto-wrapped generic code block as file: ${filePath}`);
      return wrapped;
    });

    return enhanced;
  }

  // Detect top-level JSON objects for package.json or app.json (Expo)
  private _detectAndWrapRawJson(messageId: string, input: string): string {
    const processed = this._processedCodeBlocks.get(messageId)!;

    // Quickly bail if no curly braces present
    if (!input.includes('{') || !input.includes('}')) {
      return input;
    }

    const results: Array<{ start: number; end: number; content: string; target: string }> = [];

    // Walk the string and collect balanced top-level JSON objects up to a reasonable size
    const maxScan = Math.min(input.length, 100000);
    for (let i = 0; i < maxScan; i++) {
      if (input[i] !== '{') continue;

      // Try to extract a balanced JSON block starting at i
      const end = this._findBalancedJsonEnd(input, i);
      if (end === -1) continue;

      const raw = input.slice(i, end + 1).trim();

      // Heuristic size bounds to avoid giant captures
      if (raw.length < 40 || raw.length > 20000) {
        i = end; // advance
        continue;
      }

      try {
        const obj = JSON.parse(raw);
        const isPackage = obj && typeof obj === 'object' && obj.name && obj.version && (obj.scripts || obj.dependencies || obj.devDependencies);
        const isExpoApp = obj && typeof obj === 'object' && obj.expo && typeof obj.expo === 'object';

        if (!isPackage && !isExpoApp) {
          i = end;
          continue;
        }

        const blockHash = this._hashBlock(raw);
        if (processed.has(blockHash)) {
          i = end;
          continue;
        }

        processed.add(blockHash);

        const target = isPackage ? '/package.json' : '/app.json';
        results.push({ start: i, end, content: JSON.stringify(obj, null, 2), target });
        i = end;
      } catch {
        // not valid JSON
        i = end;
        continue;
      }
    }

    if (!results.length) {
      return input;
    }

    // Apply replacements from the end to not disturb indices
    let out = input;
    for (let r = results.length - 1; r >= 0; r--) {
      const { start, end, content, target } = results[r];
      const artifactId = `artifact-${messageId}-${this._artifactCounter++}`;
      const wrapped = this._wrapInArtifact(artifactId, target, content);
      out = out.slice(0, start) + wrapped + out.slice(end + 1);
    }

    return out;
  }

  private _findBalancedJsonEnd(input: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < input.length; i++) {
      const ch = input[i];

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth === 0) return i;
    }
    return -1;
  }

  private _wrapInArtifact(artifactId: string, filePath: string, content: string): string {
    const title = filePath.split('/').pop() || 'File';

    return `<boltArtifact id="${artifactId}" title="${title}" type="bundled">
<boltAction type="file" filePath="${filePath}">
${content}
</boltAction>
</boltArtifact>`;
  }

  private _normalizeFilePath(filePath: string): string {
    // Remove quotes, backticks, and clean up
    filePath = filePath.replace(/[`'"]/g, '').trim();

    // Ensure forward slashes
    filePath = filePath.replace(/\\/g, '/');

    // Remove leading ./ if present
    if (filePath.startsWith('./')) {
      filePath = filePath.substring(2);
    }

    // Add leading slash if missing and not a relative path
    if (!filePath.startsWith('/') && !filePath.startsWith('.')) {
      filePath = '/' + filePath;
    }

    return filePath;
  }

  private _isValidFilePath(filePath: string): boolean {
    // Check for valid file extension
    const hasExtension = /\.\w+$/.test(filePath);

    if (!hasExtension) {
      return false;
    }

    // Check for valid characters
    const isValid = /^[\/\w\-\.]+$/.test(filePath);

    if (!isValid) {
      return false;
    }

    // Exclude certain patterns that are likely not real files
    const excludePatterns = [/^\/?(tmp|temp|test|example)\//i, /\.(tmp|temp|bak|backup|old|orig)$/i];

    for (const pattern of excludePatterns) {
      if (pattern.test(filePath)) {
        return false;
      }
    }

    return true;
  }

  private _detectLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      less: 'less',
      json: 'json',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      fish: 'bash',
      ps1: 'powershell',
      sql: 'sql',
      graphql: 'graphql',
      gql: 'graphql',
      vue: 'vue',
      svelte: 'svelte',
    };

    return languageMap[ext || ''] || 'text';
  }

  private _inferFileNameFromContent(content: string, language: string): string {
    // Try to infer component name from content
    const componentMatch = content.match(
      /(?:function|class|const|export\s+default\s+function|export\s+function)\s+(\w+)/,
    );

    if (componentMatch) {
      const name = componentMatch[1];
      const ext = language === 'jsx' ? '.jsx' : language === 'tsx' ? '.tsx' : '.js';

      return `/components/${name}${ext}`;
    }

    // Check for App component
    if (content.includes('function App') || content.includes('const App')) {
      return '/App.jsx';
    }

    // Default to a generic name
    return `/component-${Date.now()}.jsx`;
  }

  private _hashBlock(content: string): string {
    // Simple hash for identifying processed blocks
    let hash = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash.toString(36);
  }

  reset() {
    super.reset();
    this._processedCodeBlocks.clear();
    this._artifactCounter = 0;
  }
}
