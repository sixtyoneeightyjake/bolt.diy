import React from 'react';

const EXAMPLE_PROMPTS = [
  {
    text: 'Create a responsive web app (Vite + React) about clowns for hire. Use <boltArtifact> file actions and start the dev server.',
  },
  { text: 'Build a todo app with annoying alarms and alerts (web) using Vite. Use <boltArtifact> file actions.' },
  { text: 'Build a "Mojo is awesome" blog site with a homepage and posts (web) using Vite.' },
  { text: 'Create a site to generate random app ideas for no-code builders (web). Use <boltArtifact> file actions.' },
  { text: 'Make a space invaders game (web) with HTML/CSS/JS only.' },
  { text: 'Make a Tic Tac Toe game in html, css and js only' },
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="relative flex flex-col gap-9 w-full max-w-3xl mx-auto flex justify-center mt-6">
      <div
        className="flex flex-wrap justify-center gap-2"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.text);
              }}
              className="border border-bolt-elements-borderColor rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-3 py-1 text-xs transition-theme"
            >
              {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
