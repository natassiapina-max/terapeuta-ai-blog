import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://blog.terapeutaai.com.br',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/preview/') && !page.includes('/admin')
    })
  ],
  trailingSlash: 'never'
});
