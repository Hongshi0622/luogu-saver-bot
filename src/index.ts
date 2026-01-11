import { Context, Schema, h } from 'koishi'
import { TaskStatus, statusToString } from './task'

export const name = 'luogu-saver-bot'
export const inject = ['puppeteer']

export interface Config {
  endpoint?: string
  userAgent?: string
}

export const Config: Schema<Config> = Schema.object({
  endpoint: Schema.string().description('自定义 API endpoint，结尾无需斜杠').role('input').default(''),
  userAgent: Schema.string().description('自定义 User-Agent').role('input').default('Uptime-Kuma'),
})

export type Article = {
  id: string
  title: string
  content: string
  authorId: number
  category: number
  upvote?: number
  favorCount?: number
  solutionForPid?: string | null
  priority?: number
  deleted?: number
  tags: string[]
  createdAt?: string
  updatedAt?: string
  deleteReason?: string
  contentHash?: string | null
  viewCount?: number
  renderedContent?: string | null
}

export type StdResponse<A> = {
  code: number
  message: string
  data: A
}

export type ArticleHistory = {
  id: number
  articleId: string
  version: number
  title: string
  content: string
  createdAt: string
}

export type CountResponse = { count: number }

export type TaskQuery = Record<string, any> | null

export type Task = {
  id: string
  info?: string | null
  status: 0 | 1 | 2 | 3
  createdAt: string
  type: 'save' | 'ai_process'
  target?: string | null
  payload: Record<string, any>
}

export type TaskCreateBase = { type: string; payload: Record<string, any> }
export type TaskCreateSave = TaskCreateBase & { type: 'save'; payload: { target: string; targetId: string; metadata?: Record<string, any> } }
export type TaskCreateAi = TaskCreateBase & { type: 'ai_process'; payload: { target: string; metadata: Record<string, any> } }

export type TaskCreateResponse = { taskId: string }

class LuoguSaverClient {
  constructor(private ctx: Context, public endpoint: string, public userAgent: string) {
    if (!this.endpoint) this.endpoint = ''
  }

  private buildUrl(path: string) {
    const base = this.endpoint.replace(/\/$/, '')
    if (!base) return path
    console.log(`${base}${path}`)
    if (path.startsWith('/')) return `${base}${path}`
    return `${base}/${path}`
  }

  private headers(extra?: Record<string, string>) {
    return Object.assign({ 'User-Agent': this.userAgent }, extra || {})
  }

  async getArticle(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/article/query/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get<StdResponse<Article>>(url, { headers: this.headers(extraHeaders) })
    if (res.code !== 200) return null
    return res.data
  }

  async getRecent(opts?: { count?: number; updated_after?: string; truncated_count?: number }, extraHeaders?: Record<string, string>) {
    const params = new URLSearchParams()
    if (opts?.count != null) params.set('count', String(opts.count))
    if (opts?.updated_after) params.set('updated_after', opts.updated_after)
    if (opts?.truncated_count != null) params.set('truncated_count', String(opts.truncated_count))
    const path = `/article/recent${params.toString() ? `?${params.toString()}` : ''}`
    const url = this.buildUrl(path)
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as Article[] | null
  }

  async getCount(extraHeaders?: Record<string, string>) {
    const url = this.buildUrl('/article/count')
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as CountResponse | null
  }

  async getRelevant(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/article/relevant/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as Article[] | null
  }

  async getHistory(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/article/history/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get(url, { headers: this.headers(extraHeaders) })
    return res?.data?.data ?? null as ArticleHistory[] | null
  }

  async createTask(body: TaskCreateSave | TaskCreateAi, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl('/task/create')
    const res = await this.ctx.http.post<StdResponse<TaskCreateResponse>>(url, body, { headers: this.headers(extraHeaders) })
    if (res.code !== 200) return null
    return res.data.taskId
  }

  async getTask(id: string, extraHeaders?: Record<string, string>) {
    const url = this.buildUrl(`/task/query/${encodeURIComponent(id)}`)
    const res = await this.ctx.http.get<StdResponse<TaskQuery>>(url, { headers: this.headers(extraHeaders) })
    if (res.code !== 200) return null
    return res.data
  }
}

declare module 'koishi' {
  interface Context {
    luogu_saver: LuoguSaverClient
    puppeteer?: any
  }
}

export function apply(ctx: Context, config: Config = {}) {
  const endpoint = config.endpoint || ''
  const userAgent = config.userAgent || 'Uptime-Kuma'
  ctx.luogu_saver = new LuoguSaverClient(ctx, endpoint, userAgent)

  // 示例命令：获取文章标题
  ctx.command('获取文章信息 <id>', '获取文章信息')
    .action(async ({ options }, id) => {
      if (!id) return '请提供文章 ID'
      const art = await ctx.luogu_saver.getArticle(id)
      console.log(art)
      if (!art) return '未找到文章'
      return `${art.title} by ${art.authorId}`
    })

  // 示例命令：创建任务（接受 JSON 字符串）
  // ctx.command('创建任务 <json>', '通过 JSON 请求体创建任务')
  //   .action(async (_, json) => {
  //     try {
  //       const body = JSON.parse(json) as TaskCreateSave | TaskCreateAi
  //       const id = await ctx.luogu_saver.createTask(body)
  //       if (!id) return '创建失败'
  //       return `任务已创建，ID: ${id}`
  //     } catch (err) {
  //       return '无效的 JSON 或创建失败'
  //     }
  //   })

  ctx.command('创建保存任务 <target> <targetId>', '创建类型为 save 的任务')
    .action(async (_, target, targetId) => {
      const body: TaskCreateSave = { type: 'save', payload: { target, targetId } }
      const id = await ctx.luogu_saver.createTask(body)
      if (!id) return '创建失败'
      return `保存任务已创建，ID: ${id}`
    })

  // 示例命令：查询任务状态
  ctx.command('查询任务状态 <id>', '查询任务状态')
    .action(async ({ options }, id) => {
      if (!id) return '请提供任务 ID'
      const task = await ctx.luogu_saver.getTask(id)
      if (task == null) return '任务不存在或返回为空'
      if (typeof task === 'object' && 'status' in task) return `任务 ${id} 状态: ${statusToString((task as any).status)}`
      return JSON.stringify(task)
    })

  ctx.command('获取文章 <id>', '获取文章并截取长图')
    .option('width', '-w <width:number>', { fallback: 960 })
    .action(async ({ session, options }, id) => {
      if (!id) return '请提供文章 ID'
      const art = await ctx.luogu_saver.getArticle(id)
      if (!art) return '未找到文章'

      const content = (art.renderedContent ?? art.content ?? '') as string
      const title = art.title ?? ''

      const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])

      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"Helvetica Neue\",Arial;padding:20px;line-height:1.8;color:#222}img{max-width:100%}h1{font-size:24px;margin-bottom:12px}</style></head><body><h1>${escapeHtml(title)}</h1>${content}</body></html>`

      if (!ctx.puppeteer) return '当前没有可用的 puppeteer 服务。'

      const page = await ctx.puppeteer.page()
      try {
        const width = Number(options.width) || 960
        await page.setViewport({ width, height: 800 })
        // 强制浅色主题，避免因 prefers-color-scheme 导致的全黑截图
        if (typeof page.emulateMediaFeatures === 'function') {
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' } as any])
        }
        await page.setContent(html, { waitUntil: 'networkidle0' })
        // 强制页面白色背景，避免透明或黑底问题
        try {
          await page.evaluate(() => {
            document.documentElement.style.background = '#ffffff'
            if (document.body) document.body.style.background = '#ffffff'
          })
        } catch (e) {
          // ignore
        }
        const buffer = await page.screenshot({ fullPage: true, type: 'png', omitBackground: false })
        return h.image(buffer as Buffer, 'image/png')
      } catch (err) {
        ctx.logger.error('截图文章失败', err)
        return '获取失败'
      } finally {
        page.close()
      }
    })
}
