// Temporary shim for TypeScript to resolve 'react/jsx-runtime'
// Remove this file once '@types/react' is properly installed and recognized by your IDE/tsc.
// This provides minimal typings to unblock compilation.
declare module 'react/jsx-runtime' {
  // Using 'any' here keeps the shim minimal and non-invasive.
  export const Fragment: any;
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
}

