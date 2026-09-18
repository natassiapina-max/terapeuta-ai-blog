import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://blog.terapeutaai.com.br',
  integrations: [sitemap()],
  trailingSlash: 'never'
});
