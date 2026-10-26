import {defineConfig} from 'vite';
import {swPrecache} from './tools/sw-precache.mjs';
// base './' = relative paths, so the built site works at the root or in a sub-folder.
export default defineConfig({base:'./',plugins:[swPrecache()]});
