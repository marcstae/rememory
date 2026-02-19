// Type declaration for importing .txt files as strings via esbuild text loader
declare module '*.txt' {
  const content: string;
  export default content;
}
