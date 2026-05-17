/// <reference types="vite/client" />

declare module 'js-cookie' {
  interface CookieOptions {
    expires?: number | Date
    path?: string
    domain?: string
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
  }
  function get(name: string): string | undefined
  function set(name: string, value: string, options?: CookieOptions): string
  function remove(name: string, options?: CookieOptions): void
  export { get, set, remove }
}
