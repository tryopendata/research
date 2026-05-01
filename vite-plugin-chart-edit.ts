import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { readFile, writeFile, rename } from 'fs/promises'
import { resolve } from 'path'
import { findChartBlock } from './lib/chart-edit/find-chart'
import { patchSpec } from './lib/chart-edit/patch-spec'
import type { ChartEditRequest } from './lib/chart-edit/types'

// Per-file queue serializes the entire read-patch-write cycle
// to prevent TOCTOU races when multiple edits arrive for the same file.
const fileQueues = new Map<string, Promise<{ ok: boolean; error?: string }>>()

function enqueue(
  filePath: string,
  fn: () => Promise<{ ok: boolean; error?: string }>
): Promise<{ ok: boolean; error?: string }> {
  const prev = fileQueues.get(filePath) ?? Promise.resolve({ ok: true })
  const next = prev.then(() => fn(), () => fn())
  fileQueues.set(filePath, next)
  return next
}

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// Track files we recently wrote so handleHotUpdate can intercept them.
const recentWrites = new Map<string, number>()

export function chartEditPlugin(): Plugin {
  let root = ''
  let isDev = false

  return {
    name: 'chart-edit',

    configResolved(config) {
      root = config.root
      isDev = config.command === 'serve'
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== 'POST' || req.url !== '/__chart-edit') {
          return next()
        }

        parseBody(req)
          .then(async (body) => {
            let request: ChartEditRequest
            try {
              request = JSON.parse(body)
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid JSON body' }))
              return
            }

            const { slug, chartTitle, chartIndex, edit } = request

            // Validate slug to prevent path traversal
            if (!slug || /[/\\]/.test(slug) || slug.startsWith('.')) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid slug' }))
              return
            }

            const filePath = resolve(root, 'src', 'reports', `${slug}.mdx`)

            // Entire read-patch-write cycle runs inside the queue
            const result = await enqueue(filePath, async () => {
              const content = await readFile(filePath, 'utf-8')

              const block = findChartBlock(content, chartTitle, chartIndex)
              if (!block) {
                return { ok: false, error: `Chart not found: ${chartTitle ?? `index ${chartIndex}`}` }
              }

              const patchedSpec = patchSpec(block.specSource, edit)
              if (patchedSpec === null) {
                return { ok: false, error: 'Failed to patch spec' }
              }

              const patchedContent =
                content.slice(0, block.specStart) +
                patchedSpec +
                content.slice(block.specEnd)

              // Validate: patched content should still contain the chart title
              if (chartTitle && !patchedContent.includes(chartTitle)) {
                return { ok: false, error: 'Patched content validation failed - title missing' }
              }

              // Mark this file so handleHotUpdate knows we caused the change
              recentWrites.set(filePath, Date.now())

              // Atomic write via temp file + rename
              const tmpPath = filePath + '.tmp'
              await writeFile(tmpPath, patchedContent, 'utf-8')
              await rename(tmpPath, filePath)

              return { ok: true }
            })

            if (!result.ok) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: result.error }))
              return
            }

            const editDesc = edit.type === 'annotation' ? `annotation "${edit.annotation.text.slice(0, 30)}"` :
                             edit.type === 'chrome' ? `chrome.${edit.key}` :
                             edit.type === 'legend' ? 'legend' :
                             edit.type === 'series-label' ? `series "${edit.series}"` :
                             edit.type === 'delete' ? `delete ${edit.element.type}` :
                             edit.type
            console.log(`[chart-edit] Updated ${editDesc} offset in ${slug}.mdx`)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true }))
          })
          .catch((err) => {
            console.error('[chart-edit] Error:', err)
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Internal error' }))
            }
          })
      })
    },

    // Intercept HMR for files we wrote. Return empty array to suppress
    // Vite's default full-reload, then send our own reload command that
    // the client handles with scroll preservation.
    handleHotUpdate({ file, server: s }) {
      const writeTime = recentWrites.get(file)
      if (writeTime && Date.now() - writeTime < 5000) {
        recentWrites.delete(file)
        // Tell client to save scroll and reload on its own terms
        s.ws.send({ type: 'custom', event: 'chart-edit:reload' })
        // Return empty array = suppress Vite's default HMR/full-reload
        return []
      }
    },

    // Inject client script for scroll-preserving reloads. Dev only.
    transformIndexHtml() {
      if (!isDev) return []
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `
            if (import.meta.hot) {
              const KEY = '__chart-edit-scroll';

              // Server tells us to reload with scroll preservation
              import.meta.hot.on('chart-edit:reload', () => {
                sessionStorage.setItem(KEY, String(window.scrollY));
                location.reload();
              });

              // After reload, restore scroll once the page is tall enough
              const saved = sessionStorage.getItem(KEY);
              if (saved !== null) {
                sessionStorage.removeItem(KEY);
                const y = parseInt(saved, 10);
                const tryRestore = (n) => {
                  if (document.body.scrollHeight >= y || n > 30) {
                    window.scrollTo(0, y);
                  } else {
                    requestAnimationFrame(() => tryRestore(n + 1));
                  }
                };
                // Small delay lets React hydrate and expand the DOM
                requestAnimationFrame(() => tryRestore(0));
              }
            }
          `,
          injectTo: 'head' as const,
        },
      ]
    },
  }
}
