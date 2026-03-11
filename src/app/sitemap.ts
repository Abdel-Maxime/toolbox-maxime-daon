import type { MetadataRoute } from 'next'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'https://toolbox.maxime-daon.fr'

function getRoutesFromFileSystem(): string[] {
  const appDir = path.join(process.cwd(), 'src/app')

  function scan(dir: string, base = ''): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      if (!entry.isDirectory()) return []

      const name = entry.name
      // Ignore les conventions Next.js
      if (name.startsWith('(') || name.startsWith('_') || name.startsWith('[') || name === 'api') return []

      const fullPath = path.join(dir, name)
      const route = `${base}/${name}`
      const hasPage = fs.existsSync(path.join(fullPath, 'page.tsx'))
        || fs.existsSync(path.join(fullPath, 'page.jsx'))

      return [
        ...(hasPage ? [route] : []),
        ...scan(fullPath, route),
      ]
    })
  }

  // Inclut la racine si elle a un page.tsx
  const hasRoot = fs.existsSync(path.join(appDir, 'page.tsx'))
  return [
    ...(hasRoot ? ['/'] : []),
    ...scan(appDir),
  ]
}

export default function sitemap(): MetadataRoute.Sitemap {
  if (typeof window !== 'undefined') {
    throw new Error('sitemap function should only be called on the server side.')
  }

  const routes = getRoutesFromFileSystem()

  return routes.map(route => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
  }))
}