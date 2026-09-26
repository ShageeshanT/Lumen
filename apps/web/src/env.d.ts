// Declared so `process.env.NEXT_PUBLIC_*` can be read with dot access, which is
// the only form Next.js inlines into the client bundle.
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_API_URL?: string;
      LUMEN_ENABLE_GALLERY?: string;
    }
  }
}

export {};
