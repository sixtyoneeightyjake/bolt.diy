import type { Tool } from 'ai';

type ParameterProperty = {
  type?: string;
  description?: string;
};

// Extend Tool type to include inputSchema for MCP tools
type MCPTool = Tool & {
  inputSchema?: {
    properties?: Record<string, ParameterProperty>;
    required?: string[];
  };
};

type McpToolProps = {
  toolName: string;
  toolSchema: MCPTool;
};

export default function McpServerListItem({ toolName, toolSchema }: McpToolProps) {
  if (!toolSchema) {
    return null;
  }

  const parameters = toolSchema.inputSchema?.properties || {};
  const requiredParams = toolSchema.inputSchema?.required || [];

  return (
    <div className="mt-2 ml-4 p-3 rounded-md bg-bolt-elements-background-depth-2 text-xs">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-bolt-elements-textPrimary font-semibold truncate" title={toolName}>
          {toolName}
        </h3>

        <p className="text-bolt-elements-textSecondary">{toolSchema.description || 'No description available'}</p>

        {Object.keys(parameters).length > 0 && (
          <div className="mt-2.5">
            <h4 className="text-bolt-elements-textSecondary font-semibold mb-1.5">Parameters:</h4>
            <ul className="ml-1 space-y-2">
              {Object.entries(parameters).map(([paramName, paramDetails]) => (
                <li key={paramName} className="break-words">
                  <div className="flex items-start">
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {paramName}
                      {requiredParams.includes(paramName) && (
                        <span className="text-red-600 dark:text-red-400 ml-1">*</span>
                      )}
                    </span>
                  </div>
                  <div className="ml-2 mt-0.5 text-bolt-elements-textSecondary">
                    <div className="text-xs">
                      <span className="font-medium">Type:</span> {paramDetails.type || 'unknown'}
                    </div>
                    {paramDetails.description && (
                      <div className="text-xs mt-1">
                        <span className="font-medium">Description:</span> {paramDetails.description}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
