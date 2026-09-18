# Blog Terapeuta AI

Site editorial oficial do Terapeuta AI.

## Stack

- Astro
- Markdown + Content Collections
- Decap CMS
- GitHub
- Cloudflare Workers + Assets

## Produção

https://blog.terapeutaai.com.br

## Conteúdo

Os artigos ficam em `src/content/articles/`.

A estrutura de conteúdo é validada pelo schema em `src/content.config.ts`.

## CMS

O editor fica em:

https://blog.terapeutaai.com.br/admin/

O Decap CMS usa o GitHub como repositório de conteúdo e o fluxo editorial está preparado para:

**Rascunho → Revisão → Aprovado → Publicado**

A autenticação do backend GitHub será configurada na etapa de publicação do CMS.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
